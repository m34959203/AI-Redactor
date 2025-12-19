/**
 * Language detection utilities
 * Supports Russian, English, and Kazakh languages
 */

// Kazakh-specific Cyrillic letters (not present in Russian)
const KAZAKH_SPECIFIC = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

// Standard Cyrillic (Russian and Kazakh share these)
const CYRILLIC_PATTERN = /[а-яА-ЯёЁ]/;

// Latin characters
const LATIN_PATTERN = /[a-zA-Z]/;

/**
 * Language codes
 * @typedef {'kazakh'|'cyrillic'|'latin'} LanguageCode
 */

/**
 * Detects the primary language/script of the text
 * Priority: Kazakh > Russian (Cyrillic) > English (Latin)
 *
 * @param {string} text - Text to analyze
 * @returns {LanguageCode} - Detected language code
 */
export const detectLanguage = (text) => {
  if (!text || typeof text !== 'string') return 'latin';

  // Check for Kazakh-specific characters first
  if (KAZAKH_SPECIFIC.test(text)) {
    return 'kazakh';
  }

  // Check for Cyrillic (Russian)
  if (CYRILLIC_PATTERN.test(text)) {
    return 'cyrillic';
  }

  // Default to Latin (English)
  return 'latin';
};

/**
 * Gets human-readable language name
 * @param {LanguageCode} code - Language code
 * @returns {string} - Language name in Russian
 */
export const getLanguageName = (code) => {
  const names = {
    kazakh: 'Қазақша',
    cyrillic: 'Русский',
    latin: 'English'
  };
  return names[code] || 'Неизвестный';
};

/**
 * Gets the locale for sorting
 * @param {LanguageCode} code - Language code
 * @returns {string} - Locale string
 */
export const getLocale = (code) => {
  const locales = {
    kazakh: 'kk',
    cyrillic: 'ru',
    latin: 'en'
  };
  return locales[code] || 'en';
};

/**
 * Gets language priority for sorting (lower = first)
 * Order: Cyrillic (Russian) → Kazakh → Latin (English)
 * @param {LanguageCode} code - Language code
 * @returns {number} - Sort priority
 */
const getLanguagePriority = (code) => {
  const priorities = {
    cyrillic: 0,  // Russian first
    kazakh: 1,    // Kazakh second
    latin: 2      // English last
  };
  return priorities[code] ?? 3;
};

/**
 * Sorts articles by language and then by author name
 * Order: Russian (А-Я) → Kazakh (А-Я) → English (A-Z)
 *
 * @param {Array<{author: string, language: LanguageCode}>} articles - Array of articles
 * @returns {Array} - Sorted articles
 */
export const sortArticlesByLanguage = (articles) => {
  if (!Array.isArray(articles)) return [];

  return [...articles].sort((a, b) => {
    // First, sort by language priority
    const priorityA = getLanguagePriority(a.language);
    const priorityB = getLanguagePriority(b.language);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Then, sort by author name within the same language group
    const localeA = getLocale(a.language);
    const authorA = a.author || '';
    const authorB = b.author || '';

    return authorA.localeCompare(authorB, localeA, { sensitivity: 'base' });
  });
};

/**
 * Groups articles by language
 * @param {Array} articles - Array of articles
 * @returns {Object} - Articles grouped by language
 */
export const groupArticlesByLanguage = (articles) => {
  if (!Array.isArray(articles)) return {};

  return articles.reduce((groups, article) => {
    const lang = article.language || 'latin';
    if (!groups[lang]) {
      groups[lang] = [];
    }
    groups[lang].push(article);
    return groups;
  }, {});
};

/**
 * Counts characters by script type
 * @param {string} text - Text to analyze
 * @returns {{cyrillic: number, kazakh: number, latin: number, other: number}}
 */
export const countScriptCharacters = (text) => {
  if (!text) return { cyrillic: 0, kazakh: 0, latin: 0, other: 0 };

  const counts = { cyrillic: 0, kazakh: 0, latin: 0, other: 0 };

  for (const char of text) {
    if (KAZAKH_SPECIFIC.test(char)) {
      counts.kazakh++;
    } else if (CYRILLIC_PATTERN.test(char)) {
      counts.cyrillic++;
    } else if (LATIN_PATTERN.test(char)) {
      counts.latin++;
    } else if (/\S/.test(char)) {
      counts.other++;
    }
  }

  return counts;
};
