'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Reusable error display component.
 *
 * @param {string}   message  — What went wrong.
 * @param {string}   [hint]   — How to fix it.
 * @param {function} [onRetry] — Optional retry callback; renders a retry button.
 */
export default function ErrorMessage({ message, hint, onRetry }) {
  return (
    <div className="rounded-xl overflow-hidden animate-fade-in" style={{
      background: 'rgba(239, 68, 68, 0.06)',
      border: '1px solid rgba(239, 68, 68, 0.18)',
      borderLeft: '3px solid #f87171',
    }}>
      <div className="px-5 py-4 flex items-start gap-3">
        <AlertCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>{message}</p>
          {hint && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--cni-muted)' }}>{hint}</p>
          )}
        </div>
        {onRetry && (
          <button onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex-shrink-0"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#f87171',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}>
            <RefreshCw size={12} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
