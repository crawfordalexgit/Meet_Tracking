import React from 'react';

export default function WaPointsGuideModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 12, 0.85)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div className="glass-card animate-scale-in" onClick={e => e.stopPropagation()} style={{ background: 'rgba(10, 15, 25, 0.95)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: '24px', padding: '2.5rem', maxWidth: '750px', width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                
                <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                    <div>
                        <div className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent-cyan)' }}>CoachesEye Documentation</div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: '4px 0 0', letterSpacing: '-0.02em', color: 'white' }}>Understanding WA Points & Baselines</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.8rem', cursor: 'pointer', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color='white'} onMouseOut={e => e.target.style.color='rgba(255,255,255,0.4)'}>×</button>
                </div>

                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', lineHeight: '1.7' }}>
                    <p className="mb-4">To tell the true story of a swimmer&apos;s progression, the CoachesEye dashboard uses <strong>World Aquatics (WA) Points</strong>. Because time standards change depending on the stroke and distance, WA Points allow us to compare a 50m Breaststroke directly against a 200m Freestyle using a single, unified score.</p>
                    
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '8px', marginBottom: '2rem', borderLeft: '3px solid var(--accent-cyan)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Formula:</span> <strong style={{ color: 'white' }}>1000 × (World Record Base Time / Swimmer&apos;s Time)³</strong>
                    </div>

                    <h3 style={{ color: 'white', fontWeight: 800, marginBottom: '0.8rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--accent-cyan)' }}>1.</span> The Athlete: Peak vs. Average WA
                    </h3>
                    <ul className="mb-8" style={{ paddingLeft: '1.5rem' }}>
                        <li className="mb-2"><strong>Average WA Points (Not Shown):</strong> The mathematical mean of every race the athlete swam at a specific gala.</li>
                        <li><strong style={{ color: 'var(--accent-cyan)' }}>Peak Capability (The Mountain Peak):</strong> The single highest WA point score achieved at that meet. This represents the athlete&apos;s absolute ceiling and true biological capability, which is the most critical metric for pathway qualification.</li>
                    </ul>

                    <h3 style={{ color: 'white', fontWeight: 800, marginBottom: '0.8rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--accent-amber)' }}>2.</span> The Pathway Baselines: County & Regional
                    </h3>
                    <ul className="mb-8" style={{ paddingLeft: '1.5rem' }}>
                        <li className="mb-2"><strong>How it works:</strong> The engine looks at the swimmer&apos;s specific age and gender, then references the official published Automatic Qualifying Times (AQTs) for Kent County and South East Regionals.</li>
                        <li className="mb-2"><strong>The Category Average:</strong> The engine calculates the WA point value for <em>every</em> event qualification time for that age/gender, and averages them together.</li>
                        <li><strong>The Result:</strong> A single, flat threshold line. If the athlete&apos;s blue &quot;Peak Capability&quot; mountain breaks through this line, they are swimming at a County or Regional standard.</li>
                    </ul>

                    <h3 style={{ color: 'white', fontWeight: 800, marginBottom: '0.8rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--accent-violet)' }}>3.</span> The Squad Baselines: Age, Gold, & NAR
                    </h3>
                    <ul className="mb-4" style={{ paddingLeft: '1.5rem' }}>
                        <li className="mb-2"><strong>The 365-Day Window:</strong> The calculation engine fetches every single race result recorded by every swimmer in the Age, Gold, and NAR squads over the last 12 months.</li>
                        <li className="mb-2"><strong>Linear Regression (The Trendline):</strong> Instead of just providing a flat historical average, the engine applies a mathematical formula (y = mx + b) to calculate the squad&apos;s <em>velocity</em>—their rate of improvement over time.</li>
                        <li><strong>Date-Mapped Targets:</strong> The graph asks, <em>&quot;What was the squad&apos;s average standard on the exact day this athlete raced?&quot;</em> and plots the target specifically for that date. Catch the line to prove you belong in the group!</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
