'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAnalysisContext } from '../client-layout';
import { Download, Zap, AlertTriangle, Shield } from 'lucide-react';
import { exportImpactReport } from '../../lib/exportReport';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';

export default function ImpactPage() {
  const {
    repoPath, stats, graphData,
    impactData: data, impactFile: cachedFile,
    impactLoading: loading, impactError: error,
    fetchImpact, setImpactFile, setImpactError, fetchGraph,
  } = useAnalysisContext();
  const [file, setFile] = useState('');

  // Sync local input with cached file
  useEffect(() => {
    if (cachedFile && !file) setFile(cachedFile);
  }, [cachedFile, file]);

  // Pre-fill from URL query param
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const f = params.get('file');
      if (f) setFile(f);
    }
  }, []);

  // Fetch graph for suggestion pills
  useEffect(() => {
    if (repoPath && stats && graphData.nodes.length === 0) {
      fetchGraph(repoPath);
    }
  }, [repoPath, stats, graphData.nodes.length, fetchGraph]);

  // Suggestion pills: top files by indegree
  const suggestions = useMemo(() => {
    return graphData.nodes
      .filter(n => n.indegree >= 3)
      .sort((a, b) => b.indegree - a.indegree)
      .slice(0, 5)
      .map(n => n.label);
  }, [graphData.nodes]);

  const handleAnalyze = () => {
    if (!file.trim() || !repoPath) return;
    setImpactError(null);
    setImpactFile(file.trim());
    fetchImpact(file.trim(), repoPath);
  };

  if (!repoPath || !stats) return <NotAnalyzed />;

  const maxScore = data?.dependents?.length > 0
    ? Math.max(...data.dependents.map(d => d.score))
    : 1;

  const riskConfig = {
    HIGH: { bg: 'var(--danger-muted)', border: '#ef4444', color: '#ef4444' },
    MEDIUM: { bg: 'var(--warning-muted)', border: '#eab308', color: '#eab308' },
    LOW: { bg: 'var(--accent-muted)', border: 'var(--accent)', color: 'var(--accent)' },
  };

  const getScoreColor = (score) => {
    if (score >= 8) return '#ef4444';
    if (score >= 5) return '#eab308';
    return 'var(--text-primary)';
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Impact Analysis</h1>
        {data && (
          <button
            onClick={() => exportImpactReport(data, cachedFile, repoPath)}
            className="flex items-center gap-1.5 text-xs font-medium transition-all duration-200"
            style={{ padding: '6px 14px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Download size={14} /> Export
          </button>
        )}
      </div>

      {/* ── Input section ───────────────────────────────────────── */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Analyze the blast radius of changing a file
        </p>
        <div className="flex gap-3" style={{ maxWidth: 560 }}>
          <input
            type="text"
            placeholder="Enter filename (e.g. cache.py)"
            className="input-field flex-1 text-sm"
            style={{ maxWidth: 400 }}
            value={file}
            onChange={(e) => setFile(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          />
          <button
            className="btn-primary text-sm font-semibold disabled:opacity-50 flex-shrink-0"
            onClick={handleAnalyze}
            disabled={loading || !file.trim()}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </span>
            ) : (
              <span className="flex items-center gap-1.5"><Zap size={14} /> Analyze Impact</span>
            )}
          </button>
        </div>
        {/* Suggestion pills */}
        {suggestions.length > 0 && !data && (
          <div className="flex flex-wrap gap-2 mt-4">
            {suggestions.map(s => (
              <button key={s} onClick={() => { setFile(s); }}
                className="text-[11px] transition-all duration-200"
                style={{
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 10px',
                  borderRadius: 9999,
                  background: 'transparent',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-muted)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <ErrorMessage message={error.message} hint={error.hint} onRetry={handleAnalyze} />
      )}

      {/* ── Results ─────────────────────────────────────────────── */}
      {data && (
        <div className="space-y-5 animate-slide-up">
          {/* Risk banner */}
          {data.risk && (
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{
                background: riskConfig[data.risk]?.bg || 'var(--accent-muted)',
                borderLeft: `3px solid ${riskConfig[data.risk]?.border || 'var(--accent)'}`,
              }}
            >
              <Shield size={16} style={{ color: riskConfig[data.risk]?.color, flexShrink: 0 }} />
              <span className="text-sm font-semibold" style={{ color: riskConfig[data.risk]?.color }}>
                {data.risk} RISK
              </span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                — Changing <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{cachedFile}</span> affects {data.direct + (data.transitive || 0)} modules
              </span>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl p-5 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
              <p className="text-label mb-2">DIRECT DEPENDENTS</p>
              <p className="text-stat" style={{ color: '#3b82f6' }}>{data.direct}</p>
            </div>
            <div className="rounded-xl p-5 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
              <p className="text-label mb-2">TRANSITIVE DEPENDENTS</p>
              <p className="text-stat" style={{ color: 'var(--accent)' }}>{data.transitive || 0}</p>
            </div>
            <div className="rounded-xl p-5 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
              <p className="text-label mb-2">RISK LEVEL</p>
              <p className="text-stat" style={{ color: riskConfig[data.risk]?.color || 'var(--text-primary)' }}>
                {data.risk}
              </p>
            </div>
          </div>

          {/* Affected files table */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={15} style={{ color: '#eab308' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Affected Files</h3>
              {data.dependents?.length > 0 && (
                <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                  style={{ background: 'var(--warning-muted)', color: '#eab308' }}>{data.dependents.length}</span>
              )}
            </div>
            {data.dependents?.length > 0 ? (
              <div className="space-y-0.5">
                {/* Table header */}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-label">FILE</span>
                  <span className="text-label">CRITICALITY</span>
                </div>
                <div style={{ height: 1, background: 'var(--border-default)' }} />
                {/* Rows */}
                {data.dependents.map((dep, i) => {
                  const scoreColor = getScoreColor(dep.score);
                  const barWidth = Math.max(8, (dep.score / maxScore) * 100);
                  return (
                    <div key={i}
                      className="px-3 py-2.5 rounded-lg transition-colors"
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs truncate mr-3"
                          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {dep.file}
                        </span>
                        <span className="text-xs font-bold flex-shrink-0"
                          style={{ fontVariantNumeric: 'tabular-nums', color: scoreColor }}>
                          {dep.score.toFixed(1)}
                        </span>
                      </div>
                      {/* Mini bar */}
                      <div className="mt-1.5" style={{
                        width: `${barWidth}%`,
                        height: 3,
                        borderRadius: 2,
                        background: scoreColor,
                        opacity: 0.6,
                        transition: 'width 0.5s ease-out',
                      }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No dependents found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
