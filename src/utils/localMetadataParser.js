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
 * Extracts author from filename
 * Patterns: "Статья Калжанова Г.М. ЖГК.docx", "Статья_Иванов_А.Б.docx"
 *
 * @param {string} fileName - Original file name
 * @returns {string|null} - Extracted author or null
 */
const extractAuthorFromFileName = (fileName) => {
  if (!fileName) return null;

  // Remove extension and common prefixes
  const cleanName = fileName
    .replace(/\.docx?$/i, '')
    .replace(/^(статья|article|ст\.?)\s*/i, '')
    .replace(/[_]+/g, ' ')
    .trim();

  // Pattern: "Фамилия И.О." in filename (Калжанова Г.М., Нығызбаева П.Т.)
  const pattern1 = /([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z]+)\s+([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\.\s*([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\./;
  const match1 = cleanName.match(pattern1);
  if (match1) {
    return `${match1[1]} ${match1[2]}.${match1[3]}.`;
  }

  // Pattern: "соавторы Фамилия1, Фамилия2" - take first
  const coauthorMatch = cleanName.match(/соавторы?\s+([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіё]+)/i);
  if (coauthorMatch) {
    return coauthorMatch[1];
  }

  return null;
};

/**
 * Extracts author from content
 * Looks for patterns like "Иванов И.И." or "И.И. Иванов"
 *
 * @param {string} content - Article content
 * @param {string} fileName - Original file name (for fallback)
 * @returns {string} - Extracted author or placeholder
 */
export const extractAuthorLocal = (content, fileName = '') => {
  // First, try to extract from filename
  const fileNameAuthor = extractAuthorFromFileName(fileName);
  if (fileNameAuthor) {
    return fileNameAuthor;
  }

  if (!content || typeof content !== 'string') {
    return 'Автор не указан';
  }

  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Look in first 20 lines for author pattern (increased from 10)
  let foundTitle = false;

  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i];

    // Skip UDK/УДК lines
    if (/^[УДКудкUDK\s\d\.\-]+$/.test(line)) continue;

    // Detect title line (all caps, long)
    const upperCount = (line.match(/[А-ЯӘҒҚҢӨҰҮҺІA-Z]/g) || []).length;
    const lowerCount = (line.match(/[а-яәғқңөұүһіa-z]/g) || []).length;
    const isTitle = upperCount > lowerCount * 2 && line.length > 20;

    if (isTitle) {
      foundTitle = true;
      continue; // Skip title, author is usually after
    }

    // Only look for author AFTER we found the title
    // (or in first few lines if no title detected yet)
    if (!foundTitle && i > 5) continue;

    // Pattern 1: "Фамилия И.О." (Калжанова Г.М., Нығызбаева П.Т.)
    const pattern1 = /([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z]{2,})\s+([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\.\s*([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\./;
    const match1 = line.match(pattern1);
    if (match1 && match1[1].length >= 2) {
      return `${match1[1]} ${match1[2]}.${match1[3]}.`;
    }

    // Pattern 2: "И.О. Фамилия" (А.Б. Иванов)
    const pattern2 = /([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\.\s*([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z])\s*\.\s*([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z]{2,})/;
    const match2 = line.match(pattern2);
    if (match2 && match2[3].length >= 2) {
      return `${match2[3]} ${match2[1]}.${match2[2]}.`;
    }

    // Pattern 3: Full name "Фамилия Имя Отчество" (Иванов Андрей Борисович)
    // Look for 3 capitalized words in a row
    const pattern3 = /([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z]{2,})\s+([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z]{2,})\s+([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z]{2,})/;
    const match3 = line.match(pattern3);
    if (match3) {
      // Check that all three words start with uppercase
      const [, w1, w2, w3] = match3;
      const isName = /^[А-ЯӘҒҚҢӨҰҮҺІЁA-Z]/.test(w1) &&
                     /^[А-ЯӘҒҚҢӨҰҮҺІЁA-Z]/.test(w2) &&
                     /^[А-ЯӘҒҚҢӨҰҮҺІЁA-Z]/.test(w3);
      // Avoid matching common phrases
      const notName = /^(для|при|что|как|это|или|так|все|они|был|она|его|мы|вы)/i.test(w1);
      if (isName && !notName && w1.length <= 20 && w2.length <= 15) {
        return `${w1} ${w2[0]}.${w3[0]}.`;
      }
    }

    // Pattern 4: "Автор:" or "Author:" label
    if (/^(Автор|Author|Авторы|Authors)\s*:/i.test(line)) {
      const authorPart = line.replace(/^(Автор|Author|Авторы|Authors)\s*:\s*/i, '').trim();
      if (authorPart.length > 2) {
        return authorPart.split(/[,;]/)[0].trim();
      }
    }

    // Pattern 5: Line with email suggests author line (name@email.com)
    if (line.includes('@') && foundTitle) {
      // Try to extract name before email
      const beforeEmail = line.split(/\s*[\w.-]+@[\w.-]+/)[0].trim();
      if (beforeEmail.length > 3 && beforeEmail.length < 50) {
        const nameMatch = beforeEmail.match(/([А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіёA-Za-z\s.]+)/);
        if (nameMatch) {
          return nameMatch[1].trim().split(/[,;]/)[0].trim();
        }
      }
    }

    // Pattern 6: Short line after title (likely author, 2-4 words, not a sentence)
    if (foundTitle && line.length < 60 && line.length > 5) {
      const wordCount = line.split(/\s+/).length;
      if (wordCount >= 2 && wordCount <= 5 && !line.includes('.') || line.match(/\.\s*[А-ЯA-Z]\./)) {
        // Doesn't look like a sentence (no period at end, or has initials)
        if (!/[.!?]$/.test(line) || /[А-ЯA-Z]\.\s*[А-ЯA-Z]\./.test(line)) {
          // Check it contains Cyrillic name-like words
          if (/[А-ЯӘҒҚҢӨҰҮҺІЁа-яәғқңөұүһіё]{2,}/.test(line)) {
            return line.split(/[,;]/)[0].trim();
          }
        }
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
    author: extractAuthorLocal(content, fileName)
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
