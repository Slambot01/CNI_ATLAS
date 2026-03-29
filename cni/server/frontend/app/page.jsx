'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useAnalysisContext } from './client-layout';
import { getHistory } from '../lib/api';
import { Folder, X, AlertTriangle, FileX, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import ErrorMessage from '../components/ErrorMessage';

// Dynamic import recharts (needs browser, no SSR)
const RechartsChart = dynamic(() => import('../components/TimelineChart'), { ssr: false });

export default function DashboardPage() {
  const {
    stats, healthData, loading, error, repoPath,
    recentRepos, removeRecentRepo, analyze, setRepoPath,
    graphData, fetchGraph,
  } = useAnalysisContext();

  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Expanding dead code / god modules
  const [deadExpanded, setDeadExpanded] = useState(false);
  const [godExpanded, setGodExpanded] = useState(false);

  // Fetch history when stats are available
  useEffect(() => {
    if (!repoPath || !stats) return;
    setHistoryLoading(true);
    getHistory(repoPath)
      .then(res => {
        if (res?.history) setHistoryData(res.history);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [repoPath, stats]);

  // Fetch graph data for dead code + god modules cards
  useEffect(() => {
    if (repoPath && stats && graphData.nodes.length === 0) {
      fetchGraph(repoPath);
    }
  }, [repoPath, stats, graphData.nodes.length, fetchGraph]);

  // Compute dead code + god modules from graph nodes
  const deadCode = useMemo(() => {
    return graphData.nodes.filter(n => n.indegree === 0 && n.outdegree === 0);
  }, [graphData.nodes]);

  const godModules = useMemo(() => {
    return graphData.nodes
      .filter(n => n.indegree >= 10)
      .sort((a, b) => b.indegree - a.indegree);
  }, [graphData.nodes]);

  // Relative time formatter
  const formatRelative = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const handleRepoClick = (path) => {
    setRepoPath(path);
    analyze(path);
  };

  // ── Welcome screen (no repo analyzed) ──
  if (!stats && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh]">
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

        {/* Recent repos on welcome screen */}
        {recentRepos.length > 0 && (
          <div className="w-full max-w-lg mt-10 animate-slide-up">
            <p className="text-xs font-semibold mb-3 px-1" style={{ color: 'var(--cni-muted)' }}>Recent Repositories</p>
            <div className="space-y-1.5">
              {recentRepos.map(repo => (
                <div
                  key={repo.path}
                  className="glass-card px-4 py-3 flex items-center gap-3 cursor-pointer transition-all duration-200 group"
                  style={{ borderRadius: 12 }}
                  onClick={() => handleRepoClick(repo.path)}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)';
                    e.currentTarget.style.background = 'rgba(12, 18, 32, 0.9)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--cni-border)';
                    e.currentTarget.style.background = '';
                  }}
                >
                  <Folder size={16} style={{ color: '#60a5fa', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--cni-text)' }}>{repo.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--cni-muted)' }}>
                      {repo.path} · {repo.filesCount} files · {formatRelative(repo.lastAnalyzed)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeRecentRepo(repo.path); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all duration-150"
                    style={{ color: 'var(--cni-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--cni-muted)'; }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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

      {/* Dead Code + God Modules cards */}
      {graphData.nodes.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {/* Dead Code Card */}
          <div className="glass-card p-5 relative overflow-hidden">
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.06) 0%, transparent 60%)' }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <FileX size={16} style={{ color: '#fbbf24' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>Dead Code</h3>
              </div>
              <p className="text-2xl font-bold mb-3" style={{ color: '#fbbf24' }}>
                {deadCode.length}
                <span className="text-xs font-normal ml-2" style={{ color: 'var(--cni-muted)' }}>unused files</span>
              </p>
              {deadCode.length > 0 ? (
                <div className="space-y-1">
                  {deadCode.slice(0, deadExpanded ? undefined : 5).map(n => (
                    <p key={n.id} className="text-xs font-mono truncate" style={{ color: 'var(--cni-muted)' }}>
                      {n.label}
                    </p>
                  ))}
                  {deadCode.length > 5 && (
                    <button
                      onClick={() => setDeadExpanded(!deadExpanded)}
                      className="flex items-center gap-1 text-xs mt-2 transition-colors"
                      style={{ color: '#60a5fa' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#93bbfc'}
                      onMouseLeave={e => e.currentTarget.style.color = '#60a5fa'}
                    >
                      {deadExpanded ? (
                        <><ChevronUp size={12} /> Show less</>
                      ) : (
                        <><ChevronDown size={12} /> +{deadCode.length - 5} more</>
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>No dead code detected ✨</p>
              )}
            </div>
          </div>

          {/* God Modules Card */}
          <div className="glass-card p-5 relative overflow-hidden">
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ background: 'linear-gradient(135deg, rgba(248, 113, 113, 0.06) 0%, transparent 60%)' }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} style={{ color: '#f87171' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>God Modules</h3>
              </div>
              <p className="text-2xl font-bold mb-3" style={{ color: '#f87171' }}>
                {godModules.length}
                <span className="text-xs font-normal ml-2" style={{ color: 'var(--cni-muted)' }}>files with 10+ imports</span>
              </p>
              {godModules.length > 0 ? (
                <div className="space-y-1">
                  {godModules.slice(0, godExpanded ? undefined : 5).map(n => (
                    <div key={n.id} className="flex items-center justify-between">
                      <p className="text-xs font-mono truncate flex-1 mr-2" style={{ color: 'var(--cni-muted)' }}>
                        {n.label}
                      </p>
                      <span className="text-xs font-bold flex-shrink-0" style={{ color: '#f87171' }}>({n.indegree})</span>
                    </div>
                  ))}
                  {godModules.length > 5 && (
                    <button
                      onClick={() => setGodExpanded(!godExpanded)}
                      className="flex items-center gap-1 text-xs mt-2 transition-colors"
                      style={{ color: '#60a5fa' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#93bbfc'}
                      onMouseLeave={e => e.currentTarget.style.color = '#60a5fa'}
                    >
                      {godExpanded ? (
                        <><ChevronUp size={12} /> Show less</>
                      ) : (
                        <><ChevronDown size={12} /> +{godModules.length - 5} more</>
                      )}
                    </button>
                  )}
                  <p className="text-[10px] mt-2 italic" style={{ color: 'var(--cni-muted)' }}>
                    These are high-risk refactoring targets
                  </p>
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>No god modules detected ✨</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timeline Chart */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, transparent 60%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} style={{ color: '#60a5fa' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>Codebase Timeline</h3>
          </div>
          {historyLoading ? (
            <div className="flex items-center justify-center h-[250px]">
              <div className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
            </div>
          ) : historyData.length > 0 ? (
            <RechartsChart data={historyData} />
          ) : (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>
                Analyze your repo over time to see trends here
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent repos */}
      {recentRepos.length > 0 && (
        <div className="animate-slide-up">
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--cni-muted)' }}>Recent Repositories</p>
          <div className="grid grid-cols-3 gap-3">
            {recentRepos.map(repo => (
              <div
                key={repo.path}
                className="glass-card px-4 py-3 flex items-center gap-3 cursor-pointer transition-all duration-200 group"
                style={{
                  borderRadius: 12,
                  borderLeft: repo.path === repoPath ? '2px solid #22c55e' : '2px solid transparent',
                }}
                onClick={() => handleRepoClick(repo.path)}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = repo.path === repoPath ? '#22c55e' : 'rgba(59, 130, 246, 0.25)';
                  e.currentTarget.style.background = 'rgba(12, 18, 32, 0.9)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--cni-border)';
                  e.currentTarget.style.borderLeftColor = repo.path === repoPath ? '#22c55e' : 'transparent';
                  e.currentTarget.style.background = '';
                }}
              >
                <Folder size={14} style={{ color: repo.path === repoPath ? '#4ade80' : '#60a5fa', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: repo.path === repoPath ? '#4ade80' : 'var(--cni-text)' }}>
                    {repo.name}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--cni-muted)' }}>
                    {repo.filesCount} files · {formatRelative(repo.lastAnalyzed)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeRecentRepo(repo.path); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all duration-150"
                  style={{ color: 'var(--cni-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--cni-muted)'; }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
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
