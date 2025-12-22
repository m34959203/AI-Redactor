import React from 'react';
import { BookOpen } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const Header = ({ articlesCount, isDark, onThemeToggle }) => {
  return (
    <header className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-6 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
            <BookOpen className="text-indigo-600 dark:text-indigo-400" size={40} aria-hidden="true" />
            AI-Редактор научного журнала
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">Автоматизация сборки выпусков за 10 минут</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">Статей загружено</div>
            <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{articlesCount}</div>
          </div>
          {onThemeToggle && (
            <ThemeToggle isDark={isDark} onToggle={onThemeToggle} />
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
