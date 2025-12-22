/**
 * Local metadata parser - extracts title and author without AI
 * Used as fallback when OpenRouter API is unavailable or rate limited
 */

/**
 * Extracts title from content
 * Assumes title is in the first few lines, often in UPPERCASE
 *
 * @param {string} content - Article content
 * @param {string} fileName - Original file name
 * @returns {string} - Extracted or fallback title
 */
export const extractTitleLocal = (content, fileName) => {
  if (!content || typeof content !== 'string') {
    return cleanFileName(fileName);
  }

  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return cleanFileName(fileName);
  }

  // Strategy 1: Look for a line in UPPERCASE (common for titles)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Skip very short lines (likely headers like "УДК 123")
    if (line.length < 10) continue;
    // Skip lines that are mostly numbers (UDK codes)
    if (/^[УДКудкUDK\s\d\.\-]+$/.test(line)) continue;

    // Check if line is mostly uppercase (title indicator)
    const upperCount = (line.match(/[А-ЯӘҒҚҢӨҰҮҺІA-Z]/g) || []).length;
    const lowerCount = (line.match(/[а-яәғқңөұүһіa-z]/g) || []).length;

    if (upperCount > lowerCount && line.length > 15) {
      // Found uppercase title, convert to title case
      return toTitleCase(line);
    }
  }

  // Strategy 2: First substantial line (not UDK, not too short)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (line.length >= 15 && !/^[УДКудкUDK\s\d\.\-]+$/.test(line)) {
      return toTitleCase(line);
    }
  }

  // Fallback: use cleaned file name
  return cleanFileName(fileName);
};

/**
 * Extracts author from content
 * Looks for patterns like "Иванов И.И." or "И.И. Иванов"
 *
 * @param {string} content - Article content
 * @returns {string} - Extracted author or placeholder
 */
export const extractAuthorLocal = (content) => {
  if (!content || typeof content !== 'string') {
    return 'Автор не указан';
  }

  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Look in first 10 lines for author pattern
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];

    // Skip title-like lines (all caps)
    const upperCount = (line.match(/[А-ЯӘҒҚҢӨҰҮҺІA-Z]/g) || []).length;
    const lowerCount = (line.match(/[а-яәғқңөұүһіa-z]/g) || []).length;
    if (upperCount > lowerCount * 2 && line.length > 20) continue;

    // Pattern 1: "Фамилия И.О." or "Фамилия И.О., Фамилия2 И.О."
    const pattern1 = /([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z]+)\s+([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\.\s*([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\./;
    const match1 = line.match(pattern1);
    if (match1) {
      // Return first author
      return `${match1[1]} ${match1[2]}.${match1[3]}.`;
    }

    // Pattern 2: "И.О. Фамилия"
    const pattern2 = /([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\.\s*([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\.\s*([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z]+)/;
    const match2 = line.match(pattern2);
    if (match2) {
      return `${match2[3]} ${match2[1]}.${match2[2]}.`;
    }

    // Pattern 3: Line with "Автор:" or "Author:"
    if (/^(Автор|Author|Авторы|Authors)\s*:/i.test(line)) {
      const authorPart = line.replace(/^(Автор|Author|Авторы|Authors)\s*:\s*/i, '').trim();
      if (authorPart.length > 2) {
        // Get first author if multiple
        return authorPart.split(/[,;]/)[0].trim();
      }
    }
  }

  return 'Автор не указан';
};

/**
 * Extracts both title and author locally
 *
 * @param {string} fileName - Original file name
 * @param {string} content - Article content
 * @returns {{title: string, author: string}}
 */
export const extractMetadataLocal = (fileName, content) => {
  return {
    title: extractTitleLocal(content, fileName),
    author: extractAuthorLocal(content)
  };
};

/**
 * Cleans file name to use as fallback title
 *
 * @param {string} fileName - Original file name
 * @returns {string} - Cleaned title
 */
const cleanFileName = (fileName) => {
  if (!fileName) return 'Без названия';

  return fileName
    .replace(/\.docx?$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Без названия';
};

/**
 * Converts text to title case
 *
 * @param {string} text - Text to convert
 * @returns {string} - Title case text
 */
const toTitleCase = (text) => {
  if (!text) return '';

  // If text is all uppercase, convert to title case
  const isAllUpper = text === text.toUpperCase();

  if (isAllUpper) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  return text;
};
