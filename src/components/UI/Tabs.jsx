import React from 'react';
import { Edit2, CheckCircle, Eye, FileText } from 'lucide-react';

const Tabs = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'editor', label: 'Редактор', icon: Edit2 },
    { id: 'spellcheck', label: 'Проверка орфографии', icon: CheckCircle },
    { id: 'review', label: 'Рецензия', icon: Eye },
    { id: 'archive', label: 'Архив', icon: FileText },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-xl mb-6">
      <div className="flex border-b">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-6 py-4 font-semibold transition ${
              activeTab === id
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600 hover:text-indigo-600'
            }`}
          >
            <Icon className="inline mr-2" size={20} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Tabs;
