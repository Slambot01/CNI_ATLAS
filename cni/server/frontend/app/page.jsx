'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAnalysisContext } from './client-layout';
import { getHistory } from '../lib/api';
import {
  FolderGit2,
  AlertTriangle,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import ErrorMessage from '../components/ErrorMessage';

/* ================================================================== */
/*  Dynamic import: Recharts (no SSR)                                  */
/* ================================================================== */
const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });

/* ================================================================== */
/*  Theme tokens                                                       */
/* ================================================================== */
const T = {
  bg: '#09090b',
  surface: '#111113',
  border: '#1f1f23',
  text: '#ffffff',
  muted: '#71717a',
  amber: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
};

/* ================================================================== */
/*  Utility: shorten path to folder/file                               */
/* ================================================================== */
function shortPath(p) {
  if (!p) return '';
  return p.split(/[\\/]/).slice(-2).join('/');
}
function fileName(p) {
  if (!p) return '';
  return p.split(/[\\/]/).pop();
}

/* ================================================================== */
/*  Semicircle Health Gauge (SVG arc)                                  */
/* ================================================================== */
function HealthGauge({ score }) {
  const s = Math.min(Math.max(score || 0, 0), 100);
  const color = s >= 80 ? T.green : s >= 50 ? T.amber : T.red;
  const label = s >= 80 ? 'Healthy' : s >= 50 ? 'Needs work' : 'Critical';

  // Semicircle arc
  const cx = 60, cy = 50;
  const r = 40;
  const strokeWidth = 6;
  const startAngle = Math.PI;
  const endAngle = 0;
  const totalArc = Math.PI; // 180 degrees
  const circumference = totalArc * r;
  const progress = (s / 100) * circumference;

  const arcRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Arc path for semicircle (left to right, top half)
  const describeArc = (cx, cy, r, startA, endA) => {
    const x1 = cx + r * Math.cos(startA);
    const y1 = cy - r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy - r * Math.sin(endA);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  const trackPath = describeArc(cx, cy, r, startAngle, endAngle);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={120} height={65} viewBox="0 0 120 65">
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke={T.border}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress */}
        <path
          ref={arcRef}
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={mounted ? circumference - progress : circumference}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
        {/* Score number */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fill: T.text,
            fontSize: '1.75rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {score ?? '—'}
        </text>
      </svg>
      <span style={{
        fontFamily: 'var(--font-ui)',
        fontSize: '0.65rem',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: T.muted,
        marginTop: 2,
      }}>
        {label}
      </span>
    </div>
  );
}

