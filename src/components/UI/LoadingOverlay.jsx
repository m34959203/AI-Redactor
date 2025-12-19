import React from 'react';

const LoadingOverlay = ({ message = 'Обработка...', current, total }) => {
  const hasProgress = typeof current === 'number' && typeof total === 'number' && total > 0;
  const progressPercent = hasProgress ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 text-center min-w-[320px] max-w-md">
        {/* Progress indicator */}
        {hasProgress ? (
          <div className="mb-6">
            {/* Circular progress with count */}
            <div className="relative w-20 h-20 mx-auto mb-3">
              <svg className="w-20 h-20 transform -rotate-90">
                {/* Background circle */}
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="#e5e7eb"
                  strokeWidth="6"
                  fill="none"
                />
                {/* Progress circle */}
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="#4f46e5"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - current / total)}`}
                  className="transition-all duration-300"
                />
              </svg>
              {/* Counter in center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-indigo-600">
                  {current}/{total}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">{progressPercent}% завершено</p>
          </div>
        ) : (
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4" />
        )}

        <p className="text-lg font-semibold text-gray-800">{message}</p>
      </div>
    </div>
  );
};

export default LoadingOverlay;
