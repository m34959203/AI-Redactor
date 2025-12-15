import React from 'react';
import { AlertCircle, X } from 'lucide-react';

const SpellCheckTab = ({ spellCheckResults }) => {
  if (spellCheckResults.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          Результаты проверки орфографии
        </h2>
        <div className="text-center py-12 text-gray-500">
          <AlertCircle className="mx-auto mb-4 text-gray-400" size={48} />
          <p>Загрузите статьи для проверки орфографии</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Результаты проверки орфографии
      </h2>

      <div className="space-y-6">
        {spellCheckResults.map((result, idx) => (
          <div key={idx} className="border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{result.fileName}</h3>
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
