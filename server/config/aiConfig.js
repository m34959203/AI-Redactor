/**
 * AI Service Configuration
 * Centralized settings for AI providers and processing
 */

// ============ BATCH PROCESSING ============
export const BATCH_CONFIG = {
  // Maximum articles per batch request
  // Reduced from 5 to 3 to avoid hitting 12000 TPM limit
  BATCH_SIZE: 3,

  // Maximum characters to send per article (prevents token overflow)
  // Reduced from 1500 to 1200 for safer TPM margins
  MAX_CHARS_PER_ARTICLE: 1200,

  // Maximum tokens for batch response
  MAX_TOKENS_BATCH: 1500,

  // Maximum tokens for single analysis
  MAX_TOKENS_SINGLE: 800
};

// ============ RATE LIMITING ============
export const RATE_LIMIT_CONFIG = {
  // Delay between requests (ms)
  // Increased to 4s to allow TPM quota recovery (12000 TPM limit)
  GROQ_DELAY: 4000,           // 30 req/min but TPM limited, use 4s for safety
  OPENROUTER_DELAY: 5000,     // 20 req/min = 3s, but we use 5s for safety

  // Delay after hitting rate limit (increased for TPM recovery)
  DELAY_AFTER_429: 15000,

  // Retry configuration
  MAX_RETRIES: 3,
  BACKOFF_MULTIPLIER: 4000    // exponential backoff base (increased)
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
    // Updated fallback models - mixtral deprecated Dec 2024
    fallbackModels: ['llama-3.1-70b-versatile', 'gemma2-9b-it'],
    keyEnv: 'GROQ_API_KEY',
    // Free tier: 12000 TPM for 70b, need longer delays
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
