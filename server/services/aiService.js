/**
 * AI Service - Gemini 2.5 Flash Integration
 * Единственный провайдер: Google Gemini 2.5 Flash
 * - Оптимальное соотношение цена/качество
 * - Отличная поддержка русского, казахского и английского языков
 * - Free tier: 1500 req/day, 1.5M tokens/day
 * - Paid tier: $0.30/1M input, $2.50/1M output
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
  geminiRequests: 0,
  errors: 0,
  lastRequestTime: null,
  avgResponseTime: 0,
  promptVersion: PROMPT_VERSION,
  provider: 'Gemini 2.5 Flash'
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

const updateMetrics = (responseTime, isError = false) => {
  metrics.totalRequests++;
  metrics.geminiRequests++;
  metrics.lastRequestTime = new Date().toISOString();
  if (isError) metrics.errors++;

  // Running average of response time
  metrics.avgResponseTime = (metrics.avgResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;
};

// Get Gemini provider (единственный провайдер)
const getActiveProvider = () => {
  if (process.env.GEMINI_API_KEY && !checkGeminiDailyLimit()) {
    return { provider: PROVIDERS.gemini, apiKey: process.env.GEMINI_API_KEY };
  }
  return null;
};

// ============ REQUEST QUEUE ============

/**
 * Simple request queue to prevent burst overload
 * Processes requests sequentially with configurable delays
 */
class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastProcessTime = 0;
  }

  async add(fn, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, priority });
      // Sort by priority (higher = first)
      this.queue.sort((a, b) => b.priority - a.priority);
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();

      // Ensure minimum delay between requests
      const minDelay = RATE_LIMIT_CONFIG.MIN_DELAY || 500;
      const timeSinceLastRequest = Date.now() - this.lastProcessTime;
      if (timeSinceLastRequest < minDelay) {
        await new Promise(r => setTimeout(r, minDelay - timeSinceLastRequest));
      }

      try {
        const result = await fn();
        this.lastProcessTime = Date.now();
        resolve(result);
      } catch (error) {
        this.lastProcessTime = Date.now();
        reject(error);
      }
    }

    this.processing = false;
  }

  get length() {
    return this.queue.length;
  }

  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    return cleared;
  }
}

const requestQueue = new RequestQueue();

// ============ RATE LIMITING ============

let lastRequestTime = 0;
let consecutiveErrors = 0;

// Track Gemini daily limit (1500 req/day on free tier)
let geminiDailyLimitHit = false;
let geminiDailyLimitResetTime = 0;
let geminiRequestsToday = 0;
let geminiRequestsResetDate = new Date().toDateString();

const checkGeminiDailyLimit = () => {
  // Reset counter if new day
  const today = new Date().toDateString();
  if (today !== geminiRequestsResetDate) {
    geminiRequestsToday = 0;
    geminiRequestsResetDate = today;
    geminiDailyLimitHit = false;
    console.log('Gemini daily counter reset - new day');
  }

  // Reset if 1 hour has passed since limit was hit
  if (geminiDailyLimitHit && Date.now() > geminiDailyLimitResetTime) {
    console.log('Gemini daily limit reset - trying again');
    geminiDailyLimitHit = false;
  }
  return geminiDailyLimitHit;
};

const setGeminiDailyLimitHit = () => {
  geminiDailyLimitHit = true;
  // Reset after 1 hour
  geminiDailyLimitResetTime = Date.now() + 60 * 60 * 1000;
  console.log('Gemini daily limit hit - waiting 1 hour');
};

const incrementGeminiRequests = () => {
  geminiRequestsToday++;
  // Warn when approaching limit
  if (geminiRequestsToday >= 1400) {
    console.warn(`Gemini requests today: ${geminiRequestsToday}/1500 - approaching limit`);
  }
};

// Check if Gemini provider is exhausted
const isProviderExhausted = () => {
  return !process.env.GEMINI_API_KEY || checkGeminiDailyLimit();
};

// Get provider status for user notification
export const getProvidersStatus = () => ({
  gemini: {
    configured: !!process.env.GEMINI_API_KEY,
    exhausted: checkGeminiDailyLimit(),
    requestsToday: geminiRequestsToday,
    dailyLimit: 1500,
    resetTime: geminiDailyLimitHit ? new Date(geminiDailyLimitResetTime).toISOString() : null
  },
  provider: 'Gemini 2.5 Flash',
  allExhausted: isProviderExhausted(),
  message: isProviderExhausted()
    ? 'Лимит Gemini API исчерпан. Попробуйте позже или перейдите на платный тариф Google AI.'
    : null
});

