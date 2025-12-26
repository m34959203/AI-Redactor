/**
 * AI Service Configuration
 * Centralized settings for AI providers and processing
 */

// ============ BATCH PROCESSING ============
export const BATCH_CONFIG = {
  // Maximum articles per batch request
  // Reduced to 2 to stay within 12000 TPM limit
  BATCH_SIZE: 2,

  // Maximum characters to send per article
  // Reduced to 1000 (~250 tokens) for safer TPM margins
  MAX_CHARS_PER_ARTICLE: 1000,

  // Maximum tokens for batch response
  MAX_TOKENS_BATCH: 1000,

  // Maximum tokens for single analysis
  MAX_TOKENS_SINGLE: 600,

  // Maximum tokens for spelling check (reduced for TPM)
  MAX_TOKENS_SPELLING: 800
};

// ============ RATE LIMITING ============
export const RATE_LIMIT_CONFIG = {
  // Delay between requests (ms)
  // CRITICAL: 12000 TPM needs ~6s between requests for recovery
  GROQ_DELAY: 6000,           // 6s for TPM recovery (12000 TPM / ~2000 tokens per req)
  OPENROUTER_DELAY: 5000,     // 20 req/min = 3s, but we use 5s for safety

  // Delay after hitting rate limit (TPM resets per minute)
  DELAY_AFTER_429: 25000,     // 25s wait on 429

  // Delay between spelling checks (prevent TPM exhaustion)
  SPELLING_DELAY: 8000,       // 8s between spell checks

  // Retry configuration
  MAX_RETRIES: 2,             // Reduced - fail fast, switch provider
  BACKOFF_MULTIPLIER: 6000    // exponential backoff base
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
    // Free tier: ~12K TPM for 70b model. Paid: 300K TPM
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
