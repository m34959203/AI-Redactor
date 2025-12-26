/**
 * AI Service - Multi-provider API integration
 * Primary: Groq (fast, free)
 * Fallback: OpenRouter (reliable backup)
 */

import crypto from 'crypto';
import {
  BATCH_CONFIG,
  RATE_LIMIT_CONFIG,
  CACHE_CONFIG,
  PROVIDERS,
  ARTICLE_SECTIONS,
  NEEDS_REVIEW_SECTION,
  CONFIDENCE_THRESHOLDS,
  SYSTEM_PROMPT,
  CONFIDENCE_GUIDE,
  BATCH_EXAMPLE
} from '../config/aiConfig.js';

// ============ PROMPT VERSION (A/B Testing) ============
const PROMPT_VERSION = 'v2.1'; // Increment when prompts change

// ============ METRICS TRACKING ============
let metrics = {
  totalRequests: 0,
  cacheHits: 0,
  groqRequests: 0,
  openrouterRequests: 0,
  fallbackCount: 0,
  errors: 0,
  lastRequestTime: null,
  avgResponseTime: 0,
  promptVersion: PROMPT_VERSION
};

// ============ CONFIDENCE ANALYTICS ============
let confidenceStats = {
  totalClassifications: 0,
  distribution: {
    high: 0,      // 0.8-1.0
    medium: 0,    // 0.6-0.8
    low: 0,       // 0.4-0.6
    veryLow: 0,   // 0.0-0.4
    needsReview: 0
  },
  bySection: {},
  avgConfidence: 0,
  lastUpdated: null
};

const trackConfidence = (section, confidence, needsReview) => {
  confidenceStats.totalClassifications++;
  confidenceStats.lastUpdated = new Date().toISOString();

  // Update distribution
  if (needsReview) {
    confidenceStats.distribution.needsReview++;
  } else if (confidence >= 0.8) {
    confidenceStats.distribution.high++;
  } else if (confidence >= 0.6) {
    confidenceStats.distribution.medium++;
  } else if (confidence >= 0.4) {
    confidenceStats.distribution.low++;
  } else {
    confidenceStats.distribution.veryLow++;
  }

  // Track by section
  if (!confidenceStats.bySection[section]) {
    confidenceStats.bySection[section] = { count: 0, totalConfidence: 0, avgConfidence: 0 };
  }
  confidenceStats.bySection[section].count++;
  confidenceStats.bySection[section].totalConfidence += confidence;
  confidenceStats.bySection[section].avgConfidence =
    confidenceStats.bySection[section].totalConfidence / confidenceStats.bySection[section].count;

  // Running average
  confidenceStats.avgConfidence =
    (confidenceStats.avgConfidence * (confidenceStats.totalClassifications - 1) + confidence) /
    confidenceStats.totalClassifications;
};

// ============ PROMPT/RESPONSE LOGGING ============
const DEBUG_LOGGING = process.env.AI_DEBUG === 'true';
const requestLog = [];
const MAX_LOG_SIZE = 100;

const logRequest = (taskType, prompt, response, metadata = {}) => {
  if (!DEBUG_LOGGING && requestLog.length >= MAX_LOG_SIZE) return;

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    taskType,
    promptVersion: PROMPT_VERSION,
    promptLength: prompt.length,
    responseLength: response?.length || 0,
    ...metadata,
    // Only store full prompt/response in debug mode
    ...(DEBUG_LOGGING ? { prompt: prompt.substring(0, 2000), response: response?.substring(0, 2000) } : {})
  };

  requestLog.push(entry);

  // Trim log if too large
  if (requestLog.length > MAX_LOG_SIZE) {
    requestLog.shift();
  }

  if (DEBUG_LOGGING) {
    console.log(`[AI Log] ${taskType}:`, JSON.stringify(entry, null, 2));
  }
};

