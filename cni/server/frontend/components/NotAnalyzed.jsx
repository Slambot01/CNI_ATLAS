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
        <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(100, 116, 139, 0.1)', border: '1px solid var(--cni-border)' }}>
          <FolderOpen size={28} style={{ color: 'var(--cni-muted)' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--cni-text)' }}>
            No Repository Analyzed
          </h2>
          <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>
            Analyze a repository first to see data here.
          </p>
        </div>
        <a href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: 'white',
            boxShadow: '0 4px 16px rgba(59, 130, 246, 0.25)',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(59, 130, 246, 0.35)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.25)'; }}>
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
