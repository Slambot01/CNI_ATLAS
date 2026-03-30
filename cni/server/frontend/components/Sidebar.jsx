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
} from 'lucide-react';

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
/*  Sidebar Component                                                */
/* ────────────────────────────────────────────────────────────────── */
export default function Sidebar() {
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

  // Set initial CSS var on mount
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

  /* ────────────────────────────────────────────────────────────── */
  /*  Render                                                       */
  /* ────────────────────────────────────────────────────────────── */
  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col z-50"
      style={{
        width,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-default)',
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
              className="text-lg font-extrabold transition-transform duration-200 group-hover:scale-110"
              style={{ color: 'var(--accent)' }}
            >
              C
            </span>
          ) : (
            <>
              <span
                className="text-lg font-extrabold"
                style={{ color: 'var(--accent)' }}
              >
                CNI
              </span>
              <span
                className="text-[10px] leading-tight opacity-60"
                style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
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
          <span className="text-label">NAVIGATION</span>
        </div>
      )}

      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center gap-2.5 transition-all duration-200 group"
              style={{
                padding: collapsed ? '8px 0' : '8px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: 'transparent',
                borderRadius: 8,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              {/* Active indicator: 3px rounded green bar on left edge */}
              {isActive && (
                <span
                  className="absolute"
                  style={{
                    left: collapsed ? -2 : 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 20,
                    borderRadius: 3,
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px rgba(34, 197, 94, 0.4)',
                  }}
                />
              )}
              <Icon
                size={18}
                className="flex-shrink-0 transition-all duration-200"
                style={{
                  color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                }}
              />
              {!collapsed && (
                <span
                  className="text-sm font-medium truncate transition-colors duration-200"
                  style={{
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </span>
              )}

              {/* Tooltip — collapsed only */}
              {collapsed && (
                <span
                  className="absolute left-full ml-3 px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
                  style={{
                    background: '#1a1a1e',
                    border: '1px solid var(--border-hover)',
                    color: 'var(--text-primary)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    borderRadius: 8,
                  }}
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
              <span className="text-label">BOOKMARKS</span>
              <ChevronDown
                size={12}
                className="transition-transform duration-200"
                style={{
                  color: 'var(--text-muted)',
                  transform: bookmarksOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>
          )}

          {/* Collapsed: just star icon with count */}
          {collapsed && (
            <button
              onClick={() => setBookmarksOpen(!bookmarksOpen)}
              className="w-full flex items-center justify-center py-2 rounded-lg transition-colors duration-200 group relative"
              style={{ color: '#FFD700' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 215, 0, 0.06)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Star size={16} fill="#FFD700" />
              {/* Tooltip */}
              <span
                className="absolute left-full ml-3 px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
                style={{
                  background: '#1a1a1e',
                  border: '1px solid var(--border-hover)',
                  color: 'var(--text-primary)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  borderRadius: 8,
                }}
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
                      color: 'var(--text-secondary)',
                      fontSize: '0.6875rem',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 215, 0, 0.06)';
                      e.currentTarget.style.color = '#FFD700';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    title={bm.note ? `${bm.file}\n📝 ${bm.note}` : bm.file}
                  >
                    <Star size={11} className="flex-shrink-0" style={{ color: '#FFD700' }} />
                    <span className="truncate">{bm.file.split(/[/\\]/).pop()}</span>
                  </button>
                  {/* Remove on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeBookmark(bm.file); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all duration-150"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    title="Remove bookmark"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {extraCount > 0 && (
                <p className="text-[10px] text-center py-0.5" style={{ color: 'var(--text-muted)' }}>
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
      {/*  Repo Indicator                                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="px-3 pb-2">
        {collapsed ? (
          /* Collapsed: green dot only */
          <div className="flex flex-col items-center gap-1.5 group relative">
            <div
              className={`w-2.5 h-2.5 rounded-full ${isAnalyzed ? 'animate-pulse-dot' : ''}`}
              style={{
                background: isAnalyzed ? 'var(--accent)' : 'var(--text-muted)',
                boxShadow: isAnalyzed ? '0 0 8px rgba(34, 197, 94, 0.5)' : 'none',
              }}
            />
            {/* Tooltip */}
            {shortName && (
              <span
                className="absolute left-full ml-3 bottom-0 px-2.5 py-1.5 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: '#1a1a1e',
                  border: '1px solid var(--border-hover)',
                  color: 'var(--accent)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  borderRadius: 8,
                }}
              >
                {shortName}
              </span>
            )}
          </div>
        ) : (
          /* Expanded: full repo info */
          <div
            className="p-2.5 transition-colors duration-200"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: 10,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <FolderGit2 size={14} style={{ color: 'var(--text-secondary)' }} />
              <span
                className="text-xs font-medium truncate"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: isAnalyzed ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {shortName || 'No repo'}
              </span>
              {isAnalyzed && (
                <div
                  className="w-2 h-2 rounded-full ml-auto flex-shrink-0 animate-pulse-dot"
                  style={{
                    background: 'var(--accent)',
                    boxShadow: '0 0 6px rgba(34, 197, 94, 0.5)',
                  }}
                />
              )}
            </div>
            {repoPath && (
              <p
                className="text-[10px] truncate pl-5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
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
        className="flex items-center justify-center gap-2 py-3 transition-colors duration-200 group relative"
        style={{
          borderTop: '1px solid var(--border-default)',
          color: 'var(--text-muted)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        {!collapsed && (
          <span className="text-xs font-medium">Collapse</span>
        )}
        {/* Tooltip — collapsed only */}
        {collapsed && (
          <span
            className="absolute left-full ml-3 px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[60]"
            style={{
              background: '#1a1a1e',
              border: '1px solid var(--border-hover)',
              color: 'var(--text-primary)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              borderRadius: 8,
            }}
          >
            Expand sidebar
          </span>
        )}
      </button>
    </aside>
  );
}
