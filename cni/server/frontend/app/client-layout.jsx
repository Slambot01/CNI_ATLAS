'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import StatsBar from '../components/StatsBar';
import CommandPalette from '../components/CommandPalette';
import AppContextProvider, { useAppContext } from '../context/AppContext';

const T = {
  bg:     '#09090b',
  border: '#1f1f23',
  text:   '#ffffff',
  muted:  '#71717a',
};

/**
 * Re-export useAppContext as useAnalysisContext for backward compatibility.
 */
export function useAnalysisContext() {
  return useAppContext();
}

function LayoutShell({ children }) {
  const ctx = useAppContext();
  const [cmdkOpen, setCmdkOpen] = useState(false);

  /* ── CMD+K / CTRL+K global listener ────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdkOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const closePalette = useCallback(() => setCmdkOpen(false), []);
  const openPalette = useCallback(() => setCmdkOpen(true), []);

  /* ── Short repo path: folder/project ───────────────────────────── */
  const shortRepo = ctx.repoPath
    ? ctx.repoPath.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/')
    : '';

  return (
    <>
      <Sidebar repoPath={ctx.repoPath} isAnalyzed={ctx.isAnalyzed} onOpenCommandPalette={openPalette} />

      {/* ═══ Header ═══ */}
      <header
        className="fixed top-0 right-0 flex items-center z-30"
        style={{
          left: 'var(--sidebar-width, 64px)',
          height: 48,
          padding: '0 24px',
          background: T.bg,
          borderBottom: `1px solid ${T.border}`,
          transition: 'left 0.25s ease',
        }}
      >
        {/* Left: CNI branding + repo path */}
        <div className="flex items-center flex-1 min-w-0">
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            fontWeight: 700,
            color: T.text,
          }}>
            CNI
          </span>

          {shortRepo && (
            <>
              <span style={{ color: T.border, margin: '0 12px', fontSize: '0.875rem', userSelect: 'none' }}>│</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                color: T.muted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {shortRepo}
              </span>
            </>
          )}

          {!shortRepo && (
            <>
              <span style={{ color: T.border, margin: '0 12px', fontSize: '0.875rem', userSelect: 'none' }}>│</span>
              <input
                type="text"
                placeholder="Enter repository path (e.g. /path/to/project)"
                className="flex-1 h-8 text-sm"
                value={ctx.repoPath}
                onChange={(e) => ctx.setRepoPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ctx.repoPath.trim()) ctx.analyze(ctx.repoPath.trim());
                }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem',
                  color: T.text,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
              />
            </>
          )}
        </div>

        {/* Right: Analyze button */}
        <button
          className="flex items-center justify-center text-sm disabled:opacity-40"
          disabled={ctx.loading || !ctx.repoPath.trim()}
          onClick={() => ctx.analyze(ctx.repoPath.trim())}
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.8125rem',
            color: T.text,
            background: 'transparent',
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: '6px 16px',
            cursor: ctx.loading || !ctx.repoPath.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!ctx.loading && ctx.repoPath.trim()) {
              e.currentTarget.style.background = T.border;
              e.currentTarget.style.borderColor = T.muted;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = T.border;
          }}
        >
          {ctx.loading ? (
            <span className="flex items-center gap-2" style={{ color: T.muted }}>
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing…
            </span>
          ) : (
            'Analyze'
          )}
        </button>
      </header>

      {/* ═══ Main content ═══ */}
      <main
        className="mb-8 min-h-[calc(100vh-5.5rem)]"
        style={{
          marginTop: 48,
          marginLeft: 'var(--sidebar-width, 64px)',
          transition: 'margin-left 0.25s ease',
        }}
      >
        {ctx.recovering && (
          <div
            className="mx-5 mt-4 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2.5 animate-fade-in"
            style={{
              background: 'rgba(59, 130, 246, 0.06)',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
            }}
          >
            <span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            Re-connecting to server…
          </div>
        )}
        {ctx.error && (
          <div
            className="mx-5 mt-4 px-4 py-3 rounded-xl text-sm animate-fade-in"
            style={{
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#f87171',
            }}
          >
            {ctx.error.message || ctx.error}
          </div>
        )}
        {children}
      </main>

      <StatsBar stats={ctx.stats} healthData={ctx.healthData} />
      <CommandPalette open={cmdkOpen} onClose={closePalette} />
    </>
  );
}

export default function ClientLayout({ children }) {
  return (
    <AppContextProvider>
      <LayoutShell>{children}</LayoutShell>
    </AppContextProvider>
  );
}
