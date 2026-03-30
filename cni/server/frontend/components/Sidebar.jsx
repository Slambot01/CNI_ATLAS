'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppContext } from '../context/AppContext';
import {
  LayoutDashboard,
  Network,
  Activity,
  Zap,
  BookOpen,
  Star,
  X,
  ChevronDown,
  FolderGit2,
  PanelLeftClose,
  PanelLeftOpen,
  Command,
} from 'lucide-react';

/* ─── Theme ────────────────────────────────────────────────────────── */
const T = {
  bg:      '#09090b',
  surface: '#111113',
  border:  '#1f1f23',
  text:    '#ffffff',
  muted:   '#71717a',
  green:   '#22c55e',
};

/* ────────────────────────────────────────────────────────────────── */
/*  Navigation items                                                 */
/* ────────────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { href: '/',        label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/graph',   label: 'Graph',     Icon: Network },
  { href: '/health',  label: 'Health',    Icon: Activity },
  { href: '/impact',  label: 'Impact',    Icon: Zap },
  { href: '/onboard', label: 'Onboard',   Icon: BookOpen },
];

const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH  = 220;
const LS_KEY          = 'cni_sidebar_collapsed';

/* ────────────────────────────────────────────────────────────────── */
/*  Command Palette Hint                                             */
/* ────────────────────────────────────────────────────────────────── */
function CmdKHint({ collapsed, onOpenCommandPalette }) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(
      typeof navigator !== 'undefined' &&
      (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
       navigator.userAgentData?.platform === 'macOS')
    );
  }, []);

  const shortcut = isMac ? '⌘K' : 'Ctrl K';

  if (collapsed) {
    return (
      <button
        onClick={onOpenCommandPalette}
        className="flex items-center justify-center py-2 mx-2 rounded-lg transition-all duration-150 group relative"
        style={{ color: T.muted }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.border; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = 'transparent'; }}
      >
        <Command size={14} />
        <span
          className="absolute left-full ml-3 px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
          style={{
            background: T.border,
            border: `1px solid ${T.border}`,
            color: T.text,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            borderRadius: 6,
            fontFamily: 'var(--font-ui)',
            fontSize: '0.75rem',
          }}
        >
          Command palette (⌘K)
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onOpenCommandPalette}
      className="flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg transition-all duration-150"
      style={{ color: T.muted }}
      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.border; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        background: T.border,
        borderRadius: 4,
        padding: '2px 6px',
      }}>
        {shortcut}
      </span>
      <span style={{ fontSize: '0.7rem' }}>
        Command palette
      </span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Sidebar Component                                                */
