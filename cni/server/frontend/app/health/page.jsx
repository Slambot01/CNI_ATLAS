'use client';

import { useEffect } from 'react';
import { useAnalysisContext } from '../client-layout';
import { Download } from 'lucide-react';
import { exportHealthReport } from '../../lib/exportReport';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSkeleton from '../../components/LoadingSkeleton';

export default function HealthPage() {
  const {
    repoPath, stats,
    healthData: data, healthLoading: loading, healthError: error,
    fetchHealth,
  } = useAnalysisContext();

  // Fetch health data on mount (cached — returns instantly if already loaded)
  useEffect(() => {
    if (repoPath && stats) {
      fetchHealth(repoPath);
    }
  }, [repoPath, stats, fetchHealth]);

  if (!repoPath || !stats) return <NotAnalyzed />;
  if (loading && !data) return <LoadingSkeleton variant="cards" />;
  if (error) return (
    <div className="p-6">
      <ErrorMessage message={error.message} hint={error.hint} onRetry={() => fetchHealth(repoPath)} />
    </div>
  );
  if (!data) return null;

  const scoreColor = data.score > 80 ? '#4ade80' : data.score > 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header with export */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => exportHealthReport(data, repoPath)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-200"
          style={{
            background: 'transparent',
            border: '1px solid var(--cni-border)',
            color: 'var(--cni-muted)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.3)'; e.currentTarget.style.color = '#60a5fa'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cni-border)'; e.currentTarget.style.color = 'var(--cni-muted)'; }}
        >
          <Download size={14} /> Export Report
        </button>
      </div>

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
