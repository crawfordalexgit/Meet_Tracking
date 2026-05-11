import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

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

  if (!session) {
    return <div className="container">{children}</div>;
  }

  return (
    <div>
      <nav className="nav-bar">
        <div className="nav-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
            <path d="M2 12h4l3-9 5 18 3-9h5" />
          </svg>
          TONS Dashboard
        </div>
        <div className="nav-links">
          <Link href="/" className={`nav-link ${router.pathname === '/' ? 'active' : ''}`}>
            Dashboard
          </Link>
          {['admin', 'headcoach'].includes(profile?.role) && (
            <Link href="/settings" className={`nav-link ${router.pathname === '/settings' ? 'active' : ''}`}>
              Settings
            </Link>
          )}
          <button onClick={handleSignOut} className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}>
            Sign Out
          </button>
        </div>
      </nav>
      <main className="container">
        {children}
      </main>
    </div>
  );
}
