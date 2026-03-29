'use client';

import { useAnalysisContext } from './client-layout';
import ErrorMessage from '../components/ErrorMessage';

export default function DashboardPage() {
  const { stats, healthData, loading, error } = useAnalysisContext();

  if (!stats && !loading && !error) {
    return (
      <div className="flex items-center justify-center min-h-[75vh]">
        <div className="text-center space-y-6 animate-fade-in">
          <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-white text-3xl font-bold"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)' }}>
            C
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--cni-text)' }}>Welcome to CNI</h1>
            <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--cni-muted)' }}>
              Enter a repository path above and click <span className="font-medium" style={{ color: '#60a5fa' }}>Analyze</span> to explore your codebase with interactive dependency graphs, LLM chat, and health dashboards.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs" style={{ color: 'var(--cni-muted)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
              100% Local
            </span>
            <span>·</span><span>No Cloud</span><span>·</span><span>No Data Leaves Your Machine</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[75vh]">
        <div className="w-full max-w-lg px-6">
          <ErrorMessage message={error.message} hint={error.hint} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[75vh]">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-10 h-10 mx-auto border-2 rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
          <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Analyzing repository…</p>
          <p className="text-xs" style={{ color: 'var(--cni-border)' }}>Scanning files and building dependency graph</p>
        </div>
      </div>
    );
  }

  const cards = [
    { label: 'Files Indexed', value: stats.files, gradient: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.03) 100%)', color: '#60a5fa' },
    { label: 'Dependencies', value: stats.dependencies, gradient: 'linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(34,211,238,0.03) 100%)', color: '#22d3ee' },
    { label: 'Isolated Files', value: stats.isolated, gradient: 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.02) 100%)', color: '#fbbf24' },
    { label: 'Most Imported', value: stats.most_imported, gradient: 'linear-gradient(135deg, rgba(248,113,113,0.12) 0%, rgba(248,113,113,0.02) 100%)', color: '#f87171' },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {cards.map(({ label, value, gradient, color }, i) => (
          <div key={label} className="glass-card p-5 relative overflow-hidden animate-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: gradient }} />
            <div className="relative">
              <p className="text-xs mb-1" style={{ color: 'var(--cni-muted)' }}>{label}</p>
              <p className="text-3xl font-bold" style={{ color }}>{value.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Health overview */}
      {healthData && (
        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, transparent 60%)' }} />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--cni-muted)' }}>Codebase Health Score</p>
              <p className="text-5xl font-bold" style={{ color: healthData.score > 80 ? '#4ade80' : healthData.score > 50 ? '#fbbf24' : '#f87171' }}>
                {healthData.score}
                <span className="text-lg font-normal ml-1" style={{ color: 'var(--cni-muted)' }}>/ 100</span>
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>
                {healthData.total_modules} modules · {healthData.god_modules?.length || 0} god modules
              </p>
              <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>
                {healthData.coupled_modules?.length || 0} coupled · {healthData.isolated_count} isolated
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { href: '/graph', label: 'Dependency Graph', desc: 'Interactive visualization with built-in chat', icon: '◎' },
          { href: '/health', label: 'Health Report', desc: 'God modules, coupling analysis', icon: '♥' },
          { href: '/onboard', label: 'Onboard', desc: 'Architecture overview for new contributors', icon: '◉' },
        ].map(({ href, label, desc, icon }) => (
          <a key={href} href={href}
            className="glass-card p-5 transition-all duration-300 group"
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cni-border)'; e.currentTarget.style.boxShadow = 'none'; }}>
            <span className="text-2xl mb-3 block transition-colors" style={{ color: 'var(--cni-muted)' }}>{icon}</span>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--cni-text)' }}>{label}</h3>
            <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>{desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
