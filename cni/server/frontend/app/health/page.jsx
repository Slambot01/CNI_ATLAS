'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAnalysisContext } from '../client-layout';
import {
  Download,
  AlertTriangle,
  Info,
  Lightbulb,
  Check,
  ArrowRight,
} from 'lucide-react';
import { exportHealthReport } from '../../lib/exportReport';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSkeleton from '../../components/LoadingSkeleton';

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

/* ================================================================== */
/*  Semicircle Health Gauge                                            */
/* ================================================================== */
function HealthGauge({ score }) {
  const s = Math.min(Math.max(score ?? 0, 0), 100);
  const color = s >= 80 ? T.green : s >= 50 ? T.amber : T.red;
  const glowColor = s >= 80
    ? 'rgba(34,197,94,0.2)'
    : s >= 50
      ? 'rgba(245,158,11,0.2)'
      : 'rgba(239,68,68,0.2)';
  const label = s >= 80 ? 'Healthy' : s >= 50 ? 'Needs Work' : 'Critical';

  const cx = 80, cy = 68;
  const r = 54;
  const strokeWidth = 6;
  const totalArc = Math.PI;
  const circumference = totalArc * r;
  const progress = (s / 100) * circumference;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const describeArc = (cx, cy, r, startA, endA) => {
    const x1 = cx + r * Math.cos(startA);
    const y1 = cy - r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy - r * Math.sin(endA);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  const trackPath = describeArc(cx, cy, r, Math.PI, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={160} height={90} viewBox="0 0 160 90">
        <path
          d={trackPath} fill="none"
          stroke={T.border} strokeWidth={strokeWidth} strokeLinecap="round"
        />
        <path
          d={trackPath} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={mounted ? circumference - progress : circumference}
          style={{
            transition: 'stroke-dashoffset 1s ease-out',
            filter: `drop-shadow(0 0 8px ${glowColor})`,
          }}
        />
        <text
          x={cx} y={cy - 8}
          textAnchor="middle" dominantBaseline="central"
          style={{
            fill: T.text,
            fontSize: '2rem',
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
        fontSize: '0.7rem',
        color: T.muted,
        marginTop: 2,
        letterSpacing: '0.05em',
      }}>
        {label}
      </span>
    </div>
  );
}

/* ================================================================== */
/*  Info Tooltip                                                       */
/* ================================================================== */
function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info size={14} style={{ color: T.muted }} />
      {show && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 6,
          background: T.border,
          color: T.text,
          fontFamily: 'var(--font-ui)',
          fontSize: '0.75rem',
          lineHeight: 1.5,
          padding: '8px 12px',
          borderRadius: 8,
          maxWidth: 240,
          whiteSpace: 'normal',
          zIndex: 50,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

/* ================================================================== */
/*  Health Page                                                        */
/* ================================================================== */
export default function HealthPage() {
  const router = useRouter();
  const {
    repoPath, stats,
    healthData: data, healthLoading: loading, healthError: error,
    fetchHealth,
    graphData, fetchGraph,
  } = useAnalysisContext();

  useEffect(() => {
    if (repoPath && stats) fetchHealth(repoPath);
  }, [repoPath, stats, fetchHealth]);

  // Fetch graph data for isolated modules detail
  useEffect(() => {
    if (repoPath && stats && graphData.nodes.length === 0) {
      fetchGraph(repoPath);
    }
  }, [repoPath, stats, graphData.nodes.length, fetchGraph]);

  // Compute isolated files from graph data
  const isolatedFiles = useMemo(() => {
    return graphData.nodes
      .filter(n => n.indegree === 0 && n.outdegree === 0)
      .map(n => n.label);
  }, [graphData.nodes]);

  if (!repoPath || !stats) return <NotAnalyzed />;
  if (loading && !data) return <LoadingSkeleton variant="cards" />;
  if (error) return (
    <div style={{ padding: 28 }}>
      <ErrorMessage message={error.message} hint={error.hint} onRetry={() => fetchHealth(repoPath)} />
    </div>
  );
  if (!data) return null;

  const score = data.score ?? 0;
  const godModules = data.god_modules || [];
  const coupledModules = data.coupled_modules || [];
  const godCount = godModules.length;
  const coupledCount = coupledModules.length;
  const isolatedCount = data.isolated_count ?? 0;
  const totalModules = data.total_modules ?? 0;

  // Max values for risk bars
  const maxGodValue = godModules.length > 0
    ? Math.max(...godModules.map(m => m.value))
    : 1;
  const maxCoupledValue = coupledModules.length > 0
    ? Math.max(...coupledModules.map(m => m.value))
    : 1;

  // Top modules for diagnosis
  const topGod = godModules[0] || null;
  const topCoupled = coupledModules[0] || null;

  // Diagnosis text
  let diagnosisText = '';
  if (score >= 80) {
    diagnosisText = 'Your codebase is in good shape. Focus on reducing the god modules listed below to prevent future issues.';
  } else if (score >= 50) {
    diagnosisText = 'Your codebase has architectural issues. Priority: reduce god module count and break apart tightly coupled files.';
  } else {
    diagnosisText = 'Your codebase needs immediate attention. Start with the most depended-upon files and consider splitting them.';
  }

  // Recommendations
  const recommendations = [];
  if (godCount > 5 && topGod) {
    recommendations.push({
      icon: <AlertTriangle size={18} style={{ color: T.amber, flexShrink: 0 }} />,
      text: <>Split high-dependency modules. Start with <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(topGod.file)}</span> <span style={{ color: T.muted }}>({topGod.value} dependents)</span>.</>,
    });
  } else if (godCount > 0 && topGod) {
    recommendations.push({
      icon: <AlertTriangle size={18} style={{ color: T.amber, flexShrink: 0 }} />,
      text: <><span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(topGod.file)}</span> has <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{topGod.value}</span> dependents. Consider breaking it into smaller modules.</>,
    });
  }
  if (coupledCount > 3 && topCoupled) {
    recommendations.push({
      icon: <AlertTriangle size={18} style={{ color: T.amber, flexShrink: 0 }} />,
      text: <><span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(topCoupled.file)}</span> imports <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{topCoupled.value}</span> files. Consider dependency injection or splitting.</>,
    });
  } else if (coupledCount > 0 && topCoupled) {
    recommendations.push({
      icon: <Info size={18} style={{ color: T.muted, flexShrink: 0 }} />,
      text: <><span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(topCoupled.file)}</span> imports <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{topCoupled.value}</span> files. Review for tight coupling.</>,
    });
  }
  if (isolatedCount > 10) {
    recommendations.push({
      icon: <Info size={18} style={{ color: T.muted, flexShrink: 0 }} />,
      text: <>You have <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{isolatedCount}</span> disconnected files. Run impact analysis to check if they are safe to remove.</>,
    });
  }
  if (score >= 80 && godCount === 0) {
    recommendations.push({
      icon: <Check size={18} style={{ color: T.green, flexShrink: 0 }} />,
      text: <>Your codebase is clean. Keep monitoring as it grows.</>,
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      icon: <Check size={18} style={{ color: T.green, flexShrink: 0 }} />,
      text: <>No major issues detected. Your codebase structure is healthy.</>,
    });
  }

  return (
    <div style={{ padding: 28 }} className="animate-fade-in">
      {/* ── Page Title + Export ──────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: T.text,
          }}>
            Codebase Health
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: T.muted,
            marginTop: 4,
          }}>
            {shortPath(repoPath)}
          </p>
        </div>
        <button
          onClick={() => exportHealthReport(data, repoPath)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: T.border,
            border: `1px solid ${T.border}`,
            color: T.muted,
            fontFamily: 'var(--font-ui)',
            fontSize: '0.8125rem',
            borderRadius: 8,
            padding: '8px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = T.text;
            e.currentTarget.style.borderColor = T.muted;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = T.muted;
            e.currentTarget.style.borderColor = T.border;
          }}
        >
          <Download size={16} />
          Export Report
        </button>
      </div>

      {/* ── Top Section: Score + Diagnosis (two columns) ──────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 16,
        marginBottom: 20,
      }}>
        {/* Left: Gauge */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <HealthGauge score={score} />
        </div>

        {/* Right: Diagnosis */}
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
            marginBottom: 10,
          }}>
            Diagnosis
          </h3>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.8125rem',
            color: T.muted,
            lineHeight: 1.7,
            marginBottom: 14,
          }}>
            {diagnosisText}
          </p>
          {/* Actionable items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topGod && (
              <div style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.8125rem',
                color: T.muted,
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
              }}>
                <span style={{ color: score < 50 ? T.amber : T.muted }}>→</span>
                <span>
                  Split{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(topGod.file)}</span>
                  {' '}({topGod.value} dependents) into smaller modules
                </span>
              </div>
            )}
            {topCoupled && (
              <div style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.8125rem',
                color: T.muted,
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
              }}>
                <span style={{ color: score < 50 ? T.amber : T.muted }}>→</span>
                <span>
                  Reduce imports in{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(topCoupled.file)}</span>
                  {' '}({topCoupled.value} imports)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Metrics Row (3 cards) ────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 16,
        marginBottom: 20,
      }}>
        {/* Total Modules */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: T.muted,
            marginBottom: 4,
          }}>TOTAL MODULES</p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '2.5rem',
            fontWeight: 700,
            color: T.text,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>{totalModules}</p>
        </div>

        {/* God Modules */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: T.muted,
            marginBottom: 4,
          }}>GOD MODULES</p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '2.5rem',
            fontWeight: 700,
            color: godCount > 5 ? T.red : godCount > 0 ? T.amber : T.text,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>{godCount}</p>
          {godCount > 0 && (
            <span style={{
              display: 'inline-block',
              marginTop: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              color: T.red,
              background: 'rgba(239,68,68,0.1)',
              padding: '2px 8px',
              borderRadius: 9999,
            }}>high risk</span>
          )}
        </div>

        {/* Coupled Modules */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: T.muted,
            marginBottom: 4,
          }}>COUPLED MODULES</p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '2.5rem',
            fontWeight: 700,
            color: coupledCount > 3 ? T.amber : T.text,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>{coupledCount}</p>
          {coupledCount > 0 && (
            <span style={{
              display: 'inline-block',
              marginTop: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              color: T.amber,
              background: 'rgba(245,158,11,0.1)',
              padding: '2px 8px',
              borderRadius: 9999,
            }}>review needed</span>
          )}
        </div>
      </div>

      {/* ── Two Column: God Modules + Coupled Modules ────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '55% 1fr',
        gap: 16,
        marginBottom: 20,
      }}>
        {/* God Modules Table */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}>
            <h3 style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: T.text,
            }}>God Modules</h3>
            <InfoTooltip text="Files with 10+ dependents. Changes to these affect many parts of the codebase." />
          </div>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.75rem',
            color: T.muted,
            marginBottom: 14,
          }}>Files with 10+ direct dependents</p>

          {godCount > 0 ? (
            <div>
              {godModules.slice(0, 8).map((mod, i) => {
                const isLast = i === Math.min(godModules.length, 8) - 1;
                const barPct = (mod.value / maxGodValue) * 100;
                const isHigh = mod.value > 20;
                const badgeBg = isHigh ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)';
                const badgeColor = isHigh ? '#fecaca' : '#fef3c7';
                const rowBg = isHigh
                  ? 'rgba(239,68,68,0.03)'
                  : 'rgba(245,158,11,0.03)';

                return (
                  <div
                    key={mod.file}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 80px auto',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 8px',
                      borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
                      background: rowBg,
                      transition: 'background 0.15s ease',
                      borderRadius: 4,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(31,31,35,0.5)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      color: T.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {shortPath(mod.file)}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: badgeBg,
                      color: badgeColor,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {mod.value}
                    </span>
                    {/* Risk bar */}
                    <div style={{
                      background: T.border,
                      borderRadius: 2,
                      height: 3,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${barPct}%`,
                        height: '100%',
                        borderRadius: 2,
                        background: isHigh ? T.red : T.amber,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <button
                      onClick={() => router.push('/graph')}
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: '0.75rem',
                        color: T.muted,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'color 0.15s ease',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                    >
                      View →
                    </button>
                  </div>
                );
              })}
              {godCount > 8 && (
                <button
                  onClick={() => router.push('/graph')}
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
                  onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                  onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                >
                  View all {godCount} →
                </button>
              )}
            </div>
          ) : (
            <p style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.8rem',
              color: T.muted,
            }}>No god modules detected ✨</p>
          )}
        </div>

        {/* Coupled Modules Table */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}>
            <h3 style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: T.text,
            }}>Coupled Modules</h3>
            <InfoTooltip text="Files that import 15+ other modules. These are hard to test and maintain." />
          </div>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.75rem',
            color: T.muted,
            marginBottom: 14,
          }}>Files with 15+ outgoing imports</p>

          {coupledCount > 0 ? (
            <div>
              {coupledModules.slice(0, 8).map((mod, i) => {
                const isLast = i === Math.min(coupledModules.length, 8) - 1;
                const barPct = (mod.value / maxCoupledValue) * 100;
                const isHigh = mod.value > 20;
                const badgeBg = isHigh ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)';
                const badgeColor = isHigh ? '#fecaca' : '#fef3c7';
                const rowBg = isHigh
                  ? 'rgba(239,68,68,0.03)'
                  : 'rgba(245,158,11,0.03)';

                return (
                  <div
                    key={mod.file}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 80px auto',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 8px',
                      borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
                      background: rowBg,
                      transition: 'background 0.15s ease',
                      borderRadius: 4,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(31,31,35,0.5)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      color: T.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {shortPath(mod.file)}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: badgeBg,
                      color: badgeColor,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {mod.value}
                    </span>
                    <div style={{
                      background: T.border,
                      borderRadius: 2,
                      height: 3,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${barPct}%`,
                        height: '100%',
                        borderRadius: 2,
                        background: isHigh ? T.red : T.amber,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <button
                      onClick={() => router.push('/graph')}
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: '0.75rem',
                        color: T.muted,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'color 0.15s ease',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                    >
                      View →
                    </button>
                  </div>
                );
              })}
              {coupledCount > 8 && (
                <button
                  onClick={() => router.push('/graph')}
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
                  onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                  onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                >
                  View all {coupledCount} →
                </button>
              )}
            </div>
          ) : (
            <p style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.8rem',
              color: T.muted,
            }}>No coupled modules detected ✨</p>
          )}
        </div>
      </div>

      {/* ── Isolated Modules ─────────────────────────────────────────── */}
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 4,
        }}>
          <h3 style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: T.text,
          }}>Isolated Modules</h3>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: T.muted,
          }}>({isolatedCount})</span>
        </div>
        <p style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '0.75rem',
          color: T.muted,
          marginBottom: 14,
        }}>
          These files have no imports and nothing imports them. Consider removing.
        </p>
        {isolatedFiles.length > 0 ? (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}>
            {isolatedFiles
              .sort((a, b) => a.localeCompare(b))
              .slice(0, 15)
              .map(f => (
                <span
                  key={f}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: T.muted,
                    background: T.border,
                    padding: '4px 10px',
                    borderRadius: 9999,
                    transition: 'color 0.15s ease',
                    cursor: 'default',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                  onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                >
                  {shortPath(f)}
                </span>
              ))}
            {isolatedFiles.length > 15 && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: T.muted,
                background: T.border,
                padding: '4px 10px',
                borderRadius: 9999,
              }}>
                +{isolatedFiles.length - 15} more
              </span>
            )}
          </div>
        ) : (
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.8rem',
            color: T.muted,
          }}>
            {isolatedCount > 0
              ? `${isolatedCount} isolated files detected. Analyze the graph for details.`
              : 'No isolated modules ✨'}
          </p>
        )}
      </div>

      {/* ── Recommendations ──────────────────────────────────────────── */}
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 20,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
        }}>
          <h3 style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: T.text,
          }}>Recommendations</h3>
          <Lightbulb size={16} style={{ color: T.amber }} />
        </div>
        <div>
          {recommendations.map((rec, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderBottom: i < recommendations.length - 1
                  ? `1px solid ${T.border}`
                  : 'none',
                fontFamily: 'var(--font-ui)',
                fontSize: '0.8125rem',
                color: T.muted,
                transition: 'background 0.15s ease',
                borderRadius: 4,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(31,31,35,0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {rec.icon}
              <span>{rec.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
