import React, { useState } from 'react';

export default function ReadinessBreakdownCard({ swimmer, healthData, squad }) {
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [error, setError] = useState(null);

  const generateBriefing = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swimmerId: swimmer.id,
          type: 'readiness',
          instructions: [
            "MANDATORY: Generate a Readiness Score (0-100) based on your 3 pillars (Performance Standards, Volume, Consistency).",
            "Explicitly state the squad placement recommendation based on this score."
          ]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBriefing(data);
    } catch (err) {
      setError(err.message || 'Failed to generate readiness assessment');
    } finally {
      setLoading(false);
    }
  };

  const getPillarColor = (score) => {
    if (score > 75) return 'var(--accent-emerald, #10b981)';
    if (score >= 50) return 'var(--accent-amber, #f59e0b)';
    return 'var(--accent-rose, #f43f5e)';
  };

  const getRiskBadgeClass = (risk) => {
    if (risk === 'low') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (risk === 'medium') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  };

  return (
    <div className="glass-card animate-fade-in relative overflow-hidden" style={{ padding: '2.5rem', minHeight: '400px' }}>
      {/* Background Glow */}
      <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.05) 0%, transparent 70%)', filter: 'blur(50px)', zIndex: 0 }}></div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left Column - Mathematical Health Score */}
        <div className="left-col">
          <div className="section-title" style={{ fontSize: '0.75rem', marginBottom: 8, fontWeight: 900, letterSpacing: '0.2em', color: 'var(--accent-cyan)' }}>MATHEMATICAL HEALTH INDEX</div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.02em', color: '#fff' }}>Mathematical Health Score</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, rgba(255, 255, 255, 0.6))', marginBottom: '2rem', lineHeight: 1.5 }}>
            Mathematical Health Score: Calculated using 4 weighted pillars.
          </p>

          <div className="flex items-center gap-4 bg-white/[0.02] border border-white/5 rounded-2xl p-6 mb-8" style={{ width: 'fit-content', minWidth: '220px' }}>
            <div>
              <div style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--accent-cyan, #0ea5e9)', lineHeight: 1, marginBottom: 4 }}>
                {healthData?.total || 0}%
              </div>
              <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--text-dim, rgba(255, 255, 255, 0.4))', letterSpacing: '0.1em', textTransform: 'uppercase' }}>OVERALL HEALTH INDEX</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {healthData?.components?.map((component, idx) => {
              const color = getPillarColor(component.score);
              return (
                <div key={idx} className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.02] transition-all duration-300">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 900, letterSpacing: '0.05em', color: '#fff', textTransform: 'uppercase', marginBottom: '2px' }}>
                        {component.label}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim, rgba(255,255,255,0.4))' }}>
                        {component.desc}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: color }}>
                        {component.score}/100
                      </div>
                      <div style={{ fontSize: '0.5rem', fontWeight: 900, color: 'var(--text-dim, rgba(255,255,255,0.3))', letterSpacing: '0.05em' }}>
                        {component.weight} WEIGHT
                      </div>
                    </div>
                  </div>

                  {/* Sleek Horizontal Progress Bar */}
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${component.score}%`, 
                        height: '100%', 
                        background: `linear-gradient(90deg, ${color}cc, ${color})`, 
                        borderRadius: '3px',
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column - AI Strategic Readiness Score */}
        <div style={{ paddingLeft: '1rem' }} className="lg-pl-0 flex flex-col gap-6">
          <div>
            <div className="section-title" style={{ fontSize: '0.75rem', marginBottom: 8, fontWeight: 900, letterSpacing: '0.2em', color: 'var(--accent-cyan)' }}>COACHESEYE INTEL ASSESSMENT</div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.02em', color: '#fff' }}>Strategic Readiness Score</h2>
          </div>

          {/* Styled Explanation Block detailing the AI's logic */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5" style={{ fontSize: '0.85rem', lineHeight: '1.6', color: 'rgba(255, 255, 255, 0.75)' }}>
            <p style={{ marginBottom: '0.75rem', fontWeight: 600, color: '#fff' }}>
              An AI-synthesized 0-100 metric evaluating your physiological and competitive preparedness based on three core DNA pillars:
            </p>
            <ul style={{ listStyle: 'none', paddingLeft: 0, margin: '0 0 1.25rem 0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <li style={{ display: 'flex', gap: '10px' }}>
                <span style={{ color: 'var(--accent-cyan, #0ea5e9)', fontWeight: 900 }}>1.</span>
                <span>Performance Standards (WA Points vs County/Regional Benchmarks)</span>
              </li>
              <li style={{ display: 'flex', gap: '10px' }}>
                <span style={{ color: 'var(--accent-cyan, #0ea5e9)', fontWeight: 900 }}>2.</span>
                <span>Training Volume (Actual pool hours vs seasonal baseline)</span>
              </li>
              <li style={{ display: 'flex', gap: '10px' }}>
                <span style={{ color: 'var(--accent-cyan, #0ea5e9)', fontWeight: 900 }}>3.</span>
                <span>Attendance Consistency (Weekly compliance rate)</span>
              </li>
            </ul>

            {/* Small visual key/text block for Scoring Tiers */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Scoring Tiers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-emerald, #10b981)' }}>85–100:</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Ready for Promotion / Elite Tier</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-amber, #f59e0b)' }}>70–84:</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Aligned & Stable in Current Squad</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-rose, #f43f5e)' }}>Below 70:</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Needing Support / Re-engagement</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button & Loader */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button 
              className="btn-premium-intel flex items-center justify-center gap-2" 
              onClick={generateBriefing}
              disabled={loading}
              style={{ width: '100%', padding: '1rem', borderRadius: '14px', fontWeight: 800, transition: 'all 0.3s' }}
            >
              {loading ? (
                <>
                  <span className="loading-spinner-small">✨</span> Synthesizing Strategic Readiness...
                </>
              ) : (
                "✨ Generate Readiness Assessment"
              )}
            </button>
            {error && <p style={{ color: 'var(--accent-rose, #f43f5e)', fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>⚠️ {error}</p>}
          </div>

          {/* Resulting AI Text Block below the button */}
          {loading && (
            <div className="animate-pulse" style={{ padding: '3rem 2rem', textAlign: 'center', background: 'rgba(255, 255, 255, 0.01)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div className="loading-spinner" style={{ marginBottom: '1rem', display: 'inline-block' }}>✨</div>
              <p style={{ fontSize: '1rem', fontWeight: 900, margin: 0, color: '#fff' }}>Calling CoachesEye Brain...</p>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px', margin: '8px 0 0' }}>Evaluating performance standards, historical volume, consistency curves, and squad recommended alignment...</p>
            </div>
          )}

          {briefing && !loading && (
            <div className="animate-fade-in p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div className="flex items-center gap-4">
                  <div className="section-title" style={{ fontSize: '0.7rem', margin: 0, fontWeight: 900, letterSpacing: '0.15em', color: 'var(--accent-cyan)' }}>COACHESEYE Intel Report</div>
                  {briefing.flag && (
                    <div className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${getRiskBadgeClass(briefing.risk_level)}`}>
                      {briefing.flag}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 no-print">
                  <button 
                    className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all bg-white/5 text-white/40 hover:bg-white/10" 
                    onClick={() => setBriefing(null)}
                  >
                    Clear Assessment
                  </button>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
                <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--accent-cyan, #0ea5e9)', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
                  {briefing.headline}
                </h3>
                
                <p style={{ fontSize: '0.9rem', lineHeight: '1.65', color: '#fff', fontWeight: 400, margin: 0 }}>
                  {briefing.summary?.assessment}
                </p>
              </div>

              {briefing.recommendations && briefing.recommendations.length > 0 && (
                <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/5">
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
                    Key Directives
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {briefing.recommendations.map((rec, i) => (
                      <li key={i} style={{ fontSize: '0.8rem', display: 'flex', gap: '8px', marginBottom: '10px', lineHeight: 1.45 }}>
                        <div style={{ minWidth: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-cyan, #0ea5e9)', marginTop: '6px' }}></div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {briefing.foresight && (
                <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/5">
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                    Predictive Foresight
                  </div>
                  <p style={{ fontSize: '0.8rem', fontStyle: 'italic', color: '#fff', margin: 0, lineHeight: 1.5 }}>
                    "{briefing.foresight}"
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (min-width: 1024px) {
          .left-col {
            border-right: 1px solid rgba(255, 255, 255, 0.05);
            padding-right: 3rem !important;
          }
          .lg-pl-0 {
            padding-left: 0 !important;
          }
        }
        .loading-spinner {
          font-size: 2.5rem;
          animation: spin 2.5s linear infinite;
        }
        .loading-spinner-small {
          font-size: 1.1rem;
          display: inline-block;
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-fade-in {
          animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
