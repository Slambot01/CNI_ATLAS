'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAnalysisContext } from '../client-layout';
import { useOnboardChat } from '../../hooks/useOnboardChat';
import {
  Send, MessageSquare, Trash2, MessageSquarePlus, History,
  ChevronDown, Download, Check, Zap, Plus, ArrowUp, Info,
} from 'lucide-react';
import { exportOnboardReport } from '../../lib/exportReport';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useAppContext } from '../../context/AppContext';

/* ─── Theme ────────────────────────────────────────────────────────── */
const T = {
  bg:      '#09090b',
  surface: '#111113',
  border:  '#1f1f23',
  text:    '#ffffff',
  muted:   '#71717a',
  amber:   '#f59e0b',
  green:   '#22c55e',
  red:     '#ef4444',
};

/* ─── Helpers ──────────────────────────────────────────────────────── */
function shortPath(p) {
  if (!p) return p;
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/') : parts.pop() || p;
}

function detectFramework(ep) {
  if (!ep) return 'Generic';
  const lower = (typeof ep === 'string' ? ep : '').toLowerCase();
  if (lower.includes('fastapi') || lower.includes('@app.') || lower.includes('@router.')) return 'FastAPI';
  if (lower.includes('django') || lower.includes('urlpatterns')) return 'Django';
  if (lower.includes('flask') || lower.includes('flask')) return 'Flask';
  if (lower.includes('cli') || lower.includes('click') || lower.includes('argparse') || lower.includes('command')) return 'CLI';
  return 'Generic';
}

function dedupeEntryPoints(eps) {
  if (!eps) return [];
  const map = new Map();
  eps.forEach(ep => {
    const name = (typeof ep === 'string' ? ep : ep?.file || '').split(/[\\/]/).pop();
    if (!map.has(name)) map.set(name, { name, paths: [], raw: ep });
    map.get(name).paths.push(typeof ep === 'string' ? ep : ep?.file || '');
  });
  return Array.from(map.values());
}

