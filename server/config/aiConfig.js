/**
 * AI Service Configuration
 * Centralized settings for AI providers and processing
 */

// ============ BATCH PROCESSING ============
export const BATCH_CONFIG = {
  // Maximum articles per batch request
  // Increased to 4 for OpenRouter (200 req/day, higher throughput)
  // Groq still limited by 12K TPM, but OpenRouter handles batches better
  BATCH_SIZE: 4,

  // Maximum characters to send per article
  // 1200 chars (~300 tokens) balances context vs TPM
  MAX_CHARS_PER_ARTICLE: 1200,

  // Maximum tokens for batch response
  // Increased to handle 4 articles
  MAX_TOKENS_BATCH: 1500,

  // Maximum tokens for single analysis
  MAX_TOKENS_SINGLE: 600,

  // Maximum tokens for spelling check
  MAX_TOKENS_SPELLING: 500
};

// ============ RATE LIMITING ============
export const RATE_LIMIT_CONFIG = {
  // Delay between requests (ms)
  // Optimized delays based on actual rate limits
  GROQ_DELAY: 3000,           // 3s (12K TPM with ~1500 tokens/req = 8 req/min max)
  OPENROUTER_DELAY: 2000,     // 2s (20 req/min = 3s theoretical, 2s with burst capacity)

  // Delay after hitting rate limit (reduced for faster recovery)
  DELAY_AFTER_429: 15000,     // 15s wait on 429 (was 25s)

  // Delay between spelling checks (parallel-friendly)
  SPELLING_DELAY: 1500,       // 1.5s between spell checks

  // Retry configuration
  MAX_RETRIES: 3,             // Increased retries before failing
  BACKOFF_MULTIPLIER: 3000,   // Reduced backoff base (3s instead of 6s)

  // Minimum delay between ANY requests (prevents burst overload)
  MIN_DELAY: 500
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
