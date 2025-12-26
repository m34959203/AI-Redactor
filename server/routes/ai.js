/**
 * AI API Routes - Multi-provider proxy
 * Supports Groq (primary) and OpenRouter (fallback)
 */

import express from 'express';
import aiService from '../services/aiService.js';

const router = express.Router();

/**
 * Error handler helper
 */
const handleAIError = (error, res) => {
  console.error('AI Error:', error.message);

  if (error.message === 'API_KEY_MISSING') {
    return res.status(503).json({ error: 'AI service not configured', code: 'API_KEY_MISSING' });
  }
  if (error.message === 'API_KEY_INVALID') {
    return res.status(401).json({ error: 'Invalid API key', code: 'API_KEY_INVALID' });
  }
  if (error.message?.startsWith('RATE_LIMIT')) {
    const [, message, suggestion] = error.message.split('|');
    return res.status(429).json({ error: message, suggestion, code: 'RATE_LIMIT' });
  }
  // Handle when ALL free AI providers are exhausted
  if (error.message?.startsWith('ALL_PROVIDERS_EXHAUSTED')) {
    const [, message, suggestion] = error.message.split('|');
    return res.status(429).json({
      error: message,
      suggestion,
      code: 'ALL_PROVIDERS_EXHAUSTED',
      providers: aiService.getProvidersStatus()
    });
  }

  res.status(500).json({ error: error.message });
};

/**
 * POST /api/ai/analyze
 * Combined analysis: metadata + section + quick review (4x faster)
 */
router.post('/analyze', async (req, res) => {
  try {
    const { fileName, content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await aiService.analyzeArticle(fileName || 'article.docx', content);
    res.json(result);
  } catch (error) {
    handleAIError(error, res);
  }
});

/**
 * POST /api/ai/analyze-batch
 * Batch analysis: multiple articles in one request (20x faster)
 * Body: { articles: [{fileName, content}, ...] }
 */
router.post('/analyze-batch', async (req, res) => {
  try {
    const { articles } = req.body;

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({ error: 'Articles array is required' });
    }

    // Limit batch size on server side
    if (articles.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 articles per batch', maxBatchSize: 5 });
    }

    const results = await aiService.analyzeArticlesBatch(articles);
    res.json({ results, count: results.length });
  } catch (error) {
    handleAIError(error, res);
  }
});

/**
 * POST /api/ai/metadata
 * Extract metadata (title, author) from article content
 */