/* ────────────────────────────────────────────────────────────────── */
export default function Sidebar({ onOpenCommandPalette }) {
  const pathname = usePathname();
  const router   = useRouter();
  const ctx      = useAppContext();

  const isAnalyzed    = ctx?.isAnalyzed;
  const repoPath      = ctx?.repoPath || '';
  const bookmarks     = ctx?.bookmarks || [];
  const removeBookmark = ctx?.removeBookmark;

  /* ── Collapsed state with localStorage persistence ────────────── */
  const [collapsed, setCollapsed] = useState(true);
  const didMount = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored !== null) setCollapsed(stored === 'true');
    } catch { /* private browsing */ }
    didMount.current = true;
  }, []);

  useEffect(() => {
    if (!didMount.current) return;
    try { localStorage.setItem(LS_KEY, String(collapsed)); } catch { /* ignore */ }
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`
    );
  }, [collapsed]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`
    );
  }, []);

  const toggleCollapsed = () => setCollapsed((c) => !c);

  /* ── Derived values ───────────────────────────────────────────── */
  const shortName = repoPath
    ? repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repoPath
    : '';

  const handleBookmarkClick = (file) => {
    router.push(`/graph?search=${encodeURIComponent(file)}`);
  };

  const maxShow = 8;
  const visibleBookmarks = bookmarks.slice(0, maxShow);
  const extraCount = bookmarks.length - maxShow;
  const [bookmarksOpen, setBookmarksOpen] = useState(true);

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  /* ── Tooltip helper ───────────────────────────────────────────── */
  const tooltipStyle = {
    background: T.border,
    border: `1px solid ${T.border}`,
    color: T.text,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    borderRadius: 6,
    fontFamily: 'var(--font-ui)',
    fontSize: '0.75rem',
  };

  /* ────────────────────────────────────────────────────────────── */
  /*  Render                                                       */
  /* ────────────────────────────────────────────────────────────── */
  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col z-50"
      style={{
        width,
        background: T.bg,
        borderRight: `1px solid ${T.border}`,
        transition: 'width 0.25s ease',
        overflow: 'hidden',
      }}
    >
      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Branding                                                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4" style={{ minHeight: 60 }}>
        <Link href="/" className="flex items-center gap-2.5 group">
          {collapsed ? (
            <span
              className="flex items-center justify-center transition-all duration-150"
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: T.border,
                color: T.text,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: '0.875rem',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(113,113,122,0.3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.border; }}
            >
              C
            </span>
          ) : (
            <>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: T.text,
                }}
              >
                CNI
              </span>
              <span
                className="text-[10px] leading-tight"
                style={{ color: T.muted, fontFamily: 'var(--font-mono)', opacity: 0.6 }}
              >
                Codebase<br />Neural Interface
              </span>
            </>
          )}
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Navigation                                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {!collapsed && (
        <div className="px-4 pt-1 pb-1.5">
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.muted }}>
            NAVIGATION
          </span>
        </div>
      )}

      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center gap-2.5 transition-all duration-150 group"
              style={{
                padding: collapsed ? '8px 0' : '8px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: isActive ? T.border : 'transparent',
                borderRadius: isActive ? '0 8px 8px 0' : 8,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = T.border;
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              {/* Active indicator: white left bar */}
              {isActive && (
                <span
                  className="absolute"
                  style={{
                    left: collapsed ? -2 : 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 2,
                    height: 20,
                    borderRadius: 2,
                    background: T.text,
                  }}
                />
              )}
              <Icon
                size={18}
                className="flex-shrink-0 transition-colors duration-150"
                style={{
                  color: isActive ? T.text : T.muted,
                }}
              />
              {!collapsed && (
                <span
                  className="text-sm font-medium truncate transition-colors duration-150"
                  style={{
                    color: isActive ? T.text : T.muted,
                  }}
                >
                  {label}
                </span>
              )}

              {/* Tooltip — collapsed only */}
              {collapsed && (
                <span
                  className="absolute left-full ml-3 px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
                  style={tooltipStyle}
                >
                  {label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Bookmarks                                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {bookmarks.length > 0 && (
        <div className="mt-3 px-2">
          {/* Section header */}
          {!collapsed && (
            <button
              onClick={() => setBookmarksOpen(!bookmarksOpen)}
              className="w-full flex items-center justify-between px-2 py-1.5 mb-1"
            >
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.muted }}>
                BOOKMARKS
              </span>
              <ChevronDown
                size={12}
                className="transition-transform duration-200"
                style={{
                  color: T.muted,
                  transform: bookmarksOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>
          )}

          {/* Collapsed: star icon */}
          {collapsed && (
            <button
              onClick={() => setBookmarksOpen(!bookmarksOpen)}
              className="w-full flex items-center justify-center py-2 rounded-lg transition-all duration-150 group relative"
              style={{ color: T.muted }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.border; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted; }}
            >
              <Star size={16} />
              <span
                className="absolute left-full ml-3 px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
                style={tooltipStyle}
              >
                {bookmarks.length} Bookmark{bookmarks.length !== 1 ? 's' : ''}
              </span>
            </button>
          )}

          {/* Expanded bookmark list */}
          {!collapsed && bookmarksOpen && (
            <div className="space-y-0.5 animate-fade-in">
              {visibleBookmarks.map((bm) => (
                <div key={bm.file} className="relative group">
                  <button
                    onClick={() => handleBookmarkClick(bm.file)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs truncate text-left transition-all duration-150"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: T.muted,
                      fontSize: '0.6875rem',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = T.border;
                      e.currentTarget.style.color = T.text;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = T.muted;
                    }}
                    title={bm.note ? `${bm.file}\n📝 ${bm.note}` : bm.file}
                  >
                    <Star size={11} className="flex-shrink-0" style={{ color: T.muted }} />
                    <span className="truncate">{bm.file.split(/[/\\]/).pop()}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeBookmark(bm.file); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all duration-150"
                    style={{ color: T.muted }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={(e) => e.currentTarget.style.color = T.muted}
                    title="Remove bookmark"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {extraCount > 0 && (
                <p className="text-[10px] text-center py-0.5" style={{ color: T.muted }}>
                  +{extraCount} more
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Spacer                                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1" />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Command Palette Hint                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <CmdKHint collapsed={collapsed} onOpenCommandPalette={onOpenCommandPalette} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Connection Status Dot                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="px-3 pb-2">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5 group relative">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: isAnalyzed ? T.green : T.muted,
              }}
            />
            {shortName && (
              <span
                className="absolute left-full ml-3 bottom-0 px-2.5 py-1.5 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
                style={{
                  fontFamily: 'var(--font-mono)',
                  ...tooltipStyle,
                }}
              >
                {shortName}
              </span>
            )}
          </div>
        ) : (
          <div
            className="p-2.5 transition-colors duration-150"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <FolderGit2 size={14} style={{ color: T.muted }} />
              <span
                className="text-xs font-medium truncate"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: isAnalyzed ? T.text : T.muted,
                }}
              >
                {shortName || 'No repo'}
              </span>
              {isAnalyzed && (
                <div
                  className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
                  style={{ background: T.green }}
                />
              )}
            </div>
            {repoPath && (
              <p
                className="text-[10px] truncate pl-5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: T.muted,
                }}
                title={repoPath}
              >
                {repoPath}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Collapse / Expand Toggle                                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <button
        onClick={toggleCollapsed}
        className="flex items-center justify-center gap-2 py-3 transition-all duration-150 group relative"
        style={{
          borderTop: `1px solid ${T.border}`,
          color: T.muted,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = T.border;
          e.currentTarget.style.color = T.text;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = T.muted;
        }}
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        {!collapsed && (
          <span className="text-xs font-medium">Collapse</span>
        )}
        {collapsed && (
          <span
            className="absolute left-full ml-3 px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
            style={tooltipStyle}
          >
            Expand sidebar
          </span>
        )}
      </button>
    </aside>
  );
}
