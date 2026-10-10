import type { ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowRight, Bug, LayoutDashboard, Shield, ShieldAlert } from 'lucide-react';
import { Link, useLocation } from 'wouter';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/incidents', label: 'Incidents', icon: ShieldAlert },
  { href: '/vulnerabilities', label: 'Vulnerabilities', icon: Bug },
];

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const [location] = useLocation();
  return (
    <nav className={mobile ? 'mobile-nav' : 'nav-list'} aria-label={mobile ? 'Mobile navigation' : 'Primary navigation'}>
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase()}`}>
          <Icon size={16} strokeWidth={1.8} /><span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function SecureShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const current = navItems.find(item => item.href === location)?.label ?? 'Overview';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" data-testid="link-brand">
          <span className="brand-mark"><Shield size={18} strokeWidth={2.1} /></span>
          <span><span className="brand-name">SecureOps</span><span className="brand-caption" style={{ display: 'block' }}>THREAT OPERATIONS</span></span>
        </Link>
        <div className="nav-label">WORKSPACE</div>
        <Navigation />
        <div className="sidebar-bottom">
          <div className="env-card" data-testid="workspace-scope">
            <div className="env-row"><span className="live-dot" />Response workspace</div>
            <div className="env-sub">INCIDENTS · EXPOSURE</div>
          </div>
          <div className="nav-label">SECUREOPS CONSOLE</div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Shield size={15} /></span>SecureOps</div>
          <div className="crumb"><span>SECUREOPS</span><ArrowRight size={11} /><strong>{current.toUpperCase()}</strong></div>
          <div className="top-meta"><span><span className="clock-dot" />SECURE CONSOLE</span><span>SECURITY OPERATIONS</span></div>
        </header>
        <main>{children}</main>
      </div>
      <Navigation mobile />
    </div>
  );
}

export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>
      {action}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`severity-pill sev-${severity}`} data-testid={`status-severity-${severity.toLowerCase()}`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll(' ', '-');
  return <span className={`status-pill status-${normalized}`} data-testid={`status-${normalized}`}>{status}</span>;
}

export function LoadingRows() {
  return <div className="loading-state" aria-label="Loading records" data-testid="loading-records">
    <div style={{ maxWidth: 420, margin: '0 auto', display: 'grid', gap: 14 }}>
      {[0, 1, 2, 3].map(i => <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 8 }} />
        <div style={{ flex: 1, display: 'grid', gap: 7 }}><div className="skeleton" style={{ width: `${76 - i * 8}%`, height: 9 }} /><div className="skeleton" style={{ width: '44%', height: 7 }} /></div>
      </div>)}
    </div>
  </div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-state" role="alert" data-testid="error-state">
    <div className="state-icon" style={{ color: '#ff8588' }}><AlertTriangle size={18} /></div>
    <div className="state-title">Could not load this view</div><p className="state-copy">{message}</p>
    <button className="btn btn-secondary" onClick={onRetry} data-testid="button-retry"><Activity size={13} />Retry request</button>
  </div>;
}
