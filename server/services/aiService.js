/**
 * AI Service - Multi-provider API integration
 * Primary: Groq (fast, free)
 * Fallback: OpenRouter (reliable backup)
 */

import crypto from 'crypto';

// ============ PROVIDER CONFIGURATION ============

const PROVIDERS = {
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    fallbackModels: ['mixtral-8x7b-32768', 'llama-3.1-8b-instant'],
    keyEnv: 'GROQ_API_KEY',
    rateLimit: { requestsPerMin: 30, tokensPerMin: 15000 },
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'tngtech/deepseek-r1t2-chimera:free',
    fallbackModels: [
      'google/gemma-2-9b-it:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'qwen/qwen-2.5-7b-instruct:free'
    ],
    keyEnv: 'OPENROUTER_API_KEY',
    rateLimit: { requestsPerMin: 20, requestsPerDay: 200 },
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL || 'https://ai-redactor.railway.app',
      'X-Title': 'AI Journal Editor'
    })
  }
};

// Get active provider (Groq primary, OpenRouter fallback)
const getActiveProvider = () => {
  if (process.env.GROQ_API_KEY) {
    return { provider: PROVIDERS.groq, apiKey: process.env.GROQ_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: PROVIDERS.openrouter, apiKey: process.env.OPENROUTER_API_KEY };
  }
  return null;
};

// ============ RATE LIMITING ============

const RATE_LIMIT_DELAY = 2000; // 2s for Groq (30 req/min = 2s between requests)
const RATE_LIMIT_DELAY_OPENROUTER = 5000;
const RATE_LIMIT_DELAY_AFTER_429 = 10000;
let lastRequestTime = 0;
let consecutiveErrors = 0;
let currentProviderName = null;

const waitForRateLimit = async (providerName) => {
  const now = Date.now();
  let baseDelay = providerName === 'groq' ? RATE_LIMIT_DELAY : RATE_LIMIT_DELAY_OPENROUTER;
  if (consecutiveErrors > 0) baseDelay = RATE_LIMIT_DELAY_AFTER_429;

  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < baseDelay) {
    const waitTime = baseDelay - timeSinceLastRequest;
    console.log(`Rate limiting (${providerName}): waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
};

// ============ CACHE ============

const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const generateCacheKey = (taskType, content, additionalKey = '') => {
  const hash = crypto.createHash('md5').update(content.substring(0, 2000)).digest('hex');
  return `${taskType}:${hash}:${additionalKey}`;
};

const getCached = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Cache hit for ${key}`);
    return cached.data;
  }
  if (cached) cache.delete(key);
  return null;
};

const setCache = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp > CACHE_TTL) cache.delete(k);
    }
  }
};

// ============ JSON PARSING ============

const extractJsonFromResponse = (response) => {
  if (!response) return '{}';
  let jsonContent = response;

  // Handle </think> tags from reasoning models
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
        if (depth === 0) { lastBrace = i; break; }
      }
    }
    if (lastBrace !== -1) cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned || '{}';
};

const repairTruncatedJson = (jsonStr) => {
  let str = jsonStr.trim();
  let openBraces = 0, openBrackets = 0, inString = false, escapeNext = false;

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

  if (inString) str += '"';
  str += ']'.repeat(Math.max(0, openBrackets));
  str += '}'.repeat(Math.max(0, openBraces));
  return str;
};

const safeJsonParse = (jsonString, fallback = {}) => {
  try {
    return JSON.parse(extractJsonFromResponse(jsonString));
  } catch {
    try {
      return JSON.parse(repairTruncatedJson(extractJsonFromResponse(jsonString)));
    } catch {
      return fallback;
    }
  }
};

// ============ RATE LIMIT ERROR PARSING ============

