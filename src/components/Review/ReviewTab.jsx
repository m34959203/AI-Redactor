import React from 'react';
import { Eye, Download } from 'lucide-react';

const ReviewTab = ({ articles, reviewResult, onReviewArticle }) => {
  if (articles.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Модуль рецензирования</h2>
        <div className="text-center py-12 text-gray-500">
          <Eye className="mx-auto mb-4 text-gray-400" size={48} />
          <p>Загрузите статьи для рецензирования</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Модуль рецензирования</h2>

      <div className="space-y-6">
        <div className="border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Выберите статью для рецензии</h3>
          <select
            onChange={(e) => {
              const article = articles.find((a) => a.id.toString() === e.target.value);
              if (article) onReviewArticle(article.content, article.file.name);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            defaultValue=""
          >
            <option value="" disabled>
              Выберите статью...
            </option>
            {articles.map((article) => (
              <option key={article.id} value={article.id}>
                {article.title} - {article.author}
              </option>
            ))}
          </select>
        </div>

        {reviewResult && (
          <div className="border border-gray-200 rounded-xl p-6">
            <h3 className="text-xl font-bold mb-4">Рецензия: {reviewResult.fileName}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {[
                { key: 'structure', label: 'Структура' },
                { key: 'logic', label: 'Логичность' },
                { key: 'originality', label: 'Оригинальность' },
                { key: 'style', label: 'Стиль' },
                { key: 'relevance', label: 'Актуальность' },
              ].map(({ key, label }) => (
                <div key={key} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">{label}</span>
                    <span className="text-2xl font-bold text-indigo-600">
                      {reviewResult[key]?.score}/5
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{reviewResult[key]?.comment}</p>
                </div>
              ))}
            </div>

            <div className="bg-indigo-50 p-6 rounded-xl mb-4">
              <div className="text-center mb-4">
                <span className="text-sm text-gray-600">Общая оценка</span>
                <div className="text-4xl font-bold text-indigo-600">
                  {reviewResult.overallScore}/5
                </div>
              </div>
              <p className="text-gray-700">
                <strong>Вывод:</strong> {reviewResult.summary}
              </p>
            </div>

            {reviewResult.recommendations && (
              <div className="bg-yellow-50 p-6 rounded-xl">
                <h4 className="font-semibold mb-3">Рекомендации:</h4>
                <ul className="list-disc list-inside space-y-2">
                  {reviewResult.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-gray-700">
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => alert('Функция экспорта в разработке')}
              className="mt-6 w-full bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700"
            >
              <Download className="inline mr-2" size={20} />
              Экспортировать рецензию в PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewTab;
