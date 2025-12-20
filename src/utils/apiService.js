/**
 * API Service for server-side PDF generation
 * Uses LibreOffice for accurate Word → PDF conversion
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Check if server is available
 * @returns {Promise<{available: boolean, libreOffice: boolean}>}
 */
export const checkServerHealth = async () => {
  try {
    const response = await fetch(`${API_URL}/api/health`, {
      method: 'GET',
      timeout: 5000
    });

    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        libreOffice: data.libreOffice
      };
    }
    return { available: false, libreOffice: false };
  } catch {
    return { available: false, libreOffice: false };
  }
};

/**
 * Convert single DOCX to PDF using server
 * @param {File} file - DOCX file
 * @returns {Promise<Blob>} - PDF blob
 */
export const convertDocxToPdf = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/convert`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Conversion failed');
  }

  return response.blob();
};

/**
 * Generate journal PDF from multiple files
 * @param {Object} params - Journal parameters
 * @param {File} params.coverPage - Cover page file
 * @param {File} params.descriptionPage - Description page file
 * @param {File[]} params.articles - Array of article files
 * @param {File} params.finalPage - Final page file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Blob>} - Generated PDF blob
 */
export const generateJournalPdf = async ({ coverPage, descriptionPage, articles, finalPage }, onProgress = () => {}) => {
  const formData = new FormData();

  onProgress({ step: 1, total: 4, message: 'Подготовка файлов...' });

  if (coverPage?.file) {
    formData.append('coverPage', coverPage.file);
  }

  if (descriptionPage?.file) {
    formData.append('descriptionPage', descriptionPage.file);
  }

  if (articles && articles.length > 0) {
    for (const article of articles) {
      if (article.file) {
        formData.append('articles', article.file);
      }
    }
  }

  if (finalPage?.file) {
    formData.append('finalPage', finalPage.file);
  }

  onProgress({ step: 2, total: 4, message: 'Отправка файлов на сервер...' });

  const response = await fetch(`${API_URL}/api/generate-journal`, {
    method: 'POST',
    body: formData
  });

  onProgress({ step: 3, total: 4, message: 'Конвертация в PDF...' });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Server error' }));
    throw new Error(error.error || 'Journal generation failed');
  }

  onProgress({ step: 4, total: 4, message: 'PDF успешно создан!' });

  return response.blob();
};

/**
 * Convert file to PDF using base64 (alternative method)
 * @param {File} file - File to convert
 * @returns {Promise<Blob>} - PDF blob
 */
export const convertToBase64Pdf = async (file) => {
  // Read file as base64
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  const response = await fetch(`${API_URL}/api/convert-base64`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filename: file.name,
      data: base64
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Conversion failed');
  }

  const result = await response.json();

  // Convert base64 back to blob
  const pdfData = atob(result.data);
  const pdfArray = new Uint8Array(pdfData.length);
  for (let i = 0; i < pdfData.length; i++) {
    pdfArray[i] = pdfData.charCodeAt(i);
  }

  return new Blob([pdfArray], { type: 'application/pdf' });
};

export default {
  checkServerHealth,
  convertDocxToPdf,
  generateJournalPdf,
  convertToBase64Pdf
};
