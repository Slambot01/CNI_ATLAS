'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useAnalysisContext } from './client-layout';
import { getHistory } from '../lib/api';
import {
  FolderGit2,
  TrendingUp,
  AlertTriangle,
  Trash2,
  Activity,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import ErrorMessage from '../components/ErrorMessage';

// Dynamic import recharts (needs browser, no SSR)
const RechartsChart = dynamic(() => import('../components/TimelineChart'), { ssr: false });

/* ================================================================== */
/*  Circular SVG Gauge                                                 */
/* ================================================================== */
function HealthGauge({ score, size = 150 }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score || 0, 0), 100);
  const dashOffset = circumference - (progress / 100) * circumference;

  // Color based on score
  const color = progress >= 70 ? '#22c55e' : progress >= 40 ? '#eab308' : '#ef4444';
  const glowColor = progress >= 70
    ? 'rgba(34, 197, 94, 0.25)'
    : progress >= 40
      ? 'rgba(234, 179, 8, 0.25)'
      : 'rgba(239, 68, 68, 0.25)';

  const arcRef = useRef(null);

  useEffect(() => {
    const el = arcRef.current;
    if (!el) return;
    // Animate from full offset to target
    el.style.strokeDashoffset = String(circumference);
    requestAnimationFrame(() => {
      el.style.transition = 'stroke-dashoffset 1s ease-out';
      el.style.strokeDashoffset = String(dashOffset);
    });
  }, [circumference, dashOffset]);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
        />
        {/* Score number */}
        <text
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fill: color,
            fontSize: '2rem',
            fontWeight: 700,
            fontFamily: "'Inter', sans-serif",
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {score ?? '—'}
        </text>
        {/* /100 label */}
        <text
          x={size / 2}
          y={size / 2 + 22}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fill: 'rgba(255, 255, 255, 0.32)',
            fontSize: '0.6875rem',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          / 100
        </text>
      </svg>
    </div>
  );
}

