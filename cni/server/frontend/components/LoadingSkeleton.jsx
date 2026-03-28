'use client';

/**
 * Skeleton loader with three variants: graph, cards, text.
 *
 * @param {'graph' | 'cards' | 'text'} variant — Which skeleton to show.
 * @param {string} [message] — Optional message below the skeleton.
 */
export default function LoadingSkeleton({ variant = 'cards', message }) {
  return (
    <div className="animate-fade-in">
      {variant === 'graph' && (
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 10rem)' }}>
          <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ background: 'var(--cni-bg)' }}>
            <div className="absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.03) 0%, rgba(139,92,246,0.03) 50%, rgba(34,211,238,0.03) 100%)' }} />
            {/* Fake nodes */}
            {[
              { x: '25%', y: '30%', r: 24 }, { x: '55%', y: '20%', r: 16 },
              { x: '40%', y: '50%', r: 32 }, { x: '70%', y: '45%', r: 20 },
              { x: '30%', y: '70%', r: 14 }, { x: '60%', y: '65%', r: 18 },
              { x: '80%', y: '30%', r: 12 }, { x: '15%', y: '50%', r: 10 },
            ].map((n, i) => (
              <div key={i} className="absolute rounded-full animate-pulse"
                style={{
                  left: n.x, top: n.y, width: n.r, height: n.r,
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.08)',
                  animationDelay: `${i * 150}ms`,
                }} />
            ))}
            {/* Center message */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 mx-auto border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
                <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>
                  {message || 'Loading graph…'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {variant === 'cards' && (
        <div className="p-6 space-y-6">
          {/* Stat card skeletons */}
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="glass-card p-5 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="h-3 w-16 rounded mb-3" style={{ background: 'var(--cni-border)' }} />
                <div className="h-8 w-20 rounded" style={{ background: 'var(--cni-border)' }} />
              </div>
            ))}
          </div>
          {/* Large card skeleton */}
          <div className="glass-card p-8 animate-pulse">
            <div className="h-4 w-32 rounded mb-4" style={{ background: 'var(--cni-border)' }} />
            <div className="h-16 w-24 rounded" style={{ background: 'var(--cni-border)' }} />
          </div>
          {/* Grid card skeletons */}
          <div className="grid grid-cols-2 gap-6">
            {[0, 1].map(i => (
              <div key={i} className="glass-card p-5 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="h-4 w-28 rounded mb-4" style={{ background: 'var(--cni-border)' }} />
                <div className="space-y-3">
                  {[0, 1, 2].map(j => (
                    <div key={j} className="h-8 rounded-xl" style={{ background: 'var(--cni-bg)' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'text' && (
        <div className="p-6 space-y-6">
          <div className="glass-card p-6 animate-pulse">
            <div className="h-5 w-48 rounded mb-6" style={{ background: 'var(--cni-border)' }} />
            <div className="space-y-3">
              {[100, 85, 92, 60, 78, 45].map((w, i) => (
                <div key={i} className="h-3 rounded" style={{ width: `${w}%`, background: 'var(--cni-border)', animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
          </div>
          <div className="glass-card p-6 animate-pulse">
            <div className="h-5 w-36 rounded mb-4" style={{ background: 'var(--cni-border)' }} />
            <div className="space-y-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i}>
                  <div className="h-3 rounded mb-2" style={{ width: `${70 + Math.random() * 30}%`, background: 'var(--cni-border)' }} />
                  <div className="h-1.5 rounded-full" style={{ width: `${30 + Math.random() * 60}%`, background: 'var(--cni-bg)' }} />
                </div>
              ))}
            </div>
          </div>
          {/* Center message */}
          {message && (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
              <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>{message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
