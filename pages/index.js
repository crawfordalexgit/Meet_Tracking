import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

export default function LandingPage({ session }) {
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push('/dashboard');
    }
  }, [session, router]);

  return (
    <div style={{ background: 'var(--bg-dark)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>CoachesEye | Swimming Performance Intelligence</title>
      </Head>

      {/* Navigation Bar */}
      <nav style={{ padding: '1.5rem 4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5, 11, 16, 0.8)', backdropFilter: 'blur(20px)', position: 'fixed', width: '100%', zIndex: 50, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <svg width="38" height="38" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 0 10px rgba(189, 255, 0, 0.5))' }}>
            <defs>
              <linearGradient id="eyeGradNav" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#00E5FF" />
                <stop offset="100%" stopColor="#E8FF00" />
              </linearGradient>
            </defs>
            <path d="M10 50C10 50 25 25 50 25C75 25 90 50 90 50C90 50 75 75 50 75C25 75 10 50 10 50Z" stroke="url(#eyeGradNav)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="50" cy="50" r="16" stroke="url(#eyeGradNav)" strokeWidth="5"/>
            <path d="M41 55L48 42L53 48L62 38" stroke="url(#eyeGradNav)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="50" y1="15" x2="50" y2="23" stroke="url(#eyeGradNav)" strokeWidth="5" strokeLinecap="round"/>
          </svg>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ color: 'white' }}>COACHES</span><span style={{ color: '#E8FF00', textShadow: '0 0 20px rgba(232, 255, 0, 0.4)' }}>EYE</span>
          </div>
        </div>
        <Link href="/login" style={{ textDecoration: 'none' }}>
          <button className="btn-premium-action" style={{ padding: '10px 24px', fontSize: '0.75rem' }}>SIGN IN</button>
        </Link>
      </nav>

      {/* Hero Section */}
      <header style={{ paddingTop: '12rem', paddingBottom: '6rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '800px', height: '800px', background: 'radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 70%)', filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none' }}></div>
        <div style={{ position: 'relative', zIndex: 10, maxWidth: '900px', margin: '0 auto', padding: '0 2rem' }}>
          {/* Hero Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'absolute', width: '160px', height: '160px', background: 'radial-gradient(circle, rgba(0,212,255,0.35) 0%, transparent 70%)', filter: 'blur(30px)' }} />
              <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', filter: 'drop-shadow(0 0 24px rgba(189,255,0,0.5))' }}>
                <defs>
                  <linearGradient id="eyeGradHero" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="#00E5FF" />
                    <stop offset="100%" stopColor="#E8FF00" />
                  </linearGradient>
                </defs>
                <path d="M10 50C10 50 25 25 50 25C75 25 90 50 90 50C90 50 75 75 50 75C25 75 10 50 10 50Z" stroke="url(#eyeGradHero)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="50" cy="50" r="16" stroke="url(#eyeGradHero)" strokeWidth="5"/>
                <path d="M41 55L48 42L53 48L62 38" stroke="url(#eyeGradHero)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="50" y1="15" x2="50" y2="23" stroke="url(#eyeGradHero)" strokeWidth="5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div style={{ display: 'inline-block', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', padding: '6px 16px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.1em', marginBottom: '2rem', background: 'rgba(0,212,255,0.05)' }}>
            BUILT FOR CLUBS, COACHES &amp; FAMILIES
          </div>
          <h1 style={{ fontSize: '4.5rem', fontWeight: 950, lineHeight: 1.1, letterSpacing: '-0.04em', marginBottom: '1.5rem', color: '#fff' }}>
            Every Swimmer's Potential,<br /><span style={{ color: 'var(--accent-cyan)' }}>Clearly Understood.</span>
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '3rem', maxWidth: '700px', margin: '0 auto 3rem' }}>
            CoachesEye gives clubs and coaches the tools to understand each swimmer's development — and gives parents the clear, meaningful picture they need to support their child's journey, from first race to full potential.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <Link href="/login" style={{ textDecoration: 'none' }}>
              <button className="btn-premium-action" style={{ padding: '16px 36px', fontSize: '0.9rem' }}>ACCESS PLATFORM</button>
            </Link>
          </div>
        </div>
      </header>

      {/* Features Grid */}
      <section style={{ padding: '6rem 4rem', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.03em' }}>Everything You Need to Support Your Swimmers.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="glass-card" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🧠</div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>AI Insights Lab</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.9rem' }}>Generate clear, parent-friendly performance reports grounded in real coaching science. Give families the context to truly understand their child's progress and keep coaches, parents and swimmers all working toward the same goals.</p>
          </div>
          <div className="glass-card" style={{ padding: '3rem', borderLeft: '4px solid var(--accent-violet)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🧬</div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>LTAD &amp; Biometrics</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.9rem' }}>Understand where each swimmer is in their physical development — not just their age. Help coaches and parents set realistic, science-backed expectations so every swimmer is challenged appropriately and no one is pushed before they're ready.</p>
          </div>
          <div className="glass-card" style={{ padding: '3rem', borderLeft: '4px solid var(--accent-emerald)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏱️</div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>Tactical Pacing</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.9rem' }}>See exactly how each swimmer performs in the water. Identify whether they need more endurance work or more top-end speed, so coaches can target training where it will make the biggest difference to results.</p>
          </div>
          <div className="glass-card" style={{ padding: '3rem', borderLeft: '4px solid var(--accent-amber)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>Consistency Engine</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.9rem' }}>Track each swimmer's training commitment and readiness with a single, clear score. A simple, honest picture that helps coaches, parents and swimmers stay focused on the habits that drive real improvement over time.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '4rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '4rem' }}>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em' }}>© {new Date().getFullYear()} COACHESEYE · SWIMMING PERFORMANCE INTELLIGENCE</p>
      </footer>
    </div>
  );
}
