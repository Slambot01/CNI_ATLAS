'use client';

const T = {
  bg:    '#09090b',
  border:'#1f1f23',
  text:  '#ffffff',
  muted: '#71717a',
  green: '#22c55e',
  red:   '#ef4444',
};

export default function StatsBar({ stats, healthData }) {
  return (
    <footer
      className="fixed bottom-0 right-0 flex items-center justify-between px-5 z-30 text-xs"
      style={{
        left: 'var(--sidebar-width, 64px)',
        height: 32,
        background: T.bg,
        borderTop: `1px solid ${T.border}`,
        transition: 'left 0.25s ease',
      }}
    >
      <div className="flex items-center gap-5">
        {/* Connection dot + text */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: stats ? T.green : T.muted }}
          />
          <span style={{ fontFamily: 'var(--font-ui)', color: T.muted, fontSize: '0.7rem' }}>
            {stats ? 'Connected' : 'Not analyzed'}
          </span>
        </div>

        {/* Stats: labels in muted, numbers in white */}
        <div className="flex items-center gap-1.5">
          <span style={{ color: T.muted }}>Files:</span>
          <span style={{ color: T.text, fontFamily: 'var(--font-mono)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {stats?.files ?? '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: T.muted }}>Deps:</span>
          <span style={{ color: T.text, fontFamily: 'var(--font-mono)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {stats?.dependencies != null
              ? stats.dependencies >= 1000 ? `${(stats.dependencies / 1000).toFixed(1)}k` : stats.dependencies
              : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: T.muted }}>Health:</span>
          <span style={{ color: T.text, fontFamily: 'var(--font-mono)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {healthData?.score ?? '—'}
          </span>
        </div>
      </div>

      <span style={{ color: T.muted, fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
        CNI v0.1.0 · Local
      </span>
    </footer>
  );
}
