'use client';

import { createContext, useContext } from 'react';
import Sidebar from '../components/Sidebar';
import StatsBar from '../components/StatsBar';
import { useAnalysis } from '../hooks/useAnalysis';

const AnalysisContext = createContext(null);

export function useAnalysisContext() {
  return useContext(AnalysisContext);
}

export default function ClientLayout({ children }) {
  const analysis = useAnalysis();

  return (
    <AnalysisContext.Provider value={analysis}>
      <Sidebar />
      {/* Top bar */}
      <header className="fixed top-0 left-56 right-0 h-14 bg-cni-surface/80 backdrop-blur-xl border-b border-cni-border flex items-center gap-3 px-5 z-30">
        <span className="text-sm font-semibold text-cni-accent mr-2">CNI</span>
        <input
          type="text"
          placeholder="Enter repository path (e.g. /path/to/project)"
          className="input-field flex-1 text-sm h-9"
          value={analysis.repoPath}
          onChange={(e) => analysis.setRepoPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && analysis.repoPath.trim()) {
              analysis.analyze(analysis.repoPath.trim());
            }
          }}
        />
        <button
          className="btn-primary text-sm h-9 px-5 disabled:opacity-50"
          disabled={analysis.loading || !analysis.repoPath.trim()}
          onClick={() => analysis.analyze(analysis.repoPath.trim())}
        >
          {analysis.loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing…
            </span>
          ) : 'Analyze'}
        </button>
      </header>

      {/* Main content */}
      <main className="ml-56 mt-14 mb-10 min-h-[calc(100vh-6rem)]">
        {analysis.error && (
          <div className="mx-5 mt-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm animate-fade-in">
            {analysis.error}
          </div>
        )}
        {children}
      </main>

      <StatsBar stats={analysis.stats} healthData={analysis.healthData} />
    </AnalysisContext.Provider>
  );
}
