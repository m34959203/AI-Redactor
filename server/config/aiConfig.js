/**
 * AI Service Configuration
 * Centralized settings for AI providers and processing
 */

// ============ BATCH PROCESSING ============
export const BATCH_CONFIG = {
  // Maximum articles per batch request
  BATCH_SIZE: 5,

  // Maximum characters to send per article (prevents token overflow)
  MAX_CHARS_PER_ARTICLE: 1500,

  // Maximum tokens for batch response
  MAX_TOKENS_BATCH: 2000,

  // Maximum tokens for single analysis
  MAX_TOKENS_SINGLE: 1000
};

// ============ RATE LIMITING ============
export const RATE_LIMIT_CONFIG = {
  // Delay between requests (ms)
  GROQ_DELAY: 2000,           // 30 req/min = 2s between requests
  OPENROUTER_DELAY: 5000,     // 20 req/min = 3s, but we use 5s for safety

  // Delay after hitting rate limit
  DELAY_AFTER_429: 10000,

  // Retry configuration
  MAX_RETRIES: 2,
  BACKOFF_MULTIPLIER: 3000    // exponential backoff base
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

ФОРМАТ ОТВЕТА:
- ВСЕГДА отвечай ТОЛЬКО валидным JSON
- НИКОГДА не добавляй текст до или после JSON
- При неуверенности используй поле "confidence"`;

export default {
  BATCH_CONFIG,
  RATE_LIMIT_CONFIG,
  CACHE_CONFIG,
  PROVIDERS,
  ARTICLE_SECTIONS,
  NEEDS_REVIEW_SECTION,
  CONFIDENCE_THRESHOLDS,
  SYSTEM_PROMPT
};
