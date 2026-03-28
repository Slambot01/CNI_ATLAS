'use client';

export default function StatsBar({ stats, healthData }) {
  const items = [
    {
      label: 'Files',
      value: stats?.files ?? '—',
      color: 'text-indigo-400',
    },
    {
      label: 'Dependencies',
      value: stats?.dependencies != null
        ? stats.dependencies >= 1000
          ? `${(stats.dependencies / 1000).toFixed(1)}k`
          : stats.dependencies
        : '—',
      color: 'text-cyan-400',
    },
    {
      label: 'Health',
      value: healthData?.score ?? '—',
      color: healthData
        ? healthData.score > 80
          ? 'text-green-400'
          : healthData.score > 50
            ? 'text-yellow-400'
            : 'text-red-400'
        : 'text-cni-muted',
    },
  ];

  return (
    <footer className="fixed bottom-0 left-56 right-0 h-10 bg-cni-surface/90 backdrop-blur-md border-t border-cni-border flex items-center justify-between px-6 z-30">
      <div className="flex items-center gap-6">
        {/* Connection indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${stats ? 'bg-green-500 animate-pulse-slow' : 'bg-cni-muted'}`} />
          <span className="text-xs text-cni-muted">
            {stats ? 'Connected' : 'Not analyzed'}
          </span>
        </div>

        {/* Stat items */}
        {items.map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs">
            <span className="text-cni-muted">{label}:</span>
            <span className={`font-semibold ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      <span className="text-[10px] text-cni-muted">CNI v0.1.0</span>
    </footer>
  );
}
