import React from 'react';

// Step icons for visual clarity
const StepIcon = ({ type }) => {
  const icons = {
    reading: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    ai: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    spell: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  return icons[type] || icons.reading;
};

// Detect step type from message (3 steps per file)
const getStepInfo = (message) => {
  if (message.includes('Чтение')) {
    return { type: 'reading', label: 'Чтение файла', color: 'text-blue-600 bg-blue-100', stepNum: 1 };
  }
  if (message.includes('AI анализ')) {
    return { type: 'ai', label: 'AI анализ метаданных', color: 'text-purple-600 bg-purple-100', stepNum: 2 };
  }
  if (message.includes('Орфография')) {
    return { type: 'spell', label: 'Проверка орфографии', color: 'text-green-600 bg-green-100', stepNum: 3 };
  }
  return { type: 'reading', label: 'Обработка', color: 'text-gray-600 bg-gray-100', stepNum: 1 };
};

const STEPS_PER_FILE = 3;

// Extract filename from message
const getFileName = (message) => {
  const match = message.match(/:\s*(.+)$/);
  return match ? match[1] : '';
};

// Extract file counts from message pattern [X/Y]
const getFileCounts = (message) => {
  const match = message.match(/\[(\d+)\/(\d+)\]/);
  if (match) {
    return { currentFile: parseInt(match[1], 10), totalFiles: parseInt(match[2], 10) };
  }
  return null;
};

const LoadingOverlay = ({ message = 'Обработка...', current, total }) => {
  const hasProgress = typeof current === 'number' && typeof total === 'number' && total > 0;
  const progressPercent = hasProgress ? Math.round((current / total) * 100) : 0;
  const stepInfo = getStepInfo(message);
  const fileName = getFileName(message);
  const fileCounts = getFileCounts(message);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 text-center min-w-[360px] max-w-md">
        {/* Progress indicator */}
        {hasProgress ? (
          <div className="mb-6">
            {/* Circular progress with file count */}
            <div className="relative w-20 h-20 mx-auto mb-4">
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
                {/* Progress circle - based on files if available, otherwise steps */}
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="#4f46e5"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - (fileCounts ? fileCounts.currentFile / fileCounts.totalFiles : current / total))}`}
                  className="transition-all duration-300"
                />
              </svg>
              {/* File counter in center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-indigo-600">
                  {fileCounts ? `${fileCounts.currentFile}/${fileCounts.totalFiles}` : `${current}/${total}`}
                </span>
              </div>
            </div>

            {/* Current step badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${stepInfo.color} mb-3`}>
              <StepIcon type={stepInfo.type} />
              <span className="text-sm font-medium">{stepInfo.label}</span>
            </div>

            {/* Progress bar - shows overall step progress */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden mb-2">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-sm text-gray-500">
              {fileCounts
                ? `Шаг ${stepInfo.stepNum} из ${STEPS_PER_FILE}`
                : `${progressPercent}%`
              }
            </p>
          </div>
        ) : (
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4" />
        )}

        {/* File name being processed */}
        {fileName && (
          <p className="text-base font-medium text-gray-800 truncate max-w-[300px] mx-auto" title={fileName}>
            {fileName}
          </p>
        )}
        {!fileName && <p className="text-lg font-semibold text-gray-800">{message}</p>}
      </div>
    </div>
  );
};

export default LoadingOverlay;
