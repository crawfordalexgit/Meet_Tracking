import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Head from 'next/head';

export default function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Check your email for the login link!' });
    }
    setLoading(false);
  };

  return (
    <div className="layout-root" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem' }}>
      <Head>
        <title>Sign In | CoachesEye</title>
      </Head>
      
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', textAlign: 'center', padding: '3rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <img src="/logo.png" alt="The Coaches Eye" style={{ width: '100%', filter: 'drop-shadow(0 0 20px rgba(0, 212, 255, 0.3))' }} />
        </div>
        
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '2rem', letterSpacing: '-0.03em' }}>Sign In</h1>
        
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
          <button 
            type="submit" 
            className="period-btn active" 
            style={{ width: '100%', padding: '1.25rem', fontSize: '0.8rem', borderRadius: '16px' }}
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
        
        <div style={{ marginTop: '2.5rem', opacity: 0.3, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Authorized Personnel Only
        </div>
      </div>
    </div>
  );
}
