/**
 * Session Service
 * Manages user work sessions in database
 */

import { query } from '../db/config.js';

/**
 * Create or get existing session
 * @param {string} sessionId - Session ID (UUID)
 * @returns {Promise<Object>} Session data
 */
export async function getOrCreateSession(sessionId) {
  // Try to get existing session
  const existing = await query(
    'SELECT * FROM sessions WHERE id = $1',
    [sessionId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Create new session
  const result = await query(
    `INSERT INTO sessions (id) VALUES ($1) RETURNING *`,
    [sessionId]
  );

  return result.rows[0];
}

/**
 * Get session by ID
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
export async function getSession(sessionId) {
  const result = await query(
    'SELECT * FROM sessions WHERE id = $1',
    [sessionId]
  );
  return result.rows[0] || null;
}

/**
 * Update session settings
 * @param {string} sessionId
 * @param {Object} settings
 * @returns {Promise<Object>}
 */
export async function updateSessionSettings(sessionId, settings) {
  const result = await query(
    `UPDATE sessions SET settings = settings || $2::jsonb WHERE id = $1 RETURNING *`,
    [sessionId, JSON.stringify(settings)]
  );
  return result.rows[0];
}

/**
 * Mark onboarding as seen
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function markOnboardingSeen(sessionId) {
  await query(
    'UPDATE sessions SET onboarding_seen = TRUE WHERE id = $1',
    [sessionId]
  );
}

/**
 * Delete session and all related data
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionId) {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

/**
 * Clean up old sessions (older than specified days)
 * @param {number} daysOld - Delete sessions older than this many days
 * @returns {Promise<number>} Number of sessions deleted
 */
export async function cleanupOldSessions(daysOld = 7) {
  const result = await query(
    `DELETE FROM sessions WHERE updated_at < NOW() - INTERVAL '${daysOld} days' RETURNING id`
  );
  return result.rowCount;
}

export default {
  getOrCreateSession,
  getSession,
  updateSessionSettings,
  markOnboardingSeen,
  deleteSession,
  cleanupOldSessions
};
