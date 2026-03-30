'use client';

import { FolderOpen } from 'lucide-react';

/**
 * Empty state shown when no repo has been analyzed yet.
 * Centered layout with icon, title, subtitle, and a "Go to Dashboard" link.
 */
export default function NotAnalyzed() {
  return (
    <div className="flex items-center justify-center min-h-[70vh] animate-fade-in">
      <div className="text-center space-y-5 max-w-sm">
        <FolderOpen size={48} style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
        <div>
          <h2 className="text-lg font-semibold mb-1.5" style={{ color: 'white' }}>
            No Repository Analyzed
          </h2>
          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
            Analyze a repository first to see data here.
          </p>
        </div>
        <a href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold transition-all duration-200"
          style={{
            background: '#22c55e',
            color: '#000',
            borderRadius: 10,
            padding: '10px 20px',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(34, 197, 94, 0.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
