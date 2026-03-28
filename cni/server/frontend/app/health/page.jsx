'use client';

import { useState, useEffect } from 'react';
import { useAnalysisContext } from '../client-layout';
import { getHealth } from '../../lib/api';

export default function HealthPage() {
  const { repoPath, stats } = useAnalysisContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (repoPath && stats) {
      setLoading(true);
      getHealth(repoPath)
        .then(setData)
        .catch((err) => setError(err?.response?.data?.detail || err.message))
        .finally(() => setLoading(false));
    }
  }, [repoPath, stats]);

  if (!repoPath || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-cni-muted text-sm">Analyze a repository first to view health metrics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-8 h-8 border-2 border-cni-border border-t-cni-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const scoreColor = data.score > 80 ? 'text-green-400' : data.score > 50 ? 'text-yellow-400' : 'text-red-400';
  const scoreGlow = data.score > 80 ? 'shadow-green-500/20' : data.score > 50 ? 'shadow-yellow-500/20' : 'shadow-red-500/20';

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Score card */}
      <div className={`glass-card p-8 text-center shadow-2xl ${scoreGlow}`}>
        <p className="text-xs text-cni-muted uppercase tracking-widest mb-2">Codebase Health Score</p>
        <p className={`text-7xl font-extrabold ${scoreColor}`}>
          {data.score}
        </p>
        <p className="text-sm text-cni-muted mt-2">{data.total_modules} total modules analyzed</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* God modules */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-cni-text mb-3 flex items-center gap-2">
            <span className="text-red-400">⬆</span>
            God Modules
            <span className="badge-danger ml-auto">{data.god_modules?.length || 0}</span>
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {data.god_modules?.length > 0 ? (
              data.god_modules.map((mod) => (
                <div key={mod.file} className="flex items-center justify-between py-2 px-3 rounded-lg bg-cni-bg/50">
                  <span className="text-xs font-mono text-cni-text">{mod.file}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-cni-muted">in-deg: {mod.value}</span>
                    <span className={mod.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}>
                      {mod.severity}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-cni-muted py-2">No god modules detected ✓</p>
            )}
          </div>
        </div>

        {/* Coupled modules */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-cni-text mb-3 flex items-center gap-2">
            <span className="text-yellow-400">⬇</span>
            Coupled Modules
            <span className="badge-warning ml-auto">{data.coupled_modules?.length || 0}</span>
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {data.coupled_modules?.length > 0 ? (
              data.coupled_modules.map((mod) => (
                <div key={mod.file} className="flex items-center justify-between py-2 px-3 rounded-lg bg-cni-bg/50">
                  <span className="text-xs font-mono text-cni-text">{mod.file}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-cni-muted">out-deg: {mod.value}</span>
                    <span className={mod.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}>
                      {mod.severity}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-cni-muted py-2">No coupled modules detected ✓</p>
            )}
          </div>
        </div>
      </div>

      {/* Isolated count */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-cni-text">Isolated Modules</h3>
            <p className="text-xs text-cni-muted mt-1">Files with no imports and no importers (potential dead code)</p>
          </div>
          <p className="text-3xl font-bold text-amber-400">{data.isolated_count}</p>
        </div>
      </div>
    </div>
  );
}
