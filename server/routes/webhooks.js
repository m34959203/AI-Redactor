/**
 * Webhook Routes
 * Handles incoming webhooks from social media platforms (Instagram, Facebook, etc.)
 *
 * Instagram Webhook Documentation:
 * https://developers.facebook.com/docs/instagram-platform/webhooks
 */

import express from 'express';
import instagramService from '../services/instagramService.js';

const router = express.Router();

// Get app secret from environment
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const INSTAGRAM_WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

/**
 * GET /api/webhooks/instagram
 * Webhook verification endpoint (called by Meta during webhook setup)
 *
 * Meta sends: hub.mode, hub.verify_token, hub.challenge
 * We must respond with hub.challenge if verification succeeds
 */
router.get('/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Instagram webhook verification request:', { mode, token: token?.substring(0, 10) + '...' });

  const verifyToken = INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('INSTAGRAM_WEBHOOK_VERIFY_TOKEN not configured');
    return res.status(500).send('Webhook not configured');
  }

  const result = instagramService.verifyWebhookChallenge(mode, token, challenge, verifyToken);

  if (result) {
    // Must return challenge as plain text, not JSON
    return res.status(200).send(result);
  }

  return res.status(403).send('Verification failed');
});

/**
 * POST /api/webhooks/instagram
 * Webhook event handler (receives notifications from Instagram)
 *
 * Events include:
 * - comments: New comments on posts
 * - mentions: When account is mentioned
 * - story_insights: Story view statistics
 * - messaging: Direct messages (if enabled)
 */
router.post('/instagram', express.raw({ type: 'application/json' }), async (req, res) => {
  // Get raw body for signature verification
  const rawBody = req.body.toString('utf8');
  const signature = req.headers['x-hub-signature-256'];

  console.log('Instagram webhook event received');

  // Verify signature if app secret is configured
  if (FACEBOOK_APP_SECRET) {
    const isValid = instagramService.verifyWebhookSignature(signature, rawBody, FACEBOOK_APP_SECRET);
    if (!isValid) {
      console.warn('Instagram webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    console.warn('FACEBOOK_APP_SECRET not configured - skipping signature verification');
  }

  try {
    const payload = JSON.parse(rawBody);

    console.log('Instagram webhook payload:', JSON.stringify(payload).substring(0, 500));

    // Process the webhook event asynchronously
    // Respond immediately to Meta (they require 200 within 20 seconds)
    res.status(200).send('EVENT_RECEIVED');

    // Process event in background
    await instagramService.processWebhookEvent(payload);
  } catch (error) {
    console.error('Error processing Instagram webhook:', error);
    // Still return 200 to prevent Meta from retrying
    res.status(200).send('EVENT_RECEIVED');
  }
});

/**
 * GET /api/webhooks/instagram/events
 * Debug endpoint to view recent webhook events
 */
router.get('/instagram/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = await instagramService.getWebhookEvents(limit);
    res.json(events);
  } catch (error) {
    console.error('Error getting webhook events:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
