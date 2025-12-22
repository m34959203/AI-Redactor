/**
 * Archive Service
 * Manages archived journal issues in database
 */

import { query } from '../db/config.js';

/**
 * Create a new archive issue
 * @param {Object} issueData - Issue data
 * @returns {Promise<Object>} Created issue
 */
export async function createArchiveIssue(issueData) {
  const { issueNumber, year, month, title, articleCount, pdfFilename, pdfData, metadata } = issueData;

  const result = await query(
    `INSERT INTO archive_issues (issue_number, year, month, title, article_count, pdf_filename, pdf_data, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, issue_number, year, month, title, article_count, pdf_filename, metadata, created_at`,
    [issueNumber, year, month, title, articleCount, pdfFilename, pdfData, JSON.stringify(metadata || {})]
  );

  return result.rows[0];
}

/**
 * Get all archive issues (metadata only, no PDF data)
 * @returns {Promise<Array<Object>>}
 */
export async function getAllArchiveIssues() {
  const result = await query(
    `SELECT id, issue_number, year, month, title, article_count, pdf_filename, metadata, created_at
     FROM archive_issues
     ORDER BY year DESC, month DESC, created_at DESC`
  );

  return result.rows;
}

/**
 * Get archive issues grouped by year and month
 * @returns {Promise<Object>} { year: { month: [issues] } }
 */
export async function getArchiveByYearMonth() {
  const issues = await getAllArchiveIssues();
  const grouped = {};

  for (const issue of issues) {
    const year = issue.year;
    const month = issue.month;

    if (!grouped[year]) {
      grouped[year] = {};
    }
    if (!grouped[year][month]) {
      grouped[year][month] = [];
    }
    grouped[year][month].push(issue);
  }

  return grouped;
}

/**
 * Get archive issue by ID
 * @param {number} issueId - Issue ID
 * @returns {Promise<Object|null>}
 */
export async function getArchiveIssue(issueId) {
  const result = await query(
    `SELECT id, issue_number, year, month, title, article_count, pdf_filename, metadata, created_at
     FROM archive_issues
     WHERE id = $1`,
    [issueId]
  );

  return result.rows[0] || null;
}

/**
 * Get archive issue PDF data
 * @param {number} issueId - Issue ID
 * @returns {Promise<{filename: string, data: Buffer}|null>}
 */
export async function getArchiveIssuePdf(issueId) {
  const result = await query(
    'SELECT pdf_filename, pdf_data FROM archive_issues WHERE id = $1',
    [issueId]
  );

  if (result.rows.length === 0 || !result.rows[0].pdf_data) {
    return null;
  }

  return {
    filename: result.rows[0].pdf_filename,
    data: result.rows[0].pdf_data
  };
}

/**
 * Delete archive issue
 * @param {number} issueId - Issue ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteArchiveIssue(issueId) {
  const result = await query(
    'DELETE FROM archive_issues WHERE id = $1',
    [issueId]
  );

  return result.rowCount > 0;
}

/**
 * Update archive issue metadata
 * @param {number} issueId - Issue ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated issue
 */
export async function updateArchiveIssue(issueId, updates) {
  const allowedFields = ['issue_number', 'title', 'metadata'];
  const setClauses = [];
  const values = [issueId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key === 'issueNumber' ? 'issue_number' : key;
    if (allowedFields.includes(dbKey)) {
      setClauses.push(`${dbKey} = $${paramIndex}`);
      values.push(dbKey === 'metadata' ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  const result = await query(
    `UPDATE archive_issues
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING id, issue_number, year, month, title, article_count, pdf_filename, metadata, created_at`,
    values
  );

  return result.rows[0];
}

/**
 * Get archive statistics
 * @returns {Promise<Object>}
 */
export async function getArchiveStats() {
  const result = await query(`
    SELECT
      COUNT(*) as total_issues,
      SUM(article_count) as total_articles,
      MIN(year) as first_year,
      MAX(year) as last_year
    FROM archive_issues
  `);

  return result.rows[0];
}

/**
 * Get Russian month name
 * @param {number} month - Month number (1-12)
 * @returns {string}
 */
export function getMonthName(month) {
  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  return months[month - 1] || '';
}

export default {
  createArchiveIssue,
  getAllArchiveIssues,
  getArchiveByYearMonth,
  getArchiveIssue,
  getArchiveIssuePdf,
  deleteArchiveIssue,
  updateArchiveIssue,
  getArchiveStats,
  getMonthName
};
