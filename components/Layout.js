import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ThemeSwitcher from './ThemeSwitcher';

export default function Layout({ children, session, hideNav = false }) {
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
      {!hideNav && (
        <nav className="global-nav">
        <div className="nav-container">
          <Link href="/" className="nav-brand">
             <div className="brand-logo">
                <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
                  <ellipse cx="18" cy="18" rx="17" ry="10" stroke="currentColor" strokeWidth="2.5"/>
                  <circle cx="18" cy="18" r="5" fill="currentColor"/>
                </svg>
             </div>
             <div className="brand-text">
                COACHES<span className="brand-accent">EYE</span>
             </div>
          </Link>
          
          <div className="nav-links-wrapper">
            <Link href="/" className={`nav-link ${router.pathname === '/' ? 'active' : ''}`}>
              <span className="link-text">Dashboard</span>
              <div className="link-indicator"></div>
            </Link>
            <Link href="/meets" className={`nav-link ${router.pathname === '/meets' ? 'active' : ''}`}>
              <span className="link-text">Meets</span>
              <div className="link-indicator"></div>
            </Link>
            {['admin', 'headcoach'].includes(profile?.role) && (
              <Link href="/settings" className={`nav-link ${router.pathname === '/settings' ? 'active' : ''}`}>
                <span className="link-text">Settings</span>
                <div className="link-indicator"></div>
              </Link>
            )}
          </div>

          <div className="nav-actions">
            <ThemeSwitcher />
            <button onClick={handleSignOut} className="btn-signout-premium">
              <span>Sign Out</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </nav>
      )}

      <main className="container">
        {children}
      </main>

      <style jsx>{`
        .layout-root {
          min-height: 100vh;
        }
        .global-nav {
          height: 72px;
          display: flex;
          align-items: center;
          background: rgba(10, 15, 25, 0.7);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          position: sticky;
          top: 0;
          z-index: 1000;
        }
        .nav-container {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 3rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .nav-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          text-decoration: none;
          transition: transform 0.2s;
        }
        .nav-brand:hover {
          transform: translateY(-1px);
        }
        .brand-logo {
          color: var(--accent-cyan);
          filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.4));
        }
        .brand-text {
          color: #fff;
          font-weight: 900;
          font-size: 1.1rem;
          letter-spacing: 0.15em;
        }
        .brand-accent {
          color: var(--accent-cyan);
        }
        .nav-links-wrapper {
          display: flex;
          gap: 3rem;
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
        }
        .nav-link {
          text-decoration: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          padding: 8px 0;
        }
        .nav-link:hover {
          color: #fff;
        }
        .nav-link.active {
          color: var(--accent-cyan);
        }
        .link-indicator {
          position: absolute;
          bottom: 0;
          left: 50%;
          width: 0;
          height: 2px;
          background: var(--accent-cyan);
          transition: all 0.3s ease;
          transform: translateX(-50%);
          border-radius: 4px;
          box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
        }
        .nav-link.active .link-indicator {
          width: 100%;
        }
        .nav-actions {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .btn-signout-premium {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .btn-signout-premium:hover {
          background: rgba(244, 63, 94, 0.1);
          border-color: rgba(244, 63, 94, 0.2);
          color: #f43f5e;
          transform: translateY(-1px);
        }
        .container {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          padding: 3rem;
        }
      `}</style>
    </div>
  );
}
