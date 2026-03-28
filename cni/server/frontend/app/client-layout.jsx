'use client';

import { createContext, useContext } from 'react';
import Sidebar from '../components/Sidebar';
import StatsBar from '../components/StatsBar';
import AppContextProvider, { useAppContext } from '../context/AppContext';

/**
 * Re-export useAppContext as useAnalysisContext for backward compatibility.
 * Every page/component that previously used useAnalysisContext() will
 * now read from the global AppContext — no import changes needed.
 */
export function useAnalysisContext() {
  return useAppContext();
}

function LayoutShell({ children }) {
  const ctx = useAppContext();

  return (
    <>
      <Sidebar repoPath={ctx.repoPath} isAnalyzed={ctx.isAnalyzed} />
      {/* Top bar */}
      <header className="fixed top-0 left-16 right-0 h-14 flex items-center gap-3 px-5 z-30"
        style={{ background: 'rgba(6, 10, 19, 0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--cni-border)' }}>
        <span className="text-sm font-bold mr-2" style={{ background: 'linear-gradient(135deg, #3b82f6, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          CNI
        </span>
        <input
          type="text"
          placeholder="Enter repository path (e.g. /path/to/project)"
          className="input-field flex-1 h-9 text-sm"
          value={ctx.repoPath}
          onChange={(e) => ctx.setRepoPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ctx.repoPath.trim()) ctx.analyze(ctx.repoPath.trim()); }}
        />
        <button
          className="btn-primary h-9 px-5 text-sm disabled:opacity-50"
          disabled={ctx.loading || !ctx.repoPath.trim()}
          onClick={() => ctx.analyze(ctx.repoPath.trim())}
        >
          {ctx.loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing…
            </span>
          ) : 'Analyze'}
        </button>
      </header>

      {/* Main content */}
      <main className="ml-16 mt-14 mb-9 min-h-[calc(100vh-5.75rem)]">
        {/* Auto-recovery indicator */}
        {ctx.recovering && (
          <div className="mx-5 mt-4 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2.5 animate-fade-in"
            style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
            <span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            Re-connecting to server…
          </div>
        )}
        {ctx.error && (
          <div className="mx-5 mt-4 px-4 py-3 rounded-xl text-sm animate-fade-in"
            style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
            {ctx.error.message || ctx.error}
          </div>
        )}
        {children}
      </main>

      <StatsBar stats={ctx.stats} healthData={ctx.healthData} />
    </>
  );
}

export default function ClientLayout({ children }) {
  return (
    <AppContextProvider>
      <LayoutShell>{children}</LayoutShell>
    </AppContextProvider>
  );
}
