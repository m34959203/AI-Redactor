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
    <nav className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl mb-6 transition-colors" aria-label="Основная навигация">
      <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-6 py-4 font-semibold transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${
              activeTab === id
                ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon className="inline mr-2" size={20} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Tabs;
