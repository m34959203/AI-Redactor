/**
 * Social Media Routes
 * CRUD operations for social media integrations settings
 * Used by the admin panel to configure Instagram, Telegram, etc.
 */

import express from 'express';
import instagramService from '../services/instagramService.js';
import { query } from '../db/config.js';

const router = express.Router();

// ============ INSTAGRAM ROUTES ============

/**
 * GET /api/social-media/instagram
 * Get Instagram integration settings for current session
 */
router.get('/instagram', async (req, res) => {
  try {
    const integration = await instagramService.getIntegration(req.sessionId);

    if (!integration) {
      return res.json({
        enabled: false,
        accountId: null,
        defaultLanguage: 'ru',
        connected: false
      });
    }

    // Don't expose full access token to client
    res.json({
      id: integration.id,
      enabled: integration.enabled,
      accountId: integration.account_id,
      defaultLanguage: integration.default_language,
      connected: !!integration.access_token,
      hasAccessToken: !!integration.access_token,
      settings: integration.settings,
      createdAt: integration.created_at,
      updatedAt: integration.updated_at
    });
  } catch (error) {
    console.error('Error getting Instagram integration:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/social-media/instagram
 * Create or update Instagram integration settings
 *
 * Body: {
 *   enabled: boolean,
 *   accessToken: string (optional),
 *   accountId: string,
 *   defaultLanguage: string
 * }
 */
router.post('/instagram', async (req, res) => {
  try {
    const { enabled, accessToken, accountId, defaultLanguage, webhookVerifyToken } = req.body;

    const integration = await instagramService.saveIntegration(req.sessionId, {
      enabled,
      accessToken,
      accountId,
      defaultLanguage,
      webhookVerifyToken
    });

    res.json({
      id: integration.id,
      enabled: integration.enabled,
      accountId: integration.account_id,
      defaultLanguage: integration.default_language,
      connected: !!integration.access_token,
      updatedAt: integration.updated_at
    });
  } catch (error) {
    console.error('Error saving Instagram integration:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/social-media/instagram
 * Update specific Instagram settings
 */
router.patch('/instagram', async (req, res) => {
  try {
    const existing = await instagramService.getIntegration(req.sessionId);

    if (!existing) {
      return res.status(404).json({ error: 'Instagram integration not found' });
    }

    const updates = {
      enabled: req.body.enabled !== undefined ? req.body.enabled : existing.enabled,
      accessToken: req.body.accessToken || undefined,
      accountId: req.body.accountId || existing.account_id,
      defaultLanguage: req.body.defaultLanguage || existing.default_language,
      webhookVerifyToken: req.body.webhookVerifyToken || undefined
    };

    const integration = await instagramService.saveIntegration(req.sessionId, updates);

    res.json({
      id: integration.id,
      enabled: integration.enabled,
      accountId: integration.account_id,
      defaultLanguage: integration.default_language,
      connected: !!integration.access_token,
      updatedAt: integration.updated_at
    });
  } catch (error) {
    console.error('Error updating Instagram integration:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/social-media/instagram
 * Delete Instagram integration
 */
router.delete('/instagram', async (req, res) => {
  try {
    const deleted = await instagramService.deleteIntegration(req.sessionId);

    if (!deleted) {
      return res.status(404).json({ error: 'Instagram integration not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting Instagram integration:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/social-media/instagram/verify-account
 * Verify Instagram account credentials and get account info
 *
 * Body: { accessToken, accountId }
 */
router.post('/instagram/verify-account', async (req, res) => {
  try {
    const { accessToken, accountId } = req.body;

    if (!accessToken || !accountId) {
      return res.status(400).json({ error: 'accessToken and accountId are required' });
    }

    const accountInfo = await instagramService.getAccountInfo(accessToken, accountId);

    res.json({
      valid: true,
      account: {
        id: accountInfo.id,
        username: accountInfo.username,
        name: accountInfo.name,
        profilePictureUrl: accountInfo.profile_picture_url,
        followersCount: accountInfo.followers_count,
        mediaCount: accountInfo.media_count
      }
    });
  } catch (error) {
    console.error('Error verifying Instagram account:', error);
    res.status(400).json({
      valid: false,
      error: error.message
    });
  }
});

/**
 * POST /api/social-media/instagram/exchange-token
 * Exchange short-lived token for long-lived token
 *
 * Body: { shortLivedToken }
 */
router.post('/instagram/exchange-token', async (req, res) => {
  try {
    const { shortLivedToken } = req.body;
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      return res.status(500).json({ error: 'Facebook App credentials not configured on server' });
    }

    if (!shortLivedToken) {
      return res.status(400).json({ error: 'shortLivedToken is required' });
    }

    const result = await instagramService.exchangeForLongLivedToken(shortLivedToken, appId, appSecret);

    res.json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn
    });
  } catch (error) {
    console.error('Error exchanging token:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/social-media/instagram/publish
 * Publish a post to Instagram
 *
 * Body: {
 *   imageUrl: string (public URL),
 *   caption: string,
 *   archiveIssueId?: number
 * }
 */
router.post('/instagram/publish', async (req, res) => {
  try {
    const { imageUrl, caption, archiveIssueId } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    const integration = await instagramService.getIntegration(req.sessionId);

    if (!integration || !integration.access_token || !integration.account_id) {
      return res.status(400).json({ error: 'Instagram not configured. Please set up access token and account ID.' });
    }

    if (!integration.enabled) {
      return res.status(400).json({ error: 'Instagram publishing is disabled' });
    }

    const result = await instagramService.publishPhoto(
      integration.access_token,
      integration.account_id,
      imageUrl,
      caption || ''
    );

    // Log the published post
    await instagramService.logPublishedPost(integration.id, {
      archiveIssueId,
      externalPostId: result.mediaId,
      postType: 'article',
      content: caption,
      mediaUrl: imageUrl,
      status: 'published'
    });

    res.json({
      success: true,
      mediaId: result.mediaId
    });
  } catch (error) {
    console.error('Error publishing to Instagram:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/social-media/instagram/posts
 * Get published posts history
 */
router.get('/instagram/posts', async (req, res) => {
  try {
    const integration = await instagramService.getIntegration(req.sessionId);

    if (!integration) {
      return res.json([]);
    }

    const limit = parseInt(req.query.limit) || 50;
    const posts = await instagramService.getPublishedPosts(integration.id, limit);

    res.json(posts);
  } catch (error) {
    console.error('Error getting Instagram posts:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ GENERIC SOCIAL MEDIA ROUTES ============

/**
 * GET /api/social-media/all
 * Get all social media integrations for current session
 */
router.get('/all', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, platform, enabled, account_id, default_language,
              (access_token IS NOT NULL) as connected,
              settings, created_at, updated_at
       FROM social_media_integrations
       WHERE session_id = $1`,
      [req.sessionId]
    );

    const integrations = {};
    for (const row of result.rows) {
      integrations[row.platform] = {
        id: row.id,
        enabled: row.enabled,
        accountId: row.account_id,
        defaultLanguage: row.default_language,
        connected: row.connected,
        settings: row.settings,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    }

    res.json(integrations);
  } catch (error) {
    console.error('Error getting all integrations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/social-media/status
 * Get status of all social media integrations
 */
router.get('/status', async (req, res) => {
  try {
    const result = await query(
      `SELECT platform, enabled, (access_token IS NOT NULL) as connected
       FROM social_media_integrations
       WHERE session_id = $1`,
      [req.sessionId]
    );

    const status = {
      instagram: { enabled: false, connected: false },
      telegram: { enabled: false, connected: false },
      facebook: { enabled: false, connected: false },
      tiktok: { enabled: false, connected: false }
    };

    for (const row of result.rows) {
      if (status[row.platform]) {
        status[row.platform] = {
          enabled: row.enabled,
          connected: row.connected
        };
      }
    }

    res.json(status);
  } catch (error) {
    console.error('Error getting social media status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