const updateMetrics = (provider, responseTime, isError = false) => {
  metrics.totalRequests++;
  metrics.lastRequestTime = new Date().toISOString();

  if (provider === 'Groq') metrics.groqRequests++;
  if (provider === 'OpenRouter') metrics.openrouterRequests++;
  if (isError) metrics.errors++;

  // Running average of response time
  metrics.avgResponseTime = (metrics.avgResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;
};

// Get active provider (Groq primary, OpenRouter fallback)
const getActiveProvider = () => {
  // Check if Groq daily limit was hit - use OpenRouter instead
  if (checkGroqDailyLimit() && process.env.OPENROUTER_API_KEY) {
    return { provider: PROVIDERS.openrouter, apiKey: process.env.OPENROUTER_API_KEY };
  }
  if (process.env.GROQ_API_KEY) {
    return { provider: PROVIDERS.groq, apiKey: process.env.GROQ_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: PROVIDERS.openrouter, apiKey: process.env.OPENROUTER_API_KEY };
  }
  return null;
};

// ============ RATE LIMITING ============

let lastRequestTime = 0;
let consecutiveErrors = 0;
let currentProviderName = null;

// Track Groq daily limit (100K TPD on free tier)
// When hit, switch all requests to OpenRouter until reset
let groqDailyLimitHit = false;
let groqDailyLimitResetTime = 0;

const checkGroqDailyLimit = () => {
  // Reset if 1 hour has passed since limit was hit
  if (groqDailyLimitHit && Date.now() > groqDailyLimitResetTime) {
    console.log('Groq daily limit reset - trying Groq again');
    groqDailyLimitHit = false;
  }
  return groqDailyLimitHit;
};

const setGroqDailyLimitHit = () => {
  groqDailyLimitHit = true;
  // Reset after 1 hour (Groq resets daily, but we try again after 1h)
  groqDailyLimitResetTime = Date.now() + 60 * 60 * 1000;
  console.log('Groq daily limit hit - switching to OpenRouter for 1 hour');
};

const waitForRateLimit = async (providerName, taskType = 'general') => {
  const now = Date.now();

  // Use longer delay for spelling checks to conserve TPM
  let baseDelay;
  if (consecutiveErrors > 0) {
    baseDelay = RATE_LIMIT_CONFIG.DELAY_AFTER_429;
  } else if (taskType === 'spelling') {
    baseDelay = RATE_LIMIT_CONFIG.SPELLING_DELAY || RATE_LIMIT_CONFIG.GROQ_DELAY;
  } else if (providerName === 'groq') {
    baseDelay = RATE_LIMIT_CONFIG.GROQ_DELAY;
  } else {
    baseDelay = RATE_LIMIT_CONFIG.OPENROUTER_DELAY;
  }

  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < baseDelay) {
    const waitTime = baseDelay - timeSinceLastRequest;
    console.log(`Rate limiting (${providerName}/${taskType}): waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
};

// ============ CACHE ============

const cache = new Map();

const generateCacheKey = (taskType, content, additionalKey = '') => {
  const hash = crypto.createHash('md5').update(content.substring(0, CACHE_CONFIG.HASH_LENGTH)).digest('hex');
  return `${taskType}:${hash}:${additionalKey}`;
};

const getCached = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_CONFIG.TTL) {
    console.log(`Cache hit for ${key}`);
    metrics.cacheHits++;
    return cached.data;
  }
  if (cached) cache.delete(key);
  return null;
};

const setCache = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > CACHE_CONFIG.MAX_SIZE) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp > CACHE_CONFIG.TTL) cache.delete(k);
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

  // Pass taskType to use appropriate delay (spelling gets longer delay)
  await waitForRateLimit(currentProviderName, taskType);

  // Select model
  const allModels = [provider.model, ...provider.fallbackModels];
  let effectiveModelIndex = modelIndex;

  // NOTE: Both Groq models have low TPM on free tier:
  // - llama-3.3-70b-versatile: 12K TPM
  // - llama-3.1-8b-instant: 6K TPM (NOT 250K - that's paid tier!)
  // For spelling, we use OpenRouter when available (see checkSpelling function)

  const model = allModels[Math.min(effectiveModelIndex, allModels.length - 1)];
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

        // CRITICAL: If Groq daily limit (TPD) hit, remember it for future requests
        if (rateLimitInfo.type === 'daily' && provider.name === 'Groq') {
          setGroqDailyLimitHit();
          // Switch to OpenRouter immediately for this and all future requests
          if (process.env.OPENROUTER_API_KEY) {
            console.log('Groq daily limit - switching to OpenRouter...');
            return makeAIRequest(prompt, maxTokens, taskType, { forceFallback: true });
          }
        }

        // Try next model in same provider (only for TPM limits, not daily)
        if (!isLastModel && rateLimitInfo.type !== 'daily') {
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
- Извлекай НА ЯЗЫКЕ ОРИГИНАЛА (русский/казахский/английский)

### АВТОР (КРИТИЧНО - искать ВНИМАТЕЛЬНО!):
- Ищи автора ПОСЛЕ названия статьи, но ПЕРЕД аннотацией
- Типичные форматы:
  * "Фамилия И.О." (Иванов А.Б.)
  * "И.О. Фамилия" (А.Б. Иванов)
  * "Фамилия Имя Отчество" (Иванов Андрей Борисович)
  * Казахские: "Сатпаев Қ.И.", "Қалжанова Г.М."
- Автор часто идёт с аффилиацией (университет, город)
- Игнорируй: рецензентов, научных руководителей, учёные степени (к.т.н., PhD, доцент)
- Если несколько авторов — верни ПЕРВОГО
- НЕ ПЕРЕВОДИ имена, сохраняй оригинальное написание (казахские буквы: Қ, Ғ, Ү, Ө, Ә, Ң)
- Если имя в файле (например "Статья Калжанова Г.М.docx") — извлеки его!

### РАЗДЕЛ (выбери ОДИН):
1. ТЕХНИЧЕСКИЕ НАУКИ — IT, инженерия, программирование, строительство
2. ПЕДАГОГИЧЕСКИЕ НАУКИ — образование, методика преподавания, дидактика
3. ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ — физика, химия, биология, экономика, финансы
${CONFIDENCE_GUIDE}
### ОЦЕНКА:
- Структура (1-5): наличие введения, методологии, результатов, выводов
- Качество (1-5): общее качество изложения

## ТЕКСТ СТАТЬИ (файл "${fileName}"):
${content.substring(0, 4000)}

## ОТВЕТ (JSON):
{
  "title": "полное название статьи (на языке оригинала)",
  "author": "Фамилия И.О. (на языке оригинала)",
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

    // Track confidence for analytics
    trackConfidence(finalResult.section, finalResult.sectionConfidence, finalResult.needsReview);

    // Log request for debugging
    logRequest('analyze', prompt, response, {
      fileName,
      section: finalResult.section,
      confidence: finalResult.sectionConfidence,
      needsReview: finalResult.needsReview
    });

    console.log(`Analyzed "${fileName}": section=${finalResult.section}, confidence=${finalResult.sectionConfidence}`);
    setCache(cacheKey, finalResult);
    return finalResult;

  } catch (error) {
    console.error('Article analysis error:', error);
    logRequest('analyze', prompt, null, { fileName, error: error.message });
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

  // Use config values
  const { BATCH_SIZE, MAX_CHARS_PER_ARTICLE } = BATCH_CONFIG;
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
- НАЗВАНИЕ: после УДК/UDC, до авторов (на языке оригинала!)
- АВТОР (ВНИМАТЕЛЬНО!):
  * Ищи ПОСЛЕ названия, ПЕРЕД аннотацией
  * Форматы: "Фамилия И.О.", "И.О. Фамилия", полное ФИО
  * Казахские имена: "Қалжанова Г.М.", "Нығызбаева П.Т." (сохраняй казахские буквы!)
  * Если имя в названии файла — используй его!
  * ВСЕГДА указывай автора, не пиши "Автор не указан" без причины
- РАЗДЕЛ (выбери ОДИН для каждой):
  1. ТЕХНИЧЕСКИЕ НАУКИ — IT, инженерия, программирование, строительство
  2. ПЕДАГОГИЧЕСКИЕ НАУКИ — образование, методика преподавания, дидактика
  3. ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ — физика, химия, биология, экономика, финансы
${CONFIDENCE_GUIDE}
${BATCH_EXAMPLE}
## СТАТЬИ ДЛЯ АНАЛИЗА:
${articlesText}

## ТВОЙ ОТВЕТ (JSON массив, СТРОГО ${uncachedArticles.length} элементов):`;

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

      // Track confidence for analytics
      trackConfidence(finalResult.section, finalResult.sectionConfidence, finalResult.needsReview);

      // Cache the result
      const cacheKey = generateCacheKey('analyze', article.content, article.fileName);
      setCache(cacheKey, finalResult);

      processedResults.push(finalResult);
    }

    // Log batch request
    logRequest('batch', prompt, response, {
      articlesCount: uncachedArticles.length,
      processedCount: processedResults.length,
      avgConfidence: processedResults.reduce((sum, r) => sum + r.sectionConfidence, 0) / processedResults.length
    });

    console.log(`Batch analyzed ${processedResults.length} articles in one request`);
    return [...results, ...processedResults];

  } catch (error) {
    console.error('Batch analysis error:', error);
    logRequest('batch', prompt, null, { articlesCount: uncachedArticles.length, error: error.message });
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
 * Uses OpenRouter when available (200 req/day) to avoid Groq's 6K TPM limit
 */
export const checkSpelling = async (content, fileName) => {
  // Reduced from 4000 to 2000 chars to minimize token usage
  const textToCheck = content.substring(0, 2000);

  const prompt = `## ЗАДАЧА
Найди ТОЛЬКО реальные орфографические ОШИБКИ в тексте.

## КРИТИЧНО - ИГНОРИРУЙ:
- ВСЕ казахские слова (с буквами Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, Һ, І)
- Казахские слова без специальных букв (сауаттылық, білім, оқыту, мектеп, тіл, және т.д.)
- Термины, имена, аббревиатуры
- Слова из названий и заголовков

## ПРАВИЛА:
1. word и suggestion ДОЛЖНЫ быть РАЗНЫМИ!
2. Если не уверен что это ошибка — НЕ ДОБАВЛЯЙ
3. Проверяй только РУССКИЙ и АНГЛИЙСКИЙ текст

## ПРИМЕРЫ:
✅ ВЕРНО: {"word": "эксперемент", "suggestion": "эксперимент"}
✅ ВЕРНО: {"word": "обьект", "suggestion": "объект"}
❌ НЕВЕРНО: {"word": "сауаттылық", "suggestion": "сауаттылық"} — это казахское слово!
❌ НЕВЕРНО: {"word": "математикалық", "suggestion": "математикалық"} — это казахское слово!

## ФОРМАТ ОТВЕТА:
{"errors": [{"word": "ошибка", "suggestion": "правильно", "context": "..."}], "totalErrors": N}

Если ошибок нет: {"errors": [], "totalErrors": 0}

## ТЕКСТ:
${textToCheck}`;

  const fallback = { errors: [], totalErrors: 0 };

  // Kazakh-specific characters pattern
  const KAZAKH_PATTERN = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

  try {
    // Use configured token limit for spelling to conserve TPM
    const maxTokens = BATCH_CONFIG.MAX_TOKENS_SPELLING || 600;

    // CRITICAL: Use OpenRouter for spelling when available
    // Groq has only 6K TPM for 8B model, causing constant 429 errors
    // OpenRouter has 200 req/day which is enough for spell checking
    const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
    const response = await makeAIRequest(prompt, maxTokens, 'spelling', { forceFallback: useOpenRouter });
    const result = safeJsonParse(response, fallback);

    const validErrors = Array.isArray(result.errors)
      ? result.errors.filter(err => {
          if (!err.word || !err.suggestion) return false;

          const word = err.word.trim();
          const suggestion = err.suggestion.trim();

          // Filter out identical words (case-insensitive, normalized)
          const normalizedWord = word.toLowerCase().normalize('NFC');
          const normalizedSuggestion = suggestion.toLowerCase().normalize('NFC');
          if (normalizedWord === normalizedSuggestion) return false;

          // Filter out Kazakh words (containing Kazakh-specific characters)
          if (KAZAKH_PATTERN.test(word) || KAZAKH_PATTERN.test(suggestion)) return false;

          // Filter out common Kazakh words even without special characters
          const kazakhWords = /^(сауаттылық|білім|оқыту|мектеп|тіл|және|бойынша|туралы|арқылы|жүйесі|дамуы|қазақ|орыс|математикалық|жағдайда|сабақ|оқушы|мұғалім|әдіс|тәсіл|ұйым|жұмыс|бағдарлама)$/i;
          if (kazakhWords.test(word)) return false;

          return true;
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

// ============ STATUS, METRICS & CACHE ============

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
    config: {
      batchSize: BATCH_CONFIG.BATCH_SIZE,
      maxCharsPerArticle: BATCH_CONFIG.MAX_CHARS_PER_ARTICLE,
      cacheTTL: CACHE_CONFIG.TTL / 60000 + ' min'
    },
    cacheEnabled: true,
    cacheSize: cache.size
  };
};

/**
 * Get usage metrics for monitoring
 */
export const getMetrics = () => ({
  ...metrics,
  cacheSize: cache.size,
  cacheHitRate: metrics.totalRequests > 0
    ? Math.round((metrics.cacheHits / (metrics.totalRequests + metrics.cacheHits)) * 100) + '%'
    : '0%',
  fallbackRate: metrics.totalRequests > 0
    ? Math.round((metrics.fallbackCount / metrics.totalRequests) * 100) + '%'
    : '0%',
  errorRate: metrics.totalRequests > 0
    ? Math.round((metrics.errors / metrics.totalRequests) * 100) + '%'
    : '0%'
});

/**
 * Health check for monitoring
 */
export const healthCheck = async () => {
  const status = getStatus();
  const startTime = Date.now();

  // Quick connectivity test
  let healthy = false;
  let provider = null;
  let responseTime = 0;

  if (status.available) {
    try {
      const activeConfig = getActiveProvider();
      if (activeConfig) {
        provider = activeConfig.provider.name;
        const response = await fetch(activeConfig.provider.url.replace('/chat/completions', '/models'), {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${activeConfig.apiKey}` }
        });
        healthy = response.ok;
        responseTime = Date.now() - startTime;
      }
    } catch {
      healthy = false;
      responseTime = Date.now() - startTime;
    }
  }

  return {
    status: healthy ? 'healthy' : (status.available ? 'degraded' : 'unavailable'),
    provider,
    responseTime,
    timestamp: new Date().toISOString(),
    metrics: getMetrics()
  };
};

export const getCacheStats = () => ({
  size: cache.size,
  maxSize: CACHE_CONFIG.MAX_SIZE,
  ttl: CACHE_CONFIG.TTL,
  hitRate: metrics.cacheHits > 0
    ? Math.round((metrics.cacheHits / (metrics.totalRequests + metrics.cacheHits)) * 100) + '%'
    : '0%'
});

export const clearCache = () => {
  cache.clear();
  return { cleared: true, previousSize: cache.size };
};

// ============ ANALYTICS ============

/**
 * Get confidence distribution analytics
 */
export const getConfidenceStats = () => ({
  ...confidenceStats,
  promptVersion: PROMPT_VERSION,
  distributionPercent: confidenceStats.totalClassifications > 0 ? {
    high: Math.round((confidenceStats.distribution.high / confidenceStats.totalClassifications) * 100) + '%',
    medium: Math.round((confidenceStats.distribution.medium / confidenceStats.totalClassifications) * 100) + '%',
    low: Math.round((confidenceStats.distribution.low / confidenceStats.totalClassifications) * 100) + '%',
    veryLow: Math.round((confidenceStats.distribution.veryLow / confidenceStats.totalClassifications) * 100) + '%',
    needsReview: Math.round((confidenceStats.distribution.needsReview / confidenceStats.totalClassifications) * 100) + '%'
  } : null
});

/**
 * Get request log for debugging
 */
export const getRequestLog = (limit = 20) => ({
  total: requestLog.length,
  debugMode: DEBUG_LOGGING,
  promptVersion: PROMPT_VERSION,
  entries: requestLog.slice(-limit)
});

/**
 * Reset analytics (for A/B testing)
 */
export const resetAnalytics = () => {
  const previousStats = { ...confidenceStats };

  confidenceStats.totalClassifications = 0;
  confidenceStats.distribution = { high: 0, medium: 0, low: 0, veryLow: 0, needsReview: 0 };
  confidenceStats.bySection = {};
  confidenceStats.avgConfidence = 0;
  confidenceStats.lastUpdated = null;

  requestLog.length = 0;

  return {
    reset: true,
    previousStats,
    timestamp: new Date().toISOString()
  };
};

/**
 * Get prompt version info for A/B testing
 */
export const getPromptVersion = () => ({
  version: PROMPT_VERSION,
  totalClassifications: confidenceStats.totalClassifications,
  avgConfidence: Math.round(confidenceStats.avgConfidence * 100) / 100,
  timestamp: new Date().toISOString()
});

export default {
  analyzeArticle,
  analyzeArticlesBatch,
  extractMetadata,
  detectSection,
  checkSpelling,
  reviewArticle,
  retryClassification,
  getStatus,
  getMetrics,
  healthCheck,
  getCacheStats,
  clearCache,
  // Analytics
  getConfidenceStats,
  getRequestLog,
  resetAnalytics,
  getPromptVersion
};
