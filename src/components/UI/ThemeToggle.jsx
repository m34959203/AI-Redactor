import React from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * ThemeToggle - Button to switch between light and dark themes
 */
const ThemeToggle = ({ isDark, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
    >
      {isDark ? (
        <Sun size={20} className="text-yellow-500" aria-hidden="true" />
      ) : (
        <Moon size={20} className="text-gray-600" aria-hidden="true" />
      )}
    </button>
  );
};

export default ThemeToggle;