/* ================================================================== */
/*  Chart tooltip                                                      */
/* ================================================================== */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: '10px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.75rem',
    }}>
      <p style={{ color: T.muted, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>{label}</p>
      {payload.map(e => (
        <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: e.color, flexShrink: 0,
          }} />
          <span style={{ color: T.muted }}>{e.name}:</span>
          <span style={{ color: T.text, fontWeight: 600 }}>{e.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Chart legend                                                       */
/* ================================================================== */
function ChartLegend({ payload }) {
  if (!payload?.length) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 8 }}>
      {payload.map(e => (
        <div key={e.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: e.color,
          }} />
          <span style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.7rem',
            color: T.muted,
          }}>
            {e.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Format date for chart axis                                         */
/* ================================================================== */
function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ts; }
}

/* ================================================================== */
/*  Dashboard Page                                                     */
/* ================================================================== */
export default function DashboardPage() {
  const router = useRouter();
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

  // Compute insights from graph data
  const deadCode = useMemo(() => {
    return graphData.nodes.filter(n => n.indegree === 0 && n.outdegree === 0);
  }, [graphData.nodes]);

  const godModules = useMemo(() => {
    return graphData.nodes
      .filter(n => n.indegree >= 10)
      .sort((a, b) => b.indegree - a.indegree);
  }, [graphData.nodes]);

  const mostCritical = useMemo(() => {
    if (graphData.nodes.length === 0) return null;
    return graphData.nodes.reduce((best, n) =>
      n.indegree > (best?.indegree || 0) ? n : best, null);
  }, [graphData.nodes]);

  const mostDepended = useMemo(() => {
    if (graphData.nodes.length === 0) return null;
    return graphData.nodes.reduce((best, n) =>
      n.outdegree > (best?.outdegree || 0) ? n : best, null);
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

  // Chart data
  const chartData = useMemo(() => {
    return historyData.map(d => ({
      ...d,
      date: formatDate(d.timestamp),
    }));
  }, [historyData]);

  /* ────────────────────────────────────────────────────────────────── */
  /*  Welcome Screen — No Repo Analyzed                                */
  /* ────────────────────────────────────────────────────────────────── */
  if (!stats && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <div className="text-center space-y-5 animate-fade-in" style={{ maxWidth: 520 }}>
          <h1
            className="text-5xl font-extrabold tracking-tight"
            style={{ color: T.text }}
          >
            CNI
          </h1>
          <p
            className="text-sm"
            style={{ color: T.muted, letterSpacing: '0.04em' }}
          >
            Codebase Neural Interface
          </p>

          <div className="mt-8 space-y-3" style={{ maxWidth: 480, margin: '2rem auto 0' }}>
            <input
              type="text"
              placeholder="Enter repository path..."
              className="input-field h-12 text-sm text-center"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyze(); }}
            />
            <button
              className="w-full h-11 text-sm font-semibold disabled:opacity-50"
              disabled={loading || !localPath.trim()}
              onClick={handleAnalyze}
              style={{
                background: T.text,
                color: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
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

          <div className="flex items-center justify-center gap-3 text-xs pt-2" style={{ color: T.muted }}>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.green }} />
              100% Local
            </span>
            <span>·</span><span>No Cloud</span><span>·</span><span>No Data Leaves Your Machine</span>
          </div>
        </div>

        {recentRepos.length > 0 && (
          <div className="w-full mt-12 animate-slide-up" style={{ maxWidth: 580 }}>
            <p style={{
              fontSize: '0.65rem',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: T.muted,
              marginBottom: 12,
              paddingLeft: 4,
            }}>RECENT REPOSITORIES</p>
            <div className="flex gap-2 flex-wrap">
              {recentRepos.map(repo => (
                <button
                  key={repo.path}
                  className="group"
                  onClick={() => handleRepoClick(repo.path)}
                  style={{
                    background: T.border,
                    color: T.muted,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    borderRadius: 9999,
                    padding: '4px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                  onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                >
                  {repo.name}
                </button>
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
            style={{ borderColor: T.border, borderTopColor: T.text }}
          />
          <p className="text-sm" style={{ color: T.muted }}>Analyzing repository…</p>
          <p className="text-xs" style={{ color: T.muted }}>Scanning files and building dependency graph</p>
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /*  Analyzed Dashboard                                               */
  /* ────────────────────────────────────────────────────────────────── */
  const healthScore = healthData?.score ?? 0;
  const isolatedCount = stats.isolated ?? 0;
  const filesCount = stats.files ?? 0;
  const depsCount = stats.dependencies ?? 0;

  return (
    <div
      className="animate-fade-in"
      style={{
        padding: 28,
        background: `radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        minHeight: 'calc(100vh - 56px)',
      }}
    >
      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          color: T.muted,
          maxWidth: 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }} title={repoPath}>
          {shortPath(repoPath)}
        </span>
        <span style={{
          fontSize: '0.7rem',
          color: T.muted,
        }}>
          · {formatRelative(new Date().toISOString())}
        </span>
      </div>

      {/* ── Summary Bar ──────────────────────────────────────────────── */}
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: '16px 24px',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: T.text,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {filesCount.toLocaleString()}
            </span>
            <span style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.75rem',
              color: T.muted,
            }}>
              files
            </span>
          </div>
          <span style={{ color: T.muted, fontSize: '0.75rem' }}>·</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: T.text,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {depsCount.toLocaleString()}
            </span>
            <span style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.75rem',
              color: T.muted,
            }}>
              deps
            </span>
          </div>
          <span style={{ color: T.muted, fontSize: '0.75rem' }}>·</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.75rem',
              color: T.muted,
            }}>
              Health:
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: T.text,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {healthScore}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: T.muted,
            }}>
              /100
            </span>
          </div>
        </div>
        {/* Thin amber progress bar */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 2,
          width: `${Math.min(healthScore, 100)}%`,
          background: T.amber,
          transition: 'width 1s ease-out',
        }} />
      </div>

      {/* ── Two Column Layout ────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '60% 1fr',
        gap: 16,
        marginBottom: 16,
      }}>
        {/* ── LEFT: Codebase Timeline ──────────────────────────────── */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <h3 style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: T.text,
            marginBottom: 16,
          }}>
            Codebase Timeline
          </h3>
          {historyLoading ? (
            <div style={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: T.border, borderTopColor: T.text }}
              />
            </div>
          ) : chartData.length > 0 ? (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradFiles" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(255,255,255,0.6)" stopOpacity={0.05} />
                      <stop offset="95%" stopColor="rgba(255,255,255,0.6)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradDeps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={T.muted} stopOpacity={0.05} />
                      <stop offset="95%" stopColor={T.muted} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradHealth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={T.amber} stopOpacity={0.05} />
                      <stop offset="95%" stopColor={T.amber} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={T.border}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: T.muted, fontFamily: 'var(--font-mono)' }}
                    axisLine={{ stroke: T.border }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: T.muted, fontFamily: 'var(--font-mono)' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: T.muted, fontFamily: 'var(--font-mono)' }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend content={<ChartLegend />} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="files"
                    name="Files"
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth={2}
                    fill="url(#gradFiles)"
                    dot={{ r: 2, fill: 'rgba(255,255,255,0.6)', strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: T.text, stroke: 'rgba(255,255,255,0.2)', strokeWidth: 3 }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="dependencies"
                    name="Dependencies"
                    stroke={T.muted}
                    strokeWidth={2}
                    fill="url(#gradDeps)"
                    dot={{ r: 2, fill: T.muted, strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: T.muted, stroke: 'rgba(113,113,122,0.2)', strokeWidth: 3 }}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="health"
                    name="Health"
                    stroke={T.amber}
                    strokeWidth={2}
                    fill="url(#gradHealth)"
                    dot={{ r: 2, fill: T.amber, strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: T.amber, stroke: 'rgba(245,158,11,0.2)', strokeWidth: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{
              height: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}>
              <span style={{ color: T.muted, fontSize: '0.75rem' }}>
                Analyze over time to see trends
              </span>
            </div>
          )}
        </div>

        {/* ── RIGHT: Action Items Panel ────────────────────────────── */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px 12px',
            borderBottom: `1px solid ${T.border}`,
          }}>
            <h3 style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: T.text,
            }}>
              Action Items
            </h3>
          </div>

          {/* God modules action */}
          <ActionItem
            icon={<AlertTriangle size={14} style={{ color: T.amber }} />}
            label={
              godModules.length > 0
                ? <><span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{godModules.length}</span> god modules need attention</>
                : 'No god modules detected'
            }
            onClick={() => router.push('/health')}
            borderBottom
          />

          {/* Unused files action */}
          <ActionItem
            icon={<CheckCircle2 size={14} style={{ color: T.text }} />}
            label={
              deadCode.length > 0
                ? <><span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{deadCode.length}</span> unused files can be removed</>
                : 'No unused files detected'
            }
            onClick={() => {
              if (deadCode.length > 0) {
                router.push(`/impact?file=${encodeURIComponent(deadCode[0]?.label || '')}`);
              } else {
                router.push('/impact');
              }
            }}
            borderBottom
          />

          {/* Most critical module */}
          {mostCritical && mostCritical.indegree > 0 && (
            <ActionItem
              icon={<ArrowRight size={14} style={{ color: T.text }} />}
              label={
                <>Most critical: <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(mostCritical.label)}</span> <span style={{ color: T.muted }}>({mostCritical.indegree} dependents)</span></>
              }
              onClick={() => router.push('/graph')}
              borderBottom
            />
          )}

          {/* Most depended on */}
          {mostDepended && mostDepended.outdegree > 0 && (
            <ActionItem
              icon={<ArrowRight size={14} style={{ color: T.text }} />}
              label={
                <>Start with: <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(mostDepended.label)}</span> <span style={{ color: T.muted }}>({mostDepended.outdegree} outgoing)</span></>
              }
              onClick={() => router.push('/graph')}
            />
          )}
        </div>
      </div>

      {/* ── Stats 2×2 Grid ────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 16,
      }}>
        {/* Row 1: Files */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
        }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: T.muted,
            marginBottom: 4,
          }}>FILES</p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '2.5rem',
            fontWeight: 700,
            color: T.text,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {filesCount.toLocaleString()}
          </p>
        </div>

        {/* Row 1: Dependencies */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
        }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: T.muted,
            marginBottom: 4,
          }}>DEPENDENCIES</p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '2.5rem',
            fontWeight: 700,
            color: T.text,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {depsCount.toLocaleString()}
          </p>
        </div>

        {/* Row 2: Health Gauge */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: T.muted,
            marginBottom: 8,
            alignSelf: 'flex-start',
          }}>HEALTH SCORE</p>
          <HealthGauge score={healthScore} />
        </div>

        {/* Row 2: Isolated */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
        }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: T.muted,
            marginBottom: 4,
          }}>ISOLATED</p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '2.5rem',
            fontWeight: 700,
            color: isolatedCount > 5 ? T.amber : T.text,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {isolatedCount.toLocaleString()}
          </p>
        </div>
      </div>

      {/* ── God Modules + Dead Code side by side ─────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 16,
      }}>
        {/* God Modules */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <div style={{ marginBottom: 4 }}>
            <h3 style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: T.text,
            }}>
              God Modules
            </h3>
            <p style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.75rem',
              color: T.muted,
              marginTop: 2,
            }}>
              Files with 10+ dependents
            </p>
          </div>
          {godModules.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              {godModules.slice(0, godExpanded ? undefined : 5).map(n => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: T.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    marginRight: 12,
                  }}>
                    {shortPath(n.label)}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 9999,
                    flexShrink: 0,
                    background: n.indegree > 20 ? T.red : T.amber,
                    color: n.indegree > 20 ? '#fecaca' : '#fef3c7',
                  }}>
                    {n.indegree}
                  </span>
                </div>
              ))}
              {godModules.length > 5 && (
                <button
                  onClick={() => setGodExpanded(!godExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.75rem',
                    color: T.muted,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    marginTop: 8,
                    fontFamily: 'var(--font-ui)',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = T.text}
                  onMouseLeave={e => e.currentTarget.style.color = T.muted}
                >
                  {godExpanded ? (
                    <><ChevronUp size={12} /> Show less</>
                  ) : (
                    <><ChevronDown size={12} /> +{godModules.length - 5} more</>
                  )}
                </button>
              )}
              <button
                onClick={() => router.push('/health')}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.75rem',
                  color: T.muted,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: 12,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.color = T.text}
                onMouseLeave={e => e.currentTarget.style.color = T.muted}
              >
                View all →
              </button>
            </div>
          ) : (
            <p style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.75rem',
              color: T.muted,
              marginTop: 12,
            }}>No god modules detected ✨</p>
          )}
        </div>

        {/* Dead Code */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <div style={{ marginBottom: 4 }}>
            <h3 style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: T.text,
            }}>
              Unused Files
            </h3>
            <p style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.75rem',
              color: T.muted,
              marginTop: 2,
            }}>
              No imports or dependents
            </p>
          </div>
          {deadCode.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              {deadCode.slice(0, deadExpanded ? undefined : 5).map(n => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: T.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    marginRight: 12,
                  }}>
                    {shortPath(n.label)}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    flexShrink: 0,
                    background: T.border,
                    color: T.muted,
                  }}>
                    0 deps
                  </span>
                </div>
              ))}
              {deadCode.length > 5 && (
                <button
                  onClick={() => setDeadExpanded(!deadExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.75rem',
                    color: T.muted,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    marginTop: 8,
                    fontFamily: 'var(--font-ui)',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = T.text}
                  onMouseLeave={e => e.currentTarget.style.color = T.muted}
                >
                  {deadExpanded ? (
                    <><ChevronUp size={12} /> Show less</>
                  ) : (
                    <><ChevronDown size={12} /> +{deadCode.length - 5} more</>
                  )}
                </button>
              )}
              <button
                onClick={() => router.push('/impact')}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.75rem',
                  color: T.muted,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: 12,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.color = T.text}
                onMouseLeave={e => e.currentTarget.style.color = T.muted}
              >
                Analyze impact →
              </button>
            </div>
          ) : (
            <p style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.75rem',
              color: T.muted,
              marginTop: 12,
            }}>No dead code detected ✨</p>
          )}
        </div>
      </div>

      {/* ── Recent Repos (compact bottom pills) ──────────────────────── */}
      {recentRepos.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: T.muted,
            marginBottom: 10,
          }}>RECENT</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recentRepos.map(repo => {
              const isActive = repo.path === repoPath;
              return (
                <button
                  key={repo.path}
                  onClick={() => handleRepoClick(repo.path)}
                  style={{
                    background: T.border,
                    color: isActive ? T.text : T.muted,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    borderRadius: 9999,
                    padding: '4px 12px',
                    border: isActive ? `1px solid ${T.muted}` : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = T.muted; }}
                >
                  {repo.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  ActionItem sub-component                                           */
/* ================================================================== */
function ActionItem({ icon, label, onClick, borderBottom = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderBottom: borderBottom ? `1px solid ${T.border}` : 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8rem',
        color: T.muted,
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.border; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
