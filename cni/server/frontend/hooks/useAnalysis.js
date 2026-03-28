'use client';

import { useAppContext } from '../context/AppContext';

/**
 * Thin wrapper around AppContext for analysis state.
 * Backward-compatible API surface.
 */
export function useAnalysis() {
  const ctx = useAppContext();
  return {
    repoPath: ctx.repoPath,
    setRepoPath: ctx.setRepoPath,
    stats: ctx.stats,
    healthData: ctx.healthData,
    loading: ctx.loading,
    error: ctx.error,
    analyze: ctx.analyze,
    isAnalyzed: ctx.isAnalyzed,
  };
}
