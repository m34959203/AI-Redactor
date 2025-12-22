/**
 * Centralized constants for article sections
 * Re-exports from shared module and adds frontend-specific config
 */

// Re-export base constants from shared
export {
  ARTICLE_SECTIONS,
  SECTION_ORDER,
  NEEDS_REVIEW_SECTION,
  isValidSection,
  getSectionPriority
} from '../../shared/sections.js';

/**
 * Confidence thresholds for AI classification
 * Frontend-specific configuration for UI indicators
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,    // Very confident - no visual indicator needed
  MEDIUM: 0.6,  // Somewhat confident - subtle indicator
  LOW: 0.4      // Low confidence - needs attention indicator
};

/**
 * Section metadata with keywords for better AI classification
 * Used for generating prompts and validation
 */
export const SECTION_METADATA = {
  'ТЕХНИЧЕСКИЕ НАУКИ': {
    keywords: [
      'инженерия', 'IT', 'программирование', 'машиностроение',
      'строительство', 'архитектура', 'электроника', 'автоматизация',
      'транспорт', 'энергетика', 'материаловедение', 'робототехника',
      'искусственный интеллект', 'машинное обучение', 'алгоритм',
      'система', 'разработка', 'проектирование', 'технология',
      'информационные технологии', 'сеть', 'база данных', 'software'
    ],
    description: 'Технические и инженерные дисциплины, IT, программирование',
    color: 'indigo',
    icon: 'cog'
  },
  'ПЕДАГОГИЧЕСКИЕ НАУКИ': {
    keywords: [
      'образование', 'методика преподавания', 'дидактика', 'воспитание',
      'педагогическая психология', 'обучение', 'студент', 'преподавание',
      'урок', 'педагог', 'школа', 'вуз', 'университет', 'компетенции',
      'образовательная программа', 'учебный процесс', 'методология обучения',
      'онлайн-обучение', 'дистанционное образование', 'учитель', 'ученик'
    ],
    description: 'Педагогика, методика обучения, образовательные технологии',
    color: 'emerald',
    icon: 'academic-cap'
  },
  'ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ': {
    keywords: [
      'физика', 'химия', 'биология', 'экология', 'медицина', 'математика',
      'экономика', 'финансы', 'менеджмент', 'маркетинг', 'бухгалтерия',
      'анализ данных', 'исследование', 'эксперимент', 'рынок', 'организация',
      'статистика', 'природа', 'окружающая среда', 'здоровье', 'лечение',
      'предприятие', 'бизнес', 'инвестиции', 'банк', 'налог'
    ],
    description: 'Естественные науки, экономика, финансы, медицина',
    color: 'amber',
    icon: 'beaker'
  }
};

/**
 * Get confidence level label for UI display
 * @param {number} confidence - Confidence score (0-1)
 * @returns {{level: string, color: string, label: string}}
 */
export const getConfidenceLevel = (confidence) => {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    return { level: 'high', color: 'green', label: 'Высокая уверенность' };
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return { level: 'medium', color: 'yellow', label: 'Средняя уверенность' };
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW) {
    return { level: 'low', color: 'orange', label: 'Низкая уверенность' };
  }
  return { level: 'very-low', color: 'red', label: 'Требует проверки' };
};
