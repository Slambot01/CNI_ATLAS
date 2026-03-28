'use client';

import { useState, useCallback } from 'react';
import { analyzeRepo, getHealth } from '../lib/api';

/**
 * Shared analysis state — repo path, stats, loading, error.
 * Used by the top bar, stats bar, and multiple pages.
 */
export function useAnalysis() {
  const [repoPath, setRepoPath] = useState('');
  const [stats, setStats] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyze = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    try {
      const data = await analyzeRepo(path);
      setStats(data);
      setRepoPath(path);

      // Also fetch health in parallel (non-blocking)
      getHealth(path)
        .then((health) => {
          if (!health?.error) setHealthData(health);
        })
        .catch(() => {});
    } catch (err) {
      // err is now our structured { error, message, hint } from api.js
      setError({
        message: err?.message || 'Analysis failed',
        hint: err?.hint || '',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  return { repoPath, setRepoPath, stats, healthData, loading, error, analyze };
}
