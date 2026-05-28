import React from 'react';

export default function ChangelogModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const updates = [
    {
      version: "v4.3.0",
      date: "May 2026",
      features: [
        { icon: "🌐", title: "Commercial Landing Page Deployed", desc: "Refactored application routing to introduce a premium SaaS marketing page at the root URL. Highlighted core product virtues to support future monetization, and securely moved the operational dashboard to a dedicated authenticated route." }
      ]
    },
    {
      version: "v4.0.0",
      date: "May 2026",
      features: [
        { icon: "🚀", title: "Product Commercialization Master Update", desc: "Overhauled PDF Dossier into a premium monetizable product with a dark-mode cover and strict book-style pagination. Removed the legacy Audit Trail, added UI scrolling to the app's Meet Log, and excluded Block ROI from printing. Built a visual QT Predictor print layout, injected dedicated CoachesEye educational guides & AI modules across all tabs, and created automated Appendices for Tactical Splits and the Meet Log." }
      ]
    },
    {
      version: "v3.7.0",
      date: "May 2026",
      features: [
        { icon: "🖨️", title: "PDF Print Engine Overhaul", desc: "Fixed A4 layout constraints, eliminated blank pages, added club branding, and implemented the Advanced Print Configuration Modal allowing coaches to select specific AI insights and new data tabs for a unified export." }
      ]
    },
    {
      version: "v3.6.0",
      date: "May 2026",
      features: [
        { icon: "🧹", title: "UI Decluttering", desc: "Removed the historical CoachesEye Foresight Timeline from the Athlete Profile Performance tab to streamline the interface and reduce visual clutter." }
      ]
    },
    {
      version: "v3.5.0",
      date: "May 2026",
      features: [
        { icon: "🧠", title: "AI Prompt Engine Overhaul", desc: "Rewrote the core AI intelligence prompts to strictly output data in crisp, scannable bullet points and SWOT formats. This eliminates dense paragraphs, making exported PDF dossiers much easier for parents and coaches to digest." }
      ]
    },
    {
      version: "v3.4.0",
      date: "May 2026",
      features: [
        { icon: "📄", title: "PDF Dossier Overhaul", desc: "Completely rebuilt the print engine. Exported reports now feature a professional Tonbridge SC cover sheet, strict A4 layout formatting to prevent cut-off charts, and an Educational Glossary appendix to help parents understand the data." }
      ]
    },
    {
      version: "v3.3.0",
      date: "May 2026",
      features: [
        { icon: "👪", title: "Decoupled Parent Audits", desc: "Fixed a routing bug in the AI engine. Parent Audits now correctly generate Vorontsov-based developmental advice and render seamlessly below the main Performance Insight instead of overwriting it." }
      ]
    },
    {
      version: "v3.2.0",
      date: "May 2026",
      features: [
        { icon: "🔄", title: "Persistent AI Controls", desc: "Fixed a UX oversight on the Performance tab. The Performance Insight, Burnout Check, and Parent Audit buttons now remain permanently pinned to the top of the report card, allowing you to hot-swap AI analyses instantly." }
      ]
    },
    {
      version: "v3.1.0",
      date: "May 2026",
      features: [
        { icon: "👪", title: "Breakpoint Volume & Parental Audits", desc: "Added the Gender-Dimorphic Break Point Volume Calculator to track critical seasonal mileage and prevent plateaus. Deployed the Parental Expectation Auditing System to generate psychologically supportive reports using Vorontsov's 'Do's and Don'ts' for navigating growth spurts." }
      ]
    },
    {
      version: "v3.0.0",
      date: "May 2026",
      features: [
        { icon: "🧬", title: "Vorontsov LTAD & Biological Maturation Engine", desc: "Major scientific upgrade. Swimmer profiles now feature a dedicated Biometrics tab that shifts away from chronological age to track Biological Maturation. It dynamically maps Andrei Vorontsov's 'Sensitive Periods' (Windows of Opportunity) for Aerobic, Anaerobic, and Maximal Strength development based on gender and maturity offset." }
      ]
    },
    {
      version: "v2.8.0",
      date: "May 2026",
      features: [
        { icon: "🔮", title: "Cockpit Orbs Restored", desc: "Fixed a UI regression where the global club health and attendance premium orbs disappeared from the executive dashboard header." }
      ]
    },
    {
      version: "v2.7.0",
      date: "May 2026",
      features: [
        { icon: "🏆", title: "League Series Tracker", desc: "Injected a dedicated Team Competition Audit module into the Performance tab. Automatically surfaces all team galas, displaying race count, PBs, average WA points, and a performance trend badge per meet." },
        { icon: "🧬", title: "Team Meet AI Routing", desc: "The AI engine now detects team meets (type: 'team') and routes them to a specialized team dynamics prompt, producing club-points analysis, relay breakdowns, and league trajectory insights — distinct from the open meet celebratory audit." },
        { icon: "📋", title: "Team Meet Audit Prompt", desc: "Created a new AI prompt (team_meet_audit.md) focused on team dynamics: club point scoring, relay performance, squad depth analysis, and year-over-year league series trajectory." }
      ]
    },
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