router.post('/metadata', async (req, res) => {
  try {
    const { fileName, content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await aiService.extractMetadata(fileName || 'article.docx', content);
    res.json(result);
  } catch (error) {
    handleAIError(error, res);
  }
});

/**
 * POST /api/ai/section
 * Detect article section with confidence score
 */
router.post('/section', async (req, res) => {
  try {
    const { content, title } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await aiService.detectSection(content, title || '');
    res.json(result);
  } catch (error) {
    handleAIError(error, res);
  }
});

/**
 * POST /api/ai/spelling
 * Check spelling in content
 */
router.post('/spelling', async (req, res) => {
  try {
    const { content, fileName } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await aiService.checkSpelling(content, fileName || 'article.docx');
    res.json(result);
  } catch (error) {
    handleAIError(error, res);
  }
});

/**
 * POST /api/ai/review
 * Generate article review with scores
 */
router.post('/review', async (req, res) => {
  try {
    const { content, fileName } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await aiService.reviewArticle(content, fileName || 'article.docx');
    res.json(result);
  } catch (error) {
    handleAIError(error, res);
  }
});

/**
 * POST /api/ai/retry-section
 * Retry classification with enhanced prompt
 */
router.post('/retry-section', async (req, res) => {
  try {
    const { content, title, maxRetries } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await aiService.retryClassification(content, title || '', maxRetries || 3);
    res.json(result);
  } catch (error) {
    handleAIError(error, res);
  }
});

/**
 * GET /api/ai/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', (req, res) => {
  const stats = aiService.getCacheStats();
  res.json(stats);
});

/**
 * DELETE /api/ai/cache
 * Clear AI cache
 */
router.delete('/cache', (req, res) => {
  const result = aiService.clearCache();
  res.json(result);
});

/**
 * GET /api/ai/health
 * Health check for monitoring (Kubernetes, Railway, etc.)
 */
router.get('/health', async (req, res) => {
  try {
    const health = await aiService.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : (health.status === 'degraded' ? 200 : 503);
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/ai/metrics
 * Usage metrics for analytics
 */
router.get('/metrics', (req, res) => {
  const metrics = aiService.getMetrics();
  res.json({
    ...metrics,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai/status
 * Check AI service status with provider info
 */
router.get('/status', (req, res) => {
  const status = aiService.getStatus();
  res.json({
    ...status,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai/providers
 * Check if AI providers are exhausted (for user notification)
 * Returns status of each provider and exhaustion message
 */
router.get('/providers', (req, res) => {
  const providersStatus = aiService.getProvidersStatus();
  res.json({
    ...providersStatus,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai/test
 * Test AI connection with a simple request
 */
router.get('/test', async (req, res) => {
  try {
    const result = await aiService.extractMetadata('test.docx', 'Это тестовый текст для проверки AI.');
    const status = aiService.getStatus();

    res.json({
      success: true,
      provider: status.primaryProvider,
      result: result,
      message: `AI service working via ${status.primaryProvider}`
    });
  } catch (error) {
    console.error('AI test error:', error);

    if (error.message === 'API_KEY_MISSING') {
      return res.status(503).json({
        success: false,
        error: 'No API key configured',
        code: 'API_KEY_MISSING',
        suggestion: 'Set GROQ_API_KEY or OPENROUTER_API_KEY'
      });
    }
    if (error.message === 'API_KEY_INVALID') {
      return res.status(401).json({
        success: false,
        error: 'API key is invalid',
        code: 'API_KEY_INVALID',
        suggestion: 'Check your API key'
      });
    }
    if (error.message?.startsWith('RATE_LIMIT')) {
      const [, message, suggestion] = error.message.split('|');
      return res.status(429).json({
        success: false,
        error: message || 'Rate limit exceeded',
        code: 'RATE_LIMIT',
        suggestion: suggestion || 'Wait and try again'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'Check server logs'
    });
  }
});

// ============ ANALYTICS ENDPOINTS ============

/**
 * GET /api/ai/analytics/confidence
 * Confidence score distribution for quality monitoring
 */
router.get('/analytics/confidence', (req, res) => {
  const stats = aiService.getConfidenceStats();
  res.json({
    ...stats,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai/analytics/logs
 * Request logs for debugging (limited)
 */
router.get('/analytics/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const logs = aiService.getRequestLog(limit);
  res.json({
    ...logs,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai/analytics/version
 * Current prompt version for A/B testing
 */
router.get('/analytics/version', (req, res) => {
  const version = aiService.getPromptVersion();
  res.json(version);
});

/**
 * POST /api/ai/analytics/reset
 * Reset analytics counters (for A/B testing)
 */
router.post('/analytics/reset', (req, res) => {
  const result = aiService.resetAnalytics();
  res.json(result);
});

/**
 * GET /api/ai/analytics/summary
 * Combined analytics summary
 */
router.get('/analytics/summary', (req, res) => {
  const confidence = aiService.getConfidenceStats();
  const metrics = aiService.getMetrics();
  const version = aiService.getPromptVersion();
  const cache = aiService.getCacheStats();

  res.json({
    promptVersion: version.version,
    totalClassifications: confidence.totalClassifications,
    avgConfidence: Math.round(confidence.avgConfidence * 100) / 100,
    confidenceDistribution: confidence.distributionPercent,
    bySection: confidence.bySection,
    requests: {
      total: metrics.totalRequests,
      groq: metrics.groqRequests,
      openrouter: metrics.openrouterRequests,
      errors: metrics.errors,
      avgResponseTime: Math.round(metrics.avgResponseTime) + 'ms'
    },
    cache: {
      size: cache.size,
      hitRate: cache.hitRate
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
