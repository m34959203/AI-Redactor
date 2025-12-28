import React from 'react';
import { AlertTriangle, Clock, ExternalLink, X } from 'lucide-react';

/**
 * Big banner notification when AI provider limits are exhausted
 */
const LimitExhaustedBanner = ({ isVisible, onDismiss, message }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header with warning color */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-full p-2">
              <AlertTriangle className="text-white" size={28} />
            </div>
            <h2 className="text-xl font-bold text-white">Лимиты AI исчерпаны</h2>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-gray-700 dark:text-gray-300 text-lg">
            {message || 'Дневной лимит бесплатных AI-моделей достигнут.'}
          </p>

          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Clock className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">Когда восстановятся лимиты?</p>
                <ul className="mt-2 text-sm text-amber-700 dark:text-amber-400 space-y-1">
                  <li>• <strong>Gemini:</strong> ~1000 запросов/день (сброс в полночь UTC)</li>
                  <li>• <strong>Groq:</strong> 12K токенов/минуту (сброс каждую минуту)</li>
                  <li>• <strong>OpenRouter:</strong> 200 запросов/день</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
            <p className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Что делать?</p>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-blue-500">1.</span>
                <span>Подождите несколько минут и попробуйте снова</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500">2.</span>
                <span>Редактируйте статьи вручную без AI-классификации</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500">3.</span>
                <span>Обновите до платного тарифа для неограниченного доступа</span>
              </li>
            </ul>
          </div>

          {/* Links to upgrade */}
          <div className="flex flex-wrap gap-2 pt-2">
            <a
              href="https://console.groq.com/settings/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ExternalLink size={14} />
              Groq Pro
            </a>
            <a
              href="https://ai.google.dev/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ExternalLink size={14} />
              Gemini Pro
            </a>
            <a
              href="https://openrouter.ai/credits"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ExternalLink size={14} />
              OpenRouter Credits
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onDismiss}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};

export default LimitExhaustedBanner;
