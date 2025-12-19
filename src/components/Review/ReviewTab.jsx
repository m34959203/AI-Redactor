import React from 'react';
import { Eye, Download, FileText } from 'lucide-react';
import { generateReviewPDF, downloadPDF } from '../../utils/pdfGenerator';

const ReviewTab = ({ articles, reviewResult, onReviewArticle }) => {
  const handleExportPDF = () => {
    if (!reviewResult) return;

    try {
      const pdfBlob = generateReviewPDF(reviewResult);
      const fileName = `review_${reviewResult.fileName.replace(/\.[^/.]+$/, '')}_${new Date().toISOString().split('T')[0]}.pdf`;
      downloadPDF(pdfBlob, fileName);
    } catch (error) {
      console.error('Error exporting review:', error);
      alert('Ошибка при экспорте рецензии в PDF');
    }
  };

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

  const getScoreColor = (score) => {
    if (score >= 4) return 'text-green-600';
    if (score >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score) => {
    if (score >= 4) return 'bg-green-50';
    if (score >= 3) return 'bg-yellow-50';
    return 'bg-red-50';
  };

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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
          <p className="text-sm text-gray-500 mt-2">
            AI проанализирует статью по 5 критериям: структура, логика, оригинальность, стиль, актуальность
          </p>
        </div>

        {reviewResult && (
          <div className="border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileText className="text-indigo-600" size={24} />
                Рецензия: {reviewResult.fileName}
              </h3>
              <span className="text-sm text-gray-500">
                {new Date().toLocaleDateString('ru-RU')}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {[
                { key: 'structure', label: 'Структура', icon: '📋' },
                { key: 'logic', label: 'Логичность', icon: '🧠' },
                { key: 'originality', label: 'Оригинальность', icon: '💡' },
                { key: 'style', label: 'Стиль', icon: '✍️' },
                { key: 'relevance', label: 'Актуальность', icon: '📅' },
              ].map(({ key, label, icon }) => {
                const score = reviewResult[key]?.score || 0;
                return (
                  <div
                    key={key}
                    className={`p-4 rounded-xl ${getScoreBg(score)} border border-gray-100`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold flex items-center gap-2">
                        <span>{icon}</span>
                        {label}
                      </span>
                      <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
                        {score}/5
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{reviewResult[key]?.comment}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl mb-6">
              <div className="text-center mb-4">
                <span className="text-sm text-gray-600 uppercase tracking-wide">
                  Общая оценка
                </span>
                <div className={`text-5xl font-bold ${getScoreColor(reviewResult.overallScore)}`}>
                  {reviewResult.overallScore?.toFixed(1) || reviewResult.overallScore}/5
                </div>
              </div>
              <div className="border-t border-indigo-200 pt-4">
                <p className="text-gray-700">
                  <strong>Заключение:</strong> {reviewResult.summary}
                </p>
              </div>
            </div>

            {reviewResult.recommendations && reviewResult.recommendations.length > 0 && (
              <div className="bg-amber-50 p-6 rounded-xl mb-6 border border-amber-200">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <span>📝</span>
                  Рекомендации по улучшению:
                </h4>
                <ul className="space-y-2">
                  {reviewResult.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-gray-700">
                      <span className="text-amber-600 font-bold">{idx + 1}.</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleExportPDF}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition font-semibold shadow-lg flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Экспортировать рецензию в PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewTab;
