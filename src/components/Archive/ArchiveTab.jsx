import React from 'react';
import { FileText, Eye, Download } from 'lucide-react';

const ArchiveTab = ({ archive }) => {
  if (archive.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Архив выпусков</h2>
        <div className="text-center py-12 text-gray-500">
          <FileText className="mx-auto mb-4 text-gray-400" size={48} />
          <p>Архив пуст. Создайте первый выпуск!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Архив выпусков</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {archive.map((issue) => (
          <div
            key={issue.id}
            className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center justify-between mb-4">
              <FileText className="text-indigo-600" size={32} />
              <span className="text-sm text-gray-500">{issue.date}</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">{issue.name}</h3>
            <p className="text-gray-600 mb-4">Статей: {issue.articlesCount}</p>
            <div className="flex gap-2">
              <button className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                <Eye className="inline mr-2" size={16} />
                Просмотр
              </button>
              <button className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700">
                <Download className="inline mr-2" size={16} />
                Скачать
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ArchiveTab;
