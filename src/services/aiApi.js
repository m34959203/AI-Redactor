/**
 * AI API Service - Frontend client for AI operations
 * Supports Groq (primary) and OpenRouter (fallback)
 * All requests go through backend proxy for security
 */

import {
  ARTICLE_SECTIONS,
  CONFIDENCE_THRESHOLDS,
  NEEDS_REVIEW_SECTION
} from '../constants/sections';

// API base URL - uses backend proxy
const getApiUrl = () => {
  // In production, use same origin
  // In development, use VITE_API_URL or localhost:3001
  if (import.meta.env.PROD) {
    return '';
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
};

const API_BASE = getApiUrl();

/**
 * Check if AI service is available
 */
export const checkAIStatus = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/ai/status`);
    if (!response.ok) return { available: false };
    return await response.json();
  } catch {
    return { available: false };
  }
};

/**
 * Handle API errors with user-friendly messages
 */
const handleApiError = (error, response) => {
  if (response?.status === 503) {
    throw new Error('API_KEY_MISSING');
  }
  if (response?.status === 401) {
    throw new Error('API_KEY_INVALID');
  }
  if (response?.status === 429) {
    const data = error;
    throw new Error(`RATE_LIMIT|${data.error || 'Rate limit exceeded'}|${data.suggestion || 'Try again later'}`);
  }
  throw new Error(error.error || error.message || 'AI request failed');
};

/**
 * Combined article analysis: metadata + section + quick review
 * 4x faster than separate requests - uses single API call
 */
export const analyzeArticle = async (fileName, content) => {
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
    const response = await fetch(`${API_BASE}/api/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, content })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      handleApiError(error, response);
    }

    return await response.json();
  } catch (error) {
    console.error('Article analysis error:', error);
    if (error.message === 'API_KEY_MISSING' || error.message === 'API_KEY_INVALID') {
      return { ...fallback, author: '⚠️ API не настроен' };
    }
    return fallback;
  }
};

/**
 * Extracts metadata (title and author) from article content
 */
export const extractMetadataWithAI = async (fileName, content) => {
  const fallback = {
    title: fileName.replace('.docx', '').replace(/_/g, ' '),
    author: 'Автор не указан'
  };

  try {
    const response = await fetch(`${API_BASE}/api/ai/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, content })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      handleApiError(error, response);
    }

    const result = await response.json();
    return {
      title: result.title || fallback.title,
      author: result.author || fallback.author
    };
  } catch (error) {
    console.error('Metadata extraction error:', error);
    if (error.message === 'API_KEY_MISSING' || error.message === 'API_KEY_INVALID') {
      return { title: fallback.title, author: '⚠️ API не настроен' };
    }
    return fallback;
  }
};

/**
 * Detects the thematic section of a scientific article
 */
export const detectArticleSection = async (content, title) => {
  const fallbackResult = {
    section: NEEDS_REVIEW_SECTION,
    confidence: 0,
    needsReview: true,
    reasoning: 'Не удалось выполнить автоматическую классификацию'
  };

  try {
    const response = await fetch(`${API_BASE}/api/ai/section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      handleApiError(error, response);
    }

    return await response.json();
  } catch (error) {
    console.error('Section detection error:', error);
    return fallbackResult;
  }
};

/**
 * Checks spelling in the content
 */
export const checkSpelling = async (content, fileName) => {
  const fallback = { fileName, errors: [], totalErrors: 0 };

  try {
    const response = await fetch(`${API_BASE}/api/ai/spelling`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, fileName })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      handleApiError(error, response);
    }

    return await response.json();
  } catch (error) {
    console.error('Spell check error:', error);
    if (error.message === 'API_KEY_MISSING' || error.message === 'API_KEY_INVALID') {
      return {
        fileName,
        errors: [{
          word: '⚠️',
          suggestion: 'Настройте API ключ на сервере',
          context: 'AI проверка орфографии недоступна'
        }],
        totalErrors: 0,
        apiError: true
      };
    }
    return fallback;
  }
};

/**
 * Reviews an article with detailed scoring
 */
export const reviewArticle = async (content, fileName) => {
  const fallback = {
    fileName,
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
    const response = await fetch(`${API_BASE}/api/ai/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, fileName })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      handleApiError(error, response);
    }

    return await response.json();
  } catch (error) {
    console.error('Review error:', error);
    if (error.message === 'API_KEY_MISSING' || error.message === 'API_KEY_INVALID') {
      return {
        ...fallback,
        summary: '⚠️ AI рецензирование недоступно. Настройте API ключ на сервере.',
        apiError: true
      };
    }
    return fallback;
  }
};

/**
 * Retry article classification with enhanced prompt
 */
export const retryArticleClassification = async (content, title, maxRetries = 3) => {
  const fallbackResult = {
    section: NEEDS_REVIEW_SECTION,
    confidence: 0,
    needsReview: true,
    reasoning: 'Не удалось классифицировать'
  };

  try {
    const response = await fetch(`${API_BASE}/api/ai/retry-section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title, maxRetries })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      handleApiError(error, response);
    }

    return await response.json();
  } catch (error) {
    console.error('Retry classification error:', error);
    return fallbackResult;
  }
};

/**
 * Batch retry classification for multiple articles
 */
export const batchRetryClassification = async (articles, onProgress) => {
  const results = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    if (onProgress) {
      onProgress(i + 1, articles.length, article);
    }

    try {
      const classification = await retryArticleClassification(
        article.content,
        article.title,
        3
      );

      results.push({
        ...article,
        section: classification.section,
        sectionConfidence: classification.confidence,
        needsReview: classification.needsReview,
        sectionReasoning: classification.reasoning,
        retryAttempted: true,
        retryTimestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Failed to retry classification for "${article.title}":`, error);
      results.push({
        ...article,
        retryAttempted: true,
        retryFailed: true,
        retryTimestamp: new Date().toISOString()
      });
    }

    // Delay between articles
    if (i < articles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
};

/**
 * Get cache statistics
 */
export const getCacheStats = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/ai/cache/stats`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Clear AI cache
 */
export const clearCache = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/ai/cache`, {
      method: 'DELETE'
    });
    if (!response.ok) return false;
    return true;
  } catch {
    return false;
  }
};

// Re-export for backward compatibility
export { ARTICLE_SECTIONS } from '../constants/sections';
