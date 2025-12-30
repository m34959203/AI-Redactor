/**
 * AI Service Configuration
 * Centralized settings for AI providers and processing
 */

// ============ BATCH PROCESSING ============
export const BATCH_CONFIG = {
  // BALANCED: Speed + Quality
  // 4 articles × 2500 chars = enough context for accurate classification
  BATCH_SIZE: 4,              // 4 articles per batch (quality over speed)

  // Maximum characters to send per article
  // 2500 chars (~625 tokens) - captures УДК, title, author, abstract + intro
  // This is enough to accurately classify the section
  MAX_CHARS_PER_ARTICLE: 2500,

  // Maximum tokens for batch response (4 articles × 200 tokens each)
  MAX_TOKENS_BATCH: 1000,

  // Maximum tokens for single analysis
  MAX_TOKENS_SINGLE: 600,

  // Maximum tokens for spelling check (full article = more potential errors)
  MAX_TOKENS_SPELLING: 1500,

  // Maximum tokens for review (full article = detailed analysis)
  MAX_TOKENS_REVIEW: 3000,

  // Parallel processing settings (unchanged - doesn't affect quality)
  PARALLEL_BATCHES: 2,        // Process 2 batches simultaneously
  PARALLEL_SPELLING: 3        // 3 parallel spell checks
};

// ============ RATE LIMITING ============
export const RATE_LIMIT_CONFIG = {
  // Gemini 2.5 Flash: 15 RPM = 4s minimum delay
  // Используем 4.5s для безопасности
  GEMINI_DELAY: 4500,         // 4.5s between requests (15 RPM safe)

  // Delay after hitting rate limit (recovery)
  DELAY_AFTER_429: 10000,     // 10s wait on 429

  // Spelling checks - slightly longer for stability
  SPELLING_DELAY: 2000,       // 2s between spell checks

  // Retry configuration
  MAX_RETRIES: 3,             // More retries since single provider
  BACKOFF_MULTIPLIER: 2000,   // 2s backoff base

  // Minimum delay between ANY requests
  MIN_DELAY: 1000             // 1s minimum (safe for Gemini)
};

// ============ CACHE ============
export const CACHE_CONFIG = {
  TTL: 30 * 60 * 1000,        // 30 minutes
  MAX_SIZE: 1000,             // Maximum entries before cleanup
  HASH_LENGTH: 2000           // Characters to hash for cache key
};

// ============ PROVIDERS ============
// Приоритет: Gemini → Groq → OpenRouter
export const PROVIDERS = {
  // Priority 1: Gemini - надёжный с Tier 1 (после оплаты)
  gemini: {
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-1.5-flash',
    fallbackModels: ['gemini-1.5-flash-latest', 'gemini-1.5-pro'],
    keyEnv: 'GEMINI_API_KEY',
    // Tier 1 (paid): 1000 req/min, 4M tokens/min
    // Free tier: 15 req/min, 1500 req/day
    rateLimit: { requestsPerMin: 1000, requestsPerDay: 50000, tokensPerMin: 4000000 },
    headers: (apiKey) => ({
      'Content-Type': 'application/json'
    })
  },
  // Priority 2: Groq - быстрый, хорошие лимиты
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    fallbackModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    keyEnv: 'GROQ_API_KEY',
    // Free tier: 30 req/min, 14400 req/day
    rateLimit: { requestsPerMin: 30, requestsPerDay: 14400 },
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  },
  // Priority 3: OpenRouter - backup, множество моделей
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'tngtech/deepseek-r1t2-chimera:free',
    fallbackModels: ['deepseek/deepseek-chat:free', 'meta-llama/llama-3.1-8b-instruct:free'],
    keyEnv: 'OPENROUTER_API_KEY',
    // Free tier: ~200 req/day
    rateLimit: { requestsPerMin: 20, requestsPerDay: 200 },
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://ai-redactor.app',
      'X-Title': 'AI-Redactor'
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
- Извлечение метаданных (название, автор) из научных текстов
- Определение языка статьи (русский, казахский, английский)
- Проверка орфографии на всех трёх языках
- Рецензирование по академическим стандартам

ЯЗЫКИ СТАТЕЙ: русский, казахский, английский
- Казахский язык: особые буквы Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, І — сохраняй их!
- Извлекай метаданные НА ЯЗЫКЕ ОРИГИНАЛА статьи
- НИКОГДА не переводи названия статей и имена авторов

ФОРМАТ ОТВЕТА:
- ВСЕГДА отвечай ТОЛЬКО валидным JSON
- НИКОГДА не добавляй текст до или после JSON
- НИКОГДА не используй markdown-блоки (\`\`\`json)
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
