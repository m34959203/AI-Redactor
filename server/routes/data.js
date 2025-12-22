/**
 * Data API Routes
 * CRUD operations for articles, sessions, archive, and special pages
 */

import express from 'express';
import multer from 'multer';
import sessionService from '../services/sessionService.js';
import articleService from '../services/articleService.js';
import archiveService from '../services/archiveService.js';
import specialPagesService from '../services/specialPagesService.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ============ SESSION ROUTES ============

/**
 * GET /api/data/session
 * Get or create session
 */
router.get('/session', async (req, res) => {
  try {
    const session = await sessionService.getOrCreateSession(req.sessionId);
    res.json(session);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/data/session/settings
 * Update session settings
 */
router.patch('/session/settings', async (req, res) => {
  try {
    const session = await sessionService.updateSessionSettings(req.sessionId, req.body);
    res.json(session);
  } catch (error) {
    console.error('Error updating session settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/data/session/onboarding-seen
 * Mark onboarding as seen
 */
router.post('/session/onboarding-seen', async (req, res) => {
  try {
    await sessionService.markOnboardingSeen(req.sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking onboarding seen:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ ARTICLE ROUTES ============

/**
 * GET /api/data/articles
 * Get all articles for current session
 */
router.get('/articles', async (req, res) => {
  try {
    const articles = await articleService.getArticles(req.sessionId);
    res.json(articles);
  } catch (error) {
    console.error('Error getting articles:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/data/articles
 * Create multiple articles (file upload)
 */
router.post('/articles', upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Parse metadata if provided
    let metadata = [];
    if (req.body.metadata) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch {
        // Ignore parsing errors
      }
    }

    const articles = req.files.map((file, index) => {
      const meta = metadata[index] || {};
      return {
        filename: file.originalname,
        title: meta.title || file.originalname.replace(/\.[^/.]+$/, ''),
        author: meta.author || '',
        section: meta.section || '',
        content: meta.content || '',
        keywords: meta.keywords || '',
        language: meta.language || 'ru',
        fileData: file.buffer
      };
    });

    const created = await articleService.createArticles(req.sessionId, articles);
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating articles:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data/articles/:id
 * Get single article
 */
router.get('/articles/:id', async (req, res) => {
  try {
    const article = await articleService.getArticle(parseInt(req.params.id), req.sessionId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(article);
  } catch (error) {
    console.error('Error getting article:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data/articles/:id/file
 * Download article file
 */
router.get('/articles/:id/file', async (req, res) => {
  try {
    const file = await articleService.getArticleFile(parseInt(req.params.id), req.sessionId);
    if (!file) {
      return res.status(404).json({ error: 'Article file not found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.data);
  } catch (error) {
    console.error('Error downloading article file:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/data/articles/:id
 * Update article
 */
router.patch('/articles/:id', async (req, res) => {
  try {
    const article = await articleService.updateArticle(
      parseInt(req.params.id),
      req.sessionId,
      req.body
    );
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(article);
  } catch (error) {
    console.error('Error updating article:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/data/articles/:id
 * Delete article
 */
router.delete('/articles/:id', async (req, res) => {
  try {
    const deleted = await articleService.deleteArticle(parseInt(req.params.id), req.sessionId);
    if (!deleted) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting article:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/data/articles
 * Delete all articles for session
 */
router.delete('/articles', async (req, res) => {
  try {
    const count = await articleService.deleteAllArticles(req.sessionId);
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error deleting all articles:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ SPECIAL PAGES ROUTES ============

/**
 * GET /api/data/special-pages
 * Get all special pages for session
 */
router.get('/special-pages', async (req, res) => {
  try {
    const pages = await specialPagesService.getAllSpecialPages(req.sessionId);
    res.json(pages);
  } catch (error) {
    console.error('Error getting special pages:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/data/special-pages/:type
 * Set special page (upload)
 */
router.post('/special-pages/:type', upload.single('file'), async (req, res) => {
  try {
    const { type } = req.params;

    if (!specialPagesService.PAGE_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Invalid page type. Must be one of: ${specialPagesService.PAGE_TYPES.join(', ')}`
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const page = await specialPagesService.setSpecialPage(
      req.sessionId,
      type,
      req.file.originalname,
      req.file.buffer
    );

    res.status(201).json(page);
  } catch (error) {
    console.error('Error setting special page:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data/special-pages/:type/file
 * Download special page file
 */
router.get('/special-pages/:type/file', async (req, res) => {
  try {
    const file = await specialPagesService.getSpecialPageFile(req.sessionId, req.params.type);
    if (!file) {
      return res.status(404).json({ error: 'Special page not found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.data);
  } catch (error) {
    console.error('Error downloading special page:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/data/special-pages/:type
 * Delete special page
 */
router.delete('/special-pages/:type', async (req, res) => {
  try {
    const deleted = await specialPagesService.deleteSpecialPage(req.sessionId, req.params.type);
    if (!deleted) {
      return res.status(404).json({ error: 'Special page not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting special page:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ ARCHIVE ROUTES ============

/**
 * GET /api/data/archive
 * Get all archive issues
 */
router.get('/archive', async (req, res) => {
  try {
    const issues = await archiveService.getAllArchiveIssues();
    res.json(issues);
  } catch (error) {
    console.error('Error getting archive:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data/archive/grouped
 * Get archive grouped by year/month
 */
router.get('/archive/grouped', async (req, res) => {
  try {
    const grouped = await archiveService.getArchiveByYearMonth();
    res.json(grouped);
  } catch (error) {
    console.error('Error getting grouped archive:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data/archive/stats
 * Get archive statistics
 */
router.get('/archive/stats', async (req, res) => {
  try {
    const stats = await archiveService.getArchiveStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting archive stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/data/archive
 * Create archive issue
 */
router.post('/archive', upload.single('pdf'), async (req, res) => {
  try {
    const { issueNumber, year, month, title, articleCount, metadata } = req.body;

    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    const issue = await archiveService.createArchiveIssue({
      issueNumber,
      year: parseInt(year),
      month: parseInt(month),
      title,
      articleCount: parseInt(articleCount) || 0,
      pdfFilename: req.file?.originalname,
      pdfData: req.file?.buffer,
      metadata: metadata ? JSON.parse(metadata) : {}
    });

    res.status(201).json(issue);
  } catch (error) {
    console.error('Error creating archive issue:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data/archive/:id
 * Get archive issue
 */
router.get('/archive/:id', async (req, res) => {
  try {
    const issue = await archiveService.getArchiveIssue(parseInt(req.params.id));
    if (!issue) {
      return res.status(404).json({ error: 'Archive issue not found' });
    }
    res.json(issue);
  } catch (error) {
    console.error('Error getting archive issue:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data/archive/:id/pdf
 * Download archive issue PDF
 */
router.get('/archive/:id/pdf', async (req, res) => {
  try {
    const pdf = await archiveService.getArchiveIssuePdf(parseInt(req.params.id));
    if (!pdf) {
      return res.status(404).json({ error: 'Archive PDF not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.send(pdf.data);
  } catch (error) {
    console.error('Error downloading archive PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/data/archive/:id
 * Update archive issue
 */
router.patch('/archive/:id', async (req, res) => {
  try {
    const issue = await archiveService.updateArchiveIssue(parseInt(req.params.id), req.body);
    if (!issue) {
      return res.status(404).json({ error: 'Archive issue not found' });
    }
    res.json(issue);
  } catch (error) {
    console.error('Error updating archive issue:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/data/archive/:id
 * Delete archive issue
 */
router.delete('/archive/:id', async (req, res) => {
  try {
    const deleted = await archiveService.deleteArchiveIssue(parseInt(req.params.id));
    if (!deleted) {
      return res.status(404).json({ error: 'Archive issue not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting archive issue:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
