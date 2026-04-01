'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAnalysisContext } from '../client-layout';
import {
  Download, Zap, AlertTriangle, Check,
  Lightbulb, GitBranch, File, ArrowRight,
  Info, ChevronDown, ChevronRight, FlaskConical,
} from 'lucide-react';
import { exportImpactReport } from '../../lib/exportReport';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';

/* ================================================================== */
/*  Theme                                                              */
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
  blue: '#3b82f6',
};

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */
function shortPath(p) {
  if (!p) return '';
  // If already relative (no colon, doesn't start with /), show as-is
  if (!p.includes(':') && !p.startsWith('/')) return p;
  return p.split(/[\\/]/).slice(-2).join('/');
}

function classifyFile(dep, nodes) {
  // Use server-provided type if available
  if (dep.type && dep.type !== 'Normal') return dep.type;
  const node = nodes.find(n => n.label === dep.file || shortPath(n.label) === shortPath(dep.file));
  if (!node) return 'Normal';
  if (node.outdegree === 0 && node.indegree > 0) return 'Entry Point';
  if (node.indegree >= 5 && node.outdegree >= 5) return 'Hub';
  return 'Normal';
}

/* Score color helper (Bug 2) */
function scoreColor(score) {
  if (score >= 8) return T.red;
  if (score >= 5) return T.amber;
  if (score >= 2) return T.blue;
  return T.muted;
}

/* ================================================================== */
/*  Score Tooltip (Bug 2)                                              */
/* ================================================================== */
function ScoreTooltip() {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info size={12} style={{ color: T.muted }} />
      {show && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          right: 0,
          marginBottom: 6,
          background: '#1c1c20',
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: '12px 14px',
          width: 240,
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: T.text,
            marginBottom: 8,
          }}>Criticality Score (0–10)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { range: '+3', desc: 'if file is an entry point', color: T.red },
              { range: '+2', desc: 'if file has 5+ dependents', color: T.amber },
              { range: '+1', desc: 'per dependency chain depth', color: T.blue },
            ].map((r, i) => (
              <p key={i} style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.6875rem',
                color: T.muted,
                lineHeight: 1.5,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: r.color, fontWeight: 600, marginRight: 6 }}>{r.range}</span>
                {r.desc}
              </p>
            ))}
          </div>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.625rem',
            color: T.muted,
            marginTop: 8,
            borderTop: `1px solid ${T.border}`,
            paddingTop: 8,
          }}>Higher = more careful review needed</p>
        </div>
      )}
    </span>
  );
}

