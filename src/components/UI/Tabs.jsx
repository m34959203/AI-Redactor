import React from 'react';
import { Edit2, CheckCircle, Eye, FileText, BookOpen } from 'lucide-react';

const Tabs = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'editor', label: 'Редактор', icon: Edit2 },
    { id: 'spellcheck', label: 'Орфография', icon: CheckCircle },
    { id: 'review', label: 'Рецензия', icon: Eye },
    { id: 'archive', label: 'Архив', icon: FileText },
    { id: 'info', label: 'О журнале', icon: BookOpen },
  ];

  return (
    <nav className="glass-effect-strong rounded-2xl mb-6 p-2 transition-all duration-300" aria-label="Основная навигация">
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-5 py-3 font-medium rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-ring flex items-center gap-2 ${
              activeTab === id
                ? 'bg-primary text-primary-foreground shadow-lg glow-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Tabs;
