'use client';

import { useAnalysisContext } from './client-layout';

export default function DashboardPage() {
  const { stats, healthData, loading } = useAnalysisContext();

  if (!stats && !loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-6 animate-fade-in">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-cni-accent to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-2xl shadow-cni-accent/30">
            C
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cni-text mb-2">
              Welcome to CNI
            </h1>
            <p className="text-cni-muted text-sm max-w-md mx-auto">
              Enter a repository path above and click <span className="text-cni-accent font-medium">Analyze</span> to
              explore your codebase with interactive dependency graphs, LLM chat, and health dashboards.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-cni-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              100% Local
            </span>
            <span>·</span>
            <span>No Cloud</span>
            <span>·</span>
            <span>No Data Leaves Your Machine</span>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-10 h-10 mx-auto border-3 border-cni-border border-t-cni-accent rounded-full animate-spin" />
          <p className="text-sm text-cni-muted">Scanning repository…</p>
        </div>
      </div>
    );
  }

  const cards = [
    { label: 'Files Indexed', value: stats.files, color: 'from-indigo-500/20 to-indigo-600/5', textColor: 'text-indigo-400' },
    { label: 'Dependencies', value: stats.dependencies, color: 'from-cyan-500/20 to-cyan-600/5', textColor: 'text-cyan-400' },
    { label: 'Isolated Files', value: stats.isolated, color: 'from-amber-500/20 to-amber-600/5', textColor: 'text-amber-400' },
    { label: 'Most Imported', value: stats.most_imported, color: 'from-rose-500/20 to-rose-600/5', textColor: 'text-rose-400' },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {cards.map(({ label, value, color, textColor }) => (
          <div key={label} className="glass-card p-5 glow-accent animate-slide-up">
            <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${color} pointer-events-none`} />
            <div className="relative">
              <p className="text-xs text-cni-muted mb-1">{label}</p>
              <p className={`text-3xl font-bold ${textColor}`}>{value.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Health overview */}
      {healthData && (
        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-xs text-cni-muted mb-1">Codebase Health Score</p>
              <p className={`text-5xl font-bold ${
                healthData.score > 80 ? 'text-green-400' :
                healthData.score > 50 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {healthData.score}
                <span className="text-lg text-cni-muted font-normal ml-1">/ 100</span>
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-cni-muted">
                {healthData.total_modules} modules · {healthData.god_modules?.length || 0} god modules
              </p>
              <p className="text-xs text-cni-muted">
                {healthData.coupled_modules?.length || 0} coupled · {healthData.isolated_count} isolated
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { href: '/graph', label: 'Dependency Graph', desc: 'Interactive ReactFlow visualization', icon: '◎' },
          { href: '/chat', label: 'Ask CNI', desc: 'Query your codebase with LLM', icon: '◈' },
          { href: '/health', label: 'Health Report', desc: 'God modules, coupling analysis', icon: '♥' },
        ].map(({ href, label, desc, icon }) => (
          <a
            key={href}
            href={href}
            className="glass-card p-5 hover:border-cni-accent/30 hover:shadow-lg hover:shadow-cni-accent/5 transition-all duration-300 group"
          >
            <span className="text-2xl mb-3 block text-cni-muted group-hover:text-cni-accent transition-colors">{icon}</span>
            <h3 className="text-sm font-semibold text-cni-text mb-1">{label}</h3>
            <p className="text-xs text-cni-muted">{desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
