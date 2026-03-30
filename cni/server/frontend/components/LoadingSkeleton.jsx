'use client';

/**
 * Skeleton loader with variants: graph, cards, text, gauge.
 *
 * @param {'graph' | 'cards' | 'text' | 'gauge'} variant
 * @param {string} [message]
 */

const pulseStyle = {
  animation: 'skeletonPulse 1.5s ease-in-out infinite',
};

const skeletonKeyframes = `
@keyframes skeletonPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}`;

function Bar({ width = '100%', height = 12, delay = 0 }) {
  return (
    <div
      style={{
        ...pulseStyle,
        width,
        height,
        borderRadius: 6,
        background: 'linear-gradient(90deg, #111113, #161618)',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

export default function LoadingSkeleton({ variant = 'cards', message }) {
  return (
    <div className="animate-fade-in">
      <style>{skeletonKeyframes}</style>

      {variant === 'graph' && (
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 10rem)' }}>
          <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--bg-root)', borderRadius: 14 }}>
            <div style={{ ...pulseStyle, position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #111113, #161618)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 mx-auto border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {message || 'Loading graph…'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {variant === 'cards' && (
        <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid grid-cols-3" style={{ gap: 16 }}>
            {[0, 1, 2].map(i => (
              <div key={i}
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: 24 }}>
                <Bar width={80} height={10} delay={i * 100} />
                <div style={{ height: 12 }} />
                <Bar width={100} height={28} delay={i * 100 + 50} />
              </div>
            ))}
          </div>
          {message && (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
            </div>
          )}
        </div>
      )}

      {variant === 'text' && (
        <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: 24 }}>
            <Bar width={200} height={16} delay={0} />
            <div style={{ height: 20 }} />
            <div className="space-y-3">
              {[100, 80, 90, 70, 60].map((w, i) => (
                <Bar key={i} width={`${w}%`} height={10} delay={i * 80} />
              ))}
            </div>
          </div>
          {message && (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
            </div>
          )}
        </div>
      )}

      {variant === 'gauge' && (
        <div style={{ padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          {/* Circle */}
          <div
            style={{
              ...pulseStyle,
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #111113, #161618)',
              border: '6px solid rgba(255,255,255,0.04)',
            }}
          />
          {/* Stat bars */}
          <div className="flex" style={{ gap: 16 }}>
            {[0, 1, 2].map(i => (
              <div key={i}
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: 16, width: 120 }}>
                <Bar width={50} height={8} delay={i * 120} />
                <div style={{ height: 8 }} />
                <Bar width={70} height={20} delay={i * 120 + 60} />
              </div>
            ))}
          </div>
          {message && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
          )}
        </div>
      )}
    </div>
  );
}
