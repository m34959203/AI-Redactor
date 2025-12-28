import React from 'react';
import { BookOpen } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const Header = ({ articlesCount, isDark, onThemeToggle }) => {
  return (
    <header className="glass-effect-strong rounded-2xl p-8 mb-6 transition-all duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BookOpen size={36} aria-hidden="true" />
            </div>
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              AI-Редактор научного журнала
            </span>
          </h1>
          <p className="text-muted-foreground mt-2 ml-14">Автоматизация сборки выпусков за 10 минут</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right glass-effect rounded-xl px-6 py-3">
            <div className="text-sm text-muted-foreground">Статей загружено</div>
            <div className="text-3xl font-bold text-primary">{articlesCount}</div>
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