const parseRateLimitError = (errorMessage, providerName) => {
  const msg = errorMessage?.toLowerCase() || '';

  if (msg.includes('per-day') || msg.includes('per day') || msg.includes('daily')) {
    return {
      type: 'daily',
      message: providerName === 'groq'
        ? 'Дневной лимит Groq исчерпан'
        : 'Дневной лимит OpenRouter исчерпан (200 запросов/день)',
      suggestion: 'Переключение на резервный провайдер...'
    };
  }

  if (msg.includes('per-min') || msg.includes('per minute') || msg.includes('rate_limit')) {
    return {
      type: 'minute',
      message: providerName === 'groq'
        ? 'Превышен лимит Groq (30 запросов/мин)'
        : 'Превышен лимит OpenRouter (20 запросов/мин)',
      suggestion: 'Подождите минуту или используйте резервный провайдер'
    };
  }

  return { type: 'unknown', message: 'Лимит запросов исчерпан', suggestion: 'Попробуйте позже' };
};

// ============ SYSTEM PROMPT ============

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

// ============ CORE AI REQUEST ============

const makeAIRequest = async (prompt, maxTokens = 1000, taskType = 'general', options = {}) => {
  const { forceFallback = false, retryCount = 0, modelIndex = 0 } = options;

  // Get provider
  let activeConfig = getActiveProvider();

  // Force OpenRouter fallback if requested
  if (forceFallback && process.env.OPENROUTER_API_KEY) {
    activeConfig = { provider: PROVIDERS.openrouter, apiKey: process.env.OPENROUTER_API_KEY };
  }

  if (!activeConfig) {
    console.error('AI Request Error: No API key configured');
    throw new Error('API_KEY_MISSING');
  }

  const { provider, apiKey } = activeConfig;
  currentProviderName = provider.name.toLowerCase();

  await waitForRateLimit(currentProviderName);

  // Select model
  const allModels = [provider.model, ...provider.fallbackModels];
  const model = allModels[Math.min(modelIndex, allModels.length - 1)];
  const isLastModel = modelIndex >= allModels.length - 1;

  console.log(`AI Request: provider=${provider.name}, model=${model}, task=${taskType}, retry=${retryCount}`);

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: provider.headers(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      console.error(`AI Request Failed: status=${response.status}, provider=${provider.name}, error=${errorMessage}`);

      // Handle 401 - Invalid API key
      if (response.status === 401) {
        // Try fallback provider
        if (provider.name === 'Groq' && process.env.OPENROUTER_API_KEY) {
          console.log('Groq API key invalid, trying OpenRouter fallback...');
          return makeAIRequest(prompt, maxTokens, taskType, { forceFallback: true });
        }
        throw new Error('API_KEY_INVALID');
      }

      // Handle 429 - Rate limit
      if (response.status === 429) {
        consecutiveErrors++;
        const rateLimitInfo = parseRateLimitError(errorMessage, provider.name.toLowerCase());
        console.warn(`Rate limit (${provider.name}): ${rateLimitInfo.type}`);

        // Try next model in same provider
        if (!isLastModel) {
          console.log(`Trying fallback model: ${allModels[modelIndex + 1]}`);
          await new Promise(r => setTimeout(r, 3000));
          return makeAIRequest(prompt, maxTokens, taskType, { ...options, modelIndex: modelIndex + 1, retryCount: 0 });
        }

        // Try other provider
        if (provider.name === 'Groq' && process.env.OPENROUTER_API_KEY) {
          console.log('Groq rate limited, switching to OpenRouter...');
          await new Promise(r => setTimeout(r, 2000));
          return makeAIRequest(prompt, maxTokens, taskType, { forceFallback: true });
        }

        // Retry with backoff
        if (retryCount < 2) {
          const backoff = Math.pow(2, retryCount + 1) * 3000;
          console.log(`Retrying in ${backoff}ms...`);
          await new Promise(r => setTimeout(r, backoff));
          return makeAIRequest(prompt, maxTokens, taskType, { ...options, retryCount: retryCount + 1 });
        }

        throw new Error(`RATE_LIMIT|${rateLimitInfo.message}|${rateLimitInfo.suggestion}`);
      }

      // Handle 404/400 - Model not available
      if (response.status === 404 || response.status === 400) {
        if (!isLastModel) {
          console.log(`Model ${model} unavailable, trying ${allModels[modelIndex + 1]}`);
          await new Promise(r => setTimeout(r, 1000));
          return makeAIRequest(prompt, maxTokens, taskType, { ...options, modelIndex: modelIndex + 1 });
        }
        // Try other provider
        if (provider.name === 'Groq' && process.env.OPENROUTER_API_KEY) {
          console.log('All Groq models unavailable, switching to OpenRouter...');
          return makeAIRequest(prompt, maxTokens, taskType, { forceFallback: true });
        }
      }

      // Handle 5xx - Server error
      if (response.status >= 500 && provider.name === 'Groq' && process.env.OPENROUTER_API_KEY) {
        console.log('Groq server error, switching to OpenRouter...');
        return makeAIRequest(prompt, maxTokens, taskType, { forceFallback: true });
      }

      throw new Error(`${provider.name} API error: ${errorMessage}`);
    }

    const data = await response.json();

    if (!data.choices?.[0]?.message) {
      throw new Error('Invalid API response structure');
    }

    consecutiveErrors = 0;
    console.log(`AI Request Success: provider=${provider.name}, model=${model}`);
    return data.choices[0].message.content;

  } catch (error) {
    if (error.message === 'API_KEY_MISSING' || error.message === 'API_KEY_INVALID') throw error;
    if (error.message?.startsWith('RATE_LIMIT')) throw error;

    console.error(`AI Request Exception: ${error.message}`);

    // Network error - try other provider
    if ((error.name === 'TypeError' || error.name === 'FetchError') &&
        provider.name === 'Groq' && process.env.OPENROUTER_API_KEY) {
      console.log('Network error, switching to OpenRouter...');
      return makeAIRequest(prompt, maxTokens, taskType, { forceFallback: true });
    }

    throw error;
  }
};

