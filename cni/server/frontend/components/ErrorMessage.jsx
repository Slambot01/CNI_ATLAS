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
    <div
      className="animate-fade-in"
      style={{
        background: 'var(--danger-muted)',
        borderLeft: '3px solid var(--danger)',
        borderRadius: 14,
        padding: 0,
      }}
    >
      <div className="flex items-start gap-3" style={{ padding: '16px 20px' }}>
        <AlertCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>{message}</p>
          {hint && (
            <p className="text-sm mt-1.5" style={{ color: 'var(--text-secondary)' }}>{hint}</p>
          )}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 text-xs font-medium transition-all duration-200 flex-shrink-0"
            style={{
              padding: '6px 14px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
          >
            <RefreshCw size={12} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
