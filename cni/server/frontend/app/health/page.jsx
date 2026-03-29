'use client';

import { useEffect, useRef } from 'react';
import { useAnalysisContext } from '../client-layout';
import { Download, AlertTriangle, Link2 } from 'lucide-react';
import { exportHealthReport } from '../../lib/exportReport';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSkeleton from '../../components/LoadingSkeleton';

/* ─── Circular SVG Gauge ──────────────────────────────────────────── */
function HealthGauge({ score, size = 150 }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score ?? 0, 0), 100);
  const dashOffset = circumference - (progress / 100) * circumference;

  const color = progress >= 70 ? '#22c55e' : progress >= 40 ? '#eab308' : '#ef4444';
  const glow = progress >= 70
    ? 'rgba(34,197,94,0.25)'
    : progress >= 40
      ? 'rgba(234,179,8,0.25)'
      : 'rgba(239,68,68,0.25)';

  const arcRef = useRef(null);
  useEffect(() => {
    const el = arcRef.current;
    if (!el) return;
    el.style.strokeDashoffset = String(circumference);
    requestAnimationFrame(() => {
      el.style.transition = 'stroke-dashoffset 1s ease-out';
      el.style.strokeDashoffset = String(dashOffset);
    });
  }, [circumference, dashOffset]);

  let interpretation = { dot: '#22c55e', text: 'Excellent' };
  if (progress < 40) interpretation = { dot: '#ef4444', text: 'Critical — Immediate action needed' };
  else if (progress < 60) interpretation = { dot: '#eab308', text: 'Moderate — Needs attention' };
  else if (progress < 80) interpretation = { dot: '#22c55e', text: 'Healthy — Minor issues' };

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle ref={arcRef} cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 8px ${glow})` }} />
        <text x={size / 2} y={size / 2 - 6} textAnchor="middle" dominantBaseline="central"
          style={{ fill: color, fontSize: '2.25rem', fontWeight: 700, fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums' }}>
          {score ?? '—'}
        </text>
        <text x={size / 2} y={size / 2 + 22} textAnchor="middle" dominantBaseline="central"
          style={{ fill: 'var(--text-muted)', fontSize: '0.6875rem' }}>
          / 100
        </text>
      </svg>
      <p className="text-label">HEALTH SCORE</p>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: interpretation.dot }} />
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{interpretation.text}</span>
      </div>
    </div>
  );
}

/* ─── Health Page ─────────────────────────────────────────────────── */
export default function HealthPage() {
  const {
    repoPath, stats,
    healthData: data, healthLoading: loading, healthError: error,
    fetchHealth,
  } = useAnalysisContext();

  useEffect(() => {
    if (repoPath && stats) fetchHealth(repoPath);
  }, [repoPath, stats, fetchHealth]);

  if (!repoPath || !stats) return <NotAnalyzed />;
  if (loading && !data) return <LoadingSkeleton variant="cards" />;
  if (error) return (
    <div className="p-6">
      <ErrorMessage message={error.message} hint={error.hint} onRetry={() => fetchHealth(repoPath)} />
    </div>
  );
  if (!data) return null;

  const godCount = data.god_modules?.length || 0;
  const coupledCount = data.coupled_modules?.length || 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Codebase Health</h1>
        <button
          onClick={() => exportHealthReport(data, repoPath)}
          className="flex items-center gap-1.5 text-xs font-medium transition-all duration-200"
          style={{ padding: '6px 14px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <Download size={14} /> Export
        </button>
      </div>

      {/* ── Row 1: Gauge ────────────────────────────────────────── */}
      <div className="flex justify-center py-4">
        <HealthGauge score={data.score} size={150} />
      </div>

      {/* ── Row 2: Stat cards ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-5 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <p className="text-label mb-2">TOTAL MODULES</p>
          <p className="text-stat" style={{ color: 'var(--text-primary)' }}>{data.total_modules}</p>
        </div>
        <div className="rounded-xl p-5 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <p className="text-label mb-2">GOD MODULES</p>
          <p className="text-stat" style={{ color: godCount > 0 ? '#ef4444' : 'var(--text-primary)' }}>{godCount}</p>
          {godCount > 0 && (
            <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--danger-muted)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              High risk
            </span>
          )}
        </div>
        <div className="rounded-xl p-5 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <p className="text-label mb-2">COUPLED MODULES</p>
          <p className="text-stat" style={{ color: coupledCount > 0 ? '#eab308' : 'var(--text-primary)' }}>{coupledCount}</p>
        </div>
      </div>

      {/* ── Row 3: God + Coupled detail tables ──────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* God Modules */}
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={15} style={{ color: '#ef4444' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>God Modules</h3>
            {godCount > 0 && (
              <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: 'var(--danger-muted)', color: '#ef4444' }}>{godCount}</span>
            )}
          </div>
          {godCount > 0 ? (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {data.god_modules.map(mod => (
                <div key={mod.file} className="flex items-center justify-between py-2 px-3 rounded-lg transition-colors"
                  style={{ borderBottom: '1px solid var(--border-default)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span className="text-xs truncate mr-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{mod.file}</span>
                  <span className="text-xs font-bold flex-shrink-0"
                    style={{ fontVariantNumeric: 'tabular-nums', color: mod.value >= 15 ? '#ef4444' : '#eab308' }}>
                    {mod.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No god modules ✨</p>
          )}
        </div>

        {/* Coupled Modules */}
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Link2 size={15} style={{ color: '#eab308' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Coupled Modules</h3>
            {coupledCount > 0 && (
              <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: 'var(--warning-muted)', color: '#eab308' }}>{coupledCount}</span>
            )}
          </div>
          {coupledCount > 0 ? (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {data.coupled_modules.map(mod => (
                <div key={mod.file} className="flex items-center justify-between py-2 px-3 rounded-lg transition-colors"
                  style={{ borderBottom: '1px solid var(--border-default)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span className="text-xs truncate mr-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{mod.file}</span>
                  <span className="text-xs font-bold flex-shrink-0"
                    style={{ fontVariantNumeric: 'tabular-nums', color: '#eab308' }}>
                    {mod.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No coupled modules ✨</p>
          )}
        </div>
      </div>

      {/* ── Row 4: Isolated Modules ─────────────────────────────── */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Isolated Modules</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Files with no imports and no importers</p>
          </div>
          <p className="text-stat" style={{ color: data.isolated_count > 5 ? '#eab308' : 'var(--text-primary)' }}>
            {data.isolated_count}
          </p>
        </div>
      </div>
    </div>
  );
}
