'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '../context/AppContext';
import { Search, File, ArrowRight, Zap, MessageSquare, Command } from 'lucide-react';
import { exportHealthReport } from '../lib/exportReport';

/* ─── Theme constants ──────────────────────────────────────────────── */
const T = {
  bg:      '#09090b',
  surface: '#111113',
  border:  '#1f1f23',
  text:    '#ffffff',
  muted:   '#71717a',
  amber:   '#f59e0b',
};

/* ─── Helpers ──────────────────────────────────────────────────────── */
function shortPath(p) {
  if (!p) return '';
  return p.split(/[\\/]/).slice(-2).join('/');
}

function fileName(p) {
  if (!p) return '';
  return p.split(/[\\/]/).pop();
}

/* ─── Static commands ──────────────────────────────────────────────── */
const NAV_COMMANDS = [
  { id: 'nav-dashboard',  label: 'Dashboard',        href: '/' },
  { id: 'nav-graph',      label: 'Dependency Graph',  href: '/graph' },
  { id: 'nav-health',     label: 'Health Report',     href: '/health' },
  { id: 'nav-impact',     label: 'Impact Analysis',   href: '/impact' },
  { id: 'nav-onboard',    label: 'Onboarding',        href: '/onboard' },
];

const ACTION_COMMANDS = [
  { id: 'act-analyze',  label: 'Analyze repository',  action: 'analyze' },
  { id: 'act-chat',     label: 'New chat',             action: 'new-chat' },
  { id: 'act-export-h', label: 'Export health report',  action: 'export-health' },
  { id: 'act-export-g', label: 'Export graph data',     action: 'export-graph' },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  CommandPalette Component                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function CommandPalette({ open, onClose }) {
  const router = useRouter();
  const ctx = useAppContext();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  /* ── Focus input when modal opens ─────────────────────────────── */
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      // Give the DOM time to render
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  /* ── Build results based on query ─────────────────────────────── */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = [];

    // === FILE SEARCH ===
    if (q && ctx?.graphData?.nodes?.length > 0) {
      const matched = ctx.graphData.nodes
        .filter(n => fileName(n.label || n.id).toLowerCase().includes(q) || (n.label || n.id).toLowerCase().includes(q))
        .slice(0, 8);

      if (matched.length > 0) {
        items.push({ type: 'header', label: 'Files' });
        matched.forEach(n => {
          items.push({
            type: 'file',
            id: `file-${n.id}`,
            name: fileName(n.label || n.id),
            path: shortPath(n.id),
            nodeId: n.id,
            label: n.label || n.id,
          });
        });
      }
    }

    // === NAVIGATION ===
    const navMatches = q
      ? NAV_COMMANDS.filter(c => c.label.toLowerCase().includes(q))
      : NAV_COMMANDS;

    if (navMatches.length > 0) {
      if (items.length > 0) items.push({ type: 'separator' });
      items.push({ type: 'header', label: 'Navigation' });
      navMatches.forEach(c => items.push({ ...c, type: 'nav' }));
    }

    // === ACTIONS ===
    const actMatches = q
      ? ACTION_COMMANDS.filter(c => c.label.toLowerCase().includes(q))
      : ACTION_COMMANDS;

    if (actMatches.length > 0) {
      if (items.length > 0) items.push({ type: 'separator' });
      items.push({ type: 'header', label: 'Actions' });
      actMatches.forEach(c => items.push({ ...c, type: 'action' }));
    }

    // === ASK CNI ===
    if (q.length > 0) {
      if (items.length > 0) items.push({ type: 'separator' });
      items.push({ type: 'header', label: 'Ask CNI' });
      items.push({ type: 'ask', id: 'ask-cni', question: query.trim() });
    }

    return items;
  }, [query, ctx?.graphData?.nodes]);

  /* ── Selectable items only (skip headers and separators) ──────── */
  const selectableIndices = useMemo(() => {
    return results
      .map((item, i) => (item.type !== 'header' && item.type !== 'separator') ? i : -1)
      .filter(i => i !== -1);
  }, [results]);

  /* ── Clamp selectedIdx when results change ────────────────────── */
  useEffect(() => {
    if (selectableIndices.length > 0) {
      if (selectedIdx >= selectableIndices.length) setSelectedIdx(0);
    }
  }, [selectableIndices, selectedIdx]);

  /* ── Execute a command ────────────────────────────────────────── */
  const executeItem = useCallback((item) => {
    if (!item) return;
    onClose();

    switch (item.type) {
      case 'file':
        router.push(`/graph?search=${encodeURIComponent(item.label)}`);
        break;
      case 'nav':
        router.push(item.href);
        break;
      case 'action':
        if (item.action === 'analyze' && ctx?.repoPath) {
          ctx.analyze(ctx.repoPath.trim());
        } else if (item.action === 'new-chat') {
          router.push('/graph?chat=open');
        } else if (item.action === 'export-health' && ctx?.healthData && ctx?.repoPath) {
          exportHealthReport(ctx.healthData, ctx.repoPath);
        } else if (item.action === 'export-graph' && ctx?.graphData && ctx?.repoPath) {
          // Export graph as JSON
          const blob = new Blob([JSON.stringify(ctx.graphData, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'cni-graph-export.json';
          a.click();
        }
        break;
      case 'ask':
        router.push(`/graph?chat=open&q=${encodeURIComponent(item.question)}`);
        break;
    }
  }, [ctx, router, onClose]);

  /* ── Keyboard navigation ──────────────────────────────────────── */
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => {
        const next = prev + 1;
        return next >= selectableIndices.length ? 0 : next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => {
        const next = prev - 1;
        return next < 0 ? selectableIndices.length - 1 : next;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const realIdx = selectableIndices[selectedIdx];
      if (realIdx !== undefined) {
        executeItem(results[realIdx]);
      } else if (query.trim()) {
        // Fallback: ask CNI
        onClose();
        router.push(`/graph?chat=open&q=${encodeURIComponent(query.trim())}`);
      }
      return;
    }
  }, [selectableIndices, selectedIdx, results, executeItem, query, onClose, router]);

  /* ── Scroll selected item into view ───────────────────────────── */
  useEffect(() => {
    if (!listRef.current || selectableIndices.length === 0) return;
    const realIdx = selectableIndices[selectedIdx];
    const el = listRef.current.querySelector(`[data-idx="${realIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, selectableIndices]);

  /* ── Don't render if closed ───────────────────────────────────── */
  if (!open) return null;

  const hasSelectableResults = selectableIndices.length > 0;
  const noResultsForQuery = query.trim().length > 0 && selectableIndices.filter(i => results[i]?.type !== 'ask').length === 0;

  return (
    /* ═══ Overlay ═══ */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      {/* ═══ Modal ═══ */}
      <div
        style={{
          width: '90vw', maxWidth: 600,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
          animation: 'cmdkIn 0.15s ease forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ═══ Search Input ═══ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px',
          borderBottom: `1px solid ${T.border}`,
        }}>
          <Search size={18} style={{ color: T.muted, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            placeholder="Search commands, files, or ask CNI..."
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9375rem',
              color: T.text,
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setSelectedIdx(0); }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                color: T.muted,
                background: T.border,
                border: 'none',
                borderRadius: 4,
                padding: '2px 6px',
                cursor: 'pointer',
              }}
            >
              ESC
            </button>
          )}
        </div>

        {/* ═══ Results List ═══ */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 8,
          }}
        >
          {/* Empty state */}
          {noResultsForQuery && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '32px 16px', gap: 8,
            }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.muted }}>
                No results for &ldquo;{query.trim()}&rdquo;
              </span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: T.muted }}>
                Press Enter to ask CNI
              </span>
            </div>
          )}

          {results.map((item, idx) => {
            // Header
            if (item.type === 'header') {
              return (
                <div key={`h-${item.label}`} data-idx={idx} style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: T.muted,
                  padding: '8px 16px 4px',
                  userSelect: 'none',
                }}>
                  {item.label}
                </div>
              );
            }

            // Separator
            if (item.type === 'separator') {
              return (
                <div key={`sep-${idx}`} data-idx={idx} style={{
                  height: 1,
                  background: T.border,
                  margin: '4px 8px',
                }} />
              );
            }

            // Selectable item
            const selectablePos = selectableIndices.indexOf(idx);
            const isSelected = selectablePos === selectedIdx;

            // File result
            if (item.type === 'file') {
              return (
                <button
                  key={item.id}
                  data-idx={idx}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIdx(selectablePos)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    borderLeft: isSelected ? `2px solid ${T.text}` : '2px solid transparent',
                    background: isSelected ? T.border : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                    textAlign: 'left',
                  }}
                >
                  <File size={14} style={{ color: T.muted, flexShrink: 0 }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8125rem',
                    color: T.text,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: T.muted,
                    flexShrink: 0,
                  }}>
                    {item.path}
                  </span>
                </button>
              );
            }

            // Navigation result
            if (item.type === 'nav') {
              return (
                <button
                  key={item.id}
                  data-idx={idx}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIdx(selectablePos)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    borderLeft: isSelected ? `2px solid ${T.text}` : '2px solid transparent',
                    background: isSelected ? T.border : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                    textAlign: 'left',
                  }}
                >
                  <ArrowRight size={14} style={{ color: T.muted, flexShrink: 0 }} />
                  <span style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.8125rem',
                    color: T.text,
                  }}>
                    Navigate to {item.label}
                  </span>
                </button>
              );
            }

            // Action result
            if (item.type === 'action') {
              return (
                <button
                  key={item.id}
                  data-idx={idx}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIdx(selectablePos)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    borderLeft: isSelected ? `2px solid ${T.text}` : '2px solid transparent',
                    background: isSelected ? T.border : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                    textAlign: 'left',
                  }}
                >
                  <Zap size={14} style={{ color: T.muted, flexShrink: 0 }} />
                  <span style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.8125rem',
                    color: T.text,
                  }}>
                    {item.label}
                  </span>
                </button>
              );
            }

            // Ask CNI result
            if (item.type === 'ask') {
              return (
                <button
                  key={item.id}
                  data-idx={idx}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIdx(selectablePos)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    borderLeft: isSelected ? `2px solid ${T.text}` : '2px solid transparent',
                    background: isSelected ? T.border : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                    textAlign: 'left',
                  }}
                >
                  <MessageSquare size={14} style={{ color: T.amber, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: T.text }}>
                    Ask CNI:{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', color: T.muted }}>
                      {item.question}
                    </span>
                  </span>
                </button>
              );
            }

            return null;
          })}
        </div>

        {/* ═══ Footer ═══ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '8px 16px',
          borderTop: `1px solid ${T.border}`,
        }}>
          {[
            { hint: '↑↓', label: 'navigate' },
            { hint: '↵', label: 'select' },
            { hint: 'esc', label: 'close' },
          ].map(({ hint, label }, i) => (
            <span key={label} style={{
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {i > 0 && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', color: T.muted, marginRight: 4 }}>·</span>}
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                color: T.muted,
                background: T.border,
                borderRadius: 3,
                padding: '1px 5px',
              }}>
                {hint}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                color: T.muted,
              }}>
                {label}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ═══ Animation Keyframes ═══ */}
      <style>{`
        @keyframes cmdkIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
