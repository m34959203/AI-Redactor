import React from 'react';
import { AlertCircle, X, Check, CheckCheck, FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const SpellCheckTab = ({ articles, spellCheckResults, onSpellCheck }) => {
  const { actions } = useApp();

  const handleFixError = (fileName, errorIndex, word, suggestion) => {
    actions.fixSpellingError(fileName, errorIndex, word, suggestion);
    actions.showSuccess(`Исправлено: "${word}" → "${suggestion}"`);
  };

  const handleFixAllErrors = (result) => {
    // Fix all errors in reverse order to maintain correct indices
    const errors = [...result.errors];
    errors.forEach((error, idx) => {
      // We use index 0 each time because after each fix, the array shifts
      actions.fixSpellingError(result.fileName, 0, error.word, error.suggestion);
    });
    actions.showSuccess(`Исправлено ${errors.length} ошибок в файле "${result.fileName}"`);
  };

  // Render article selection dropdown
  const renderArticleSelector = () => (
    <div className="border border-gray-200 rounded-xl p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <FileText className="text-indigo-600" size={20} />
        Выберите статью для проверки орфографии
      </h3>
      {articles.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <AlertCircle className="mx-auto mb-2 text-gray-400" size={32} />
          <p>Сначала загрузите статьи во вкладке "Редактор"</p>
        </div>
      ) : (
        <>
          <select
            onChange={(e) => {
              const article = articles.find((a) => a.id.toString() === e.target.value);
              if (article) onSpellCheck(article.content, article.file.name);
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
            AI проверит орфографию на русском, казахском и английском языках
          </p>
        </>
      )}
    </div>
  );

  if (spellCheckResults.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          Результаты проверки орфографии
        </h2>
        {renderArticleSelector()}
        <div className="text-center py-12 text-gray-500">
          <AlertCircle className="mx-auto mb-4 text-gray-400" size={48} />
          <p>Выберите статью для проверки орфографии</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Результаты проверки орфографии
      </h2>

      {renderArticleSelector()}

      <div className="space-y-6">
        {spellCheckResults.map((result, idx) => (
          <div key={idx} className="border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{result.fileName}</h3>
              <div className="flex items-center gap-3">
                {result.errors && result.errors.length > 0 && (
                  <button
                    onClick={() => handleFixAllErrors(result)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <CheckCheck size={16} />
                    Исправить все
                  </button>
                )}
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    result.totalErrors === 0
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {result.totalErrors === 0
                    ? 'Ошибок не найдено'
                    : `Найдено ошибок: ${result.totalErrors}`}
                </span>
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="space-y-2">
                {result.errors.map((error, errIdx) => (
                  <div key={errIdx} className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-start gap-3">
                      <X className="text-red-500 flex-shrink-0 mt-1" size={18} />
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">
                          <span className="text-red-600">{error.word}</span>
                          {' → '}
                          <span className="text-green-600">{error.suggestion}</span>
                        </p>
                        <p className="text-sm text-gray-600 mt-1">{error.context}</p>
                      </div>
                      <button
                        onClick={() => handleFixError(result.fileName, errIdx, error.word, error.suggestion)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                      >
                        <Check size={16} />
                        Исправить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpellCheckTab;