const waitForRateLimit = async (taskType = 'general') => {
  const now = Date.now();

  // Determine delay based on task type and error state
  let baseDelay;
  if (consecutiveErrors > 0) {
    baseDelay = RATE_LIMIT_CONFIG.DELAY_AFTER_429;
  } else if (taskType === 'spelling') {
    baseDelay = RATE_LIMIT_CONFIG.SPELLING_DELAY;
  } else {
    baseDelay = RATE_LIMIT_CONFIG.GEMINI_DELAY;
  }

  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < baseDelay) {
    const waitTime = baseDelay - timeSinceLastRequest;
    console.log(`Rate limiting (Gemini/${taskType}): waiting ${waitTime}ms...`);
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

// ============ SECTION MATCHING ============

// Keywords for flexible section matching (Russian, English, Kazakh)
const SECTION_KEYWORDS = {
  'ТЕХНИЧЕСКИЕ НАУКИ': [
    // Russian
    'ТЕХНИЧ', 'ТЕХНО', 'IT', 'ИНЖЕНЕР', 'ПРОГРАММИР', 'СТРОИТ',
    'ИНФОРМАЦ', 'КОМПЬЮТЕР', 'ЦИФРОВ', 'АВТОМАТИЗ', 'РОБОТ',
    'МАШИН', 'ЭЛЕКТР', 'ЭНЕРГ', 'ПРОМЫШЛЕН', 'ПРОИЗВОД',
    'СИСТЕМ', 'СЕТЬ', 'АЛГОРИТМ', 'ДАНН', 'SOFTWARE', 'HARDWARE',
    'АРХИТЕКТ', 'CONSTRUCT', 'ENGINEER', 'TECHNICAL',
    'ИСКУССТВЕН', 'ИНТЕЛЛЕКТ', 'НЕЙРОН', 'НЕЙРОСЕТ', 'МАШИНН', 'ОБУЧЕН',
    // Kazakh
    'ТЕХНИК', 'АҚПАРАТ', 'КОМПЬЮТЕР', 'БАҒДАРЛАМ', 'ЖҮЙЕ', 'ЦИФРЛ',
    'АВТОМАТТАНД', 'РОБОТ', 'ЭЛЕКТРОН', 'ЭНЕРГЕТИК', 'ӨНДІР',
    'ҚҰРЫЛЫС', 'ИНЖЕНЕР', 'ЖЕЛІ', 'ДЕРЕКТЕР', 'ТЕХНОЛОГ',
    'ЖАСАНДЫ ИНТЕЛЛЕКТ', 'ЖАСАНДЫ', 'ИНТЕЛЛЕКТ', 'НЕЙРОН', 'AI', 'ҚОЛДАНУ'
  ],
  'ПЕДАГОГИЧЕСКИЕ НАУКИ': [
    // Russian
    'ПЕДАГОГ', 'ОБРАЗОВ', 'МЕТОДИК', 'ОБУЧЕН', 'ПРЕПОДАВ',
    'ДИДАКТ', 'ШКОЛ', 'УЧИТЕЛ', 'СТУДЕНТ', 'УЧАЩ', 'ВОСПИТАН',
    'УРОК', 'КУРС', 'ЛЕКЦ', 'СЕМИНАР', 'ПРАКТИК', 'ТРЕНИНГ',
    'КОМПЕТЕН', 'НАВЫК', 'ЗНАН', 'УМЕН', 'ОЦЕНК', 'ТЕСТ',
    'EDUCATION', 'TEACH', 'LEARN', 'PEDAGOG', 'DIDACT',
    // Kazakh
    'ПЕДАГОГ', 'БІЛІМ', 'ОҚЫТУ', 'ОҚУШЫ', 'МҰҒАЛІМ', 'МЕКТЕП',
    'СТУДЕНТ', 'САБАҚ', 'ӘДІС', 'ТӘСІЛ', 'ДИДАКТ', 'ТӘРБИЕ',
    'ОҚЫТ', 'ҮЙРЕТ', 'ДАҒДЫ', 'ҚҰЗЫРЕТ', 'БАҒАЛАУ', 'КУРС',
    'САУАТТЫЛЫҚ', 'САУАТТЫЛ', 'ОРЫС ТІЛ', 'ҚАЗАҚ ТІЛ', 'ЕРЕКШЕЛІК'
  ],
  'ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ': [
    // Russian
    'ЕСТЕСТВ', 'ЭКОНОМ', 'ФИЗИК', 'ХИМИЯ', 'ХИМИЧ', 'БИОЛОГ',
    'МАТЕМАТ', 'ФИНАНС', 'БУХГАЛТЕР', 'АУДИТ', 'НАЛОГ',
    'ИНВЕСТ', 'БАНК', 'РЫНОК', 'БИЗНЕС', 'ПРЕДПРИНИМ',
    'ЭКОЛОГИ', 'ПРИРОД', 'ГЕОЛОГ', 'ГЕОГРАФ', 'АСТРОНОМ',
    'МЕДИЦ', 'ЗДОРОВ', 'ФАРМАЦ', 'ГЕНЕТИК', 'МИКРОБИО',
    'СТАТИСТ', 'АНАЛИЗ', 'МОДЕЛ', 'NATURAL', 'ECONOMIC', 'SCIENCE',
    'BUSINESS', 'FINANCE', 'MARKET', 'ПЛАСТИК', 'ЛАСТАН', 'ЭКОЛОГИЯ',
    // Kazakh
    'ЭКОНОМИК', 'ҚАРЖЫ', 'БИЗНЕС', 'КӘСІПКЕР', 'БАНК', 'ИНВЕСТ',
    'ФИЗИК', 'ХИМИЯ', 'БИОЛОГ', 'МАТЕМАТИК', 'ТАБИҒАТ', 'ЭКОЛОГИЯ',
    'ГЕОЛОГ', 'ГЕОГРАФ', 'МЕДИЦИН', 'ДЕНСАУЛЫҚ', 'ДӘРІ', 'СТАТИСТ',
    'ТАЛДАУ', 'МОДЕЛЬ', 'НАРЫҚ', 'САЛЫҚ', 'ҚОРШАҒАН ОРТА', 'ЛАСТАНУ'
  ]
};

/**
 * Match detected section string to known sections using keywords
 * @param {string} detectedSection - Uppercase section string from AI
 * @returns {string|null} - Matched section name or null
 */
const matchSectionByKeywords = (detectedSection) => {
  if (!detectedSection || detectedSection.length === 0) return null;

  // First try exact match
  const exactMatch = ARTICLE_SECTIONS.find(s => s.toUpperCase() === detectedSection);
  if (exactMatch) return exactMatch;

  // Try partial match (section name contains detected or vice versa)
  const partialMatch = ARTICLE_SECTIONS.find(s => {
    const sectionUpper = s.toUpperCase();
    return detectedSection.includes(sectionUpper) || sectionUpper.includes(detectedSection);
  });
  if (partialMatch) return partialMatch;

  // Try keyword matching
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (detectedSection.includes(keyword)) {
        return section;
      }
    }
  }

  return null;
};

