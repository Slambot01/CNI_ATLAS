'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/',        label: 'Dashboard', icon: '◆' },
  { href: '/graph',   label: 'Graph',     icon: '◎' },
  { href: '/chat',    label: 'Chat',      icon: '◈' },
  { href: '/health',  label: 'Health',    icon: '♥' },
  { href: '/impact',  label: 'Impact',    icon: '⚡' },
  { href: '/onboard', label: 'Onboard',   icon: '◉' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-cni-surface border-r border-cni-border flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-cni-border">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cni-accent to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-cni-accent/20 group-hover:shadow-cni-accent/40 transition-shadow">
            C
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide text-cni-text">CNI</div>
            <div className="text-[10px] text-cni-muted leading-none">Neural Interface</div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200 group
                ${isActive
                  ? 'bg-cni-accent/15 text-cni-accent-light border border-cni-accent/20'
                  : 'text-cni-muted hover:text-cni-text hover:bg-white/5 border border-transparent'
                }
              `}
            >
              <span className={`text-base ${isActive ? 'text-cni-accent' : 'text-cni-muted group-hover:text-cni-text'} transition-colors`}>
                {icon}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-cni-border">
        <p className="text-[10px] text-cni-muted text-center">
          100% Local · No Cloud
        </p>
      </div>
    </aside>
  );
}
