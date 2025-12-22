/**
 * Data API Service
 * Handles all data persistence through the backend API
 * Falls back to localStorage/IndexedDB when database is unavailable
 */

import { getApiUrl } from '../utils/apiService';

const API_BASE = getApiUrl();

// Get or create session ID
function getSessionId() {
  let sessionId = localStorage.getItem('ai_redactor_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('ai_redactor_session_id', sessionId);
  }
  return sessionId;
}

// Common headers for API requests
function getHeaders() {
  return {
    'X-Session-Id': getSessionId(),
  };
}

// Check if API is available
let apiAvailable = null;

async function checkApiAvailability() {
  if (apiAvailable !== null) return apiAvailable;

  try {
    const response = await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      headers: getHeaders(),
    });
    const data = await response.json();
    apiAvailable = data.database === true;
    return apiAvailable;
  } catch {
    apiAvailable = false;
    return false;
  }
}

// ============ SESSION API ============

/**
 * Get or create session
 */
export async function getSession() {
  if (!await checkApiAvailability()) {
    return {
      id: getSessionId(),
      onboarding_seen: localStorage.getItem('hasSeenOnboarding') === 'true',
      settings: {},
    };
  }

  const response = await fetch(`${API_BASE}/api/data/session`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get session');
  }

  return response.json();
}

/**
 * Mark onboarding as seen
 */
export async function markOnboardingSeen() {
  localStorage.setItem('hasSeenOnboarding', 'true');

  if (!await checkApiAvailability()) return;

  await fetch(`${API_BASE}/api/data/session/onboarding-seen`, {
    method: 'POST',
    headers: getHeaders(),
  });
}

// ============ ARTICLES API ============

/**
 * Get all articles for current session
 */
export async function getArticles() {
  if (!await checkApiAvailability()) {
    return []; // No persistent articles without database
  }

  const response = await fetch(`${API_BASE}/api/data/articles`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get articles');
  }

  return response.json();
}

/**
 * Upload and create articles
 * @param {FileList|File[]} files - Files to upload
 * @param {Array<Object>} metadata - Optional metadata for each file
 */
export async function createArticles(files, metadata = []) {
  if (!await checkApiAvailability()) {
    console.warn('Database not available, articles will not persist');
    return [];
  }

  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
  }

  if (metadata.length > 0) {
    formData.append('metadata', JSON.stringify(metadata));
  }

  const response = await fetch(`${API_BASE}/api/data/articles`, {
    method: 'POST',
    headers: {
      'X-Session-Id': getSessionId(),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create articles');
  }

  return response.json();
}

/**
 * Update article
 * @param {number} id - Article ID
 * @param {Object} updates - Fields to update
 */
export async function updateArticle(id, updates) {
  if (!await checkApiAvailability()) {
    return null;
  }

  const response = await fetch(`${API_BASE}/api/data/articles/${id}`, {
    method: 'PATCH',
    headers: {
      ...getHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error('Failed to update article');
  }

  return response.json();
}

/**
 * Delete article
 * @param {number} id - Article ID
 */
export async function deleteArticle(id) {
  if (!await checkApiAvailability()) {
    return;
  }

  const response = await fetch(`${API_BASE}/api/data/articles/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete article');
  }
}

/**
 * Delete all articles
 */
export async function deleteAllArticles() {
  if (!await checkApiAvailability()) {
    return;
  }

  const response = await fetch(`${API_BASE}/api/data/articles`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete articles');
  }
}

// ============ SPECIAL PAGES API ============

/**
 * Get all special pages
 */
export async function getSpecialPages() {
  if (!await checkApiAvailability()) {
    return { cover: null, description: null, final: null };
  }

  const response = await fetch(`${API_BASE}/api/data/special-pages`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get special pages');
  }

  return response.json();
}

/**
 * Set special page
 * @param {string} type - 'cover', 'description', or 'final'
 * @param {File} file - File to upload
 */
export async function setSpecialPage(type, file) {
  if (!await checkApiAvailability()) {
    return null;
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/data/special-pages/${type}`, {
    method: 'POST',
    headers: {
      'X-Session-Id': getSessionId(),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to set special page');
  }

  return response.json();
}

/**
 * Delete special page
 * @param {string} type - Page type
 */
export async function deleteSpecialPage(type) {
  if (!await checkApiAvailability()) {
    return;
  }

  const response = await fetch(`${API_BASE}/api/data/special-pages/${type}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete special page');
  }
}

// ============ ARCHIVE API ============

/**
 * Get all archive issues
 */
export async function getArchiveIssues() {
  if (!await checkApiAvailability()) {
    // Fallback to localStorage
    const data = localStorage.getItem('ai_journal_archive_metadata');
    return data ? JSON.parse(data) : [];
  }

  const response = await fetch(`${API_BASE}/api/data/archive`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get archive');
  }

  return response.json();
}

/**
 * Create archive issue
 * @param {Object} issueData - Issue metadata
 * @param {Blob} pdfBlob - PDF file
 */
export async function createArchiveIssue(issueData, pdfBlob) {
  if (!await checkApiAvailability()) {
    // Fallback to localStorage/IndexedDB
    const { addToArchive } = await import('../utils/archiveStorage');
    return addToArchive(issueData, pdfBlob);
  }

  const formData = new FormData();
  formData.append('issueNumber', issueData.issueNumber || '');
  formData.append('year', issueData.year);
  formData.append('month', issueData.month);
  formData.append('title', issueData.title || '');
  formData.append('articleCount', issueData.articleCount || 0);
  formData.append('metadata', JSON.stringify(issueData.metadata || {}));

  if (pdfBlob) {
    formData.append('pdf', pdfBlob, issueData.pdfFilename || 'journal.pdf');
  }

  const response = await fetch(`${API_BASE}/api/data/archive`, {
    method: 'POST',
    headers: {
      'X-Session-Id': getSessionId(),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to create archive issue');
  }

  return response.json();
}

/**
 * Get archive issue PDF
 * @param {number} id - Issue ID
 */
export async function getArchiveIssuePdf(id) {
  if (!await checkApiAvailability()) {
    // Fallback to IndexedDB
    const { getPdfBlob } = await import('../utils/archiveStorage');
    return getPdfBlob(id);
  }

  const response = await fetch(`${API_BASE}/api/data/archive/${id}/pdf`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get archive PDF');
  }

  return response.blob();
}

/**
 * Delete archive issue
 * @param {number} id - Issue ID
 */
export async function deleteArchiveIssue(id) {
  if (!await checkApiAvailability()) {
    // Fallback to localStorage/IndexedDB
    const { removeFromArchive } = await import('../utils/archiveStorage');
    return removeFromArchive(id);
  }

  const response = await fetch(`${API_BASE}/api/data/archive/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete archive issue');
  }
}

/**
 * Check if database is available
 */
export async function isDatabaseAvailable() {
  return checkApiAvailability();
}

/**
 * Reset API availability check (for testing or after reconnection)
 */
export function resetApiCheck() {
  apiAvailable = null;
}

export default {
  getSession,
  markOnboardingSeen,
  getArticles,
  createArticles,
  updateArticle,
  deleteArticle,
  deleteAllArticles,
  getSpecialPages,
  setSpecialPage,
  deleteSpecialPage,
  getArchiveIssues,
  createArchiveIssue,
  getArchiveIssuePdf,
  deleteArchiveIssue,
  isDatabaseAvailable,
  resetApiCheck,
};
