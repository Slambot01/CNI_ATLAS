'use client';

import { useAppContext } from '../context/AppContext';

/**
 * Thin wrapper around AppContext for graph data.
 * Returns the same API as the old standalone hook.
 */
export function useGraph() {
  const ctx = useAppContext();
  return {
    graphData: ctx.graphData,
    loading: ctx.graphLoading,
    error: ctx.graphError,
    notAnalyzed: ctx.graphNotAnalyzed,
    fetchGraph: ctx.fetchGraph,
  };
}