// ============ ARTICLE SECTIONS ============

const ARTICLE_SECTIONS = [
  'ТЕХНИЧЕСКИЕ НАУКИ',
  'ПЕДАГОГИЧЕСКИЕ НАУКИ',
  'ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ'
];
const NEEDS_REVIEW_SECTION = 'ТРЕБУЕТ КЛАССИФИКАЦИИ';
const CONFIDENCE_THRESHOLDS = { HIGH: 0.8, MEDIUM: 0.6, LOW: 0.4 };

// ============ COMBINED ANALYSIS (FAST) ============

/**
 * Analyze article in one request: metadata + section + quick review
 * 4x faster than separate requests
 */
export const analyzeArticle = async (fileName, content) => {
  const cacheKey = generateCacheKey('analyze', content, fileName);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const prompt = `## ЗАДАЧА
Проанализируй научную статью и верни метаданные, раздел и краткую оценку.

## ПРАВИЛА ИЗВЛЕЧЕНИЯ:

### НАЗВАНИЕ:
- Обычно после УДК/UDC, до списка авторов
- Может быть ЗАГЛАВНЫМИ или обычным шрифтом

### АВТОР:
- После названия, форматы: "Фамилия И.О.", "И.О. Фамилия", полное ФИО
- Игнорируй рецензентов, учёные степени (к.т.н., PhD)
- Если несколько авторов — верни ПЕРВОГО

### РАЗДЕЛ (выбери ОДИН):
1. ТЕХНИЧЕСКИЕ НАУКИ — IT, инженерия, программирование, строительство
2. ПЕДАГОГИЧЕСКИЕ НАУКИ — образование, методика преподавания, дидактика
3. ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ — физика, химия, биология, экономика

### ОЦЕНКА:
- Структура (1-5): наличие введения, методологии, результатов, выводов
- Качество (1-5): общее качество изложения

## ТЕКСТ СТАТЬИ (файл "${fileName}"):
${content.substring(0, 4000)}

## ОТВЕТ (JSON):
{
  "title": "полное название статьи",
  "author": "Фамилия И.О.",
  "section": "ТОЧНОЕ_НАЗВАНИЕ_РАЗДЕЛА",
  "sectionConfidence": 0.0-1.0,
  "sectionReasoning": "1-2 предложения почему этот раздел",
  "structureScore": 1-5,
  "qualityScore": 1-5
}`;

  const fallback = {
    title: fileName.replace('.docx', '').replace(/_/g, ' '),
    author: 'Автор не указан',
    section: NEEDS_REVIEW_SECTION,
    sectionConfidence: 0,
    needsReview: true,
    structureScore: 0,
    qualityScore: 0
  };

  try {
    const response = await makeAIRequest(prompt, 1000, 'analyze');
    const result = safeJsonParse(response, null);

    if (!result || !result.title) return fallback;

    // Process author
    let author = result.author;
    if (!author || author === 'null' || author === 'Не указан' || !author.trim()) {
      author = fallback.author;
    }
    author = author.trim().replace(/,\s*$/, '').replace(/\s+/g, ' ');

    // Process section
    const detectedSection = result.section?.toUpperCase?.()?.trim() || '';
    const matchedSection = ARTICLE_SECTIONS.find(s =>
      s.toUpperCase() === detectedSection ||
      s.toUpperCase().includes(detectedSection.replace(/\s+/g, ' ').trim()) ||
      detectedSection.includes(s.toUpperCase()) ||
      (detectedSection.includes('ТЕХНИЧ') && s.includes('ТЕХНИЧЕСКИЕ')) ||
      (detectedSection.includes('ПЕДАГОГ') && s.includes('ПЕДАГОГИЧЕСКИЕ')) ||
      (detectedSection.includes('ЕСТЕСТВ') && s.includes('ЕСТЕСТВЕННЫЕ'))
    );

    const confidence = Math.max(0, Math.min(1, Number(result.sectionConfidence) || 0.5));

    const finalResult = {
      title: result.title || fallback.title,
      author,
      section: matchedSection || NEEDS_REVIEW_SECTION,
      sectionConfidence: matchedSection ? confidence : 0,
      needsReview: !matchedSection || confidence < CONFIDENCE_THRESHOLDS.LOW,
      sectionReasoning: result.sectionReasoning || undefined,
      structureScore: Math.max(1, Math.min(5, Number(result.structureScore) || 3)),
      qualityScore: Math.max(1, Math.min(5, Number(result.qualityScore) || 3))
    };

    console.log(`Analyzed "${fileName}": section=${finalResult.section}, confidence=${finalResult.sectionConfidence}`);
    setCache(cacheKey, finalResult);
    return finalResult;

  } catch (error) {
    console.error('Article analysis error:', error);
    return fallback;
  }
};