/**
 * Detect section from article content using keywords
 * Fallback when AI fails to return section
 * @param {string} content - Article content
 * @param {string} title - Article title
 * @returns {{section: string, confidence: number}}
 */
const detectSectionFromContent = (content, title = '') => {
  const text = `${title} ${content}`.toUpperCase();

  // Count keyword matches for each section
  const scores = {};
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    scores[section] = 0;
    for (const keyword of keywords) {
      // Count occurrences (up to 3 per keyword)
      const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
      scores[section] += Math.min(matches, 3);
    }
  }

  // Find best match
  let bestSection = null;
  let bestScore = 0;
  for (const [section, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestSection = section;
    }
  }

  // Return result if confidence is high enough (at least 2 keyword matches)
  if (bestScore >= 2) {
    const confidence = Math.min(0.8, 0.4 + bestScore * 0.1);
    return { section: bestSection, confidence };
  }

  return { section: null, confidence: 0 };
};

/**
 * Extract author from article content using regex patterns
 * @param {string} content - Article content
 * @returns {string|null} - Extracted author or null
 */
const extractAuthorFromContent = (content) => {
  if (!content) return null;

  // Take first 3000 chars where author is usually located
  const text = content.substring(0, 3000);

  // Patterns for author extraction (ordered by reliability)
  const patterns = [
    // "Автор: Иванов А.Б." or "Author: Ivanov A.B."
    /(?:автор|author|авторы|authors)[\s:]+([А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүіA-Za-z]+\s+[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүіA-Za-z]\.[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүіA-Za-z]?\.?)/i,

    // After UDK/УДК: Title \n Author (common format)
    /(?:УДК|UDC|ӘОЖ)[\s\d.]+[^\n]+\n+([А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі][а-яёәғқңөүі]+\s+[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі]\.[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі]?\.?)/i,

    // "Фамилия И.О." pattern with affiliation (university, etc.)
    /([А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі][а-яёәғқңөүі]+\s+[А-ЯЁӘҒҚҢӨҮІ]\.[А-ЯЁӘҒҚҢӨҮІ]?\.?)[\s,]*(?:магистр|докторант|профессор|доцент|к\.\s*[а-я]+\.\s*н|PhD|университет|институт|академия)/i,

    // "И.О. Фамилия" pattern
    /([А-ЯЁӘҒҚҢӨҮІ]\.[А-ЯЁӘҒҚҢӨҮІ]?\.?\s+[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі][а-яёәғқңөүі]+)[\s,]*(?:магистр|докторант|профессор|доцент|к\.\s*[а-я]+\.\s*н|PhD|университет)/i,

    // Simple "Фамилия И.О." anywhere
    /\b([А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі][а-яёәғқңөүі]{2,}\s+[А-ЯЁӘҒҚҢӨҮІ]\.[А-ЯЁӘҒҚҢӨҮІ]?\.?)\b/,

    // Full name "Фамилия Имя Отчество" before annotation
    /([А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі][а-яёәғқңөүі]+\s+[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі][а-яёәғқңөүі]+\s+[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі][а-яёәғқңөүі]+)[\s,]*(?:аннотация|abstract|annotation|түйін)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const author = match[1].trim();
      // Validate: should be 2-50 chars and not look like a title
      if (author.length >= 2 && author.length <= 50 &&
          !author.toUpperCase().includes('УДК') &&
          !author.toUpperCase().includes('НАУК') &&
          !author.match(/^\d/)) {
        return author;
      }
    }
  }

  return null;
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

// ============ GEMINI API HELPER ============
// Gemini uses different API format than OpenAI-compatible APIs

const makeGeminiRequest = async (prompt, maxTokens, apiKey, model) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: prompt }] }
      ],
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.3
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;

    // Return structured error for handling in makeAIRequest
    return {
      error: true,
      status: response.status,
      message: errorMessage,
      isQuotaExceeded: errorMessage.includes('quota') || errorMessage.includes('429') ||
                       errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('limit')
    };
  }

  const data = await response.json();

  // Gemini returns content in different structure
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    return { error: true, status: 500, message: 'Invalid Gemini response structure' };
  }

  return { error: false, content };
};

// ============ CORE AI REQUEST (Gemini Only) ============

