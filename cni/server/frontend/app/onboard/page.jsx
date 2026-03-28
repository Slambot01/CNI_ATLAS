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
      getOnboard(repoPath).then(setData).catch((err) => setError(err?.response?.data?.detail || err.message)).finally(() => setLoading(false));
    }
  }, [repoPath, stats]);

  if (!repoPath || !stats) return <div className="flex items-center justify-center min-h-[75vh]"><p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Analyze a repository first to generate an onboarding report.</p></div>;
  if (loading) return <div className="flex items-center justify-center min-h-[75vh]"><div className="text-center space-y-3"><div className="w-8 h-8 mx-auto border-2 rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} /><p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Generating onboarding report…</p></div></div>;
  if (error) return <div className="p-6"><div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>{error}</div></div>;
  if (!data) return null;

  const maxCentrality = Math.max(...(data.critical_modules?.map((m) => m.centrality) || [1]), 0.01);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-lg font-bold" style={{ color: 'var(--cni-text)' }}>Onboarding Report</h2>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--cni-text)' }}>
          Entry Points <span className="badge-success">{data.entry_points?.length || 0}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {data.entry_points?.slice(0, 20).map((ep) => (
            <span key={ep} className="badge-info font-mono">{ep.split(/[/\\]/).pop()}</span>
          ))}
          {(!data.entry_points || data.entry_points.length === 0) && <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>No entry points detected.</p>}
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--cni-text)' }}>
          Critical Modules <span className="text-xs font-normal ml-1" style={{ color: 'var(--cni-muted)' }}>(read these first)</span>
        </h3>
        <div className="space-y-3">
          {data.critical_modules?.map((mod, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-5 text-right" style={{ color: 'var(--cni-muted)' }}>{i + 1}.</span>
                  <span className="text-sm font-mono" style={{ color: 'var(--cni-text)' }}>{mod.name}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>{mod.centrality.toFixed(2)}</span>
              </div>
              <div className="ml-7 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cni-bg)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(mod.centrality / maxCentrality) * 100}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.dead_modules?.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--cni-text)' }}>
            Dead Modules <span className="badge-warning">{data.dead_modules.length}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.dead_modules.slice(0, 20).map((dm) => <span key={dm} className="badge-warning font-mono">{dm}</span>)}
          </div>
        </div>
      )}

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--cni-text)' }}>Architecture Summary</h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(226, 232, 240, 0.8)' }}>{data.summary}</p>
      </div>
    </div>
  );
}
