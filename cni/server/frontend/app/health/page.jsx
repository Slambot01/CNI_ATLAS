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
      getHealth(repoPath).then(setData).catch((err) => setError(err?.response?.data?.detail || err.message)).finally(() => setLoading(false));
    }
  }, [repoPath, stats]);

  if (!repoPath || !stats) return <div className="flex items-center justify-center min-h-[75vh]"><p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Analyze a repository first to view health metrics.</p></div>;
  if (loading) return <div className="flex items-center justify-center min-h-[75vh]"><div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} /></div>;
  if (error) return <div className="p-6"><div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>{error}</div></div>;
  if (!data) return null;

  const scoreColor = data.score > 80 ? '#4ade80' : data.score > 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Score */}
      <div className="glass-card p-8 text-center" style={{ boxShadow: `0 0 40px ${scoreColor}15` }}>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--cni-muted)' }}>Codebase Health Score</p>
        <p className="text-7xl font-extrabold" style={{ color: scoreColor }}>{data.score}</p>
        <p className="text-sm mt-2" style={{ color: 'var(--cni-muted)' }}>{data.total_modules} total modules analyzed</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* God modules */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--cni-text)' }}>
            <span style={{ color: '#f87171' }}>⬆</span> God Modules
            <span className="badge-danger ml-auto">{data.god_modules?.length || 0}</span>
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {data.god_modules?.length > 0 ? data.god_modules.map((mod) => (
              <div key={mod.file} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'var(--cni-bg)' }}>
                <span className="text-xs font-mono" style={{ color: 'var(--cni-text)' }}>{mod.file}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>in: {mod.value}</span>
                  <span className={mod.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}>{mod.severity}</span>
                </div>
              </div>
            )) : <p className="text-xs py-2" style={{ color: 'var(--cni-muted)' }}>No god modules ✓</p>}
          </div>
        </div>

        {/* Coupled */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--cni-text)' }}>
            <span style={{ color: '#fbbf24' }}>⬇</span> Coupled Modules
            <span className="badge-warning ml-auto">{data.coupled_modules?.length || 0}</span>
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {data.coupled_modules?.length > 0 ? data.coupled_modules.map((mod) => (
              <div key={mod.file} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'var(--cni-bg)' }}>
                <span className="text-xs font-mono" style={{ color: 'var(--cni-text)' }}>{mod.file}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>out: {mod.value}</span>
                  <span className={mod.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}>{mod.severity}</span>
                </div>
              </div>
            )) : <p className="text-xs py-2" style={{ color: 'var(--cni-muted)' }}>No coupled modules ✓</p>}
          </div>
        </div>
      </div>

      {/* Isolated */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>Isolated Modules</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--cni-muted)' }}>Files with no imports and no importers</p>
          </div>
          <p className="text-3xl font-bold" style={{ color: '#fbbf24' }}>{data.isolated_count}</p>
        </div>
      </div>
    </div>
  );
}
