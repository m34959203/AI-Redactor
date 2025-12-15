import React from 'react';

const LoadingOverlay = ({ message = 'Обработка...' }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-lg font-semibold">{message}</p>
      </div>
    </div>
  );
};

export default LoadingOverlay;
