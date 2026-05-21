import React from 'react';

export default function ChangelogModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const updates = [
    {
      version: "v2.6.0",
      date: "May 2026",
      features: [
        { icon: "✨", title: "Compact AI Insights", desc: "Redesigned the technical intelligence block into a sleek, horizontal layout with automated background loading on mount." },
        { icon: "🏁", title: "Pacing Splits Binding Fix", desc: "Resolved splits data binding broken by the database migration, restoring the granular split visualizer on swimmer profiles." },
        { icon: "📐", title: "Flexible Tab Control Alignment", desc: "Optimized alignment and spacing of tab navigation and on-demand synchronization buttons for better screen real estate utilization." }
      ]
    },
    {
      version: "v2.4.0",
      date: "May 2026",
      features: [
        { icon: "🎯", title: "Single-Focus Race Selector", desc: "Upgraded the True In-Race Execution module to use a dropdown selector, allowing detailed focus on split analysis for one race at a time." },
        { icon: "📊", title: "Granular Splits Breakdown", desc: "Added an automated split-by-split distance breakdown below the pacing visualizer for the selected race." }
      ]
    },
    {
      version: "v2.2.0",
      date: "May 2026",
      features: [
        { icon: "📜", title: "Scrollable Splits Feed", desc: "The True In-Race Execution visualizer now features a full, date-sorted scrollable feed showcasing all recorded split data." },
        { icon: "⏱️", title: "Dynamic Midpoint Pacing Math", desc: "Pacing analysis now dynamically resolves the race midpoint based on event distance (e.g., 100m for 200m events, 200m for 400m events) to support longer distances." },
        { icon: "🧠", title: "AI Midpoint Intelligence", desc: "The AI analysis engine has been upgraded to utilize dynamic midpoint logic, enabling accurate pacing audits for middle-distance and long-distance events." }
      ]
    },
    {
      version: "v2.1.0",
      date: "May 2026",
      features: [
        { icon: "⚡", title: "Dedicated Performance Tab", desc: "Athlete profiles now feature a dedicated Performance tab, separating high-level overviews from deep-dive technical analytics." },
        { icon: "⏱️", title: "In-Race Execution Visualizer", desc: "The AI now pulls exact 50m/100m split data directly from official races to diagnose Heavy Positive (Fatigue) vs. Negative (Late Acceleration) pacing strategies." },
        { icon: "📊", title: "Multi-Stroke Endurance Decay", desc: "Toggle between Sprint Decay (100m/50m) and Mid-Distance Decay (200m/100m) to mathematically identify aerobic vs. raw speed deficits." },
        { icon: "🔄", title: "Live PB & Splits Sync", desc: "On-demand synchronization buttons added to individual athlete profiles and global settings to fetch the latest race splits instantly." },
        { icon: "🧠", title: "Strategic Intelligence Matrix", desc: "Revamped Cockpit executive summary with high-contrast pathway ranking orbs, operational yield tracking, and an AI auditing toggle." },
        { icon: "🎨", title: "Premium Appearance Themes", desc: "Customize your workspace with Midnight Stealth, Nordic Ice, Emerald Elite, or Solar Flare in the Workspace Settings." }
      ]
    }
  ];

  return (
    <div className="modal-overlay no-print" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 12, 0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, backdropFilter: 'blur(15px)' }}>
      <div className="glass-card animate-scale-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto', padding: '0', background: 'rgba(15, 20, 30, 0.95)', border: '1px solid rgba(0, 212, 255, 0.2)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)' }}>
        
        {/* Header */}
        <div style={{ padding: '2.5rem 3rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.05) 0%, transparent 100%)' }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.15em', marginBottom: '8px' }}>TEST ENVIRONMENT UPDATES</div>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 900, margin: 0, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>What's New in CoachesEye</h2>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', transition: 'all 0.2s' }} className="hover-glow">✕</button>
        </div>

        {/* Content */}
        <div style={{ padding: '3rem' }}>
          {updates.map((release, idx) => (
            <div key={idx} style={{ marginBottom: idx !== updates.length - 1 ? '3rem' : '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: 'var(--accent-cyan)' }}>{release.version}</h3>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, padding: '4px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', color: 'var(--text-secondary)' }}>{release.date}</span>
              </div>

              <div className="flex flex-col gap-4">
                {release.features.map((feat, fIdx) => (
                  <div key={fIdx} style={{ display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.03)', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                    <div style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '50px', height: '50px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', flexShrink: 0 }}>{feat.icon}</div>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 8px 0', color: '#fff' }}>{feat.title}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        {/* Footer */}
        <div style={{ padding: '2rem 3rem', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>
          <button className="btn-premium-action" onClick={onClose}>AWESOME, LET'S TEST IT</button>
        </div>
      </div>
      <style jsx>{`
        .animate-scale-in {
          animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
