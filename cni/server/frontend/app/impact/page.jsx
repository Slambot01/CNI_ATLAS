'use client';

import { useState, useEffect } from 'react';
import { useAnalysisContext } from '../client-layout';
import { getImpact } from '../../lib/api';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';

export default function ImpactPage() {
  const { repoPath, stats } = useAnalysisContext();
  const [file, setFile] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const f = params.get('file');
      if (f) setFile(f);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!file.trim() || !repoPath) return;
    setLoading(true);
    setError(null);
    const result = await getImpact(file.trim(), repoPath);
    if (result?.error) {
      setError({ message: result.message, hint: result.hint });
      setData(null);
    } else {
      setData(result);
    }
    setLoading(false);
  };

  if (!repoPath || !stats) return <NotAnalyzed />;

  const riskStyles = { HIGH: 'badge-danger', MEDIUM: 'badge-warning', LOW: 'badge-success' };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--cni-text)' }}>Impact Analysis</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--cni-muted)' }}>Analyze the blast radius of modifying a file.</p>
        <div className="flex gap-3">
          <input type="text" placeholder="Enter filename (e.g. cache.py)" className="input-field flex-1 text-sm"
            value={file} onChange={(e) => setFile(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()} />
          <button className="btn-primary text-sm disabled:opacity-50" onClick={handleAnalyze} disabled={loading || !file.trim()}>
            {loading ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</span> : '⚡ Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <ErrorMessage message={error.message} hint={error.hint} onRetry={handleAnalyze} />
      )}

      {data && (
        <div className="space-y-4 animate-slide-up">
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card p-5 text-center">
              <p className="text-xs mb-2" style={{ color: 'var(--cni-muted)' }}>Risk Level</p>
              <span className={`${riskStyles[data.risk] || 'badge-info'} text-lg px-4 py-1`}>{data.risk}</span>
            </div>
            <div className="glass-card p-5 text-center">
              <p className="text-xs mb-1" style={{ color: 'var(--cni-muted)' }}>Direct Dependents</p>
              <p className="text-3xl font-bold" style={{ color: '#60a5fa' }}>{data.direct}</p>
            </div>
            <div className="glass-card p-5 text-center">
              <p className="text-xs mb-1" style={{ color: 'var(--cni-muted)' }}>Transitive Dependents</p>
              <p className="text-3xl font-bold" style={{ color: '#22d3ee' }}>{data.transitive}</p>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--cni-text)' }}>Critical Dependents</h3>
            <div className="space-y-2">
              {data.dependents?.length > 0 ? data.dependents.map((dep, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--cni-bg)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs w-5 text-right" style={{ color: 'var(--cni-muted)' }}>{i + 1}.</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--cni-text)' }}>{dep.file}</span>
                  </div>
                  <span className="badge-info">{dep.score.toFixed(1)}</span>
                </div>
              )) : <p className="text-xs py-2" style={{ color: 'var(--cni-muted)' }}>No dependents found.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