function progressMessage(pct) {
  if (pct === 0) return 'Start here — read entry points first';
  if (pct <= 25) return 'Good start — keep going';
  if (pct <= 75) return 'Making progress';
  if (pct < 100) return 'Almost done';
  return null; // 100% handled separately
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function OnboardPage() {
  const {
    repoPath, stats,
    onboardData: data, onboardLoading: loading, onboardError: error,
    fetchOnboard, setOnboardError,
    graphData, fetchGraph,
  } = useAnalysisContext();

  const {
    messages, streaming, error: chatError, ollamaDown,
    sessionId, sessions, sessionsOpen, setSessionsOpen,
    sendMessage, clearChat, startNewSession, loadSession, removeSession,
  } = useOnboardChat();

  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);
  const sessionsRef = useRef(null);
  const [epExpanded, setEpExpanded] = useState(false);

  const {
    checklist, checklistProgress,
    fetchChecklist, fetchChecklistProgress, toggleChecklistItem,
  } = useAppContext();

  useEffect(() => {
    if (repoPath && stats) {
      fetchOnboard(repoPath);
      fetchGraph(repoPath);
    }
  }, [repoPath, stats, fetchOnboard, fetchGraph]);

  useEffect(() => {
    if (data && repoPath) { fetchChecklist(); fetchChecklistProgress(); }
  }, [data, repoPath, fetchChecklist, fetchChecklistProgress]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClick = (e) => {
      if (sessionsRef.current && !sessionsRef.current.contains(e.target)) setSessionsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [setSessionsOpen]);

  const handleChatSend = (text) => {
    const q = (text || chatInput).trim();
    if (!q || !repoPath || streaming) return;
    sendMessage(q, repoPath);
    setChatInput('');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'Z');
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
    } catch { return dateStr; }
  };

  /* ── Derived data ─────────────────────────────────────────────── */
  const entryPoints = useMemo(() => dedupeEntryPoints(data?.entry_points), [data?.entry_points]);

  const checklistGroups = useMemo(() => {
    if (!checklist.length) return { groups: {}, completedCount: 0, totalCount: 0, pct: 0 };
    const groups = {};
    const LABELS = { entry_point: 'ENTRY POINTS', core: 'CORE MODULES', config: 'CONFIGURATION', utility: 'UTILITIES' };
    const ORDER = ['entry_point', 'core', 'config', 'utility'];
    checklist.forEach(item => {
      const cat = item.category || 'utility';
      if (!groups[cat]) groups[cat] = { label: LABELS[cat] || cat.toUpperCase(), items: [] };
      groups[cat].items.push(item);
    });
    const ordered = {};
    ORDER.forEach(k => { if (groups[k]) ordered[k] = groups[k]; });
    const completedCount = checklist.filter(item => checklistProgress[item.file]).length;
    const totalCount = checklist.length;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    return { groups: ordered, completedCount, totalCount, pct };
  }, [checklist, checklistProgress]);

  const maxCentrality = useMemo(() =>
    Math.max(...(data?.critical_modules?.map(m => m.centrality) || [0.01]), 0.01),
  [data?.critical_modules]);

  const archSummaryFallback = useMemo(() => {
    if (!graphData?.nodes?.length) return null;
    const nodes = graphData.nodes;
    const fileCount = nodes.length;
    const dirs = new Set(nodes.map(n => (n.id || n.label || '').split(/[\\/]/).slice(0, -1).join('/')).filter(Boolean));
    const dirCount = Math.max(dirs.size, 1);
    const topNode = nodes.reduce((best, n) => (n.indegree || 0) > (best.indegree || 0) ? n : best, nodes[0]);
    const topModule = shortPath(topNode?.label || topNode?.id || 'unknown');
    const isolated = nodes.filter(n => (n.indegree || 0) === 0 && (n.outdegree || 0) === 0).length;
    let framework = 'Python';
    if (data?.entry_points?.length) {
      const raw = typeof data.entry_points[0] === 'string' ? data.entry_points[0] : '';
      framework = detectFramework(raw);
    }
    return { fileCount, dirCount, topModule, indegree: topNode?.indegree || 0, framework, isolated };
  }, [graphData, data?.entry_points]);

  /* ── Guards ───────────────────────────────────────────────────── */
  if (!repoPath || !stats) return <NotAnalyzed />;
  if (loading) return <LoadingSkeleton variant="text" message="Generating onboarding report… This may take a minute" />;
  if (error) return (
    <div style={{ padding: 28 }}>
      <ErrorMessage message={error.message} hint={error.hint} onRetry={() => { setOnboardError(null); fetchOnboard(repoPath); }} />
    </div>
  );
  if (!data) return null;

  const { groups, completedCount, totalCount, pct } = checklistGroups;
  const currentSessionLabel = sessions.find(s => s.session_id === sessionId);

  const suggestedQuestions = [
    'What should I read first?',
    'How do the entry points connect?',
    'Which modules are most risky to change?',
    'Explain the architecture',
    'What are the god modules?',
  ];

  const EP_LIMIT = 8;
  const visibleEps = epExpanded ? entryPoints : entryPoints.slice(0, EP_LIMIT);
  const epOverflow = entryPoints.length - EP_LIMIT;

  /* ── Styles helper ────────────────────────────────────────────── */
  const card = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    padding: 20,
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  return (
    <div style={{ padding: 28 }} className="animate-fade-in">

      {/* ═══ PAGE TITLE + EXPORT ═══ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-ui)', fontSize: '1.25rem', fontWeight: 600, color: T.text, margin: 0 }}>
            Developer Onboarding
          </h1>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted, marginTop: 4 }}>
            Your guided tour of this codebase
          </p>
        </div>
        <button
          onClick={() => exportOnboardReport(data, repoPath)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: T.border, border: `1px solid ${T.border}`, borderRadius: 8,
            padding: '8px 16px', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border; }}
        >
          <Download size={16} /> Export Guide
        </button>
      </div>

      {/* ═══ SECTION 1 — PROGRESS HEADER BAR ═══ */}
      {totalCount > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text }}>
              Reading Progress
            </span>
            <span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: T.text }}>{completedCount} / {totalCount}</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted, marginLeft: 6 }}>({pct}%)</span>
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ width: '100%', height: 8, background: T.border, borderRadius: 9999 }}>
            <div style={{
              width: `${Math.max(pct, 0)}%`,
              height: '100%',
              borderRadius: 9999,
              background: pct === 100 ? T.green : T.text,
              transition: 'width 0.4s ease',
            }} />
          </div>
          {/* Motivational text */}
          <p style={{
            fontFamily: 'var(--font-ui)', fontSize: '0.75rem', marginTop: 8,
            color: pct === 100 ? T.green : T.muted,
          }}>
            {pct === 100 ? '✓ Onboarding complete' : progressMessage(pct)}
          </p>
        </div>
      )}

      {/* ═══ SECTION 2 — TWO COLUMN LAYOUT ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '55fr 45fr', gap: 16, marginBottom: 16 }}>

        {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ENTRY POINTS CARD */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text }}>
                Entry Points
              </span>
              {entryPoints.length > 0 && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: T.muted,
                  background: T.border, padding: '2px 8px', borderRadius: 9999,
                }}>
                  {entryPoints.length}
                </span>
              )}
            </div>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted, marginBottom: 12 }}>
              Where code execution begins
            </p>

            {entryPoints.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted }}>No entry points detected.</p>
            ) : (
              <div>
                {visibleEps.map((ep, i) => {
                  const raw = typeof ep.raw === 'string' ? ep.raw : ep.raw?.file || '';
                  const reason = typeof ep.raw === 'object' ? ep.raw?.reason || '' : '';
                  const fw = detectFramework(reason || raw);
                  return (
                    <div
                      key={ep.name + i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px',
                        borderBottom: i < visibleEps.length - 1 ? `1px solid ${T.border}` : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        borderRadius: i === 0 ? '8px 8px 0 0' : i === visibleEps.length - 1 ? '0 0 8px 8px' : 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = T.border; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => {
                        window.location.href = `/graph?search=${encodeURIComponent(ep.name)}`;
                      }}
                    >
                      <Zap size={14} style={{ color: T.amber, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: T.text }}>
                            {ep.name}
                          </span>
                          {ep.paths.length > 1 && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: T.muted }}>
                              ×{ep.paths.length}
                            </span>
                          )}
                        </div>
                        {reason && (
                          <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: T.muted, display: 'block', marginTop: 2 }}>
                            Entry point — {reason}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: T.muted,
                        background: T.border, padding: '2px 8px', borderRadius: 9999, flexShrink: 0,
                      }}>
                        {fw}
                      </span>
                    </div>
                  );
                })}
                {!epExpanded && epOverflow > 0 && (
                  <button
                    onClick={() => setEpExpanded(true)}
                    style={{
                      fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      padding: '10px 16px', width: '100%', textAlign: 'left',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                  >
                    + {epOverflow} more
                  </button>
                )}
                {epExpanded && entryPoints.length > EP_LIMIT && (
                  <button
                    onClick={() => setEpExpanded(false)}
                    style={{
                      fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      padding: '10px 16px', width: '100%', textAlign: 'left',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                  >
                    Show less
                  </button>
                )}
              </div>
            )}
          </div>

          {/* READING CHECKLIST CARD */}
          {totalCount > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text }}>
                  Reading Checklist
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: T.muted }}>
                  {completedCount}/{totalCount}
                </span>
              </div>

              {Object.entries(groups).map(([cat, group], gi) => (
                <div key={cat}>
                  {/* Section header */}
                  <div style={{
                    fontFamily: 'var(--font-ui)', fontSize: '0.6rem', fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: '0.1em', color: T.muted,
                    paddingTop: gi === 0 ? 0 : 16, paddingBottom: 6, userSelect: 'none',
                  }}>
                    {group.label}
                  </div>
                  {/* Items */}
                  {group.items.map(item => {
                    const done = !!checklistProgress[item.file];
                    return (
                      <div
                        key={item.file}
                        onClick={() => toggleChecklistItem(item.file)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          height: 36, padding: '0 16px', borderRadius: 6,
                          cursor: 'pointer', transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={e => { if (!done) e.currentTarget.style.background = 'rgba(31,31,35,0.5)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: done ? 'none' : `1.5px solid ${T.border}`,
                          background: done ? (pct === 100 ? T.green : T.text) : 'transparent',
                          transition: 'all 0.2s ease',
                        }}>
                          {done && <Check size={10} style={{ color: T.bg }} />}
                        </div>
                        {/* Filename */}
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
                          color: done ? T.muted : T.text,
                          textDecoration: done ? 'line-through' : 'none',
                          transition: 'color 0.2s ease',
                        }}>
                          {shortPath(item.file)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* CRITICAL MODULES CARD */}
          {data.critical_modules?.length > 0 && (
            <div style={card}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text, display: 'block' }}>
                Critical Modules
              </span>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted, marginBottom: 12 }}>
                Ranked by betweenness centrality
              </p>
              {data.critical_modules.slice(0, 10).map((mod, i) => {
                const barPct = Math.max(2, (mod.centrality / maxCentrality) * 100);
                let barColor = T.text;
                if (i >= 3 && i < 7) barColor = 'rgba(255,255,255,0.4)';
                if (i >= 7) barColor = 'rgba(255,255,255,0.15)';
                return (
                  <div key={mod.name + i} style={{
                    padding: '10px 0',
                    borderBottom: i < Math.min(data.critical_modules.length, 10) - 1 ? `1px solid ${T.border}` : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: T.muted, width: 20, textAlign: 'right' }}>
                          {i + 1}.
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: T.text }}>
                          {shortPath(mod.name)}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                        {mod.centrality.toFixed(4)}
                      </span>
                    </div>
                    {/* Bar */}
                    <div style={{ marginTop: 6, height: 3, background: T.border, borderRadius: 9999 }}>
                      <div style={{
                        width: `${barPct}%`, height: '100%', borderRadius: 9999,
                        background: barColor, transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ARCHITECTURE SUMMARY CARD */}
          <div style={{
            ...card,
            borderLeft: `2px solid ${T.border}`,
          }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text, display: 'block', marginBottom: 12 }}>
              Architecture Summary
            </span>

            {data.summary && !data.summary.toLowerCase().includes('llm unavailable') && !data.summary.toLowerCase().includes('error') && !data.summary.toLowerCase().includes('cannot connect') ? (
              <>
                <p style={{
                  fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted,
                  lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0,
                }}>
                  {data.summary}
                </p>
                <span style={{
                  display: 'inline-block', marginTop: 12,
                  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: T.muted,
                  background: T.border, padding: '2px 8px', borderRadius: 9999,
                }}>
                  AI generated
                </span>
              </>
            ) : archSummaryFallback ? (
              <>
                <p style={{
                  fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted,
                  lineHeight: 1.7, margin: 0,
                }}>
                  This codebase has <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{archSummaryFallback.fileCount}</span> files organized in <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{archSummaryFallback.dirCount}</span> directories.
                  The most critical module is <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{archSummaryFallback.topModule}</span> with <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{archSummaryFallback.indegree}</span> dependents.
                  Entry points suggest this is a <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{archSummaryFallback.framework}</span> application.
                  {archSummaryFallback.isolated > 0 && (
                    <> <span style={{ fontFamily: 'var(--font-mono)', color: T.text }}>{archSummaryFallback.isolated}</span> files appear unused and may be candidates for removal.</>
                  )}
                </p>
                <span style={{
                  display: 'inline-block', marginTop: 12,
                  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: T.muted,
                  background: T.border, padding: '2px 8px', borderRadius: 9999,
                }}>
                  Static analysis
                </span>
              </>
            ) : (
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted }}>
                Analyze a repository to generate the architecture summary.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ SECTION 3 — FOLLOW-UP CHAT ═══ */}
      <div style={card}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text }}>
            Ask Follow-up Questions
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} ref={sessionsRef}>
            <button
              onClick={startNewSession}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted,
                background: T.border, border: `1px solid ${T.border}`, borderRadius: 8,
                padding: '6px 12px', cursor: 'pointer', transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border; }}
            >
              <Plus size={14} /> New
            </button>

            {sessions.length > 0 && (
              <button
                onClick={() => setSessionsOpen(!sessionsOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted,
                  background: sessionsOpen ? T.border : 'transparent',
                  border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: '6px 12px', cursor: 'pointer', transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border; }}
              >
                <History size={12} />
                <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentSessionLabel ? formatDate(currentSessionLabel.created_at) : sessions.length}
                </span>
                <ChevronDown size={10} style={{ transform: sessionsOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }} />
              </button>
            )}

            {messages.length > 0 && (
              <button
                onClick={clearChat}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted,
                  background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: '6px 12px', cursor: 'pointer', transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = T.red; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
              >
                <Trash2 size={12} /> Clear
              </button>
            )}

            {/* Sessions dropdown */}
            {sessionsOpen && sessions.length > 0 && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 8,
                width: 288, maxHeight: 224, overflowY: 'auto', zIndex: 50,
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: 8,
              }}>
                {sessions.map(s => (
                  <div
                    key={s.session_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer', borderRadius: 8,
                      background: s.session_id === sessionId ? T.border : 'transparent',
                      borderLeft: s.session_id === sessionId ? `2px solid ${T.text}` : '2px solid transparent',
                      transition: 'background 0.15s ease',
                    }}
                    onClick={() => loadSession(s.session_id)}
                    onMouseEnter={e => { if (s.session_id !== sessionId) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { if (s.session_id !== sessionId) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: s.session_id === sessionId ? T.text : T.muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.first_message || 'Empty session'}
                      </p>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: T.muted, margin: '2px 0 0 0' }}>
                        {formatDate(s.created_at)} · {s.message_count} msgs
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeSession(s.session_id); }}
                      style={{ opacity: 0, padding: 4, borderRadius: 4, border: 'none', cursor: 'pointer', color: T.muted, background: 'transparent', transition: 'opacity 0.15s ease, color 0.15s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.red; e.currentTarget.style.opacity = 1; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
                      className="group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Suggested questions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {suggestedQuestions.map(q => (
            <button
              key={q}
              onClick={() => handleChatSend(q)}
              style={{
                fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted,
                background: T.border, border: 'none', borderRadius: 9999,
                padding: '6px 14px', cursor: 'pointer', transition: 'color 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Ollama / chat errors */}
        {ollamaDown && <div style={{ marginTop: 12 }}><ErrorMessage message="Cannot connect to Ollama" hint="Start Ollama with: ollama serve" /></div>}
        {chatError && !ollamaDown && <div style={{ marginTop: 12 }}><ErrorMessage message={chatError.message} hint={chatError.hint} /></div>}

        {/* Chat messages area */}
        <div style={{
          minHeight: 200, maxHeight: 400, overflowY: 'auto',
          marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 16,
        }}>
          {messages.length === 0 && !ollamaDown && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 8 }}>
              <MessageSquare size={32} style={{ color: T.border }} />
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted }}>
                Ask anything about the architecture
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  ...(msg.role === 'user' ? {
                    background: T.border,
                    borderRadius: '12px 12px 2px 12px',
                  } : {
                    background: 'transparent',
                    border: `1px solid ${T.border}`,
                    borderRadius: '12px 12px 12px 2px',
                  }),
                }}>
                  <div style={{
                    fontFamily: msg.role === 'user' ? 'var(--font-ui)' : 'var(--font-ui)',
                    fontSize: '0.8125rem',
                    color: msg.role === 'user' ? T.text : T.muted,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                  }}>
                    {msg.content}
                    {msg.role === 'assistant' && streaming && i === messages.length - 1 && msg.content && (
                      <span style={{
                        display: 'inline-block', width: 6, height: 14, marginLeft: 2,
                        background: T.text, animation: 'pulse 1s ease infinite',
                      }} />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {streaming && messages.length > 0 && messages[messages.length - 1]?.content === '' && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px', border: `1px solid ${T.border}`, borderRadius: '12px 12px 12px 2px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.muted, animation: 'bounce 1.2s ease infinite' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.muted, animation: 'bounce 1.2s ease infinite 0.15s' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.muted, animation: 'bounce 1.2s ease infinite 0.3s' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div style={{ display: 'flex', gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 8 }}>
          <input
            type="text"
            placeholder="Ask about the architecture..."
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleChatSend()}
            disabled={streaming || ollamaDown}
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: T.text,
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
              padding: '10px 16px', outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = T.muted; }}
            onBlur={e => { e.currentTarget.style.borderColor = T.border; }}
          />
          <button
            onClick={() => handleChatSend()}
            disabled={!chatInput.trim() || streaming || ollamaDown}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: chatInput.trim() && !streaming ? T.text : T.border,
              color: chatInput.trim() && !streaming ? T.bg : T.muted,
              transition: 'all 0.15s ease',
              opacity: !chatInput.trim() || streaming || ollamaDown ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (chatInput.trim() && !streaming) e.currentTarget.style.background = '#e4e4e7'; }}
            onMouseLeave={e => { if (chatInput.trim() && !streaming) e.currentTarget.style.background = T.text; }}
          >
            {streaming ? (
              <span style={{ width: 16, height: 16, border: `2px solid rgba(0,0,0,0.2)`, borderTopColor: T.bg, borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'block' }} />
            ) : (
              <ArrowUp size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
