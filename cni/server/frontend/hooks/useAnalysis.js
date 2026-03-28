'use client';

import { useState, useCallback } from 'react';
import { analyzeRepo, getHealth } from '../lib/api';

/**
 * Shared analysis state — repo path, stats, loading.
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

      // Also fetch health in parallel
      try {
        const health = await getHealth(path);
        setHealthData(health);
      } catch {
        // Health is optional
      }
    } catch (err) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { repoPath, setRepoPath, stats, healthData, loading, error, analyze };
}
