'use client';

import { useState, useEffect } from 'react';
import { useAnalysisContext } from '../client-layout';
import { getImpact } from '../../lib/api';

export default function ImpactPage() {
  const { repoPath, stats } = useAnalysisContext();
  const [file, setFile] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Read initial file from URL hash (#file=xxx) on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const f = params.get('file');
      if (f) setFile(f);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!file.trim() || !repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getImpact(file.trim(), repoPath);
      setData(result);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (!repoPath || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-cni-muted text-sm">Analyze a repository first to run impact analysis.</p>
      </div>
    );
  }

  const riskColors = {
    HIGH: 'badge-danger',
    MEDIUM: 'badge-warning',
    LOW: 'badge-success',
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Search */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-cni-text mb-3">Impact Analysis</h2>
        <p className="text-xs text-cni-muted mb-4">Analyze the blast radius of modifying a file.</p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter filename (e.g. cache.py)"
            className="input-field flex-1 text-sm"
            value={file}
            onChange={(e) => setFile(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          />
          <button
            className="btn-primary text-sm disabled:opacity-50"
            onClick={handleAnalyze}
            disabled={loading || !file.trim()}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </span>
            ) : '⚡ Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4 animate-slide-up">
          {/* Risk + counts */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card p-5 text-center">
              <p className="text-xs text-cni-muted mb-2">Risk Level</p>
              <span className={`${riskColors[data.risk] || 'badge-info'} text-lg px-4 py-1`}>
                {data.risk}
              </span>
            </div>
            <div className="glass-card p-5 text-center">
              <p className="text-xs text-cni-muted mb-1">Direct Dependents</p>
              <p className="text-3xl font-bold text-indigo-400">{data.direct}</p>
            </div>
            <div className="glass-card p-5 text-center">
              <p className="text-xs text-cni-muted mb-1">Transitive Dependents</p>
              <p className="text-3xl font-bold text-cyan-400">{data.transitive}</p>
            </div>
          </div>

          {/* Dependents list */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-cni-text mb-3">
              Critical Dependents (ranked by score)
            </h3>
            <div className="space-y-2">
              {data.dependents?.length > 0 ? (
                data.dependents.map((dep, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-cni-bg/50">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-cni-muted w-5 text-right">{i + 1}.</span>
                      <span className="text-xs font-mono text-cni-text">{dep.file}</span>
                    </div>
                    <span className="badge-info">{dep.score.toFixed(1)}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-cni-muted py-2">No dependents found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