/* ================================================================== */
/*  Autocomplete Input                                                 */
/* ================================================================== */
function FileInput({ value, onChange, onSubmit, nodes }) {
  const [focused, setFocused] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const wrapRef = useRef(null);

  const matches = useMemo(() => {
    if (!value.trim() || !nodes.length) return [];
    const q = value.toLowerCase();
    return nodes
      .filter(n => shortPath(n.label).toLowerCase().includes(q))
      .slice(0, 8)
      .map(n => n.label);
  }, [value, nodes]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, maxWidth: 440 }}>
      <input
        type="text"
        placeholder="e.g. auth.py, models.py"
        value={value}
        onChange={e => { onChange(e.target.value); setShowDrop(true); }}
        onFocus={() => { setFocused(true); setShowDrop(true); }}
        onBlur={() => setFocused(false)}
        onKeyDown={e => { if (e.key === 'Enter') { setShowDrop(false); onSubmit(); } }}
        style={{
          width: '100%',
          background: T.surface,
          border: `1px solid ${focused ? T.muted : T.border}`,
          borderRadius: 8,
          padding: '10px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
          color: T.text,
          outline: 'none',
          transition: 'border-color 0.15s ease',
        }}
      />
      {showDrop && matches.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          maxHeight: 200,
          overflowY: 'auto',
          zIndex: 50,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {matches.map(m => (
            <div
              key={m}
              style={{
                padding: '8px 16px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                color: T.text,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              onMouseDown={() => { onChange(m); setShowDrop(false); }}
              onMouseEnter={e => { e.currentTarget.style.background = T.border; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {shortPath(m)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Collapsible Section                                                */
/* ================================================================== */
function CollapsibleSection({ label, icon, items, defaultOpen = true, renderItem }) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  const ChevronIcon = open ? ChevronDown : ChevronRight;

  return (
    <>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: T.bg,
          borderBottom: `1px solid ${T.border}`,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#0d0d0f'; }}
        onMouseLeave={e => { e.currentTarget.style.background = T.bg; }}
      >
        <ChevronIcon size={14} style={{ color: T.muted, flexShrink: 0 }} />
        {icon}
        <span style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '0.75rem',
          color: T.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>{label} ({items.length})</span>
      </div>
      {open && items.map((item, i) => renderItem(item, i, items.length))}
    </>
  );
}

/* ================================================================== */
/*  Impact Page                                                        */
/* ================================================================== */
export default function ImpactPage() {
  const router = useRouter();
  const {
    repoPath, stats, graphData,
    impactData: data, impactFile: cachedFile,
    impactLoading: loading, impactError: error,
    fetchImpact, setImpactFile, setImpactError, fetchGraph,
  } = useAnalysisContext();
  const [file, setFile] = useState('');

  useEffect(() => { if (cachedFile && !file) setFile(cachedFile); }, [cachedFile, file]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const f = new URLSearchParams(window.location.search).get('file');
      if (f) setFile(f);
    }
  }, []);

  useEffect(() => {
    if (repoPath && stats && graphData.nodes.length === 0) fetchGraph(repoPath);
  }, [repoPath, stats, graphData.nodes.length, fetchGraph]);

  const handleAnalyze = () => {
    if (!file.trim() || !repoPath) return;
    setImpactError(null);
    setImpactFile(file.trim());
    fetchImpact(file.trim(), repoPath);
  };

  // Suggestion pills (top indegree files when no results yet)
  const suggestions = useMemo(() => {
    return graphData.nodes
      .filter(n => n.indegree >= 3)
      .sort((a, b) => b.indegree - a.indegree)
      .slice(0, 5)
      .map(n => n.label);
  }, [graphData.nodes]);

  if (!repoPath || !stats) return <NotAnalyzed />;

  // Derived data when results are available
  const directCount = data?.direct ?? 0;
  const transitiveCount = data?.transitive ?? 0;
  const totalCount = directCount + transitiveCount;
  const risk = data?.risk || 'LOW';
  const dependents = data?.dependents || [];
  const maxScore = dependents.length > 0 ? Math.max(...dependents.map(d => d.score)) : 1;

  // Group dependents by server-provided type (Bug 1)
  const sourceDeps = dependents.filter(d => d.type === 'source' || (!d.type));
  const testDeps = dependents.filter(d => d.type === 'test');
  const exampleDeps = dependents.filter(d => d.type === 'example');

  // Also classify by role for sub-grouping source files
  const classified = sourceDeps.map(d => ({
    ...d,
    role: classifyFile(d, graphData.nodes),
  }));
  const entryPoints = classified.filter(d => d.role === 'Entry Point');
  const hubs = classified.filter(d => d.role === 'Hub');
  const regulars = classified.filter(d => d.role === 'Normal');

  // Risk config
  const riskColor = risk === 'HIGH' ? T.red : risk === 'MEDIUM' ? T.amber : T.green;
  const riskBg = risk === 'HIGH'
    ? 'rgba(239,68,68,0.05)'
    : risk === 'MEDIUM'
      ? 'rgba(245,158,11,0.05)'
      : 'rgba(34,197,94,0.05)';
  const riskContext = risk === 'HIGH'
    ? 'change with extreme caution'
    : risk === 'MEDIUM'
      ? 'review dependents before merging'
      : 'safe to modify with basic testing';

  const RiskIcon = risk === 'LOW' ? Check : AlertTriangle;

  // Badge helper
  const getBadge = (score) => {
    if (score >= 7) return { bg: 'rgba(239,68,68,0.15)', color: '#fecaca', barColor: T.red };
    if (score >= 4) return { bg: 'rgba(245,158,11,0.15)', color: '#fef3c7', barColor: T.amber };
    return { bg: T.border, color: T.muted, barColor: T.muted };
  };

  const getRowBg = (score) => {
    if (score >= 7) return 'rgba(239,68,68,0.03)';
    if (score >= 4) return 'rgba(245,158,11,0.03)';
    return 'transparent';
  };

  // Render a single dependent row
  const renderDepRow = (dep, i, total) => {
    const badge = getBadge(dep.score);
    const rowBg = getRowBg(dep.score);
    const barW = Math.max(8, (dep.score / maxScore) * 100);
    const role = dep.role || classifyFile(dep, graphData.nodes);
    return (
      <div
        key={dep.file + i}
        onClick={() => router.push('/graph')}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto 80px',
          alignItems: 'center',
          gap: 14,
          padding: '12px 16px',
          borderBottom: i < total - 1 ? `1px solid ${T.border}` : 'none',
          background: rowBg,
          cursor: 'pointer',
          transition: 'background 0.15s ease',
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
        }}>{shortPath(dep.file)}</span>
        <span style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '0.75rem',
          color: T.muted,
        }}>{role}</span>
        {/* Bug 2: Color-coded scores */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 9999,
          background: badge.bg,
          color: scoreColor(dep.score),
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}>{dep.score.toFixed(1)}</span>
        <div style={{
          background: T.border,
          borderRadius: 2,
          height: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${barW}%`,
            height: '100%',
            borderRadius: 2,
            background: badge.barColor,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 28 }} className="animate-fade-in">
      {/* ── Title + Export ────────────────────────────────────────── */}
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
          }}>Impact Analysis</h1>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.8125rem',
            color: T.muted,
            marginTop: 4,
          }}>Analyze how changes propagate through your codebase</p>
        </div>
        {data && (
          <button
            onClick={() => exportImpactReport(data, cachedFile, repoPath)}
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
            onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
            onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border; }}
          >
            <Download size={16} />
            Export Report
          </button>
        )}
      </div>

      {/* ── Input Section ────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 20,
        alignItems: 'center',
      }}>
        <FileInput
          value={file}
          onChange={setFile}
          onSubmit={handleAnalyze}
          nodes={graphData.nodes}
        />
        <button
          onClick={handleAnalyze}
          disabled={loading || !file.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: T.text,
            color: T.bg,
            fontFamily: 'var(--font-ui)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            borderRadius: 8,
            padding: '10px 20px',
            border: 'none',
            cursor: loading || !file.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !file.trim() ? 0.5 : 1,
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          onMouseEnter={e => { if (!loading && file.trim()) e.currentTarget.style.background = '#e4e4e7'; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.text; }}
        >
          {loading ? (
            <>
              <span style={{
                width: 14, height: 14,
                border: '2px solid rgba(0,0,0,0.2)',
                borderTopColor: T.bg,
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }} />
              Analyzing…
            </>
          ) : (
            <><Zap size={14} /> Analyze Impact</>
          )}
        </button>
      </div>

      {/* Suggestion pills (before results) */}
      {suggestions.length > 0 && !data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => setFile(s)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                padding: '4px 12px',
                borderRadius: 9999,
                background: T.border,
                border: 'none',
                color: T.muted,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
            >
              {shortPath(s)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 20 }}>
          <ErrorMessage message={error.message} hint={error.hint} onRetry={handleAnalyze} />
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────── */}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-slide-up">
          {/* Risk Banner */}
          <div style={{
            background: riskBg,
            borderLeft: `3px solid ${riskColor}`,
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <RiskIcon size={24} style={{ color: riskColor, flexShrink: 0 }} />
              <span style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '1rem',
                fontWeight: 600,
                color: T.text,
              }}>
                {risk} RISK
                <span style={{ fontWeight: 400, color: T.muted }}>
                  {' '}— Changing{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(cachedFile)}</span>
                  {risk === 'LOW'
                    ? ' has limited impact'
                    : ` affects ${totalCount} modules`}
                </span>
              </span>
            </div>
            <p style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.8125rem',
              color: T.muted,
              marginLeft: 34,
            }}>
              {risk === 'LOW'
                ? `Only ${totalCount} files are affected. Safe to modify with basic testing.`
                : `This file is imported by ${directCount} direct dependents and ${transitiveCount} transitive dependents`}
            </p>
          </div>

          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.muted, marginBottom: 4 }}>DIRECT DEPENDENTS</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{directCount}</p>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted, marginTop: 6 }}>{directCount} files directly import this</p>
            </div>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.muted, marginBottom: 4 }}>TRANSITIVE DEPENDENTS</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{transitiveCount}</p>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted, marginTop: 6 }}>{transitiveCount} more are affected transitively</p>
            </div>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.muted, marginBottom: 4 }}>RISK LEVEL</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, color: riskColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{risk}</p>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted, marginTop: 6 }}>{riskContext}</p>
            </div>
          </div>

          {/* Affected Files Table */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text }}>Affected Files</h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: T.muted }}>({dependents.length})</span>
            </div>

            {dependents.length > 0 ? (
              <div>
                {/* Column headers */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto 80px',
                  gap: 14,
                  padding: '0 16px 8px',
                  borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>File</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Type</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Score <ScoreTooltip />
                  </span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Risk</span>
                </div>

                {/* Source files — always open */}
                {sourceDeps.length > 0 && (
                  <>
                    <CollapsibleSection
                      label="Source files affected"
                      icon={<File size={14} style={{ color: T.text }} />}
                      items={entryPoints}
                      defaultOpen={true}
                      renderItem={renderDepRow}
                    />
                    <CollapsibleSection
                      label="Hub modules"
                      icon={<GitBranch size={14} style={{ color: T.muted }} />}
                      items={hubs}
                      defaultOpen={true}
                      renderItem={renderDepRow}
                    />
                    <CollapsibleSection
                      label="Regular files"
                      icon={<File size={14} style={{ color: T.muted }} />}
                      items={regulars}
                      defaultOpen={true}
                      renderItem={renderDepRow}
                    />
                  </>
                )}

                {/* Test files — collapsed by default (Bug 1) */}
                {testDeps.length > 0 && (
                  <CollapsibleSection
                    label="Test files affected"
                    icon={<FlaskConical size={14} style={{ color: T.amber }} />}
                    items={testDeps}
                    defaultOpen={false}
                    renderItem={renderDepRow}
                  />
                )}

                {/* Example files — collapsed by default */}
                {exampleDeps.length > 0 && (
                  <CollapsibleSection
                    label="Example files affected"
                    icon={<Lightbulb size={14} style={{ color: T.amber }} />}
                    items={exampleDeps}
                    defaultOpen={false}
                    renderItem={renderDepRow}
                  />
                )}
              </div>
            ) : (
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: T.muted }}>No dependents found.</p>
            )}

            {/* Scope note */}
            {data.note && (
              <p style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.6875rem',
                color: T.muted,
                marginTop: 14,
                padding: '8px 12px',
                background: T.bg,
                borderRadius: 6,
                borderLeft: `2px solid ${T.border}`,
              }}>{data.note}</p>
            )}
          </div>

          {/* What This Means */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text }}>What This Means</h3>
              <Lightbulb size={16} style={{ color: T.amber }} />
            </div>

            {risk === 'HIGH' && (
              <>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted, marginBottom: 12 }}>
                  Before modifying <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{shortPath(cachedFile)}</span>:
                </p>
                <div style={{ borderLeft: `2px solid ${T.red}`, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {[
                    <>Review all <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{directCount}</span> direct dependents</>,
                    <>Run full test suite — <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{transitiveCount}</span> transitive files affected</>,
                    <>Consider creating an interface/abstraction layer</>,
                    <>Coordinate with team before merging</>,
                  ].map((item, i) => (
                    <div key={i} style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: '0.8125rem',
                      color: T.muted,
                      lineHeight: 1.6,
                      padding: '8px 0',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: T.text, marginRight: 8 }}>{i + 1}.</span>
                      {item}
                    </div>
                  ))}
                </div>
              </>
            )}

            {risk === 'MEDIUM' && (
              <div style={{ borderLeft: `2px solid ${T.amber}`, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  <>Review the <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{directCount}</span> direct dependents and run targeted tests.</>,
                  <>Check hub modules that import this for cascading effects.</>,
                ].map((item, i) => (
                  <div key={i} style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.8125rem',
                    color: T.muted,
                    lineHeight: 1.6,
                    padding: '8px 0',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: T.text, marginRight: 8 }}>{i + 1}.</span>
                    {item}
                  </div>
                ))}
              </div>
            )}

            {risk === 'LOW' && (
              <div style={{ borderLeft: `2px solid ${T.green}`, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  <>This change is relatively safe.</>,
                  <>Run tests for the <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{totalCount}</span> affected files and you're good.</>,
                ].map((item, i) => (
                  <div key={i} style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.8125rem',
                    color: T.muted,
                    lineHeight: 1.6,
                    padding: '8px 0',
                  }}>
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
