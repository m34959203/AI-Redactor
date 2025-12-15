/**
 * Language detection utilities
 */

/**
 * Detects if text contains Cyrillic or Latin characters
 * @param {string} text - Text to analyze
 * @returns {'cyrillic'|'latin'} - Detected language
 */
export const detectLanguage = (text) => {
  if (!text) return 'latin';

  const cyrillicPattern = /[а-яА-ЯёЁ]/;
  return cyrillicPattern.test(text) ? 'cyrillic' : 'latin';
};

/**
 * Sorts articles by language and author name
 * @param {Array} articles - Array of articles
 * @returns {Array} - Sorted articles
 */
export const sortArticlesByLanguage = (articles) => {
  return [...articles].sort((a, b) => {
    // First, sort by language (Cyrillic first)
    if (a.language !== b.language) {
      return a.language === 'cyrillic' ? -1 : 1;
    }

    // Then, sort by author name within the same language
    const locale = a.language === 'cyrillic' ? 'ru' : 'en';
    return a.author.localeCompare(b.author, locale);
  });
};
