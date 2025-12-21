/**
 * Shared constants for article sections
 * Used by both frontend and backend
 * Single source of truth for section names and order
 */

/**
 * Available scientific sections for the journal
 * @type {string[]}
 */
export const ARTICLE_SECTIONS = [
  'ТЕХНИЧЕСКИЕ НАУКИ',
  'ПЕДАГОГИЧЕСКИЕ НАУКИ',
  'ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ'
];

/**
 * Section order for sorting and display
 * Matches ARTICLE_SECTIONS order
 * @type {string[]}
 */
export const SECTION_ORDER = ARTICLE_SECTIONS;

/**
 * Special value for articles that need manual classification
 */
export const NEEDS_REVIEW_SECTION = 'ТРЕБУЕТ КЛАССИФИКАЦИИ';

/**
 * Check if a section name is valid for PDF generation
 * @param {string} section - Section name to validate
 * @returns {boolean} - True if section is valid
 */
export function isValidSection(section) {
  return ARTICLE_SECTIONS.includes(section);
}

/**
 * Get the display name for a section
 * @param {string} section - Section name
 * @returns {string} - Display name or original if not found
 */
export function getSectionDisplayName(section) {
  if (section === NEEDS_REVIEW_SECTION) {
    return 'Требует классификации';
  }
  return section;
}