/* ================================================================== */
/*  Dashboard Page                                                     */
/* ================================================================== */
export default function DashboardPage() {
  const {
    stats, healthData, loading, error, repoPath,
    recentRepos, removeRecentRepo, analyze, setRepoPath,
    graphData, fetchGraph,
  } = useAnalysisContext();

  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deadExpanded, setDeadExpanded] = useState(false);
  const [godExpanded, setGodExpanded] = useState(false);
  const [localPath, setLocalPath] = useState('');

  // Fetch history when stats are available
  useEffect(() => {
    if (!repoPath || !stats) return;
    setHistoryLoading(true);
    getHistory(repoPath)
      .then(res => {
        if (res?.history) setHistoryData(res.history);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [repoPath, stats]);

  // Fetch graph data for dead code + god modules
  useEffect(() => {
    if (repoPath && stats && graphData.nodes.length === 0) {
      fetchGraph(repoPath);
    }
  }, [repoPath, stats, graphData.nodes.length, fetchGraph]);

  // Compute dead code + god modules
  const deadCode = useMemo(() => {
    return graphData.nodes.filter(n => n.indegree === 0 && n.outdegree === 0);
  }, [graphData.nodes]);

  const godModules = useMemo(() => {
    return graphData.nodes
      .filter(n => n.indegree >= 10)
      .sort((a, b) => b.indegree - a.indegree);
  }, [graphData.nodes]);

  // Relative time formatter
  const formatRelative = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const handleRepoClick = (path) => {
    setRepoPath(path);
    analyze(path);
  };

  const handleAnalyze = () => {
    const p = localPath.trim();
    if (!p) return;
    setRepoPath(p);
    analyze(p);
  };

  /* ────────────────────────────────────────────────────────────────── */
  /*  Welcome Screen — No Repo Analyzed                                */
  /* ────────────────────────────────────────────────────────────────── */
  if (!stats && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <div className="text-center space-y-5 animate-fade-in" style={{ maxWidth: 520 }}>
          {/* CNI Branding */}
          <h1
            className="text-5xl font-extrabold tracking-tight"
            style={{ color: 'var(--accent)' }}
          >
            CNI
          </h1>
          <p
            className="text-sm"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}
          >
            Codebase Neural Interface
          </p>

          {/* Input */}
          <div className="mt-8 space-y-3" style={{ maxWidth: 480, margin: '2rem auto 0' }}>
            <input
              type="text"
              placeholder="Enter repository path..."
              className="input-field h-12 text-sm text-center"
              style={{ background: 'var(--bg-input)' }}
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyze(); }}
            />
            <button
              className="btn-primary w-full h-11 text-sm font-semibold disabled:opacity-50"
              disabled={loading || !localPath.trim()}
              onClick={handleAnalyze}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing…
                </span>
              ) : (
                'Analyze Repository'
              )}
            </button>
          </div>

          {/* Privacy badges */}
          <div className="flex items-center justify-center gap-3 text-xs pt-2" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
              100% Local
            </span>
            <span>·</span><span>No Cloud</span><span>·</span><span>No Data Leaves Your Machine</span>
          </div>
        </div>

        {/* Recent Repositories */}
        {recentRepos.length > 0 && (
          <div className="w-full mt-12 animate-slide-up" style={{ maxWidth: 580 }}>
            <p className="text-label mb-3 px-1">RECENT REPOSITORIES</p>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
              {recentRepos.map(repo => (
                <div
                  key={repo.path}
                  className="flex-shrink-0 rounded-xl cursor-pointer transition-all duration-200 group"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    padding: '14px 16px',
                    minWidth: 200,
                    maxWidth: 260,
                  }}
                  onClick={() => handleRepoClick(repo.path)}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent-border)';
                    e.currentTarget.style.background = 'var(--bg-card-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.background = 'var(--bg-card)';
                  }}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <FolderGit2 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {repo.name}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeRecentRepo(repo.path); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all duration-150 ml-2"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <p
                    className="text-[10px] truncate mb-1"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
                  >
                    {repo.path}
                  </p>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    <span>{repo.filesCount} files</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>{formatRelative(repo.lastAnalyzed)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /*  Error State                                                      */
  /* ────────────────────────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[75vh]">
        <div className="w-full max-w-lg px-6">
          <ErrorMessage message={error.message} hint={error.hint} />
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /*  Loading State                                                    */
  /* ────────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[75vh]">
        <div className="text-center space-y-4 animate-fade-in">
          <div
            className="w-10 h-10 mx-auto border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }}
          />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Analyzing repository…</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Scanning files and building dependency graph</p>
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /*  Analyzed Dashboard                                               */
  /* ────────────────────────────────────────────────────────────────── */
  const shortName = repoPath
    ? repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repoPath
    : '';

  const isolatedCount = stats.isolated ?? 0;

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
        <div className="flex items-center gap-3">
          <span
            className="text-xs truncate"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', maxWidth: 320 }}
            title={repoPath}
          >
            {repoPath}
          </span>
          {stats && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {formatRelative(new Date().toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* ── Row 1: Stat Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {/* Files Scanned */}
        <div
          className="rounded-xl p-5 animate-slide-up"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            animationDelay: '0ms',
          }}
        >
          <p className="text-label mb-2">FILES SCANNED</p>
          <p
            className="text-stat"
            style={{ color: 'var(--accent)' }}
          >
            {(stats.files ?? 0).toLocaleString()}
          </p>
        </div>

        {/* Dependencies */}
        <div
          className="rounded-xl p-5 animate-slide-up"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            animationDelay: '60ms',
          }}
        >
          <p className="text-label mb-2">DEPENDENCIES</p>
          <p
            className="text-stat"
            style={{ color: '#3b82f6' }}
          >
            {(stats.dependencies ?? 0).toLocaleString()}
          </p>
        </div>

        {/* Health Score Gauge */}
        <div
          className="rounded-xl p-5 flex flex-col items-center animate-slide-up"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            animationDelay: '120ms',
          }}
        >
          <p className="text-label mb-3 self-start">HEALTH SCORE</p>
          <HealthGauge score={healthData?.score} size={120} />
        </div>

        {/* Isolated Modules */}
        <div
          className="rounded-xl p-5 animate-slide-up"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            animationDelay: '180ms',
          }}
        >
          <p className="text-label mb-2">ISOLATED MODULES</p>
          <p
            className="text-stat"
            style={{ color: isolatedCount > 5 ? '#eab308' : 'var(--text-primary)' }}
          >
            {isolatedCount.toLocaleString()}
          </p>
        </div>
      </div>

      {/* ── Row 2: Timeline + Alerts ─────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '58% 1fr' }}>
        {/* Left: Codebase Timeline */}
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} style={{ color: '#3b82f6' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Codebase Timeline
            </h3>
          </div>
          {historyLoading ? (
            <div className="flex items-center justify-center" style={{ height: 220 }}>
              <div
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }}
              />
            </div>
          ) : historyData.length > 0 ? (
            <div style={{ height: 220 }}>
              <RechartsChart data={historyData} />
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2"
              style={{ height: 220 }}
            >
              <TrendingUp size={24} style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Analyze over time to see trends
              </p>
            </div>
          )}
        </div>

        {/* Right: God Modules + Unused Files stacked */}
        <div className="flex flex-col gap-4">
          {/* God Modules */}
          <div
            className="rounded-xl p-5 flex-1"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} style={{ color: '#eab308' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  God Modules
                </h3>
                {godModules.length > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                    style={{
                      background: 'var(--warning-muted)',
                      color: '#eab308',
                    }}
                  >
                    {godModules.length}
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Files with 10+ dependents
            </p>
            {godModules.length > 0 ? (
              <div className="space-y-1">
                {godModules.slice(0, godExpanded ? undefined : 5).map(n => (
                  <div key={n.id} className="flex items-center justify-between py-1">
                    <span
                      className="text-xs truncate flex-1 mr-3"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
                    >
                      {n.label}
                    </span>
                    <span
                      className="text-xs font-bold flex-shrink-0"
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        color: n.indegree >= 15 ? '#ef4444' : '#eab308',
                      }}
                    >
                      {n.indegree}
                    </span>
                  </div>
                ))}
                {godModules.length > 5 && (
                  <button
                    onClick={() => setGodExpanded(!godExpanded)}
                    className="flex items-center gap-1 text-xs mt-1 transition-colors"
                    style={{ color: 'var(--accent)' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    {godExpanded ? (
                      <><ChevronUp size={12} /> Show less</>
                    ) : (
                      <><ChevronDown size={12} /> +{godModules.length - 5} more</>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No god modules detected ✨</p>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-default)' }} />

          {/* Unused Files */}
          <div
            className="rounded-xl p-5 flex-1"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trash2 size={15} style={{ color: 'var(--text-secondary)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Unused Files
                </h3>
                {deadCode.length > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {deadCode.length}
                  </span>
                )}
              </div>
            </div>
            {deadCode.length > 0 ? (
              <div className="space-y-1">
                {deadCode.slice(0, deadExpanded ? undefined : 5).map(n => (
                  <p
                    key={n.id}
                    className="text-xs truncate py-0.5"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
                  >
                    {n.label}
                  </p>
                ))}
                {deadCode.length > 5 && (
                  <button
                    onClick={() => setDeadExpanded(!deadExpanded)}
                    className="flex items-center gap-1 text-xs mt-1 transition-colors"
                    style={{ color: 'var(--accent)' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    {deadExpanded ? (
                      <><ChevronUp size={12} /> Show less</>
                    ) : (
                      <><ChevronDown size={12} /> +{deadCode.length - 5} more</>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No dead code detected ✨</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 3: Recent Repositories ───────────────────────────────── */}
      {recentRepos.length > 0 && (
        <div className="animate-slide-up">
          <p className="text-label mb-3">RECENT REPOSITORIES</p>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {recentRepos.map(repo => {
              const isActive = repo.path === repoPath;
              return (
                <div
                  key={repo.path}
                  className="flex-shrink-0 rounded-xl cursor-pointer transition-all duration-200 group"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                    padding: '12px 16px',
                    minWidth: 200,
                    maxWidth: 260,
                  }}
                  onClick={() => handleRepoClick(repo.path)}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.borderColor = 'var(--border-hover)';
                    e.currentTarget.style.background = 'var(--bg-card-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.borderLeftColor = isActive ? 'var(--accent)' : 'transparent';
                    e.currentTarget.style.background = 'var(--bg-card)';
                  }}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <FolderGit2
                        size={14}
                        style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}
                      />
                      <span
                        className="text-xs font-semibold truncate"
                        style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {repo.name}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeRecentRepo(repo.path); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all duration-150 ml-2"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <p
                    className="text-[10px] truncate mb-1"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
                  >
                    {repo.path}
                  </p>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    <span>{repo.filesCount} files</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>{formatRelative(repo.lastAnalyzed)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
