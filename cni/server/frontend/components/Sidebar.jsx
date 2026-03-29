'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppContext } from '../context/AppContext';
import { Star, X, ChevronDown } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',        label: 'Dashboard', icon: '⬡' },
  { href: '/graph',   label: 'Graph',     icon: '◎' },
  { href: '/health',  label: 'Health',    icon: '♥' },
  { href: '/impact',  label: 'Impact',    icon: '⚡' },
  { href: '/onboard', label: 'Onboard',   icon: '◉' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const ctx = useAppContext();
  const isAnalyzed = ctx?.isAnalyzed;
  const repoPath = ctx?.repoPath || '';
  const bookmarks = ctx?.bookmarks || [];
  const removeBookmark = ctx?.removeBookmark;

  const [bookmarksOpen, setBookmarksOpen] = useState(true);

  // Extract short name from path (last directory segment)
  const shortName = repoPath
    ? repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || repoPath
    : '';

  const handleBookmarkClick = (file) => {
    // Navigate to graph and highlight that node (via query param)
    router.push(`/graph?search=${encodeURIComponent(file)}`);
  };

  const maxShow = 8;
  const visibleBookmarks = bookmarks.slice(0, maxShow);
  const extraCount = bookmarks.length - maxShow;

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 flex flex-col items-center py-4 z-50"
      style={{ background: 'var(--cni-sidebar-bg)', borderRight: '1px solid var(--cni-border)' }}>

      {/* Logo */}
      <Link href="/" className="mb-6 group">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm transition-all duration-300 group-hover:shadow-lg"
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', boxShadow: '0 2px 12px rgba(59, 130, 246, 0.3)' }}>
          C
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center text-base transition-all duration-200 group"
              style={{
                background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: isActive ? '#60a5fa' : 'var(--cni-muted)',
                border: isActive ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid transparent',
              }}
            >
              <span className="group-hover:scale-110 transition-transform duration-200">{icon}</span>
              {/* Tooltip */}
              <span className="absolute left-full ml-3 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200"
                style={{ background: 'var(--cni-surface-2)', border: '1px solid var(--cni-border)', color: 'var(--cni-text)' }}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bookmarks section */}
      {bookmarks.length > 0 && (
        <div className="mt-3 w-full px-1.5">
          <button
            onClick={() => setBookmarksOpen(!bookmarksOpen)}
            className="w-full flex items-center justify-center gap-0.5 py-1.5 rounded-lg text-[9px] font-medium transition-all duration-200 group relative"
            style={{ color: '#FFD700' }}
            title={`${bookmarks.length} bookmark${bookmarks.length !== 1 ? 's' : ''}`}
          >
            <Star size={11} fill="#FFD700" />
            <span>{bookmarks.length}</span>
            <ChevronDown size={8} className={`transition-transform duration-200 ${bookmarksOpen ? 'rotate-180' : ''}`} />
            {/* Tooltip */}
            <span className="absolute left-full ml-3 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200"
              style={{ background: 'var(--cni-surface-2)', border: '1px solid var(--cni-border)', color: 'var(--cni-text)' }}>
              Bookmarks
            </span>
          </button>

          {bookmarksOpen && (
            <div className="mt-1 space-y-0.5 animate-fade-in">
              {visibleBookmarks.map((bm) => (
                <div
                  key={bm.file}
                  className="relative group"
                >
                  <button
                    onClick={() => handleBookmarkClick(bm.file)}
                    className="w-full px-1.5 py-1.5 rounded-lg text-[8px] font-mono truncate text-left transition-all duration-150"
                    style={{ color: 'var(--cni-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 215, 0, 0.06)'; e.currentTarget.style.color = '#FFD700'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--cni-muted)'; }}
                    title={bm.note ? `${bm.file}\n📝 ${bm.note}` : bm.file}
                  >
                    {bm.file.split(/[/\\]/).pop()}
                  </button>
                  {/* Remove button on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeBookmark(bm.file); }}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all duration-150"
                    style={{ color: 'var(--cni-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--cni-muted)'}
                    title="Remove bookmark"
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
              {extraCount > 0 && (
                <p className="text-[8px] text-center py-0.5" style={{ color: 'var(--cni-muted)' }}>
                  +{extraCount} more
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Repo indicator */}
      <div className="flex flex-col items-center gap-1.5 mb-1 group relative">
        <div className={`w-2 h-2 rounded-full ${isAnalyzed ? 'animate-pulse-slow' : ''}`}
          style={{
            background: isAnalyzed ? '#22c55e' : 'var(--cni-muted)',
            boxShadow: isAnalyzed ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none',
          }}
          title={isAnalyzed ? `Repo: ${repoPath}` : 'Not analyzed'} />
        {/* Short repo name */}
        {isAnalyzed && shortName && (
          <span className="text-[9px] font-mono text-center leading-tight truncate w-14"
            style={{ color: '#4ade80' }}
            title={repoPath}>
            📁 {shortName}
          </span>
        )}
        {/* Repo name tooltip */}
        {shortName && (
          <span className="absolute bottom-full mb-2 left-full ml-3 px-2.5 py-1.5 rounded-lg text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200"
            style={{ background: 'var(--cni-surface-2)', border: '1px solid var(--cni-border)', color: '#4ade80' }}>
            {shortName}
          </span>
        )}
      </div>
    </aside>
  );
}
