/**
 * Instagram Service
 * Handles Instagram Graph API integration and webhook processing
 * Documentation: https://developers.facebook.com/docs/instagram-platform/webhooks
 */

import crypto from 'crypto';
import { query } from '../db/config.js';

// Instagram Graph API base URL
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Verify webhook signature from Meta
 * @param {string} signature - X-Hub-Signature-256 header value
 * @param {string} body - Raw request body
 * @param {string} appSecret - Facebook App Secret
 * @returns {boolean}
 */
export function verifyWebhookSignature(signature, body, appSecret) {
  if (!signature || !appSecret) {
    return false;
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(body, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Verify webhook challenge (for initial webhook setup)
 * @param {string} mode - hub.mode parameter
 * @param {string} token - hub.verify_token parameter
 * @param {string} challenge - hub.challenge parameter
 * @param {string} expectedToken - Our verify token from env
 * @returns {string|null} Challenge value if verified, null otherwise
 */
export function verifyWebhookChallenge(mode, token, challenge, expectedToken) {
  if (mode === 'subscribe' && token === expectedToken) {
    console.log('Instagram webhook verified successfully');
    return challenge;
  }
  console.warn('Instagram webhook verification failed', { mode, token });
  return null;
}

/**
 * Process incoming webhook event
 * @param {Object} payload - Webhook payload from Instagram
 * @returns {Promise<void>}
 */
export async function processWebhookEvent(payload) {
  const { object, entry } = payload;

  if (object !== 'instagram' && object !== 'page') {
    console.log(`Ignoring webhook for object type: ${object}`);
    return;
  }

  for (const event of entry || []) {
    const { id: accountId, time, messaging, changes } = event;

    // Process messaging events (Direct Messages)
    if (messaging) {
      for (const message of messaging) {
        await handleMessagingEvent(accountId, message);
      }
    }

    // Process field changes (comments, mentions, story_insights, etc.)
    if (changes) {
      for (const change of changes) {
        await handleFieldChange(accountId, change);
      }
    }
  }
}

/**
 * Handle Instagram Direct Message event
 * @param {string} accountId - Instagram account ID
 * @param {Object} event - Messaging event data
 */
async function handleMessagingEvent(accountId, event) {
  const { sender, recipient, timestamp, message } = event;

  console.log('Instagram DM received:', {
    from: sender?.id,
    to: recipient?.id,
    text: message?.text?.substring(0, 50)
  });

  // Log event to database
  await logWebhookEvent('messaging', 'instagram', {
    sender_id: sender?.id,
    recipient_id: recipient?.id,
    payload: event
  });

  // Here you can implement auto-replies or forward to admin
}

/**
 * Handle Instagram field change event (comments, mentions, etc.)
 * @param {string} accountId - Instagram account ID
 * @param {Object} change - Change event data
 */
async function handleFieldChange(accountId, change) {
  const { field, value } = change;

  console.log(`Instagram ${field} event:`, value);

  // Log event to database
  await logWebhookEvent(field, 'instagram', {
    sender_id: value?.from?.id,
    recipient_id: accountId,
    payload: change
  });

  switch (field) {
    case 'comments':
      await handleCommentEvent(accountId, value);
      break;
    case 'mentions':
      await handleMentionEvent(accountId, value);
      break;
    case 'story_insights':
      await handleStoryInsightsEvent(accountId, value);
      break;
    default:
      console.log(`Unhandled Instagram field: ${field}`);
  }
}

/**
 * Handle new comment on Instagram post
 * @param {string} accountId
 * @param {Object} data
 */
async function handleCommentEvent(accountId, data) {
  console.log('New Instagram comment:', {
    mediaId: data.media_id,
    commentId: data.id,
    text: data.text?.substring(0, 100)
  });
  // Implement comment handling logic (e.g., auto-reply, moderation)
}

/**
 * Handle Instagram mention
 * @param {string} accountId
 * @param {Object} data
 */
async function handleMentionEvent(accountId, data) {
  console.log('Instagram mention:', {
    mediaId: data.media_id,
    commentId: data.comment_id
  });
  // Implement mention handling logic
}

/**
 * Handle story insights event
 * @param {string} accountId
 * @param {Object} data
 */
async function handleStoryInsightsEvent(accountId, data) {
  console.log('Story insights:', data);
  // Implement story insights handling
}

/**
 * Log webhook event to database for audit/debugging
 * @param {string} eventType
 * @param {string} objectType
 * @param {Object} data
 */
async function logWebhookEvent(eventType, objectType, data) {
  try {
    await query(
      `INSERT INTO instagram_webhook_events
       (event_type, object_type, sender_id, recipient_id, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventType, objectType, data.sender_id, data.recipient_id, JSON.stringify(data.payload)]
    );
  } catch (error) {
    console.error('Failed to log webhook event:', error.message);
  }
}

/**
 * Get Instagram integration settings for a session
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
export async function getIntegration(sessionId) {
  const result = await query(
    `SELECT * FROM social_media_integrations
     WHERE session_id = $1 AND platform = 'instagram'`,
    [sessionId]
  );
  return result.rows[0] || null;
}

/**
 * Create or update Instagram integration settings
 * @param {string} sessionId
 * @param {Object} settings
 * @returns {Promise<Object>}
 */
export async function saveIntegration(sessionId, settings) {
  const {
    enabled = false,
    accessToken,
    accountId,
    defaultLanguage = 'ru',
    webhookVerifyToken
  } = settings;

  const result = await query(
    `INSERT INTO social_media_integrations
     (session_id, platform, enabled, access_token, account_id, default_language, webhook_verify_token, settings)
     VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7)
     ON CONFLICT (session_id, platform) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       access_token = COALESCE(EXCLUDED.access_token, social_media_integrations.access_token),
       account_id = COALESCE(EXCLUDED.account_id, social_media_integrations.account_id),
       default_language = EXCLUDED.default_language,
       webhook_verify_token = COALESCE(EXCLUDED.webhook_verify_token, social_media_integrations.webhook_verify_token),
       settings = social_media_integrations.settings || EXCLUDED.settings,
       updated_at = NOW()
     RETURNING *`,
    [
      sessionId,
      enabled,
      accessToken || null,
      accountId || null,
      defaultLanguage,
      webhookVerifyToken || null,
      JSON.stringify(settings.extra || {})
    ]
  );

  return result.rows[0];
}

/**
 * Delete Instagram integration
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function deleteIntegration(sessionId) {
  const result = await query(
    `DELETE FROM social_media_integrations
     WHERE session_id = $1 AND platform = 'instagram'
     RETURNING id`,
    [sessionId]
  );
  return result.rowCount > 0;
}

/**
 * Get long-lived access token from short-lived token
 * @param {string} shortLivedToken
 * @param {string} appId
 * @param {string} appSecret
 * @returns {Promise<Object>}
 */
export async function exchangeForLongLivedToken(shortLivedToken, appId, appSecret) {
  const url = `${GRAPH_API_BASE}/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${appId}&` +
    `client_secret=${appSecret}&` +
    `fb_exchange_token=${shortLivedToken}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in // Usually ~60 days for long-lived tokens
  };
}

/**
 * Get Instagram Business Account info
 * @param {string} accessToken
 * @param {string} accountId - Instagram Business Account ID
 * @returns {Promise<Object>}
 */
export async function getAccountInfo(accessToken, accountId) {
  const url = `${GRAPH_API_BASE}/${accountId}?` +
    `fields=id,username,name,profile_picture_url,followers_count,media_count&` +
    `access_token=${accessToken}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data;
}

/**
 * Publish a photo post to Instagram
 * @param {string} accessToken
 * @param {string} accountId
 * @param {string} imageUrl - Public URL of the image
 * @param {string} caption
 * @returns {Promise<Object>}
 */
export async function publishPhoto(accessToken, accountId, imageUrl, caption) {
  // Step 1: Create media container
  const containerUrl = `${GRAPH_API_BASE}/${accountId}/media`;
  const containerResponse = await fetch(containerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption: caption,
      access_token: accessToken
    })
  });

  const containerData = await containerResponse.json();
  if (containerData.error) {
    throw new Error(containerData.error.message);
  }

  const creationId = containerData.id;

  // Step 2: Publish the container
  const publishUrl = `${GRAPH_API_BASE}/${accountId}/media_publish`;
  const publishResponse = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: accessToken
    })
  });

  const publishData = await publishResponse.json();
  if (publishData.error) {
    throw new Error(publishData.error.message);
  }

  return {
    mediaId: publishData.id,
    containerId: creationId
  };
}

/**
 * Publish a carousel post to Instagram
 * @param {string} accessToken
 * @param {string} accountId
 * @param {Array<string>} imageUrls - Array of public image URLs (2-10 images)
 * @param {string} caption
 * @returns {Promise<Object>}
 */
export async function publishCarousel(accessToken, accountId, imageUrls, caption) {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error('Carousel requires 2-10 images');
  }

  // Step 1: Create container for each image
  const childContainers = [];
  for (const imageUrl of imageUrls) {
    const response = await fetch(`${GRAPH_API_BASE}/${accountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        is_carousel_item: true,
        access_token: accessToken
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    childContainers.push(data.id);
  }

  // Step 2: Create carousel container
  const carouselResponse = await fetch(`${GRAPH_API_BASE}/${accountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      caption: caption,
      children: childContainers.join(','),
      access_token: accessToken
    })
  });

  const carouselData = await carouselResponse.json();
  if (carouselData.error) {
    throw new Error(carouselData.error.message);
  }

  // Step 3: Publish carousel
  const publishResponse = await fetch(`${GRAPH_API_BASE}/${accountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: carouselData.id,
      access_token: accessToken
    })
  });

  const publishData = await publishResponse.json();
  if (publishData.error) {
    throw new Error(publishData.error.message);
  }

  return {
    mediaId: publishData.id,
    containerId: carouselData.id
  };
}

/**
 * Log a published post to database
 * @param {number} integrationId
 * @param {Object} postData
 * @returns {Promise<Object>}
 */
export async function logPublishedPost(integrationId, postData) {
  const {
    archiveIssueId,
    externalPostId,
    postType = 'article',
    content,
    mediaUrl,
    status = 'published'
  } = postData;

  const result = await query(
    `INSERT INTO social_media_posts
     (integration_id, archive_issue_id, platform, external_post_id, post_type, content, media_url, status, published_at)
     VALUES ($1, $2, 'instagram', $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [integrationId, archiveIssueId, externalPostId, postType, content, mediaUrl, status]
  );

  return result.rows[0];
}

/**
 * Get published posts for an integration
 * @param {number} integrationId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getPublishedPosts(integrationId, limit = 50) {
  const result = await query(
    `SELECT * FROM social_media_posts
     WHERE integration_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [integrationId, limit]
  );
  return result.rows;
}

/**
 * Get webhook events for debugging
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getWebhookEvents(limit = 100) {
  const result = await query(
    `SELECT * FROM instagram_webhook_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export default {
  verifyWebhookSignature,
  verifyWebhookChallenge,
  processWebhookEvent,
  getIntegration,
  saveIntegration,
  deleteIntegration,
  exchangeForLongLivedToken,
  getAccountInfo,
  publishPhoto,
  publishCarousel,
  logPublishedPost,
  getPublishedPosts,
  getWebhookEvents
};
