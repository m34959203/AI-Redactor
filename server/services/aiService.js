/**
 * AI Service - Server-side OpenRouter API integration
 * Keeps API key secure on the backend
 */

import crypto from 'crypto';

// Rate limiting configuration
const RATE_LIMIT_DELAY = 5000;
const RATE_LIMIT_DELAY_AFTER_429 = 15000;
let lastRequestTime = 0;
let consecutiveErrors = 0;

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
// Updated to currently available OpenRouter free models (December 2024)
// Using DeepSeek R1 as primary - excellent for reasoning and text analysis
const MODEL = "tngtech/deepseek-r1t2-chimera:free";
const FALLBACK_MODELS = [
  "google/gemma-2-9b-it:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "qwen/qwen-2.5-7b-instruct:free"
];

// Model routing for different tasks (multi-model strategy)
// DeepSeek R1 is excellent for complex reasoning tasks
const MODEL_ROUTING = {
  metadata: "tngtech/deepseek-r1t2-chimera:free",    // Good for extraction
  section: "tngtech/deepseek-r1t2-chimera:free",     // Excellent for classification
  spelling: "tngtech/deepseek-r1t2-chimera:free",    // Good for multilingual
  review: "tngtech/deepseek-r1t2-chimera:free"       // Excellent for analysis
};

// Cache for AI results (in-memory with TTL)
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Generate cache key from content hash
 */
const generateCacheKey = (taskType, content, additionalKey = '') => {
  const hash = crypto.createHash('md5').update(content.substring(0, 2000)).digest('hex');
  return `${taskType}:${hash}:${additionalKey}`;
};

/**
 * Get cached result if available and not expired
 */
const getCached = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Cache hit for ${key}`);
    return cached.data;
  }
  if (cached) {
    cache.delete(key);
  }
  return null;
};

/**
 * Store result in cache
 */
const setCache = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });

  // Cleanup old entries periodically (keep cache size manageable)
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp > CACHE_TTL) {
        cache.delete(k);
      }
    }
  }
};

/**
 * Rate limiting helper
 */
const waitForRateLimit = async () => {
  const now = Date.now();
  const baseDelay = consecutiveErrors > 0 ? RATE_LIMIT_DELAY_AFTER_429 : RATE_LIMIT_DELAY;
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < baseDelay) {
    const waitTime = baseDelay - timeSinceLastRequest;
    console.log(`Rate limiting: waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
};

/**
 * Parse rate limit error
 */
const parseRateLimitError = (errorMessage) => {
  const msg = errorMessage?.toLowerCase() || '';

  if (msg.includes('per-day') || msg.includes('per day')) {
    return {
      type: 'daily',
      message: 'Дневной лимит бесплатных запросов исчерпан (50 запросов/день)',
      suggestion: 'Пополните счёт OpenRouter на $10 для увеличения лимита'
    };
  }

  if (msg.includes('per-min') || msg.includes('per minute')) {
    return {
      type: 'minute',
      message: 'Превышен лимит запросов в минуту (20 запросов/мин)',
      suggestion: 'Подождите минуту и попробуйте снова'
    };
  }

  return {
    type: 'unknown',
    message: 'Лимит запросов OpenRouter исчерпан',
    suggestion: 'Попробуйте позже'
  };
};

// Enhanced system prompt
const SYSTEM_PROMPT = `Ты - эксперт-редактор научного журнала с 20-летним опытом.
Специализация: анализ и классификация академических публикаций.

ТВОИ КОМПЕТЕНЦИИ:
- Классификация статей по научным дисциплинам
- Извлечение метаданных из научных текстов
- Проверка орфографии на русском, казахском и английском языках
- Рецензирование по академическим стандартам

ФОРМАТ ОТВЕТА:
- ВСЕГДА отвечай ТОЛЬКО валидным JSON
- НИКОГДА не добавляй текст до или после JSON
- При неуверенности используй поле "confidence"`;

/**
 * Extract JSON from AI response
 */
