import React from 'react';
import { AlertCircle } from 'lucide-react';

const Alert = ({ type = 'info', title, children }) => {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  };

  const iconColors = {
    info: 'text-blue-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
    success: 'text-green-600',
  };

  return (
    <div className={`${styles[type]} border rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <AlertCircle className={`${iconColors[type]} flex-shrink-0 mt-1`} size={20} />
        <div className="text-sm">
          {title && <p className="font-semibold mb-1">{title}</p>}
          {children}
        </div>
      </div>
    </div>
  );
};

export default Alert;