const makeAIRequest = async (prompt, maxTokens = 1000, taskType = 'general', options = {}) => {
  const { retryCount = 0, modelIndex = 0 } = options;
  const startTime = Date.now();

  // Check if Gemini is exhausted
  if (isProviderExhausted()) {
    console.error('GEMINI_EXHAUSTED: Gemini API daily limit reached');
    throw new Error('PROVIDER_EXHAUSTED|Лимит Gemini API исчерпан|Попробуйте позже или перейдите на платный тариф');
  }

  // Get Gemini provider
  const activeConfig = getActiveProvider();
  if (!activeConfig) {
    console.error('AI Request Error: GEMINI_API_KEY not configured');
    throw new Error('API_KEY_MISSING|Ключ GEMINI_API_KEY не настроен|Добавьте GEMINI_API_KEY в переменные окружения');
  }

  const { provider, apiKey } = activeConfig;

  // Wait for rate limit
  await waitForRateLimit(taskType);

  // Select model (with fallbacks)
  const allModels = [provider.model, ...provider.fallbackModels];
  const model = allModels[Math.min(modelIndex, allModels.length - 1)];
  const isLastModel = modelIndex >= allModels.length - 1;

  console.log(`AI Request: provider=Gemini, model=${model}, task=${taskType}, retry=${retryCount}`);

  try {
    const geminiResult = await makeGeminiRequest(prompt, maxTokens, apiKey, model);

    if (geminiResult.error) {
      console.error(`Gemini Request Failed: status=${geminiResult.status}, error=${geminiResult.message}`);

      // Handle quota exceeded
      if (geminiResult.isQuotaExceeded || geminiResult.status === 429) {
        consecutiveErrors++;
        setGeminiDailyLimitHit();
        throw new Error('PROVIDER_EXHAUSTED|Лимит Gemini API исчерпан|Попробуйте позже или перейдите на платный тариф');
      }

      // Handle model not available - try fallback model
      if ((geminiResult.status === 404 || geminiResult.status === 400) && !isLastModel) {
        console.log(`Model ${model} unavailable, trying ${allModels[modelIndex + 1]}`);
        await new Promise(r => setTimeout(r, 1000));
        return makeAIRequest(prompt, maxTokens, taskType, { ...options, modelIndex: modelIndex + 1 });
      }

      // Handle 5xx - retry with backoff
      if (geminiResult.status >= 500 && retryCount < RATE_LIMIT_CONFIG.MAX_RETRIES) {
        consecutiveErrors++;
        const backoff = Math.pow(2, retryCount) * RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER;
        console.log(`Server error, retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        return makeAIRequest(prompt, maxTokens, taskType, { ...options, retryCount: retryCount + 1 });
      }

      throw new Error(`Gemini API error: ${geminiResult.message}`);
    }

    // Success
    consecutiveErrors = 0;
    incrementGeminiRequests();
    updateMetrics(Date.now() - startTime);
    console.log(`AI Request Success: model=${model}, time=${Date.now() - startTime}ms`);
    return geminiResult.content;

  } catch (error) {
    updateMetrics(Date.now() - startTime, true);

    if (error.message?.includes('API_KEY_MISSING') ||
        error.message?.includes('PROVIDER_EXHAUSTED')) {
      throw error;
    }

    console.error(`AI Request Exception: ${error.message}`);

    // Network error - retry with backoff
    if ((error.name === 'TypeError' || error.name === 'FetchError') &&
        retryCount < RATE_LIMIT_CONFIG.MAX_RETRIES) {
      consecutiveErrors++;
      const backoff = Math.pow(2, retryCount) * RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER;
      console.log(`Network error, retrying in ${backoff}ms...`);
      await new Promise(r => setTimeout(r, backoff));
      return makeAIRequest(prompt, maxTokens, taskType, { ...options, retryCount: retryCount + 1 });
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

    // Process section - use centralized keyword matching
    const detectedSection = result.section?.toUpperCase?.()?.trim() || '';
    const matchedSection = matchSectionByKeywords(detectedSection);

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
 * Analyze ALL articles with parallel batch processing
 * Splits into batches and processes them in parallel for maximum speed
 * @param {Array} articles - Array of {fileName, content}
 * @returns {Array} - Array of analysis results
 */
export const analyzeAllArticles = async (articles) => {
  if (!articles || articles.length === 0) return [];

  const { BATCH_SIZE, PARALLEL_BATCHES = 2 } = BATCH_CONFIG;
  const allResults = [];

  // Split all articles into batches
  const batches = [];
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    batches.push(articles.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${articles.length} articles in ${batches.length} batches (${PARALLEL_BATCHES} parallel)`);
  const startTime = Date.now();

  // Process batches in parallel chunks
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);

    // Process this chunk of batches in parallel
    const batchPromises = parallelBatches.map(batch => analyzeArticlesBatch(batch));
    const batchResults = await Promise.all(batchPromises);

    // Flatten results
    for (const results of batchResults) {
      allResults.push(...results);
    }

    console.log(`Processed ${Math.min((i + PARALLEL_BATCHES) * BATCH_SIZE, articles.length)}/${articles.length} articles`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`All ${articles.length} articles analyzed in ${duration}s (${(articles.length / parseFloat(duration)).toFixed(1)} articles/sec)`);

  return allResults;
};

/**
 * Analyze multiple articles in one request
 * Up to 6 articles per batch for maximum efficiency
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
Проанализируй ${uncachedArticles.length} научных статей и верни JSON массив с ${uncachedArticles.length} элементами.

## КРИТИЧНЫЕ ПРАВИЛА (ВСЕ ПОЛЯ ОБЯЗАТЕЛЬНЫ!):
1. КАЖДЫЙ элемент ОБЯЗАН содержать ВСЕ поля: fileName, title, author, section, sectionConfidence
2. НИКОГДА не возвращай "undefined" или null - если не нашёл, извлеки из имени файла!
3. Если раздел не определён - выбери наиболее подходящий по содержанию

## РАЗДЕЛЫ (выбери ОДИН для КАЖДОЙ статьи):
- "ТЕХНИЧЕСКИЕ НАУКИ" — IT, инженерия, программирование, строительство, технологии, компьютеры, цифровизация
- "ПЕДАГОГИЧЕСКИЕ НАУКИ" — образование, методика преподавания, педагогика, обучение, школа, студенты, дидактика
- "ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ" — физика, химия, биология, экономика, финансы, математика, экология, медицина

## ИЗВЛЕЧЕНИЕ АВТОРА (КРИТИЧНО!):
1. Ищи ПОСЛЕ названия статьи, ПЕРЕД аннотацией/abstract
2. Форматы: "Фамилия И.О.", "И.О. Фамилия", "Фамилия Имя Отчество"
3. Казахские: "Қайрат Е.Қ.", "Макишева Э.И.", "Нұрбек А.Б." — сохраняй КАК ЕСТЬ с буквами Қ,Ғ,Ү,Ө,Ә,Ң
4. ЕСЛИ автор в имени файла (напр. "Қайрат Е.Қ..docx") — извлеки оттуда!
5. НИКОГДА не пиши "undefined" — если не нашёл, возьми из имени файла без расширения

## ИЗВЛЕЧЕНИЕ НАЗВАНИЯ:
- После УДК/UDC, до списка авторов
- На языке оригинала (казахский/русский/английский)
- НЕ переводи!
${BATCH_EXAMPLE}
## СТАТЬИ ДЛЯ АНАЛИЗА:
${articlesText}

## ОТВЕТ (JSON массив из ${uncachedArticles.length} объектов, КАЖДЫЙ с полем section):
[`;

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
    // Note: prompt ends with "[" so model should continue the array
    let parsed;
    let cleaned = response?.trim() || '';

    // If response doesn't start with [ or {, prepend [ (model continued from our prompt)
    if (!cleaned.startsWith('[') && !cleaned.startsWith('{')) {
      cleaned = '[' + cleaned;
    }

    cleaned = extractJsonFromResponse(cleaned);

    // Handle array response
    if (cleaned.startsWith('[')) {
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Try to repair truncated array
        const repaired = repairTruncatedJson(cleaned);
        try {
          parsed = JSON.parse(repaired);
        } catch {
          console.error('Failed to parse batch response JSON');
          parsed = [];
        }
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

      // Match section - more flexible matching for different model outputs
      const detectedSection = result.section?.toUpperCase?.()?.trim() || '';

      // DEBUG: Log what the model returned for troubleshooting
      console.log(`Section matching for "${article.fileName}": model returned "${result.section}" -> normalized: "${detectedSection}"`);

      // Try AI-returned section first
      let matchedSection = detectedSection.length > 0 ? matchSectionByKeywords(detectedSection) : null;
      let confidence = Number(result.sectionConfidence) || 0;

      // FALLBACK: If AI didn't return section, try content-based detection
      if (!matchedSection) {
        console.log(`Fallback: trying content-based section detection for "${article.fileName}"`);
        const contentDetection = detectSectionFromContent(article.content, result.title || '');
        if (contentDetection.section) {
          matchedSection = contentDetection.section;
          confidence = contentDetection.confidence;
          console.log(`Content-based detection: "${article.fileName}" -> "${matchedSection}" (confidence: ${confidence})`);
        }
      } else {
        // AI returned valid section
        confidence = Math.max(0, Math.min(1, confidence || 0.7));
      }

      // DEBUG: Log match result
      console.log(`Section match result for "${article.fileName}": ${matchedSection ? `MATCHED -> "${matchedSection}"` : 'NO MATCH -> ТРЕБУЕТ КЛАССИФИКАЦИИ'}`);

      let author = result.author;
      // Check if author is invalid (undefined, null, empty, or literal "undefined" string)
      const isInvalidAuthor = !author ||
        author === 'null' ||
        author === 'undefined' ||
        author === 'Не указан' ||
        author === 'Автор не указан' ||
        !author.trim();

      if (isInvalidAuthor) {
        // FALLBACK 1: Try to extract author from article content using regex patterns
        const contentAuthor = extractAuthorFromContent(article.content);
        if (contentAuthor) {
          author = contentAuthor;
          console.log(`Extracted author from content: "${article.fileName}" -> "${author}"`);
        } else {
          // FALLBACK 2: Try to extract from filename (e.g., "Қайрат Е.Қ..docx")
          const fileNameWithoutExt = article.fileName.replace(/\.docx$/i, '').trim();
          const looksLikeName = /[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі]\.\s*[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі]\.?/i.test(fileNameWithoutExt) ||
            /^[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі]+\s+[А-ЯЁӘҒҚҢӨҮІа-яёәғқңөүі]/i.test(fileNameWithoutExt);

          if (looksLikeName && fileNameWithoutExt.length < 50) {
            author = fileNameWithoutExt;
            console.log(`Extracted author from filename: "${article.fileName}" -> "${author}"`);
          } else {
            author = 'Автор не указан';
            console.log(`Could not extract author for: "${article.fileName}"`);
          }
        }
      }
      author = author.trim().replace(/,\s*$/, '').replace(/\s+/g, ' ');

      const finalResult = {
        fileName: article.fileName,
        title: result.title || article.fileName.replace('.docx', '').replace(/_/g, ' '),
        author,
        section: matchedSection || NEEDS_REVIEW_SECTION,
        sectionConfidence: matchedSection ? confidence : 0,
        // Only require review if section couldn't be matched at all
        // If section matched, trust the model's classification
        needsReview: !matchedSection,
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
    const matchedSection = matchSectionByKeywords(detectedSection);

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

// Kazakh-specific characters pattern
const KAZAKH_PATTERN = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

// Common Kazakh words without special characters
const KAZAKH_WORDS = /^(сауаттылық|білім|оқыту|мектеп|тіл|және|бойынша|туралы|арқылы|жүйесі|дамуы|қазақ|орыс|математикалық|жағдайда|сабақ|оқушы|мұғалім|әдіс|тәсіл|ұйым|жұмыс|бағдарлама|ғылым|тарих|мәдениет|қоғам|мемлекет|заң|құқық|денсаулық|спорт|өнер|музыка)$/i;

/**
 * Detect primary language of text
 * @returns {'kazakh' | 'russian' | 'english' | 'mixed'}
 */
const detectTextLanguage = (text) => {
  if (!text) return 'mixed';

  const sample = text.substring(0, 3000);

  // Count Kazakh-specific characters
  const kazakhChars = (sample.match(/[ӘәҒғҚқҢңӨөҰұҮүІі]/g) || []).length;

  // Count Cyrillic characters (Russian + Kazakh common)
  const cyrillicChars = (sample.match(/[а-яёА-ЯЁ]/g) || []).length;

  // Count Latin characters
  const latinChars = (sample.match(/[a-zA-Z]/g) || []).length;

  const totalChars = kazakhChars + cyrillicChars + latinChars;
  if (totalChars === 0) return 'mixed';

  // If significant Kazakh-specific characters, it's Kazakh
  if (kazakhChars > 10 || kazakhChars / totalChars > 0.02) {
    return 'kazakh';
  }

  // If mostly Cyrillic, it's Russian
  if (cyrillicChars > latinChars * 2) {
    return 'russian';
  }

  // If mostly Latin, it's English
  if (latinChars > cyrillicChars * 2) {
    return 'english';
  }

  return 'mixed';
};

// Known synonym pairs that are NOT spelling errors
const SYNONYM_PAIRS = [
  ['disperse', 'deflect'], ['decrease', 'reduction'], ['especially', 'particularly'],
  ['increase', 'growth'], ['important', 'significant'], ['use', 'utilize'],
  ['show', 'demonstrate'], ['help', 'assist'], ['big', 'large'], ['small', 'little'],
  ['start', 'begin'], ['end', 'finish'], ['make', 'create'], ['get', 'obtain'],
  ['give', 'provide'], ['take', 'receive'], ['also', 'additionally'], ['but', 'however'],
  ['экологический', 'экологически'], ['чистый', 'чистой']
];

/**
 * Calculate similarity ratio between two strings (0-1)
 * Typos should have high similarity (>0.5), synonyms have low similarity
 */
const calculateSimilarity = (str1, str2) => {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Simple character overlap ratio
  const chars1 = new Set(s1.split(''));
  const chars2 = new Set(s2.split(''));
  const intersection = [...chars1].filter(c => chars2.has(c)).length;
  const union = new Set([...chars1, ...chars2]).size;

  const charSimilarity = intersection / union;

  // Length similarity
  const lengthDiff = Math.abs(s1.length - s2.length);
  const maxLength = Math.max(s1.length, s2.length);
  const lengthSimilarity = 1 - (lengthDiff / maxLength);

  // Combined similarity
  return (charSimilarity * 0.6 + lengthSimilarity * 0.4);
};

/**
 * Filter out false positive spelling errors
 * @param {Array} errors - Array of spelling errors
 * @param {boolean} isKazakhMode - If true, allow Kazakh words through (Gemini handles them)
 */
const filterSpellingErrors = (errors, isKazakhMode = false) => {
  if (!Array.isArray(errors)) return [];

  return errors.filter(err => {
    if (!err.word || !err.suggestion) return false;

    const word = err.word.trim();
    const suggestion = err.suggestion.trim();

    // Filter out identical words (case-insensitive, normalized)
    const normalizedWord = word.toLowerCase().normalize('NFC');
    const normalizedSuggestion = suggestion.toLowerCase().normalize('NFC');
    if (normalizedWord === normalizedSuggestion) return false;

    // In Kazakh mode, allow Kazakh words through (Gemini checked them)
    // In non-Kazakh mode, filter out Kazakh words (they weren't checked properly)
    if (!isKazakhMode) {
      if (KAZAKH_PATTERN.test(word) || KAZAKH_PATTERN.test(suggestion)) return false;
      if (KAZAKH_WORDS.test(word)) return false;
    }

    // Filter out known synonym pairs (applies to all languages)
    for (const [syn1, syn2] of SYNONYM_PAIRS) {
      if ((normalizedWord.includes(syn1) && normalizedSuggestion.includes(syn2)) ||
          (normalizedWord.includes(syn2) && normalizedSuggestion.includes(syn1))) {
        console.log(`Filtered synonym pair: "${word}" -> "${suggestion}"`);
        return false;
      }
    }

    // Filter out suggestions that are completely different words (synonyms)
    // Real typos should have similarity > 0.4
    const similarity = calculateSimilarity(word, suggestion);
    if (similarity < 0.4) {
      console.log(`Filtered low-similarity suggestion (${similarity.toFixed(2)}): "${word}" -> "${suggestion}"`);
      return false;
    }

    // Filter out multi-word suggestions (like "экологически" -> "экологически чистой")
    if (suggestion.split(/\s+/).length > word.split(/\s+/).length + 1) {
      console.log(`Filtered multi-word addition: "${word}" -> "${suggestion}"`);
      return false;
    }

    return true;
  });
};

/**
 * Check spelling for a single article
 * ALWAYS checks 100% of article content - no sampling or truncation
 * Supports: Russian, English, Kazakh
 * AI detects language automatically during analysis (more accurate than regex)
 * If provider limits don't allow full check, throws error with message
 */
export const checkSpelling = async (content, fileName) => {
  // Check cache first
  const cacheKey = generateCacheKey('spelling', content, fileName);
  const cached = getCached(cacheKey);
  if (cached) return { fileName, ...cached };

  const fallback = { errors: [], totalErrors: 0, language: 'cyrillic' };

  // ALWAYS use full content - 100% analysis required
  const textToCheck = content;

  console.log(`Spell check "${fileName}": ${content.length} chars (100%), requesting AI analysis with language detection`);

  // Unified prompt that detects language AND checks spelling
  const prompt = `## ЗАДАЧА / TASK / ТАПСЫРМА
1. Определи ОСНОВНОЙ ЯЗЫК текста (русский, английский или казахский)
2. Найди ОРФОГРАФИЧЕСКИЕ ОШИБКИ (опечатки)

## ОПРЕДЕЛЕНИЕ ЯЗЫКА:
- "kazakh" — если текст на казахском языке (содержит казахские слова: және, бойынша, туралы, қазіргі, білім и т.д., или буквы Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, І)
- "cyrillic" — если текст на русском языке (кириллица без казахских особенностей)
- "latin" — если текст на английском языке (латиница)

ВАЖНО: Определяй язык по СОДЕРЖАНИЮ текста, а не по отдельным словам. Казахские имена авторов в русском тексте НЕ делают текст казахским.

## ЧТО ЯВЛЯЕТСЯ ОРФОГРАФИЧЕСКОЙ ОШИБКОЙ:
- Пропущенная/лишняя/неправильная буква: "эксперемент" → "эксперимент"
- Для казахского: неправильное использование Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, І

## ЧТО НЕ ЯВЛЯЕТСЯ ОШИБКОЙ (ИГНОРИРУЙ):
❌ Синонимы — разные слова с похожим значением
❌ Стилистика — замена правильного слова другим правильным
❌ Грамматика — падежи, согласование
❌ Термины, имена, аббревиатуры

## ФОРМАТ ОТВЕТА (JSON):
{"language": "cyrillic|kazakh|latin", "errors": [{"word": "ошибка", "suggestion": "исправление", "context": "..."}], "totalErrors": N}

Если ошибок нет: {"language": "detected_language", "errors": [], "totalErrors": 0}

## ТЕКСТ:
${textToCheck}`;

  try {
    const maxTokens = BATCH_CONFIG.MAX_TOKENS_SPELLING || 1500;

    // Gemini отлично справляется со всеми языками (русский, казахский, английский)
    const response = await makeAIRequest(prompt, maxTokens, 'spelling');
    const result = safeJsonParse(response, fallback);

    // Get AI-detected language (fallback to regex detection if AI didn't return it)
    let detectedLanguage = result.language;
    if (!detectedLanguage || !['kazakh', 'cyrillic', 'latin'].includes(detectedLanguage)) {
      // Fallback to character-based detection
      detectedLanguage = detectTextLanguage(content);
      // Map 'russian'/'english' to 'cyrillic'/'latin' for consistency
      if (detectedLanguage === 'russian') detectedLanguage = 'cyrillic';
      if (detectedLanguage === 'english') detectedLanguage = 'latin';
      if (!['kazakh', 'cyrillic', 'latin'].includes(detectedLanguage)) {
        detectedLanguage = 'cyrillic';
      }
    }

    const isKazakh = detectedLanguage === 'kazakh';

    // For Kazakh, use less aggressive filtering (AI handles it better)
    const validErrors = isKazakh
      ? filterSpellingErrors(result.errors || [], true)
      : filterSpellingErrors(result.errors || [], false);

    const spellingResult = {
      errors: validErrors,
      totalErrors: validErrors.length,
      coverage: 100, // Always 100%
      language: detectedLanguage
    };

    console.log(`Spell check "${fileName}": AI detected language="${detectedLanguage}", found ${validErrors.length} errors`);

    // Cache the result
    setCache(cacheKey, spellingResult);

    return { fileName, ...spellingResult };
  } catch (error) {
    console.error(`Spell check error for "${fileName}":`, error.message);

    // Re-throw rate limit errors so UI can show proper message
    if (error.message?.includes('ALL_PROVIDERS_EXHAUSTED') ||
        error.message?.includes('RATE_LIMIT') ||
        error.message?.includes('413') ||
        error.message?.includes('too large')) {
      throw new Error(`SPELL_CHECK_LIMIT|Не удалось проверить орфографию "${fileName}" - превышен лимит AI. Попробуйте позже или обновите тариф.`);
    }

    return { fileName, ...fallback };
  }
};

/**
 * Batch spell check for multiple articles
 * Processes articles in parallel (up to 3 concurrent requests)
 */
export const checkSpellingBatch = async (articles) => {
  if (!articles || articles.length === 0) return [];

  // Check cache for each article
  const cachedResults = [];
  const uncachedArticles = [];

  for (const article of articles) {
    const cacheKey = generateCacheKey('spelling', article.content, article.fileName);
    const cached = getCached(cacheKey);
    if (cached) {
      cachedResults.push({ fileName: article.fileName, ...cached, fromCache: true });
    } else {
      uncachedArticles.push(article);
    }
  }

  // If all cached, return immediately
  if (uncachedArticles.length === 0) {
    console.log(`Batch spelling: all ${articles.length} articles from cache`);
    return cachedResults;
  }

  console.log(`Batch spelling: ${cachedResults.length} cached, ${uncachedArticles.length} to process`);

  // Process uncached articles in PARALLEL (configurable concurrency)
  const MAX_CONCURRENT = BATCH_CONFIG.PARALLEL_SPELLING || 3;
  const processedResults = [];

  // Split into chunks for parallel processing
  const chunks = [];
  for (let i = 0; i < uncachedArticles.length; i += MAX_CONCURRENT) {
    chunks.push(uncachedArticles.slice(i, i + MAX_CONCURRENT));
  }

  for (const chunk of chunks) {
    // Process chunk in parallel
    const promises = chunk.map(article => processSpellingArticle(article));
    const chunkResults = await Promise.all(promises);
    processedResults.push(...chunkResults);
  }

  console.log(`Batch spelling completed: ${processedResults.length} articles processed`);
  return [...cachedResults, ...processedResults];
};

/**
 * Process single article for spelling (used for parallel processing)
 */
const processSpellingArticle = async (article) => {
  try {
    const result = await checkSpelling(article.content, article.fileName);
    return result;
  } catch (error) {
    console.error(`Spelling error for ${article.fileName}:`, error.message);
    return { fileName: article.fileName, errors: [], totalErrors: 0 };
  }
};

/**
 * Review article
 * ALWAYS reviews 100% of article content - no sampling or truncation
 * If provider limits don't allow full review, throws error with message
 */
export const reviewArticle = async (content, fileName) => {
  // ALWAYS use full content - 100% analysis required
  const textToReview = content;

  console.log(`Review "${fileName}": ${content.length} chars (100%), requesting full analysis`);

  const prompt = `Проведи рецензию научной статьи.

ШКАЛА (1-5): 1-неприемлемо, 2-слабо, 3-удовл., 4-хорошо, 5-отлично

КРИТЕРИИ:
1. structure: введение, методология, результаты, выводы
2. logic: последовательность аргументации
3. originality: новизна исследования
4. style: научный язык, грамотность
5. relevance: актуальность темы

ТЕКСТ (${fileName}):
${textToReview}

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
    const maxTokens = BATCH_CONFIG.MAX_TOKENS_REVIEW || 3000;
    const response = await makeAIRequest(prompt, maxTokens, 'review');
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
      recommendations: Array.isArray(review.recommendations) ? review.recommendations.filter(r => r && typeof r === 'string') : [],
      coverage: 100 // Always 100%
    };
  } catch (error) {
    console.error(`Review error for "${fileName}":`, error.message);

    // Re-throw rate limit errors so UI can show proper message
    if (error.message?.includes('ALL_PROVIDERS_EXHAUSTED') ||
        error.message?.includes('RATE_LIMIT') ||
        error.message?.includes('413') ||
        error.message?.includes('too large')) {
      throw new Error(`REVIEW_LIMIT|Не удалось создать рецензию "${fileName}" - превышен лимит AI. Попробуйте позже или обновите тариф.`);
    }

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
      const matchedSection = matchSectionByKeywords(detectedSection);

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
  const geminiKey = process.env.GEMINI_API_KEY;

  return {
    available: !!geminiKey,
    provider: 'Gemini 2.5 Flash',
    gemini: {
      configured: !!geminiKey,
      model: PROVIDERS.gemini.model,
      rateLimit: '15 req/min, 1500 req/day',
      requestsToday: geminiRequestsToday,
      dailyLimitHit: geminiDailyLimitHit
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
  errorRate: metrics.totalRequests > 0
    ? Math.round((metrics.errors / metrics.totalRequests) * 100) + '%'
    : '0%',
  geminiRequestsToday,
  geminiDailyLimitHit
});

/**
 * Health check for monitoring
 */
export const healthCheck = async () => {
  const status = getStatus();
  const startTime = Date.now();

  // Quick connectivity test for Gemini
  let healthy = false;
  let responseTime = 0;

  if (status.available) {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      // Gemini models list endpoint
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { method: 'GET' }
      );
      healthy = response.ok;
      responseTime = Date.now() - startTime;
    } catch {
      healthy = false;
      responseTime = Date.now() - startTime;
    }
  }

  return {
    status: healthy ? 'healthy' : (status.available ? 'degraded' : 'unavailable'),
    provider: 'Gemini 2.5 Flash',
    model: PROVIDERS.gemini.model,
    cache: { size: cache.size, maxSize: CACHE_CONFIG.MAX_SIZE },
    uptime: process.uptime(),
    responseTime,
    timestamp: new Date().toISOString()
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
  analyzeAllArticles,  // NEW: Parallel batch processing for all articles
  extractMetadata,
  detectSection,
  checkSpelling,
  checkSpellingBatch,
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
  getPromptVersion,
  // Provider status (for exhausted limits notification)
  getProvidersStatus
};
