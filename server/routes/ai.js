/**
 * AI API Routes - Proxy for OpenRouter API
 * Keeps API key secure on the backend
 */

import express from 'express';
import aiService from '../services/aiService.js';

const router = express.Router();

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
    console.error('Metadata extraction error:', error);

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
    console.error('Section detection error:', error);

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
    console.error('Spelling check error:', error);

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
    console.error('Review error:', error);

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
    console.error('Retry classification error:', error);

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
 * GET /api/ai/status
 * Check AI service status
 */
router.get('/status', (req, res) => {
  const hasApiKey = !!process.env.OPENROUTER_API_KEY;
  res.json({
    available: hasApiKey,
    cacheEnabled: true,
    multiModelEnabled: true
  });
});

export default router;
