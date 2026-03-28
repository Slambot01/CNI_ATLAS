'use client';

import { useState, useEffect } from 'react';
import { useAnalysisContext } from '../client-layout';
import { getOnboard } from '../../lib/api';

export default function OnboardPage() {
  const { repoPath, stats } = useAnalysisContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (repoPath && stats) {
      setLoading(true);
      getOnboard(repoPath)
        .then(setData)
        .catch((err) => setError(err?.response?.data?.detail || err.message))
        .finally(() => setLoading(false));
    }
  }, [repoPath, stats]);

  if (!repoPath || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-cni-muted text-sm">Analyze a repository first to generate an onboarding report.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-cni-border border-t-cni-accent rounded-full animate-spin" />
          <p className="text-sm text-cni-muted">Generating onboarding report…</p>
        </div>
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

  const maxCentrality = Math.max(...(data.critical_modules?.map((m) => m.centrality) || [1]), 0.01);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-lg font-bold text-cni-text">Onboarding Report</h2>

      {/* Entry points */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-cni-text mb-3 flex items-center gap-2">
          Entry Points
          <span className="badge-success">{data.entry_points?.length || 0}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {data.entry_points?.slice(0, 20).map((ep) => {
            const name = ep.split(/[/\\]/).pop();
            return (
              <span key={ep} className="badge-info font-mono">{name}</span>
            );
          })}
          {(!data.entry_points || data.entry_points.length === 0) && (
            <p className="text-xs text-cni-muted">No entry points detected.</p>
          )}
        </div>
      </div>

      {/* Critical modules */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-cni-text mb-4">
          Critical Modules <span className="text-cni-muted font-normal text-xs ml-1">(read these first)</span>
        </h3>
        <div className="space-y-3">
          {data.critical_modules?.map((mod, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-cni-muted w-5 text-right">{i + 1}.</span>
                  <span className="text-sm font-mono text-cni-text">{mod.name}</span>
                </div>
                <span className="text-xs text-cni-muted">{mod.centrality.toFixed(2)}</span>
              </div>
              <div className="ml-7 h-1.5 bg-cni-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cni-accent to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${(mod.centrality / maxCentrality) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dead modules */}
      {data.dead_modules?.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-cni-text mb-3 flex items-center gap-2">
            Dead Modules
            <span className="badge-warning">{data.dead_modules.length}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.dead_modules.slice(0, 20).map((dm) => (
              <span key={dm} className="badge-warning font-mono">{dm}</span>
            ))}
          </div>
        </div>
      )}

      {/* Architecture summary */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-cni-text mb-3">Architecture Summary</h3>
        <div className="prose prose-invert prose-sm max-w-none">
          <p className="text-sm text-cni-text/80 leading-relaxed whitespace-pre-wrap">
            {data.summary}
          </p>
        </div>
      </div>
    </div>
  );
}
