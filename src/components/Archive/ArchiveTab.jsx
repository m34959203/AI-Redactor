import React from 'react';
import { FileText, Eye, Download, Trash2, Calendar } from 'lucide-react';
import { getMonthName } from '../../utils/archiveStorage';

const ArchiveTab = ({ archive, onDownload, onView, onDelete }) => {
  if (archive.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Архив выпусков</h2>
        <div className="text-center py-12 text-gray-500">
          <FileText className="mx-auto mb-4 text-gray-400" size={48} />
          <p>Архив пуст. Создайте первый выпуск!</p>
          <p className="text-sm mt-2 text-gray-400">
            Сгенерированные PDF сохраняются автоматически
          </p>
        </div>
      </div>
    );
  }

  // Group archive by year and month
  const groupedArchive = {};
  archive.forEach(issue => {
    const year = issue.year || new Date().getFullYear();
    const month = issue.month || new Date().getMonth() + 1;

    if (!groupedArchive[year]) {
      groupedArchive[year] = {};
    }
    if (!groupedArchive[year][month]) {
      groupedArchive[year][month] = [];
    }
    groupedArchive[year][month].push(issue);
  });

  const years = Object.keys(groupedArchive).sort((a, b) => b - a);

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Архив выпусков</h2>

      <div className="space-y-8">
        {years.map(year => (
          <div key={year}>
            <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Calendar className="text-indigo-600" size={24} />
              {year} год
            </h3>

            {Object.keys(groupedArchive[year])
              .sort((a, b) => b - a)
              .map(month => (
                <div key={`${year}-${month}`} className="ml-4 mb-6">
                  <h4 className="text-lg font-medium text-gray-600 mb-3">
                    {getMonthName(parseInt(month))}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedArchive[year][month].map((issue) => (
                      <div
                        key={issue.id}
                        className="border border-gray-200 rounded-xl p-5 hover:shadow-lg transition bg-gradient-to-br from-white to-gray-50"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <FileText className="text-indigo-600" size={28} />
                          <span className="text-sm text-gray-500">{issue.date}</span>
                        </div>

                        <h5 className="text-lg font-semibold mb-2 text-gray-800">
                          {issue.name}
                        </h5>

                        <div className="text-sm text-gray-600 mb-4 space-y-1">
                          <p>Статей: {issue.articlesCount}</p>
                          {issue.hasPdf && (
                            <p className="text-green-600 flex items-center gap-1">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              PDF сохранён
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => onView(issue.id)}
                            className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition text-sm flex items-center justify-center gap-1"
                            title="Открыть в новой вкладке"
                          >
                            <Eye size={16} />
                            Просмотр
                          </button>
                          <button
                            onClick={() => onDownload(issue.id)}
                            className="flex-1 bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition text-sm flex items-center justify-center gap-1"
                            title="Скачать PDF"
                          >
                            <Download size={16} />
                            Скачать
                          </button>
                          <button
                            onClick={() => onDelete(issue.id)}
                            className="bg-red-100 text-red-600 px-3 py-2 rounded-lg hover:bg-red-200 transition"
                            title="Удалить из архива"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {issue.articles && issue.articles.length > 0 && (
                          <details className="mt-4">
                            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                              Показать содержание
                            </summary>
                            <ul className="mt-2 text-sm text-gray-600 space-y-1 pl-4">
                              {issue.articles.slice(0, 5).map((article, idx) => (
                                <li key={article.id} className="truncate">
                                  {idx + 1}. {article.title}
                                </li>
                              ))}
                              {issue.articles.length > 5 && (
                                <li className="text-gray-400">
                                  ... и ещё {issue.articles.length - 5} статей
                                </li>
                              )}
                            </ul>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-xl text-sm text-blue-700">
        <p className="font-semibold mb-1">Информация о хранении:</p>
        <p>PDF файлы сохраняются в локальном хранилище браузера (IndexedDB).
           Они доступны даже после перезагрузки страницы, но будут удалены
           при очистке данных браузера.</p>
      </div>
    </div>
  );
};

export default ArchiveTab;
