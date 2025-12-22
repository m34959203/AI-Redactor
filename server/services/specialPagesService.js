/**
 * Special Pages Service
 * Manages cover, description, and final pages in database
 */

import { query } from '../db/config.js';

const PAGE_TYPES = ['cover', 'description', 'final'];

/**
 * Set special page
 * @param {string} sessionId - Session ID
 * @param {string} pageType - 'cover', 'description', or 'final'
 * @param {string} filename - File name
 * @param {Buffer} fileData - File data
 * @returns {Promise<Object>} Created/updated page
 */
export async function setSpecialPage(sessionId, pageType, filename, fileData) {
  if (!PAGE_TYPES.includes(pageType)) {
    throw new Error(`Invalid page type: ${pageType}. Must be one of: ${PAGE_TYPES.join(', ')}`);
  }

  const result = await query(
    `INSERT INTO special_pages (session_id, page_type, filename, file_data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, page_type)
     DO UPDATE SET filename = $3, file_data = $4, created_at = NOW()
     RETURNING id, session_id, page_type, filename, created_at`,
    [sessionId, pageType, filename, fileData]
  );

  return result.rows[0];
}

/**
 * Get special page
 * @param {string} sessionId - Session ID
 * @param {string} pageType - Page type
 * @returns {Promise<Object|null>}
 */
export async function getSpecialPage(sessionId, pageType) {
  const result = await query(
    `SELECT id, session_id, page_type, filename, created_at
     FROM special_pages
     WHERE session_id = $1 AND page_type = $2`,
    [sessionId, pageType]
  );

  return result.rows[0] || null;
}

/**
 * Get special page file data
 * @param {string} sessionId - Session ID
 * @param {string} pageType - Page type
 * @returns {Promise<{filename: string, data: Buffer}|null>}
 */
export async function getSpecialPageFile(sessionId, pageType) {
  const result = await query(
    'SELECT filename, file_data FROM special_pages WHERE session_id = $1 AND page_type = $2',
    [sessionId, pageType]
  );

  if (result.rows.length === 0 || !result.rows[0].file_data) {
    return null;
  }

  return {
    filename: result.rows[0].filename,
    data: result.rows[0].file_data
  };
}

/**
 * Get all special pages for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} { cover: {...}, description: {...}, final: {...} }
 */
export async function getAllSpecialPages(sessionId) {
  const result = await query(
    `SELECT id, session_id, page_type, filename, created_at
     FROM special_pages
     WHERE session_id = $1`,
    [sessionId]
  );

  const pages = { cover: null, description: null, final: null };

  for (const row of result.rows) {
    pages[row.page_type] = row;
  }

  return pages;
}

/**
 * Delete special page
 * @param {string} sessionId - Session ID
 * @param {string} pageType - Page type
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteSpecialPage(sessionId, pageType) {
  const result = await query(
    'DELETE FROM special_pages WHERE session_id = $1 AND page_type = $2',
    [sessionId, pageType]
  );

  return result.rowCount > 0;
}

/**
 * Delete all special pages for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<number>} Number of pages deleted
 */
export async function deleteAllSpecialPages(sessionId) {
  const result = await query(
    'DELETE FROM special_pages WHERE session_id = $1',
    [sessionId]
  );

  return result.rowCount;
}

export default {
  setSpecialPage,
  getSpecialPage,
  getSpecialPageFile,
  getAllSpecialPages,
  deleteSpecialPage,
  deleteAllSpecialPages,
  PAGE_TYPES
};
