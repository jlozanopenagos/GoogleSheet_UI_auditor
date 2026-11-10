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
      className={`flex items-start justify-between gap-3 p-4 rounded-2xl border shadow-xl transition-all duration-200 ${
        isSuccess
          ? 'bg-brand-surface/95 border-brand-amethyst/60 text-brand-ice shadow-brand-amethyst/20'
          : 'bg-brand-wine/90 border-brand-mulberry text-rose-200 shadow-brand-mulberry/30'
      }`}
    >
      <div className="flex items-center gap-3">
        {isSuccess ? (
          <CheckCircle2 className="w-5 h-5 text-brand-sky shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 text-rose-300 shrink-0" />
        )}
        <p className="text-sm font-semibold">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="text-brand-ice/50 hover:text-white p-1 rounded-lg transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