// ============ BATCH ANALYSIS (MAXIMUM SPEED) ============

/**
 * Analyze multiple articles in one request
 * Up to 5 articles per batch = 20x faster than individual requests
 * @param {Array} articles - Array of {fileName, content}
 * @returns {Array} - Array of analysis results
 */
export const analyzeArticlesBatch = async (articles) => {
  if (!articles || articles.length === 0) return [];

  // Limit batch size to prevent token overflow
  const BATCH_SIZE = 5;
  const MAX_CHARS_PER_ARTICLE = 1500;

  const batch = articles.slice(0, BATCH_SIZE);

  // Check cache for each article
  const results = [];
  const uncachedArticles = [];

  for (const article of batch) {
    const cacheKey = generateCacheKey('analyze', article.content, article.fileName);
    const cached = getCached(cacheKey);
    if (cached) {
      results.push({ ...cached, fileName: article.fileName, fromCache: true });
    } else {
      uncachedArticles.push(article);
    }
  }

  // If all cached, return immediately
  if (uncachedArticles.length === 0) {
    console.log(`Batch: all ${batch.length} articles from cache`);
    return results;
  }

  // Build batch prompt
  const articlesText = uncachedArticles.map((a, i) =>
    `### СТАТЬЯ ${i + 1} (файл: "${a.fileName}"):\n${a.content.substring(0, MAX_CHARS_PER_ARTICLE)}`
  ).join('\n\n');

  const prompt = `## ЗАДАЧА
Проанализируй ${uncachedArticles.length} научных статей и верни массив результатов.

## ПРАВИЛА:
- НАЗВАНИЕ: после УДК/UDC, до авторов
- АВТОР: первый автор в формате "Фамилия И.О."
- РАЗДЕЛ (выбери ОДИН для каждой):
  1. ТЕХНИЧЕСКИЕ НАУКИ — IT, инженерия, программирование
  2. ПЕДАГОГИЧЕСКИЕ НАУКИ — образование, методика преподавания
  3. ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ — физика, химия, биология, экономика

## СТАТЬИ:
${articlesText}

## ОТВЕТ (JSON массив, СТРОГО ${uncachedArticles.length} элементов):
[
  {"fileName": "имя_файла_1", "title": "...", "author": "...", "section": "...", "sectionConfidence": 0.0-1.0},
  ...
]`;

  const fallbackResults = uncachedArticles.map(a => ({
    fileName: a.fileName,
    title: a.fileName.replace('.docx', '').replace(/_/g, ' '),
    author: 'Автор не указан',
    section: NEEDS_REVIEW_SECTION,
    sectionConfidence: 0,
    needsReview: true
  }));

  try {
    // More tokens for batch response
    const response = await makeAIRequest(prompt, 2000, 'batch');

    // Parse JSON array from response
    let parsed;
    const cleaned = extractJsonFromResponse(response);

    // Handle array response
    if (cleaned.startsWith('[')) {
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Try to repair truncated array
        const repaired = repairTruncatedJson(cleaned);
        parsed = JSON.parse(repaired);
      }
    } else {
      // If wrapped in object, extract articles array
      const obj = safeJsonParse(cleaned, {});
      parsed = obj.articles || obj.results || [obj];
    }

    if (!Array.isArray(parsed)) {
      console.warn('Batch response not an array, using fallback');
      return [...results, ...fallbackResults];
    }

    // Process each result
    const processedResults = [];
    for (let i = 0; i < uncachedArticles.length; i++) {
      const article = uncachedArticles[i];
      const result = parsed[i] || {};

      // Match section
      const detectedSection = result.section?.toUpperCase?.()?.trim() || '';
      const matchedSection = ARTICLE_SECTIONS.find(s =>
        s.toUpperCase() === detectedSection ||
        detectedSection.includes(s.toUpperCase()) ||
        (detectedSection.includes('ТЕХНИЧ') && s.includes('ТЕХНИЧЕСКИЕ')) ||
        (detectedSection.includes('ПЕДАГОГ') && s.includes('ПЕДАГОГИЧЕСКИЕ')) ||
        (detectedSection.includes('ЕСТЕСТВ') && s.includes('ЕСТЕСТВЕННЫЕ'))
      );

      const confidence = Math.max(0, Math.min(1, Number(result.sectionConfidence) || 0.5));

      let author = result.author;
      if (!author || author === 'null' || author === 'Не указан' || !author.trim()) {
        author = 'Автор не указан';
      }
      author = author.trim().replace(/,\s*$/, '').replace(/\s+/g, ' ');

      const finalResult = {
        fileName: article.fileName,
        title: result.title || article.fileName.replace('.docx', '').replace(/_/g, ' '),
        author,
        section: matchedSection || NEEDS_REVIEW_SECTION,
        sectionConfidence: matchedSection ? confidence : 0,
        needsReview: !matchedSection || confidence < CONFIDENCE_THRESHOLDS.LOW,
        sectionReasoning: result.sectionReasoning
      };

      // Cache the result
      const cacheKey = generateCacheKey('analyze', article.content, article.fileName);
      setCache(cacheKey, finalResult);

      processedResults.push(finalResult);
    }

    console.log(`Batch analyzed ${processedResults.length} articles in one request`);
    return [...results, ...processedResults];

  } catch (error) {
    console.error('Batch analysis error:', error);
    return [...results, ...fallbackResults];
  }
};

