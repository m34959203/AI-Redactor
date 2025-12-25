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

export default router;
