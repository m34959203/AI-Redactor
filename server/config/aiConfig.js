/**
 * AI Service Configuration
 * Centralized settings for AI providers and processing
 */

// ============ BATCH PROCESSING ============
export const BATCH_CONFIG = {
  // Maximum articles per batch request
  // Gemini: 250K TPM allows large batches (6 articles × 1500 chars ≈ 2300 tokens)
  // Processing 6 articles in one request = 6x faster than individual
  BATCH_SIZE: 6,

  // Maximum characters to send per article
  // 1500 chars (~375 tokens) - Gemini has plenty of TPM headroom
  MAX_CHARS_PER_ARTICLE: 1500,

  // Maximum tokens for batch response (6 articles × 150 tokens each)
  MAX_TOKENS_BATCH: 1200,

  // Maximum tokens for single analysis
  MAX_TOKENS_SINGLE: 500,

  // Maximum tokens for spelling check
  MAX_TOKENS_SPELLING: 400,

  // Parallel processing settings
  PARALLEL_BATCHES: 2,        // Process 2 batches simultaneously
  PARALLEL_SPELLING: 3        // 3 parallel spell checks
};

// ============ RATE LIMITING ============
export const RATE_LIMIT_CONFIG = {
  // AGGRESSIVE delays for maximum speed (within rate limits)
  // Gemini: 30 RPM = minimum 2s, but we use 1.2s with burst capacity
  GEMINI_DELAY: 1200,         // 1.2s - aggressive, uses burst capacity
  GROQ_DELAY: 2000,           // 2s fallback
  OPENROUTER_DELAY: 1500,     // 1.5s fallback

  // Delay after hitting rate limit (quick recovery)
  DELAY_AFTER_429: 5000,      // 5s wait on 429 (aggressive retry)

  // Spelling checks - minimal delay for parallel processing
  SPELLING_DELAY: 500,        // 0.5s between spell checks

  // Retry configuration
  MAX_RETRIES: 2,             // Quick fail, switch provider
  BACKOFF_MULTIPLIER: 1500,   // 1.5s backoff base

  // Minimum delay between ANY requests
  MIN_DELAY: 200              // 200ms minimum (aggressive)
};

// ============ CACHE ============
export const CACHE_CONFIG = {
  TTL: 30 * 60 * 1000,        // 30 minutes
  MAX_SIZE: 1000,             // Maximum entries before cleanup
  HASH_LENGTH: 2000           // Characters to hash for cache key
};

// ============ PROVIDERS ============
export const PROVIDERS = {
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    // Fallback: llama-3.1-8b-instant (faster, 560 T/s, less TPM usage)
    // See https://console.groq.com/docs/models for current models
    fallbackModels: ['llama-3.1-8b-instant'],
    keyEnv: 'GROQ_API_KEY',
    // Free tier TPM limits (NOT paid tier!):
    // - llama-3.3-70b-versatile: 12K TPM
    // - llama-3.1-8b-instant: 6K TPM
    rateLimit: { requestsPerMin: 30, tokensPerMin: 12000 },
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'tngtech/deepseek-r1t2-chimera:free',
    // Updated Dec 2025 - only working free models
    fallbackModels: [
      'deepseek/deepseek-chat:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-7b-instruct:free'
    ],
    keyEnv: 'OPENROUTER_API_KEY',
    rateLimit: { requestsPerMin: 20, requestsPerDay: 200 },
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL || 'https://ai-redactor.railway.app',
      'X-Title': 'AI Journal Editor'
    })
  },
  gemini: {
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.0-flash-lite',
    // Flash-Lite has highest free tier: 1000 req/day, 30 RPM
    fallbackModels: ['gemini-1.5-flash'],
    keyEnv: 'GEMINI_API_KEY',
    // Free tier limits (Dec 2025):
    // - gemini-2.0-flash-lite: 1000 req/day, 30 RPM, 250K TPM
    // - gemini-1.5-flash: 15 req/min, 1M tokens/min
    rateLimit: { requestsPerMin: 30, requestsPerDay: 1000, tokensPerMin: 250000 },
    // Gemini uses different API format - handled in aiService.js
    headers: (apiKey) => ({
      'Content-Type': 'application/json'
    })
  }
};

// ============ ARTICLE SECTIONS ============
export const ARTICLE_SECTIONS = [
  'ТЕХНИЧЕСКИЕ НАУКИ',
  'ПЕДАГОГИЧЕСКИЕ НАУКИ',
  'ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ'
];

export const NEEDS_REVIEW_SECTION = 'ТРЕБУЕТ КЛАССИФИКАЦИИ';

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.6,
  LOW: 0.4
};

// ============ SYSTEM PROMPT ============
export const SYSTEM_PROMPT = `Ты - эксперт-редактор научного журнала с 20-летним опытом.
Специализация: анализ и классификация академических публикаций.

ТВОИ КОМПЕТЕНЦИИ:
- Классификация статей по научным дисциплинам
- Извлечение метаданных из научных текстов
- Проверка орфографии на русском, казахском и английском языках
- Рецензирование по академическим стандартам

ЯЗЫКИ СТАТЕЙ: русский, казахский, английский
- Извлекай метаданные на языке оригинала статьи
- Не переводи названия и имена авторов

ФОРМАТ ОТВЕТА:
- ВСЕГДА отвечай ТОЛЬКО валидным JSON
- НИКОГДА не добавляй текст до или после JSON
- При неуверенности используй поле "confidence"`;

// ============ CONFIDENCE CALIBRATION ============
export const CONFIDENCE_GUIDE = `
КАЛИБРОВКА CONFIDENCE (sectionConfidence):
- 0.9-1.0: Ключевые термины раздела явно присутствуют в тексте
- 0.7-0.9: Тематика очевидна из контекста и методов
- 0.5-0.7: Смешанная тематика, подходит несколько разделов
- 0.3-0.5: Слабые признаки, требуется ручная проверка
- 0.0-0.3: Невозможно определить раздел
`;

// ============ BATCH EXAMPLE ============
export const BATCH_EXAMPLE = `
## ПРИМЕР ОТВЕТА:
[
  {"fileName": "ml_article.docx", "title": "Методы машинного обучения в анализе данных", "author": "Иванов А.Б.", "section": "ТЕХНИЧЕСКИЕ НАУКИ", "sectionConfidence": 0.95},
  {"fileName": "pedagogy.docx", "title": "Методика преподавания математики", "author": "Петрова В.Г.", "section": "ПЕДАГОГИЧЕСКИЕ НАУКИ", "sectionConfidence": 0.88}
]
`;

export default {
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
};
