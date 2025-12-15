/**
 * File validation utilities
 */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_ARTICLE_TYPES = ['.docx'];
const ALLOWED_PAGE_TYPES = ['.docx', '.pdf'];

/**
 * Validates article file
 * @param {File} file - File to validate
 * @returns {{valid: boolean, error: string|null}}
 */
export const validateArticleFile = (file) => {
  if (!file) {
    return { valid: false, error: 'Файл не выбран' };
  }

  const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

  if (!ALLOWED_ARTICLE_TYPES.includes(fileExt)) {
    return {
      valid: false,
      error: `Поддерживаются только ${ALLOWED_ARTICLE_TYPES.join(', ')} форматы`
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Размер файла не должен превышать 50 МБ'
    };
  }

  return { valid: true, error: null };
};

/**
 * Validates special page file (cover, description, final)
 * @param {File} file - File to validate
 * @returns {{valid: boolean, error: string|null}}
 */
export const validatePageFile = (file) => {
  if (!file) {
    return { valid: false, error: 'Файл не выбран' };
  }

  const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

  if (!ALLOWED_PAGE_TYPES.includes(fileExt)) {
    return {
      valid: false,
      error: `Поддерживаются только ${ALLOWED_PAGE_TYPES.join(', ')} форматы`
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Размер файла не должен превышать 50 МБ'
    };
  }

  return { valid: true, error: null };
};

/**
 * Validates multiple files
 * @param {FileList|File[]} files - Files to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export const validateMultipleFiles = (files) => {
  const errors = [];
  const filesArray = Array.from(files);

  filesArray.forEach((file, index) => {
    const validation = validateArticleFile(file);
    if (!validation.valid) {
      errors.push(`Файл ${index + 1} (${file.name}): ${validation.error}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
};