// ============ INDIVIDUAL FUNCTIONS (backward compatibility) ============

/**
 * Extract metadata from article
 */
export const extractMetadata = async (fileName, content) => {
  const cacheKey = generateCacheKey('metadata', content, fileName);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const prompt = `Извлеки метаданные из научной статьи.

ПРАВИЛА ИЗВЛЕЧЕНИЯ НАЗВАНИЯ:
1. Название обычно в начале после УДК/UDC
2. Может быть ЗАГЛАВНЫМИ БУКВАМИ или обычным шрифтом
3. Идёт ДО списка авторов

ПРАВИЛА ИЗВЛЕЧЕНИЯ АВТОРА:
1. Автор указан ПОСЛЕ названия статьи
2. Форматы: "Фамилия И.О.", "И.О. Фамилия", полное ФИО
3. Часто ПЕРЕД именем стоит учёная степень (к.т.н., PhD)
4. Если несколько авторов — верни ПЕРВОГО

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

    let author = metadata.author;
    if (!author || author === 'null' || author === 'Не указан' || !author.trim()) {
      author = fallback.author;
    }
    author = author.trim().replace(/,\s*$/, '').replace(/\s+/g, ' ');

    const result = {
      title: metadata.title || fallback.title,
      author
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return fallback;
  }
};

/**
 * Detect article section
 */
export const detectSection = async (content, title) => {
  const cacheKey = generateCacheKey('section', content, title);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const prompt = `## ЗАДАЧА
Определи раздел журнала для научной статьи.

## РАЗДЕЛЫ (выбери ОДИН):
1. ТЕХНИЧЕСКИЕ НАУКИ — IT, инженерия, программирование, строительство
2. ПЕДАГОГИЧЕСКИЕ НАУКИ — образование, методика преподавания, дидактика
3. ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ — физика, химия, биология, экономика

## НАЗВАНИЕ: "${title}"
## ТЕКСТ:
${content.substring(0, 2500)}

## ОТВЕТ (JSON):
{"section": "ТОЧНОЕ_НАЗВАНИЕ_РАЗДЕЛА", "confidence": 0.0-1.0, "reasoning": "1-2 предложения"}`;

  const fallbackResult = {
    section: NEEDS_REVIEW_SECTION,
    confidence: 0,
    needsReview: true,
    reasoning: 'Не удалось выполнить классификацию'
  };

  try {
    const response = await makeAIRequest(prompt, 500, 'section');
    const result = safeJsonParse(response, null);

    if (!result?.section) return fallbackResult;

    const detectedSection = result.section?.toUpperCase?.()?.trim() || '';
    const matchedSection = ARTICLE_SECTIONS.find(s =>
      s.toUpperCase() === detectedSection ||
      s.toUpperCase().includes(detectedSection) ||
      detectedSection.includes(s.toUpperCase())
    );

    const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0.5));

    const finalResult = {
      section: matchedSection || NEEDS_REVIEW_SECTION,
      confidence: matchedSection ? confidence : 0,
      needsReview: !matchedSection || confidence < CONFIDENCE_THRESHOLDS.LOW,
      reasoning: result.reasoning
    };

    setCache(cacheKey, finalResult);
    return finalResult;
  } catch (error) {
    console.error('Section detection error:', error);
    return fallbackResult;
  }
};

/**
 * Check spelling
 */
export const checkSpelling = async (content, fileName) => {
  const prompt = `## ЗАДАЧА
Найди ТОЛЬКО реальные орфографические ОШИБКИ в тексте.

## ПРАВИЛА:
1. word и suggestion ДОЛЖНЫ быть РАЗНЫМИ
2. ИГНОРИРУЙ: термины, имена, аббревиатуры, казахские слова

## ПРИМЕРЫ ОШИБОК:
✅ {"word": "эксперемент", "suggestion": "эксперимент"}
✅ {"word": "обьект", "suggestion": "объект"}
❌ {"word": "многогранного", "suggestion": "многогранного"} — НЕПРАВИЛЬНО!

## ФОРМАТ:
{"errors": [{"word": "...", "suggestion": "...", "context": "..."}], "totalErrors": N}

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
          return err.word.toLowerCase().trim() !== err.suggestion.toLowerCase().trim();
        })
      : [];

    return { fileName, errors: validErrors, totalErrors: validErrors.length };
  } catch (error) {
    console.error('Spell check error:', error);
    return { fileName, ...fallback };
  }
};

