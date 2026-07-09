import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ThemeProvider } from '../lib/ThemeContext';
import { Toaster } from 'react-hot-toast';

// Routes that render without a session. Everything else bounces to /login.
// Puppeteer print/export pages (?print=true) still work: the export APIs inject
// the sb-*-auth-token into localStorage before load, so getSession() resolves
// with a real session in the headless browser.
const PUBLIC_PATHS = ['/', '/login'];

export default function MyApp({ Component, pageProps }) {
  const [session, setSession] = useState(undefined);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();
  const isPublicRoute = PUBLIC_PATHS.includes(router.pathname);

  useEffect(() => {
    // Missing NEXT_PUBLIC_SUPABASE_* at build time leaves the client null — bail
    // out so we render the config-error screen below instead of crashing on .auth.
    if (!supabase) return;

    // 1. Grab the session if they just returned from Google
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // 2. Listen for any future login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    // session === undefined means getSession() hasn't resolved yet; only
    // redirect once we know there is definitely no session.
    if (session === null && !isPublicRoute) {
      router.replace('/login');
    }
  }, [session, isPublicRoute, router]);

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

  // Database client never initialised (missing env vars in this deployment).
  // Show a clear message rather than a blank white-screen React crash.
  if (!supabase) {
    return (
      <ThemeProvider>
        <Head><title>Configuration error | CoachesEye</title></Head>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
          <div className="glass-card" style={{ maxWidth: '520px', padding: '3rem' }}>
            <h1 style={{ fontSize: '1.6rem', marginBottom: '1rem', color: 'var(--accent-rose)' }}>Configuration error</h1>
            <p style={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
              This deployment can&apos;t reach its database. The <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> environment variables are missing. Add them to the hosting environment and redeploy.
            </p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Hold back protected pages until the session is known (undefined) and while
  // an anonymous visitor (null) is being redirected to /login.
  if (!session && !isPublicRoute) {
    return (
      <ThemeProvider>
        <Head><title>Tonbridge Open Meet Dashboard</title></Head>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>
          Checking your session…
        </div>
      </ThemeProvider>
    );
  }

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
