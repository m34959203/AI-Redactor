/**
 * OpenRouter API Service with improved prompts
 * Supports Russian, English, and Kazakh languages
 */

import {
  ARTICLE_SECTIONS,
  SECTION_METADATA,
  CONFIDENCE_THRESHOLDS,
  NEEDS_REVIEW_SECTION,
  isValidSection
} from '../constants/sections';

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "tngtech/deepseek-r1t2-chimera:free";
// Fallback models in order of preference (updated to currently available free models)
const FALLBACK_MODELS = [
  "google/gemma-2-9b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "mistralai/mistral-7b-instruct:free"
];

// System prompt for consistent AI behavior
const SYSTEM_PROMPT = `Ты - эксперт-классификатор научных публикаций для академического журнала.
Ты анализируешь научные статьи на русском, английском и казахском языках.
Всегда отвечай ТОЛЬКО в формате JSON без дополнительного текста.
Не добавляй пояснения до или после JSON.
При классификации учитывай методологию, объект исследования и ключевые термины.`;

/**
 * Extracts JSON from AI response that may contain <think> tags or other text
 */
const extractJsonFromResponse = (response) => {
  if (!response) return '{}';

  // FIRST: Try to find JSON in the response before any cleanup
  // This prevents regex from accidentally deleting JSON content

  // Look for JSON that starts after </think> or at beginning
  let jsonContent = response;

  // Find the last occurrence of </think> and take everything after it
  const thinkEndIndex = response.lastIndexOf('</think>');
  if (thinkEndIndex !== -1) {
    jsonContent = response.substring(thinkEndIndex + 8); // 8 = length of '</think>'
  } else {
    // No closing think tag - try to find JSON directly
    // Look for first { that might be JSON (after any <think> content)
    const thinkStartIndex = response.indexOf('<think>');
    if (thinkStartIndex !== -1) {
      // Find JSON after the think tag or before it
      const beforeThink = response.substring(0, thinkStartIndex);
      const jsonInBefore = beforeThink.match(/\{[\s\S]*\}/);
      if (jsonInBefore) {
        jsonContent = jsonInBefore[0];
      } else {
        // Try to find JSON that might be mixed with incomplete think content
        // Extract everything that looks like JSON
        const jsonMatch = response.match(/\{[^<]*"(?:structure|title)"[\s\S]*?\}(?=\s*$|\s*<)/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
      }
    }
  }

  // Clean up any remaining tags and markdown
  let cleaned = jsonContent;
  cleaned = cleaned.replace(/<\/?think>/gi, '');
  cleaned = cleaned.replace(/```json\s*/gi, '');
  cleaned = cleaned.replace(/```\s*/gi, '');
  cleaned = cleaned.trim();

  // Try to extract complete JSON object using balanced braces
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
 * Makes a request to OpenRouter API with system prompt
 * @param {string} prompt - The prompt to send
 * @param {number} maxTokens - Maximum tokens for response
 * @param {number} fallbackIndex - Index of fallback model to use (-1 = primary model)
 */
const makeAIRequest = async (prompt, maxTokens = 1000, fallbackIndex = -1) => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  // Select model based on fallback index
  const model = fallbackIndex < 0 ? MODEL : FALLBACK_MODELS[fallbackIndex];
  const isLastFallback = fallbackIndex >= FALLBACK_MODELS.length - 1;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "AI Journal Editor"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: prompt
          }
        ],
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;

      // 401 = invalid API key, don't retry
      if (response.status === 401) {
        throw new Error("API_KEY_INVALID");
      }

      // Retry with next fallback on rate limit, server errors, or model not found (404)
      if (!isLastFallback && (response.status === 404 || response.status === 429 || response.status >= 500)) {
        const nextFallbackIndex = fallbackIndex + 1;
        const nextModel = FALLBACK_MODELS[nextFallbackIndex];
        console.warn(`Model ${model} failed (${response.status}), trying fallback: ${nextModel}...`);
        return makeAIRequest(prompt, maxTokens, nextFallbackIndex);
      }

      throw new Error(`OpenRouter API error: ${errorMessage}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid API response structure');
    }

    return data.choices[0].message.content;
  } catch (error) {
    // Don't retry on auth errors
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      throw error;
    }

    // Try next fallback on network errors
    if (!isLastFallback && error.name === 'TypeError') {
      const nextFallbackIndex = fallbackIndex + 1;
      const nextModel = FALLBACK_MODELS[nextFallbackIndex];
      console.warn(`Network error with ${model}, trying fallback: ${nextModel}...`);
      return makeAIRequest(prompt, maxTokens, nextFallbackIndex);
    }

    console.error("OpenRouter API request failed:", error);
    throw error;
  }
};

/**
 * Attempts to repair truncated JSON by closing open structures
 */
const repairTruncatedJson = (jsonStr) => {
  let str = jsonStr.trim();

  // Count unclosed structures
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }
  }

  // If we're in a string, try to close it
  if (inString) {
    // Find last quote and truncate there or add closing quote
    str = str + '"';
  }

  // Close any open brackets and braces
  str = str + ']'.repeat(Math.max(0, openBrackets));
  str = str + '}'.repeat(Math.max(0, openBraces));

  return str;
};

/**
 * Safely parses JSON with fallback values
 */
const safeJsonParse = (jsonString, fallback = {}) => {
  try {
    const cleaned = extractJsonFromResponse(jsonString);
    return JSON.parse(cleaned);
  } catch (error) {
    // Try to repair truncated JSON
    try {
      const repaired = repairTruncatedJson(extractJsonFromResponse(jsonString));
      console.warn('Attempting to repair truncated JSON...');
      return JSON.parse(repaired);
    } catch (repairError) {
      console.error('JSON parse error:', error, 'Raw:', jsonString?.substring(0, 500));
      return fallback;
    }
  }
};

/**
 * Extracts metadata (title and author) from article content using AI
 * Supports Russian, English, and Kazakh articles
 */
export const extractMetadataWithAI = async (fileName, content) => {
  const prompt = `Извлеки метаданные из научной статьи.

ПРАВИЛА ИЗВЛЕЧЕНИЯ:
1. Название статьи обычно в начале документа
   - Может быть ЗАГЛАВНЫМИ БУКВАМИ
   - Может быть на русском, английском или казахском языке
2. Автор(ы) указаны после названия
   - Формат: "Фамилия И.О." или "И.О. Фамилия" или "Surname N."
   - Если несколько авторов - укажи только первого
3. Если название или автор не найдены - верни null для этого поля

ПРИМЕРЫ:
Вход: "ВЛИЯНИЕ КЛИМАТА НА ЭКОСИСТЕМУ\\nИванов А.Б., Петров В.Г.\\nАннотация..."
Выход: {"title": "Влияние климата на экосистему", "author": "Иванов А.Б."}

Вход: "ҚАЗАҚСТАНДАҒЫ ЭКОЛОГИЯ МӘСЕЛЕЛЕРІ\\nСәрсенбаев Қ.М.\\nКіріспе..."
Выход: {"title": "Қазақстандағы экология мәселелері", "author": "Сәрсенбаев Қ.М."}

Вход: "CLIMATE CHANGE IMPACTS\\nSmith J., Brown A.\\nAbstract..."
Выход: {"title": "Climate Change Impacts", "author": "Smith J."}

ТЕКСТ СТАТЬИ (файл "${fileName}"):
${content.substring(0, 2500)}

Ответь JSON: {"title": "...", "author": "..."}`;

  const fallback = {
    title: fileName.replace('.docx', '').replace(/_/g, ' '),
    author: 'Автор не указан'
  };

  try {
    const response = await makeAIRequest(prompt, 600);
    const metadata = safeJsonParse(response, fallback);

    return {
      title: metadata.title || fallback.title,
      author: metadata.author || fallback.author
    };
  } catch (error) {
    console.error("AI extraction error:", error);
    // Show API config message in author field to alert user
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      return {
        title: fallback.title,
        author: '⚠️ API ключ не настроен'
      };
    }
    return fallback;
  }
};

/**
 * Checks spelling in the content using AI
 * Supports Russian, English, and Kazakh text
 */
export const checkSpelling = async (content, fileName) => {
  const prompt = `Проверь орфографию в научном тексте.

ВАЖНЫЕ ПРАВИЛА:
1. Возвращай ТОЛЬКО реальные орфографические ОШИБКИ, где слово написано НЕПРАВИЛЬНО
2. word и suggestion должны быть РАЗНЫМИ словами!
3. Если слово написано правильно - НЕ добавляй его в список ошибок
4. Игнорируй:
   - Специальные термины и аббревиатуры (DNA, РНК, ЖИК, IT)
   - Имена собственные и названия
   - Формулы, числа и символы
   - Слова на казахском языке если они написаны правильно
5. Найди до 10 самых явных орфографических ошибок

ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА:
{
  "errors": [
    {"word": "эксперемент", "suggestion": "эксперимент", "context": "...провести эксперемент в лаборатории..."},
    {"word": "обьект", "suggestion": "объект", "context": "...изучаемый обьект исследования..."}
  ],
  "totalErrors": 2
}

ПРИМЕР КОГДА ОШИБОК НЕТ:
{"errors": [], "totalErrors": 0}

НЕ ДЕЛАЙ ТАК (word = suggestion - это НЕ ошибка):
{"word": "многогранного", "suggestion": "многогранного"} - НЕПРАВИЛЬНО!

ТЕКСТ ДЛЯ ПРОВЕРКИ:
${content.substring(0, 4000)}

Ответь JSON:`;

  const fallback = { errors: [], totalErrors: 0 };

  try {
    const response = await makeAIRequest(prompt, 2000);
    const result = safeJsonParse(response, fallback);

    // Filter out false positives where word equals suggestion
    const validErrors = Array.isArray(result.errors)
      ? result.errors.filter(err => {
          // Skip if word and suggestion are the same
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
    // Return informative message when API is not configured
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      return {
        fileName,
        errors: [{
          word: "⚠️",
          suggestion: "Настройте API ключ OpenRouter",
          context: "AI проверка орфографии недоступна без API ключа"
        }],
        totalErrors: 0,
        apiError: true
      };
    }
    return { fileName, ...fallback };
  }
};

/**
 * Reviews an article using AI with detailed scoring criteria
 * Supports Russian, English, and Kazakh articles
 */
export const reviewArticle = async (content, fileName) => {
  const prompt = `Проведи экспертную рецензию научной статьи.

ШКАЛА ОЦЕНОК (1-5):
1 - Неприемлемо: критические недостатки, требует полной переработки
2 - Слабо: существенные проблемы, много доработок
3 - Удовлетворительно: есть замечания, требует правок
4 - Хорошо: незначительные замечания
5 - Отлично: соответствует высоким стандартам

КРИТЕРИИ ОЦЕНКИ:
1. СТРУКТУРА (structure): наличие введения, методологии, результатов, выводов
2. ЛОГИКА (logic): последовательность аргументации, обоснованность выводов
3. ОРИГИНАЛЬНОСТЬ (originality): новизна исследования, научный вклад
4. СТИЛЬ (style): научный язык, терминология, грамотность
5. АКТУАЛЬНОСТЬ (relevance): современность темы, практическая значимость

ПРИМЕР РЕЦЕНЗИИ:
{
  "structure": {"score": 4, "comment": "Структура соответствует требованиям, введение информативное"},
  "logic": {"score": 3, "comment": "Выводы недостаточно обоснованы результатами"},
  "originality": {"score": 4, "comment": "Предложен новый подход к решению проблемы"},
  "style": {"score": 5, "comment": "Текст написан грамотным научным языком"},
  "relevance": {"score": 4, "comment": "Тема актуальна для современной науки"},
  "overallScore": 4,
  "summary": "Статья соответствует требованиям научного журнала с небольшими доработками",
  "recommendations": ["Усилить обоснование выводов", "Добавить больше ссылок на источники"]
}

ТЕКСТ СТАТЬИ (${fileName}):
${content.substring(0, 5000)}

Проведи рецензию и ответь JSON:`;

  const fallback = {
    structure: { score: 0, comment: "Анализ недоступен" },
    logic: { score: 0, comment: "Анализ недоступен" },
    originality: { score: 0, comment: "Анализ недоступен" },
    style: { score: 0, comment: "Анализ недоступен" },
    relevance: { score: 0, comment: "Анализ недоступен" },
    overallScore: 0,
    summary: "Не удалось создать рецензию. Попробуйте позже.",
    recommendations: []
  };

  const apiErrorFallback = {
    structure: { score: 0, comment: "API ключ не настроен" },
    logic: { score: 0, comment: "API ключ не настроен" },
    originality: { score: 0, comment: "API ключ не настроен" },
    style: { score: 0, comment: "API ключ не настроен" },
    relevance: { score: 0, comment: "API ключ не настроен" },
    overallScore: 0,
    summary: "⚠️ AI рецензирование недоступно. Настройте API ключ OpenRouter в переменных окружения (VITE_OPENROUTER_API_KEY).",
    recommendations: ["Получите API ключ на openrouter.ai", "Добавьте ключ в настройки Railway"],
    apiError: true
  };

  // Helper to try parsing review
  const tryParseReview = async (fallbackIndex = -1) => {
    const response = await makeAIRequest(prompt, 2500, fallbackIndex);
    return safeJsonParse(response, null);
  };

  try {
    let review = await tryParseReview(-1);

    // Retry with first fallback model if primary attempt returned invalid JSON
    if (!review || !review.structure) {
      console.warn('First review attempt failed, retrying with fallback model...');
      review = await tryParseReview(0);
    }

    if (!review || !review.structure) {
      console.error('Invalid review structure after retry, using fallback');
      return { fileName, ...fallback };
    }

    // Validate and normalize scores (clamp to 1-5)
    const clampScore = (score) => Math.max(1, Math.min(5, Number(score) || 3));

    const normalizedReview = {
      structure: {
        score: clampScore(review.structure?.score),
        comment: review.structure?.comment || fallback.structure.comment
      },
      logic: {
        score: clampScore(review.logic?.score),
        comment: review.logic?.comment || fallback.logic.comment
      },
      originality: {
        score: clampScore(review.originality?.score),
        comment: review.originality?.comment || fallback.originality.comment
      },
      style: {
        score: clampScore(review.style?.score),
        comment: review.style?.comment || fallback.style.comment
      },
      relevance: {
        score: clampScore(review.relevance?.score),
        comment: review.relevance?.comment || fallback.relevance.comment
      },
      overallScore: clampScore(review.overallScore),
      summary: review.summary || fallback.summary,
      recommendations: Array.isArray(review.recommendations)
        ? review.recommendations.filter(r => r && typeof r === 'string')
        : []
    };

    return { fileName, ...normalizedReview };
  } catch (error) {
    console.error("Review error:", error);
    // Show clear message when API is not configured
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      return { fileName, ...apiErrorFallback };
    }
    return { fileName, ...fallback };
  }
};

// Re-export ARTICLE_SECTIONS for backward compatibility
export { ARTICLE_SECTIONS } from '../constants/sections';

/**
 * Generates dynamic section descriptions for the prompt
 * @returns {string} - Formatted section descriptions
 */
const generateSectionDescriptions = () => {
  return ARTICLE_SECTIONS.map((section, index) => {
    const meta = SECTION_METADATA[section];
    const keywords = meta.keywords.slice(0, 10).join(', ');
    return `${index + 1}. ${section}\n   Ключевые темы: ${keywords}\n   Описание: ${meta.description}`;
  }).join('\n\n');
};

/**
 * Detects the thematic section of a scientific article using AI
 * Returns section name with confidence score
 *
 * @param {string} content - Article content
 * @param {string} title - Article title
 * @returns {Promise<{section: string, confidence: number, needsReview: boolean, reasoning?: string}>}
 */
export const detectArticleSection = async (content, title) => {
  const sectionDescriptions = generateSectionDescriptions();

  const prompt = `Ты - эксперт по классификации научных публикаций.
Твоя задача: определить ОДИН тематический раздел для научной статьи и оценить уверенность.

## ДОСТУПНЫЕ РАЗДЕЛЫ:

${sectionDescriptions}

## ПРАВИЛА КЛАССИФИКАЦИИ:

1. **Приоритет МЕТОДОЛОГИИ**:
   - Статья о преподавании IT/программирования → ПЕДАГОГИЧЕСКИЕ НАУКИ
   - Статья о методике обучения физике → ПЕДАГОГИЧЕСКИЕ НАУКИ

2. **Приоритет ОБЪЕКТА исследования**:
   - Разработка технологии для медицины → ТЕХНИЧЕСКИЕ НАУКИ
   - Разработка программного обеспечения для экономического анализа → ТЕХНИЧЕСКИЕ НАУКИ

3. **При равном соотношении**: выбери раздел по ОСНОВНОЙ теме первых абзацев

4. **Оценка уверенности (confidence)**:
   - 0.9-1.0: Очевидная принадлежность, все ключевые слова указывают на один раздел
   - 0.7-0.89: Высокая уверенность, большинство признаков указывают на раздел
   - 0.5-0.69: Средняя уверенность, есть признаки нескольких разделов
   - 0.3-0.49: Низкая уверенность, статья междисциплинарная
   - 0.0-0.29: Очень низкая уверенность, требуется ручная проверка

## ВХОДНЫЕ ДАННЫЕ:

**Название статьи:** "${title}"

**Текст статьи (начало):**
${content.substring(0, 2500)}

## ФОРМАТ ОТВЕТА (строго JSON):
{
  "section": "ТОЧНОЕ_НАЗВАНИЕ_РАЗДЕЛА",
  "confidence": 0.85,
  "reasoning": "Краткое объяснение выбора (1 предложение)"
}`;

  const fallbackResult = {
    section: NEEDS_REVIEW_SECTION,
    confidence: 0,
    needsReview: true,
    reasoning: 'Не удалось выполнить автоматическую классификацию'
  };

  try {
    const response = await makeAIRequest(prompt, 500);
    const result = safeJsonParse(response, null);

    if (!result || !result.section) {
      console.warn('Invalid AI response for section detection');
      return fallbackResult;
    }

    // Validate and normalize section
    const detectedSection = result.section?.toUpperCase?.()?.trim() || '';

    // Find matching section (case-insensitive partial match)
    const matchedSection = ARTICLE_SECTIONS.find(s =>
      s.toUpperCase() === detectedSection ||
      s.toUpperCase().includes(detectedSection.replace(/\s+/g, ' ').trim()) ||
      detectedSection.includes(s.toUpperCase())
    );

    // Normalize confidence to 0-1 range
    const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0.5));

    // Determine if manual review is needed
    const needsReview = !matchedSection || confidence < CONFIDENCE_THRESHOLDS.LOW;

    return {
      section: matchedSection || NEEDS_REVIEW_SECTION,
      confidence: matchedSection ? confidence : 0,
      needsReview,
      reasoning: result.reasoning || undefined
    };
  } catch (error) {
    console.error("Section detection error:", error);
    return fallbackResult;
  }
};

/**
 * Simple version of detectArticleSection that returns only section string
 * For backward compatibility
 *
 * @param {string} content - Article content
 * @param {string} title - Article title
 * @returns {Promise<string>} - Section name
 */
export const detectArticleSectionSimple = async (content, title) => {
  const result = await detectArticleSection(content, title);
  return result.section;
};