/**
 * Review article
 */
export const reviewArticle = async (content, fileName) => {
  const prompt = `Проведи рецензию научной статьи.

ШКАЛА (1-5): 1-неприемлемо, 2-слабо, 3-удовл., 4-хорошо, 5-отлично

КРИТЕРИИ:
1. structure: введение, методология, результаты, выводы
2. logic: последовательность аргументации
3. originality: новизна исследования
4. style: научный язык, грамотность
5. relevance: актуальность темы

ТЕКСТ (${fileName}):
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
  "recommendations": ["..."]
}`;

  const fallback = {
    structure: { score: 0, comment: 'Анализ недоступен' },
    logic: { score: 0, comment: 'Анализ недоступен' },
    originality: { score: 0, comment: 'Анализ недоступен' },
    style: { score: 0, comment: 'Анализ недоступен' },
    relevance: { score: 0, comment: 'Анализ недоступен' },
    overallScore: 0,
    summary: 'Не удалось создать рецензию',
    recommendations: []
  };

  try {
    const response = await makeAIRequest(prompt, 2500, 'review');
    const review = safeJsonParse(response, null);

    if (!review?.structure) return { fileName, ...fallback };

    const clampScore = (score) => Math.max(1, Math.min(5, Number(score) || 3));

    return {
      fileName,
      structure: { score: clampScore(review.structure?.score), comment: review.structure?.comment || '' },
      logic: { score: clampScore(review.logic?.score), comment: review.logic?.comment || '' },
      originality: { score: clampScore(review.originality?.score), comment: review.originality?.comment || '' },
      style: { score: clampScore(review.style?.score), comment: review.style?.comment || '' },
      relevance: { score: clampScore(review.relevance?.score), comment: review.relevance?.comment || '' },
      overallScore: clampScore(review.overallScore),
      summary: review.summary || fallback.summary,
      recommendations: Array.isArray(review.recommendations) ? review.recommendations.filter(r => r && typeof r === 'string') : []
    };
  } catch (error) {
    console.error('Review error:', error);
    return { fileName, ...fallback };
  }
};

