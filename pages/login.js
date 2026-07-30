import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Login({ session }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('magic_link'); // 'magic_link' or 'password'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (session) {
      router.push('/dashboard');
    }
  }, [session, router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // This dynamically detects the host (localhost vs your live Vercel URL)
          redirectTo: `${window.location.origin}/dashboard`
        }
      });
      if (error) throw error;
    } catch (error) {
      // The renderer reads message.text / message.type. Setting a bare string
      // here rendered an EMPTY box styled as a success — a failed Google
      // sign-in told the user nothing had gone wrong.
      setMessage({ type: 'error', text: error.message || 'Google sign-in failed. Please try again.' });
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (authMode === 'magic_link') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/dashboard' },
      });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Check your email for the login link!' });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        window.location.href = '/dashboard';
      }
    }
    setLoading(false);
  };

  return (
    <div className="layout-root" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem' }}>
      <Head>
        <title>Sign In | CoachesEye</title>
      </Head>
      
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', textAlign: 'center', padding: '3rem' }}>
        <div style={{ marginBottom: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            {/* The Eye Logo with Chart */}
            <svg width="60" height="60" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 0 12px rgba(189, 255, 0, 0.5))' }}>
              <defs>
                <linearGradient id="eyeGrad" x1="0%" y1="50%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor="#00E5FF" />
                  <stop offset="100%" stopColor="#E8FF00" />
                </linearGradient>
              </defs>
              <path d="M10 50C10 50 25 25 50 25C75 25 90 50 90 50C90 50 75 75 50 75C25 75 10 50 10 50Z" stroke="url(#eyeGrad)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="50" cy="50" r="16" stroke="url(#eyeGrad)" strokeWidth="5"/>
              <path d="M41 55L48 42L53 48L62 38" stroke="url(#eyeGrad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
              {/* Top tick mark */}
              <line x1="50" y1="15" x2="50" y2="23" stroke="url(#eyeGrad)" strokeWidth="5" strokeLinecap="round"/>
            </svg>

            {/* COACHESEYE Text */}
            <div style={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
              <span style={{ color: 'white' }}>COACHES</span><span style={{ color: '#E8FF00', textShadow: '0 0 20px rgba(232, 255, 0, 0.4)' }}>EYE</span>
            </div>
          </div>

          {/* Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em' }}>
            <span style={{ color: 'white' }}>TONBRIDGE SWIMMING CLUB</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
            <span style={{ color: '#60A5FA' }}>2025/26 SEASON PERFORMANCE ANALYTICS</span>
          </div>
        </div>
        
        {message && (
          <div style={{ 
            padding: '1rem', 
            borderRadius: '12px', 
            marginBottom: '2rem', 
            fontSize: '0.85rem',
            fontWeight: 600,
            background: message.type === 'error' ? 'rgba(var(--accent-rose-rgb), 0.15)' : 'rgba(var(--accent-emerald-rgb), 0.15)',
            color: message.type === 'error' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
            border: `1px solid rgba(var(--accent-${message.type === 'error' ? 'rose' : 'emerald'}-rgb), 0.3)`
          }}>
            {message.text}
          </div>
        )}

        <button 
          type="button" 
          onClick={handleGoogleLogin} 
          className="period-btn" 
          style={{ 
            width: '100%', 
            padding: '1.25rem', 
            fontSize: '0.8rem', 
            borderRadius: '16px', 
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--text-primary)'
          }}
          disabled={loading}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', opacity: 0.3 }}>
          <div style={{ flex: 1, height: '1px', background: 'currentColor' }}></div>
          <div style={{ padding: '0 1rem', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Or</div>
          <div style={{ flex: 1, height: '1px', background: 'currentColor' }}></div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <label htmlFor="email" style={{ display: 'block', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '4px' }}>Email Address</label>
            <input
              id="email"
              type="email"
              className="search-input"
              style={{ paddingLeft: '1.5rem' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@tonbridgeswimming.co.uk"
              required
            />
          </div>

          {authMode === 'password' && (
            <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
              <label htmlFor="password" style={{ display: 'block', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '4px' }}>Password</label>
              <input
                id="password"
                type="password"
                className="search-input"
                style={{ paddingLeft: '1.5rem' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          )}

          <button 
            type="submit" 
            className="period-btn active" 
            style={{ width: '100%', padding: '1.25rem', fontSize: '0.8rem', borderRadius: '16px' }}
            disabled={loading}
          >
            {loading ? 'Loading...' : authMode === 'magic_link' ? 'Send Magic Link' : 'Sign In'}
          </button>
        </form>

        <div 
          onClick={() => setAuthMode(prev => prev === 'magic_link' ? 'password' : 'magic_link')}
          style={{ marginTop: '1.5rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-cyan)', textDecoration: 'underline' }}
        >
          {authMode === 'magic_link' ? 'Switch to Password Login' : 'Switch to Magic Link Login'}
        </div>
        
        <div style={{ marginTop: '2.5rem', opacity: 0.3, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Authorized Personnel Only
        </div>

        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.7rem', opacity: 0.5, maxWidth: '350px', margin: '0 auto', lineHeight: '1.5' }}>
            By signing in, you acknowledge that data and automated insights provided by the CoachesEye platform are for analytical guidance and modeling purposes only. They do not replace professional medical advice or direct poolside coaching assessments.
          </p>
        </div>
      </div>
    </div>
  );
}
