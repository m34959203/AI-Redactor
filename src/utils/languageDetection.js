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
 * Order: Latin (English) → Cyrillic (Russian) → Kazakh (as per TZ requirement)
 * @param {LanguageCode} code - Language code
 * @returns {number} - Sort priority
 */
const getLanguagePriority = (code) => {
  const priorities = {
    latin: 0,     // English first (A-Z)
    cyrillic: 1,  // Russian second (А-Я)
    kazakh: 2     // Kazakh last (А-Я)
  };
  return priorities[code] ?? 3;
};

/**
 * Section order for journal
 */
export const SECTION_ORDER = [
  'ТЕХНИЧЕСКИЕ НАУКИ',
  'ПЕДАГОГИЧЕСКИЕ НАУКИ',
  'ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ'
];

/**
 * Gets section priority for sorting
 * @param {string} section - Section name
 * @returns {number} - Sort priority
 */
const getSectionPriority = (section) => {
  const index = SECTION_ORDER.indexOf(section);
  return index >= 0 ? index : SECTION_ORDER.length;
};

/**
 * Sorts articles by language and then by author name
 * Order: Latin (A-Z) → Cyrillic (А-Я) → Kazakh (А-Я) - as per TZ requirement
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
 * Sorts articles by section first, then by language, then by author name
 * Section Order: ТЕХНИЧЕСКИЕ НАУКИ → ПЕДАГОГИЧЕСКИЕ НАУКИ → ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ
 * Language Order within section: Latin (A-Z) → Cyrillic (А-Я) → Kazakh (А-Я)
 *
 * @param {Array<{author: string, language: LanguageCode, section: string}>} articles - Array of articles
 * @returns {Array} - Sorted articles
 */
export const sortArticlesBySectionAndLanguage = (articles) => {
  if (!Array.isArray(articles)) return [];

  return [...articles].sort((a, b) => {
    // First, sort by section priority
    const sectionPriorityA = getSectionPriority(a.section);
    const sectionPriorityB = getSectionPriority(b.section);

    if (sectionPriorityA !== sectionPriorityB) {
      return sectionPriorityA - sectionPriorityB;
    }

    // Then, sort by language priority within the same section
    const langPriorityA = getLanguagePriority(a.language);
    const langPriorityB = getLanguagePriority(b.language);

    if (langPriorityA !== langPriorityB) {
      return langPriorityA - langPriorityB;
    }

    // Finally, sort by author name within the same language group
    const localeA = getLocale(a.language);
    const authorA = a.author || '';
    const authorB = b.author || '';

    return authorA.localeCompare(authorB, localeA, { sensitivity: 'base' });
  });
};

/**
 * Groups articles by section
 * @param {Array} articles - Array of articles
 * @returns {Object} - Articles grouped by section (only non-empty sections)
 */
export const groupArticlesBySection = (articles) => {
  if (!Array.isArray(articles)) return {};

  const groups = {};

  // Initialize groups in correct order
  SECTION_ORDER.forEach(section => {
    const sectionArticles = articles.filter(a => a.section === section);
    if (sectionArticles.length > 0) {
      groups[section] = sectionArticles;
    }
  });

  return groups;
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
