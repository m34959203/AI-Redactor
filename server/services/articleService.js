/**
 * Article Service
 * Manages articles in database
 */

import { query, getClient } from '../db/config.js';

/**
 * Create a new article
 * @param {string} sessionId - Session ID
 * @param {Object} articleData - Article data
 * @returns {Promise<Object>} Created article
 */
export async function createArticle(sessionId, articleData) {
  const { filename, title, author, section, content, keywords, language, fileData } = articleData;

  const result = await query(
    `INSERT INTO articles (session_id, filename, title, author, section, content, keywords, language, file_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, session_id, filename, title, author, section, content, keywords, language, created_at, updated_at`,
    [sessionId, filename, title, author, section, content, keywords, language || 'ru', fileData]
  );

  return result.rows[0];
}

/**
 * Create multiple articles in a batch
 * @param {string} sessionId - Session ID
 * @param {Array<Object>} articles - Array of article data
 * @returns {Promise<Array<Object>>} Created articles
 */
export async function createArticles(sessionId, articles) {
  const client = await getClient();
  const createdArticles = [];

  try {
    await client.query('BEGIN');

    for (const articleData of articles) {
      const { filename, title, author, section, content, keywords, language, fileData } = articleData;

      const result = await client.query(
        `INSERT INTO articles (session_id, filename, title, author, section, content, keywords, language, file_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, session_id, filename, title, author, section, content, keywords, language, created_at, updated_at`,
        [sessionId, filename, title, author, section, content, keywords, language || 'ru', fileData]
      );

      createdArticles.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return createdArticles;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all articles for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array<Object>>} Articles
 */
export async function getArticles(sessionId) {
  const result = await query(
    `SELECT id, session_id, filename, title, author, section, content, keywords, language, created_at, updated_at
     FROM articles
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  return result.rows;
}

/**
 * Get a single article by ID
 * @param {number} articleId - Article ID
 * @param {string} sessionId - Session ID (for security)
 * @returns {Promise<Object|null>}
 */
export async function getArticle(articleId, sessionId) {
  const result = await query(
    `SELECT * FROM articles WHERE id = $1 AND session_id = $2`,
    [articleId, sessionId]
  );

  return result.rows[0] || null;
}

/**
 * Get article file data (for download)
 * @param {number} articleId - Article ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<{filename: string, data: Buffer}|null>}
 */
export async function getArticleFile(articleId, sessionId) {
  const result = await query(
    'SELECT filename, file_data FROM articles WHERE id = $1 AND session_id = $2',
    [articleId, sessionId]
  );

  if (result.rows.length === 0) return null;

  return {
    filename: result.rows[0].filename,
    data: result.rows[0].file_data
  };
}

/**
 * Update article
 * @param {number} articleId - Article ID
 * @param {string} sessionId - Session ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated article
 */
export async function updateArticle(articleId, sessionId, updates) {
  const allowedFields = ['title', 'author', 'section', 'content', 'keywords', 'language'];
  const setClauses = [];
  const values = [articleId, sessionId];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  const result = await query(
    `UPDATE articles
     SET ${setClauses.join(', ')}
     WHERE id = $1 AND session_id = $2
     RETURNING id, session_id, filename, title, author, section, content, keywords, language, created_at, updated_at`,
    values
  );

  return result.rows[0];
}

/**
 * Delete article
 * @param {number} articleId - Article ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteArticle(articleId, sessionId) {
  const result = await query(
    'DELETE FROM articles WHERE id = $1 AND session_id = $2',
    [articleId, sessionId]
  );

  return result.rowCount > 0;
}

/**
 * Delete all articles for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<number>} Number of articles deleted
 */
export async function deleteAllArticles(sessionId) {
  const result = await query(
    'DELETE FROM articles WHERE session_id = $1',
    [sessionId]
  );

  return result.rowCount;
}

/**
 * Get article count for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<number>}
 */
export async function getArticleCount(sessionId) {
  const result = await query(
    'SELECT COUNT(*) as count FROM articles WHERE session_id = $1',
    [sessionId]
  );

  return parseInt(result.rows[0].count, 10);
}

export default {
  createArticle,
  createArticles,
  getArticles,
  getArticle,
  getArticleFile,
  updateArticle,
  deleteArticle,
  deleteAllArticles,
  getArticleCount
};
