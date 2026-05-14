import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ThemeSwitcher from './ThemeSwitcher';

export default function Layout({ children, session }) {
  const router = useRouter();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (session?.user?.id) {
      supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => setProfile(data));
    }
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="layout-root">
      <nav className="global-nav">
        <div className="nav-container">
          <Link href="/" className="nav-brand">
            <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
              <ellipse cx="18" cy="18" rx="17" ry="10" stroke="var(--accent-cyan)" strokeWidth="2"/>
              <circle cx="18" cy="18" r="5" fill="var(--accent-cyan)" opacity="0.9"/>
            </svg>
            <span>Coaches<span style={{ color: 'var(--accent-cyan)' }}>Eye</span></span>
          </Link>
          
          <div className="nav-actions">
            <Link href="/" className={`nav-link ${router.pathname === '/' ? 'active' : ''}`}>Dashboard</Link>
            <Link href="/meets" className={`nav-link ${router.pathname === '/meets' ? 'active' : ''}`}>Meets</Link>
            {['admin', 'headcoach'].includes(profile?.role) && (
              <Link href="/settings" className={`nav-link ${router.pathname === '/settings' ? 'active' : ''}`}>Settings</Link>
            )}
            <ThemeSwitcher />
            <button onClick={handleSignOut} className="btn-signout">Sign Out</button>
          </div>
        </div>
      </nav>

      <main className="container">
        {children}
      </main>

      <style jsx>{`
        .layout-root {
          min-height: 100vh;
        }
        .global-nav {
          height: 80px;
          display: flex;
          align-items: center;
          background: var(--glass-bg);
          backdrop-filter: blur(15px);
          border-bottom: 1px solid var(--glass-border);
          position: sticky;
          top: 0;
          z-index: 1000;
        }
        .nav-container {
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .nav-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          color: var(--text-primary);
          font-weight: 800;
          font-size: 1.2rem;
        }
        .nav-actions {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        .nav-link {
          text-decoration: none;
          color: var(--text-dim);
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: color 0.2s;
        }
        .nav-link:hover, .nav-link.active {
          color: var(--accent-cyan);
        }
        .btn-signout {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-dim);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.7rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-signout:hover {
          background: rgba(var(--accent-rose-rgb), 0.1);
          color: var(--accent-rose);
          border-color: rgba(var(--accent-rose-rgb), 0.2);
        }
      `}</style>
    </div>
  );
}
