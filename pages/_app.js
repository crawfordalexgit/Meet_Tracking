import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ThemeProvider } from '../lib/ThemeContext';
import { Toaster } from 'react-hot-toast';

export default function MyApp({ Component, pageProps }) {
  const [session, setSession] = useState(undefined);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 1. Grab the session if they just returned from Google
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // 2. Listen for any future login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription?.unsubscribe();
  }, [router]);

  const checkProfile = async (currentSession) => {
    if (!currentSession?.user) {
      setIsPending(false);
      return;
    }
    try {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', currentSession.user.id).single();
      if (prof?.role === 'coach') {
        const { count } = await supabase.from('coach_squads').select('*', { count: 'exact', head: true }).eq('coach_id', currentSession.user.id);
        setIsPending(count === 0);
      } else {
        setIsPending(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsPending(false);
    router.push('/login');
  };

  if (isPending && router.pathname !== '/login') {
    return (
      <ThemeProvider>
        <Head><title>Pending Approval | CoachesEye</title></Head>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
          <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', padding: '3rem' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--accent-amber)' }}>Account Pending</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '2rem' }}>
              Your account has been successfully created, but you have not yet been assigned to any squads. 
              Please wait for an Administrator or Head Coach to grant you operational access.
            </p>
            <button onClick={handleSignOut} className="btn-premium-intel" style={{ padding: '0.75rem 2rem' }}>
              Sign Out
            </button>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0a1921',
            color: '#fff',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.85rem',
            fontWeight: 600,
          }
        }}
      />
      <Head>
        <title>Tonbridge Open Meet Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} session={session} />
    </ThemeProvider>
  );
}
