'use client';

export default function StatsBar({ stats, healthData }) {
  const items = [
    { label: 'Files', value: stats?.files ?? '—', color: '#60a5fa' },
    { label: 'Deps', value: stats?.dependencies != null
        ? stats.dependencies >= 1000 ? `${(stats.dependencies / 1000).toFixed(1)}k` : stats.dependencies
        : '—',
      color: '#22d3ee',
    },
    { label: 'Health', value: healthData?.score ?? '—',
      color: healthData ? (healthData.score > 80 ? '#4ade80' : healthData.score > 50 ? '#fbbf24' : '#f87171') : '#64748b',
    },
  ];

  return (
    <footer className="fixed bottom-0 left-16 right-0 h-9 flex items-center justify-between px-5 z-30 text-xs"
      style={{ background: 'rgba(6, 10, 19, 0.9)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--cni-border)' }}>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${stats ? 'animate-pulse-slow' : ''}`}
            style={{ background: stats ? '#22c55e' : 'var(--cni-muted)', boxShadow: stats ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none' }} />
          <span style={{ color: 'var(--cni-muted)' }}>{stats ? 'Connected' : 'Not analyzed'}</span>
        </div>

        {items.map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span style={{ color: 'var(--cni-muted)' }}>{label}:</span>
            <span className="font-semibold" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>
      <span style={{ color: 'var(--cni-muted)', fontSize: '10px' }}>CNI v0.1.0 · Local</span>
    </footer>
  );
}