const extractJsonFromResponse = (response) => {
  if (!response) return '{}';

  let jsonContent = response;

  // Handle </think> tags
  const thinkEndIndex = response.lastIndexOf('</think>');
  if (thinkEndIndex !== -1) {
    jsonContent = response.substring(thinkEndIndex + 8);
  }

  // Clean up
  let cleaned = jsonContent;
  cleaned = cleaned.replace(/<\/?think>/gi, '');
  cleaned = cleaned.replace(/```json\s*/gi, '');
  cleaned = cleaned.replace(/```\s*/gi, '');
  cleaned = cleaned.trim();

  // Extract balanced JSON
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let lastBrace = -1;
    for (let i = firstBrace; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          lastBrace = i;
          break;
        }
      }
    }
    if (lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  return cleaned || '{}';
};

/**
 * Repair truncated JSON
 */
const repairTruncatedJson = (jsonStr) => {
  let str = jsonStr.trim();
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }
  }

  if (inString) str = str + '"';
  str = str + ']'.repeat(Math.max(0, openBrackets));
  str = str + '}'.repeat(Math.max(0, openBraces));

  return str;
};

/**
 * Safe JSON parse
 */
const safeJsonParse = (jsonString, fallback = {}) => {
  try {
    const cleaned = extractJsonFromResponse(jsonString);
    return JSON.parse(cleaned);
  } catch (error) {
    try {
      const repaired = repairTruncatedJson(extractJsonFromResponse(jsonString));
      return JSON.parse(repaired);
    } catch {
      console.error('JSON parse error:', error);
      return fallback;
    }
  }
};

/**
 * Make AI request with rate limiting and fallback
 */
