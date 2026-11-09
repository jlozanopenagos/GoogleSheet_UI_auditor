import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface NotificationToastProps {
  type: 'success' | 'error';
  message: string;
  onClose: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ type, message, onClose }) => {
  if (!message) return null;

  const isSuccess = type === 'success';

  return (
    <div
      className={`flex items-start justify-between gap-3 p-4 rounded-xl border shadow-xl transition-all duration-200 ${
        isSuccess
          ? 'bg-emerald-950/80 border-emerald-600/50 text-emerald-200'
          : 'bg-rose-950/80 border-rose-600/50 text-rose-200'
      }`}
    >
      <div className="flex items-center gap-3">
        {isSuccess ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
        )}
        <p className="text-sm font-semibold">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