/**
 * Retry classification
 */
export const retryClassification = async (content, title, maxRetries = 3) => {
  const prompt = `Ты - ГЛАВНЫЙ ЭКСПЕРТ по классификации научных публикаций.

## РАЗДЕЛЫ:
1. ТЕХНИЧЕСКИЕ НАУКИ — IT, программирование, инженерия, строительство
2. ПЕДАГОГИЧЕСКИЕ НАУКИ — методика преподавания, образование, педагогика
3. ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ — физика, химия, биология, экономика

## НАЗВАНИЕ: "${title}"
## ТЕКСТ:
${content.substring(0, 3500)}

## ОТВЕТ (JSON):
{"section": "ТОЧНОЕ_НАЗВАНИЕ", "confidence": 0.75, "reasoning": "1-2 предложения"}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
    }

    try {
      const response = await makeAIRequest(prompt, 600, 'section', { modelIndex: attempt });
      const result = safeJsonParse(response, null);

      if (!result?.section) continue;

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
        return {
          section: matchedSection,
          confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.6)),
          needsReview: false,
          reasoning: result.reasoning || 'Автоматическая классификация'
        };
      }
    } catch (error) {
      console.error(`Retry attempt ${attempt + 1} failed:`, error.message);
      if (error.message === 'API_KEY_MISSING' || error.message === 'API_KEY_INVALID') break;
    }
  }

  return {
    section: NEEDS_REVIEW_SECTION,
    confidence: 0,
    needsReview: true,
    reasoning: `Не удалось классифицировать после ${maxRetries} попыток`
  };
};

// ============ STATUS & CACHE ============

export const getStatus = () => {
  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  return {
    available: !!(groqKey || openrouterKey),
    primaryProvider: groqKey ? 'Groq' : (openrouterKey ? 'OpenRouter' : null),
    fallbackProvider: groqKey && openrouterKey ? 'OpenRouter' : null,
    groq: {
      configured: !!groqKey,
      model: PROVIDERS.groq.model,
      rateLimit: '30 req/min'
    },
    openrouter: {
      configured: !!openrouterKey,
      model: PROVIDERS.openrouter.model,
      rateLimit: '200 req/day'
    },
    cacheEnabled: true,
    cacheSize: cache.size
  };
};

export const getCacheStats = () => ({
  size: cache.size,
  maxSize: 1000,
  ttl: CACHE_TTL
});

export const clearCache = () => {
  cache.clear();
  return { cleared: true };
};

export default {
  analyzeArticle,
  analyzeArticlesBatch,
  extractMetadata,
  detectSection,
  checkSpelling,
  reviewArticle,
  retryClassification,
  getStatus,
  getCacheStats,
  clearCache
};