const makeAIRequest = async (prompt, maxTokens = 1000, taskType = 'general', fallbackIndex = -1, retryCount = 0) => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('AI Request Error: OPENROUTER_API_KEY is not set');
    throw new Error("API_KEY_MISSING");
  }

  await waitForRateLimit();

  // Use task-specific model or fallback
  let model;
  if (fallbackIndex < 0) {
    model = MODEL_ROUTING[taskType] || MODEL;
  } else {
    model = FALLBACK_MODELS[Math.min(fallbackIndex, FALLBACK_MODELS.length - 1)];
  }

  const isLastFallback = fallbackIndex >= FALLBACK_MODELS.length - 1;

  console.log(`AI Request: model=${model}, task=${taskType}, fallback=${fallbackIndex}, retry=${retryCount}`);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.APP_URL || "https://ai-redactor.railway.app",
        "X-Title": "AI Journal Editor"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;

      console.error(`AI Request Failed: status=${response.status}, model=${model}, error=${errorMessage}`);

      if (response.status === 401) {
        console.error('API Key is invalid or expired');
        throw new Error("API_KEY_INVALID");
      }

      if (response.status === 429) {
        consecutiveErrors++;
        const rateLimitInfo = parseRateLimitError(errorMessage);
        console.warn(`Rate limit hit: ${rateLimitInfo.type} - ${rateLimitInfo.message}`);

        if (rateLimitInfo.type === 'daily') {
          throw new Error(`RATE_LIMIT_DAILY|${rateLimitInfo.message}|${rateLimitInfo.suggestion}`);
        }

        if (retryCount < 2) {
          const backoffTime = Math.pow(2, retryCount + 1) * 5000;
          console.log(`Retrying in ${backoffTime}ms (attempt ${retryCount + 1}/2)...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          return makeAIRequest(prompt, maxTokens, taskType, fallbackIndex, retryCount + 1);
        }

        if (!isLastFallback) {
          console.log(`Switching to fallback model: ${FALLBACK_MODELS[fallbackIndex + 1]}`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          return makeAIRequest(prompt, maxTokens, taskType, fallbackIndex + 1, 0);
        }

        throw new Error(`RATE_LIMIT|${rateLimitInfo.message}|${rateLimitInfo.suggestion}`);
      }

      // Handle model not found (404) or model errors (400 with specific messages)
      if (response.status === 404 || response.status === 400) {
        console.warn(`Model ${model} not available, trying fallback...`);
        if (!isLastFallback) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return makeAIRequest(prompt, maxTokens, taskType, fallbackIndex + 1, 0);
        }
      }

      if (!isLastFallback && response.status >= 500) {
        console.warn(`Server error for model ${model}, trying fallback...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        return makeAIRequest(prompt, maxTokens, taskType, fallbackIndex + 1, 0);
      }

      throw new Error(`OpenRouter API error: ${errorMessage}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid API response structure:', JSON.stringify(data).substring(0, 200));
      throw new Error('Invalid API response structure');
    }

    consecutiveErrors = 0;
    console.log(`AI Request Success: model=${model}, task=${taskType}`);
    return data.choices[0].message.content;
  } catch (error) {
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      throw error;
    }

    if (error.message?.startsWith('RATE_LIMIT')) {
      throw error;
    }

    console.error(`AI Request Exception: ${error.message}`);

    if (!isLastFallback && (error.name === 'TypeError' || error.name === 'FetchError')) {
      console.log(`Network error, trying fallback model...`);
      return makeAIRequest(prompt, maxTokens, taskType, fallbackIndex + 1);
    }

    throw error;
  }
};

// Article sections configuration
const ARTICLE_SECTIONS = [
  'ТЕХНИЧЕСКИЕ НАУКИ',
  'ПЕДАГОГИЧЕСКИЕ НАУКИ',
  'ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ'
];

const NEEDS_REVIEW_SECTION = 'ТРЕБУЕТ КЛАССИФИКАЦИИ';
const CONFIDENCE_THRESHOLDS = { HIGH: 0.8, MEDIUM: 0.6, LOW: 0.4 };

/**
 * Extract metadata from article
 */
export const extractMetadata = async (fileName, content) => {
  // Check cache first
  const cacheKey = generateCacheKey('metadata', content, fileName);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const prompt = `Извлеки метаданные из научной статьи.

ПРАВИЛА ИЗВЛЕЧЕНИЯ НАЗВАНИЯ:
1. Название обычно в начале после УДК/UDC
2. Может быть ЗАГЛАВНЫМИ БУКВАМИ или обычным шрифтом
3. Идёт ДО списка авторов

ПРАВИЛА ИЗВЛЕЧЕНИЯ АВТОРА (КРИТИЧЕСКИ ВАЖНО):
1. Автор указан ПОСЛЕ названия статьи
2. ФОРМАТЫ АВТОРОВ (все допустимы):
   - "Фамилия И.О." (Иванов И.И.)
   - "И.О. Фамилия" (И.И. Иванов)
   - "Фамилия Имя Отчество" (Иванов Иван Иванович)
   - "Surname I.O." или "I.O. Surname" (для английских статей)
   - Казахские имена: Әлиев Ә.М., Қасымов Қ.Б., Жұмабаев Ж.Ж.
3. Часто ПЕРЕД именем стоит учёная степень (к.т.н., PhD, д.э.н.)
4. Часто ПОСЛЕ имени указана организация или email
5. Если несколько авторов через запятую - верни ПЕРВОГО
6. Игнорируй рецензентов и редакторов

ПРИМЕРЫ:
- "УДК 004.5 АНАЛИЗ ДАННЫХ Иванов И.И., к.т.н." → author: "Иванов И.И."
- "Методика обучения / А.Б. Петров, PhD" → author: "А.Б. Петров"
- "ИССЛЕДОВАНИЕ РЫНКА Сидоров Иван Петрович" → author: "Сидоров И.П."
- "Зерттеу жұмысы Әлиев Ә.М." → author: "Әлиев Ә.М."

ТЕКСТ СТАТЬИ (файл "${fileName}"):
${content.substring(0, 4000)}

Ответь ТОЛЬКО JSON: {"title": "полное название", "author": "Фамилия И.О."}`;

  const fallback = {
    title: fileName.replace('.docx', '').replace(/_/g, ' '),
    author: 'Автор не указан'
  };

  try {
    const response = await makeAIRequest(prompt, 800, 'metadata');
    const metadata = safeJsonParse(response, fallback);

    // Normalize author - handle null, "null", empty string, or placeholder values
    let author = metadata.author;
    if (!author || author === 'null' || author === 'Не указан' || author.trim() === '') {
      author = fallback.author;
    }

    // Clean up author name - remove trailing commas, extra spaces
    author = author.trim().replace(/,\s*$/, '').replace(/\s+/g, ' ');

    const result = {
      title: metadata.title || fallback.title,
      author: author
    };

    console.log(`Metadata extracted for "${fileName}": title="${result.title?.substring(0, 50)}...", author="${result.author}"`);

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("AI extraction error:", error);
    return fallback;
  }
};

/**
 * Detect article section with Chain-of-Thought prompting
 */
export const detectSection = async (content, title) => {
  // Check cache first
  const cacheKey = generateCacheKey('section', content, title);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const prompt = `## ЗАДАЧА
Определи раздел журнала для научной статьи.

## РАЗДЕЛЫ (выбери ОДИН):
1. ТЕХНИЧЕСКИЕ НАУКИ — IT, инженерия, программирование, строительство, автоматизация
2. ПЕДАГОГИЧЕСКИЕ НАУКИ — образование, методика преподавания, дидактика, педагогика
3. ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ — физика, химия, биология, экономика, медицина

## АЛГОРИТМ КЛАССИФИКАЦИИ (Chain-of-Thought):
ШАГ 1: Найди КЛЮЧЕВЫЕ ТЕРМИНЫ в тексте
ШАГ 2: Определи МЕТОДОЛОГИЮ исследования
ШАГ 3: Определи ОБЪЕКТ исследования
ШАГ 4: Выбери раздел по МЕТОДОЛОГИИ, не по объекту

## ВАЖНЫЕ ПРАВИЛА:
- "Методика преподавания X" → ПЕДАГОГИЧЕСКИЕ НАУКИ (даже если X = IT)
- "Разработка программного обеспечения" → ТЕХНИЧЕСКИЕ НАУКИ
- Confidence < 0.5 → требует ручной проверки

## НАЗВАНИЕ: "${title}"
## ТЕКСТ (начало):
${content.substring(0, 2500)}

## ОТВЕТ (JSON):
{"section": "ТОЧНОЕ_НАЗВАНИЕ_РАЗДЕЛА", "confidence": 0.0-1.0, "reasoning": "1-2 предложения"}`;

  const fallbackResult = {
    section: NEEDS_REVIEW_SECTION,
    confidence: 0,
    needsReview: true,
    reasoning: 'Не удалось выполнить автоматическую классификацию'
  };

  try {
    const response = await makeAIRequest(prompt, 500, 'section');
    const result = safeJsonParse(response, null);

    if (!result || !result.section) {
      return fallbackResult;
    }

    const detectedSection = result.section?.toUpperCase?.()?.trim() || '';
    const matchedSection = ARTICLE_SECTIONS.find(s =>
      s.toUpperCase() === detectedSection ||
      s.toUpperCase().includes(detectedSection.replace(/\s+/g, ' ').trim()) ||
      detectedSection.includes(s.toUpperCase())
    );

    const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0.5));
    const needsReview = !matchedSection || confidence < CONFIDENCE_THRESHOLDS.LOW;

    const finalResult = {
      section: matchedSection || NEEDS_REVIEW_SECTION,
      confidence: matchedSection ? confidence : 0,
      needsReview,
      reasoning: result.reasoning || undefined
    };

    setCache(cacheKey, finalResult);
    return finalResult;
  } catch (error) {
    console.error("Section detection error:", error);
    return fallbackResult;
  }
};

/**
 * Check spelling with improved prompt
 */
export const checkSpelling = async (content, fileName) => {
  const prompt = `## ЗАДАЧА
Найди ТОЛЬКО реальные орфографические ОШИБКИ в тексте.

## ПРАВИЛА:
1. word и suggestion ДОЛЖНЫ быть РАЗНЫМИ словами
2. НЕ отмечай правильно написанные слова
3. ИГНОРИРУЙ:
   - Термины: DNA, РНК, IT, API, SQL
   - Имена и названия: Иванов, Казахстан, Google
   - Аббревиатуры: ЖКХ, ВУЗ, НИИ
   - Казахские слова если корректны: қазақ, ұлт, әдіс

## ПРИМЕРЫ ОШИБОК:
✅ {"word": "эксперемент", "suggestion": "эксперимент"} — ПРАВИЛЬНО
✅ {"word": "обьект", "suggestion": "объект"} — ПРАВИЛЬНО
❌ {"word": "многогранного", "suggestion": "многогранного"} — НЕПРАВИЛЬНО!

## ФОРМАТ:
{"errors": [{"word": "...", "suggestion": "...", "context": "...слово..."}], "totalErrors": N}

Если ошибок нет: {"errors": [], "totalErrors": 0}

## ТЕКСТ:
${content.substring(0, 4000)}`;

  const fallback = { errors: [], totalErrors: 0 };

  try {
    const response = await makeAIRequest(prompt, 2000, 'spelling');
    const result = safeJsonParse(response, fallback);

    const validErrors = Array.isArray(result.errors)
      ? result.errors.filter(err => {
          if (!err.word || !err.suggestion) return false;
          const word = err.word.toLowerCase().trim();
          const suggestion = err.suggestion.toLowerCase().trim();
          return word !== suggestion;
        })
      : [];

    return {
      fileName,
      errors: validErrors,
      totalErrors: validErrors.length
    };
  } catch (error) {
    console.error("Spell check error:", error);
    return { fileName, ...fallback };
  }
};

/**
 * Review article with structured criteria
 */
export const reviewArticle = async (content, fileName) => {
  const prompt = `Проведи экспертную рецензию научной статьи.

ШКАЛА ОЦЕНОК (1-5):
1 - Неприемлемо: критические недостатки
2 - Слабо: существенные проблемы
3 - Удовлетворительно: есть замечания
4 - Хорошо: незначительные замечания
5 - Отлично: соответствует стандартам

КРИТЕРИИ:
1. СТРУКТУРА (structure): введение, методология, результаты, выводы
2. ЛОГИКА (logic): последовательность аргументации
3. ОРИГИНАЛЬНОСТЬ (originality): новизна исследования
4. СТИЛЬ (style): научный язык, грамотность
5. АКТУАЛЬНОСТЬ (relevance): современность темы

ТЕКСТ СТАТЬИ (${fileName}):
${content.substring(0, 5000)}

Ответь JSON:
{
  "structure": {"score": N, "comment": "..."},
  "logic": {"score": N, "comment": "..."},
  "originality": {"score": N, "comment": "..."},
  "style": {"score": N, "comment": "..."},
  "relevance": {"score": N, "comment": "..."},
  "overallScore": N,
  "summary": "...",
  "recommendations": ["...", "..."]
}`;

  const fallback = {
    structure: { score: 0, comment: "Анализ недоступен" },
    logic: { score: 0, comment: "Анализ недоступен" },
    originality: { score: 0, comment: "Анализ недоступен" },
    style: { score: 0, comment: "Анализ недоступен" },
    relevance: { score: 0, comment: "Анализ недоступен" },
    overallScore: 0,
    summary: "Не удалось создать рецензию",
    recommendations: []
  };

  try {
    const response = await makeAIRequest(prompt, 2500, 'review');
    const review = safeJsonParse(response, null);

    if (!review || !review.structure) {
      return { fileName, ...fallback };
    }

    const clampScore = (score) => Math.max(1, Math.min(5, Number(score) || 3));

    return {
      fileName,
      structure: { score: clampScore(review.structure?.score), comment: review.structure?.comment || "" },
      logic: { score: clampScore(review.logic?.score), comment: review.logic?.comment || "" },
      originality: { score: clampScore(review.originality?.score), comment: review.originality?.comment || "" },
      style: { score: clampScore(review.style?.score), comment: review.style?.comment || "" },
      relevance: { score: clampScore(review.relevance?.score), comment: review.relevance?.comment || "" },
      overallScore: clampScore(review.overallScore),
      summary: review.summary || fallback.summary,
      recommendations: Array.isArray(review.recommendations) ? review.recommendations.filter(r => r && typeof r === 'string') : []
    };
  } catch (error) {
    console.error("Review error:", error);
    return { fileName, ...fallback };
  }
};

/**
 * Retry classification with enhanced prompt
 */
export const retryClassification = async (content, title, maxRetries = 3) => {
  const enhancedPrompt = `Ты - ГЛАВНЫЙ ЭКСПЕРТ по классификации научных публикаций.
КРИТИЧЕСКИ ВАЖНО: Выбери ОДИН из разделов ниже.

## РАЗДЕЛЫ:
1. ТЕХНИЧЕСКИЕ НАУКИ — IT, программирование, инженерия, строительство
2. ПЕДАГОГИЧЕСКИЕ НАУКИ — методика преподавания, образование, педагогика
3. ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ — физика, химия, биология, экономика

## ПРИМЕРЫ:
"Разработка мобильного приложения" → ТЕХНИЧЕСКИЕ НАУКИ
"Методика преподавания программирования" → ПЕДАГОГИЧЕСКИЕ НАУКИ
"Влияние удобрений на урожайность" → ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ

## НАЗВАНИЕ: "${title}"
## ТЕКСТ:
${content.substring(0, 3500)}

## ОТВЕТ (JSON):
{"section": "ТОЧНОЕ_НАЗВАНИЕ", "confidence": 0.75, "reasoning": "1-2 предложения"}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }

    try {
      const fallbackIndex = attempt === 0 ? -1 : Math.min(attempt - 1, FALLBACK_MODELS.length - 1);
      const response = await makeAIRequest(enhancedPrompt, 600, 'section', fallbackIndex);
      const result = safeJsonParse(response, null);

      if (!result || !result.section) continue;

      const detectedSection = result.section?.toUpperCase?.()?.trim() || '';
      const matchedSection = ARTICLE_SECTIONS.find(s => {
        const norm = s.toUpperCase().replace(/\s+/g, ' ').trim();
        const det = detectedSection.replace(/\s+/g, ' ').trim();
        return norm === det || norm.includes(det) || det.includes(norm) ||
               (det.includes('ТЕХНИЧ') && s.includes('ТЕХНИЧЕСКИЕ')) ||
               (det.includes('ПЕДАГОГ') && s.includes('ПЕДАГОГИЧЕСКИЕ')) ||
               (det.includes('ЕСТЕСТВ') && s.includes('ЕСТЕСТВЕННЫЕ'));
      });

      if (matchedSection) {
        const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0.6));
        return {
          section: matchedSection,
          confidence,
          needsReview: confidence < CONFIDENCE_THRESHOLDS.LOW,
          reasoning: result.reasoning || 'Автоматическая классификация'
        };
      }
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
        break;
      }
    }
  }

  return {
    section: NEEDS_REVIEW_SECTION,
    confidence: 0,
    needsReview: true,
    reasoning: `Не удалось классифицировать после ${maxRetries} попыток`
  };
};

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
  return {
    size: cache.size,
    maxSize: 1000,
    ttl: CACHE_TTL
  };
};

/**
 * Clear cache
 */
export const clearCache = () => {
  cache.clear();
  return { cleared: true };
};

export default {
  extractMetadata,
  detectSection,
  checkSpelling,
  reviewArticle,
  retryClassification,
  getCacheStats,
  clearCache
};
