import React from 'react';
import { BookOpen } from 'lucide-react';

const Header = ({ articlesCount }) => {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-800 flex items-center gap-3">
            <BookOpen className="text-indigo-600" size={40} />
            AI-Редактор научного журнала
          </h1>
          <p className="text-gray-600 mt-2">Автоматизация сборки выпусков за 10 минут</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Статей загружено</div>
          <div className="text-3xl font-bold text-indigo-600">{articlesCount}</div>
        </div>
      </div>
    </div>
  );
};

export default Header;
