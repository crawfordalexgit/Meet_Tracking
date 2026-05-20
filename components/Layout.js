import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import IssueModal from './IssueModal';

export default function Layout({ children, session, hideNav = false }) {
  const router = useRouter();
  const [profile, setProfile] = useState({ role: 'headcoach' });
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const navItems = [
    { label: 'Cockpit', path: '/', icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3v18h18"/><path d="M18 9l-5 5-2-2-4 4"/></svg>
    )},
    { label: 'Squads', path: '/squads', icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    )},
    { label: 'Swimmers', path: '/swimmers', icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="8" r="5"/><path d="M3 21v-2a7 7 0 0 1 14 0v2"/><path d="M18 12h4"/><path d="M20 10v4"/></svg>
    )},
    { label: 'Meets', path: '/meets', icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
    )},
    { label: 'Reports', path: '/reports', icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    )},
    { 
      label: 'Roadmap', 
      path: '/feedback', 
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      )
    },
    { label: 'Config', path: '/settings', icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    )}
  ];

  const [helpVisible, setHelpVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('intro');

  const helpSections = [
    { id: 'intro', label: 'Strategic Overview', icon: '🎯' },
    { id: 'features', label: 'Intelligence Assets', icon: '🛠️' },
    { id: 'metrics', label: 'Methodology & Logic', icon: '🧮' },
    { id: 'dashboards', label: 'Dashboard Overview', icon: '🖥️' },
    { id: 'ai', label: 'AI Insights Engine', icon: '🧠' },
    { id: 'glossary', label: 'Performance Glossary', icon: '📖' },
    { id: 'faq', label: 'Knowledge & Support', icon: '❓' },
    { id: 'v21_update', label: 'What\'s New in v2.1', icon: '🚀' }
  ];

  return (
    <div className="layout-root">
      {!hideNav && (
        <aside className="mockup-sidebar no-print">
          <div className="sidebar-pill">
            <div className="sidebar-header">
              <div className="logo-box">
                <svg width="40" height="40" viewBox="0 0 44 44" fill="none">
                  <path d="M4 22C4 12.0589 12.0589 4 22 4C31.9411 4 40 12.0589 40 22C40 31.9411 31.9411 40 22 40C12.0589 40 4 31.9411 4 22Z" stroke="var(--accent-cyan)" strokeWidth="3"/>
                  <path d="M12 22C12 16.4772 16.4772 12 22 12C27.5228 12 32 16.4772 32 22" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            <nav className="sidebar-nav">
              {navItems.map(item => (
                <Link 
                  key={item.label} 
                  href={item.path}
                  className={`nav-item ${router.pathname === item.path ? 'active' : ''}`}
                >
                  {router.pathname === item.path && <div className="nav-indicator-bar"></div>}
                  <div className="nav-icon-container">
                    {item.icon}
                  </div>
                  <span className="nav-label">{item.label}</span>
                </Link>
              ))}

              <button 
                onClick={() => setHelpVisible(true)}
                className="nav-item help-trigger-sidebar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div className="nav-icon-container" style={{ borderColor: 'rgba(255, 234, 0, 0.2)', color: 'rgba(255, 234, 0, 0.4)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <span className="nav-label" style={{ color: 'var(--accent-amber)', opacity: 0.6 }}>INTEL</span>
              </button>

              <button 
                onClick={() => setIsIssueModalOpen(true)} 
                className="btn-premium-intel" 
                style={{ width: '90%', margin: '1rem auto', display: 'block', fontSize: '0.65rem' }}
              >
                🐛 Report Issue
              </button>
            </nav>

            <div className="sidebar-footer">
               <button onClick={handleSignOut} className="btn-signout-mock">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
               </button>
            </div>
            <div style={{ fontSize: '0.6rem', opacity: 0.4, textAlign: 'center', marginTop: 'auto', padding: '1rem' }}>v2.1.0-stable</div>
          </div>
        </aside>
      )}
      <main className="content-main">
        {children}
      </main>

      {helpVisible && (
        <div className="guide-overlay no-print">
           <div className="flex h-full w-full">
              {/* Sidebar Help Nav */}
              <aside className="guide-sidebar">
                 <div className="mb-12">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">INTELLIGENCE <span style={{ color: 'var(--accent-cyan)' }}>CENTER</span></h2>
                    <p className="text-xs font-bold tracking-widest text-white/30 uppercase mt-2">Performance Intelligence Guide v2.0</p>
                 </div>
                 
                 <nav className="flex flex-col flex-1">
                    {helpSections.map(s => (
                       <button 
                         key={s.id}
                         onClick={() => setActiveTab(s.id)}
                         className={`guide-nav-btn ${activeTab === s.id ? 'active' : ''}`}
                       >
                          <span className="nav-icon text-xl">{s.icon}</span>
                          <span className="nav-label font-bold text-sm tracking-tight">{s.label}</span>
                       </button>
                    ))}
                 </nav>

                 <button onClick={() => setHelpVisible(false)} className="guide-exit-btn">Close Intelligence Center</button>
              </aside>

              {/* Content Area */}
              <div className="guide-content">
                 {activeTab === 'intro' && (
                    <div className="max-w-4xl animate-fade-in">
                       <h1 className="text-5xl font-black text-white mb-8 tracking-tighter">Strategic <span style={{ color: 'var(--accent-cyan)' }}>Overview</span></h1>
                       <div className="prose-refined">
                          <p className="text-xl text-white/60 leading-relaxed mb-12">
                             CoachesEye is the club's primary intelligence hub. It synthesizes complex data streams—attendance, competitive results, and training metrics—into a unified strategic framework for athlete development.
                          </p>
                          <div className="grid grid-cols-2 gap-8 mb-12">
                             <div className="guide-card-premium">
                                <h4 className="guide-badge mb-4">Strategic Objective</h4>
                                <p className="text-sm text-white/50 leading-relaxed">To provide an objective, data-driven audit of performance health and development velocity for every athlete in the pathway.</p>
                             </div>
                             <div className="guide-card-premium">
                                <h4 className="guide-badge mb-4" style={{ background: 'rgba(45, 212, 191, 0.1)', color: 'var(--accent-teal)', borderColor: 'rgba(45, 212, 191, 0.2)' }}>Performance Pathway</h4>
                                <p className="text-sm text-white/50 leading-relaxed">Aligning individual metrics with elite benchmarks to ensure every swimmer is on the optimal trajectory for their physiological potential.</p>
                             </div>
                          </div>
                       </div>
                    </div>
                 )}

                 {activeTab === 'features' && (
                    <div className="max-w-4xl animate-fade-in">
                       <h1 className="text-5xl font-black text-white mb-12 tracking-tighter">Intelligence <span style={{ color: 'var(--accent-amber)' }}>Assets</span></h1>
                       <div className="grid grid-cols-1 gap-6">
                          {[
                            { id: '01', title: 'Performance DNA Profiles', desc: 'The high-fidelity intelligence hub for every athlete. It synthesizes lifetime data into a strategic view, featuring PB Conversion and Velocity tracking.', accent: 'var(--accent-cyan)' },
                            { id: '02', title: 'Strategic Briefings', desc: 'Automated AI-narratives that translate complex datasets into plain English conclusions, identifying risks and elite rhythms.', accent: 'var(--accent-amber)' },
                            { id: '03', title: 'Pathway Registries', desc: 'The Squad and Athlete databases provide a searchable index of the club\'s performance assets for instant operational auditing.', accent: 'var(--accent-rose)' }
                          ].map(f => (
                             <div key={f.id} className="guide-card-premium flex gap-8 items-center">
                                <div className="text-4xl font-black opacity-10" style={{ color: f.accent }}>{f.id}</div>
                                <div>
                                   <h3 className="text-xl font-black text-white mb-2">{f.title}</h3>
                                   <p className="text-white/50 leading-relaxed text-sm">{f.desc}</p>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>
                 )}

                 {activeTab === 'metrics' && (
                    <div className="max-w-4xl animate-fade-in">
                       <h1 className="text-5xl font-black text-white mb-12 tracking-tighter">Methodology & <span style={{ color: 'var(--accent-cyan)' }}>Logic</span></h1>
                       <div className="grid grid-cols-1 gap-8">
                          <div className="guide-card-premium" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
                             <div className="flex justify-between items-start mb-6">
                                <h3 className="text-2xl font-black text-white uppercase italic">Global Club Health</h3>
                                <span className="guide-badge">FORMULAIC WEIGHTING</span>
                             </div>
                             <p className="text-white/60 mb-8 leading-relaxed">A strategic aggregate score reflecting the technical stability of a squad. It balances consistency against competitive output.</p>
                             <div className="grid grid-cols-4 gap-4">
                                {[
                                  { l: 'Reliability', v: '20%' },
                                  { l: 'Competition', v: '40%' },
                                  { l: 'Volume', v: '10%' },
                                  { l: 'Progression', v: '30%' }
                                ].map(m => (
                                   <div key={m.l} className="p-4 bg-white/5 rounded-xl text-center border border-white/5">
                                      <div className="text-cyan-400 font-black text-xl">{m.v}</div>
                                      <div className="text-[10px] opacity-40 uppercase font-bold tracking-widest mt-1">{m.l}</div>
                                   </div>
                                ))}
                             </div>
                          </div>

                          <div className="grid grid-cols-2 gap-8">
                             <div className="guide-card-premium" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
                                <h3 className="text-xl font-black text-white uppercase italic mb-4">Velocity (⚡)</h3>
                                <p className="text-white/50 text-sm leading-relaxed mb-6">Measures the rate of technical acceleration between current and prior performance baselines.</p>
                                <code className="text-amber-400 text-xs font-mono block p-4 bg-black/40 rounded-lg">Δ Performance Avg</code>
                             </div>
                             <div className="guide-card-premium" style={{ borderLeft: '4px solid var(--accent-violet)' }}>
                                <h3 className="text-xl font-black text-white uppercase italic mb-4">PB Conversion</h3>
                                <p className="text-white/50 text-sm leading-relaxed mb-6">Efficiency tracking: the percentage of race entries resulting in a Personal Best achievement.</p>
                                <code className="text-violet-400 text-xs font-mono block p-4 bg-black/40 rounded-lg">% PBs Secured</code>
                             </div>
                          </div>
                       </div>
                    </div>
                 )}

                 {activeTab === 'ai' && (
                    <div className="max-w-4xl animate-fade-in">
                       <h1 className="text-5xl font-black text-white mb-12 tracking-tighter">AI Insights <span style={{ color: 'var(--accent-cyan)' }}>Logic</span></h1>
                       <p className="text-xl text-white/60 mb-12 leading-relaxed italic">"Translating raw telemetry into objective coaching conclusions."</p>
                       <div className="grid grid-cols-2 gap-12">
                          <div className="guide-card-premium">
                             <h4 className="text-white font-black text-lg mb-4">Talent Recognition</h4>
                             <p className="text-sm text-white/40 leading-relaxed">The system monitors the **Performance Ceiling**. When an athlete breaks into top-tier percentiles for their age group, the AI identifies the specific training patterns that enabled the breakthrough.</p>
                          </div>
                          <div className="guide-card-premium">
                             <h4 className="text-white font-black text-lg mb-4">Risk Mitigation</h4>
                             <p className="text-sm text-white/40 leading-relaxed">The system flags **Stagnation Risks** when technical progression plateaus despite high training volume, indicating potential over-training or technical fatigue.</p>
                          </div>
                       </div>
                    </div>
                 )}

                 {activeTab === 'glossary' && (
                    <div className="max-w-4xl animate-fade-in">
                       <h1 className="text-5xl font-black text-white mb-12 tracking-tighter">Performance <span style={{ color: 'var(--accent-teal)' }}>Glossary</span></h1>
                       <div className="grid grid-cols-1 gap-2">
                          {[
                            { term: 'AQT', def: 'Automatic Qualifying Time. The standard required for championship entry.' },
                            { term: 'Compliance Gap', def: 'The delta between actual attendance and prescribed training targets.' },
                            { term: 'LTAD', def: 'Long Term Athlete Development. The roadmap used to track physiological growth.' },
                            { term: 'Peak Standard', def: 'The highest achievement achieved by an athlete in their career context.' },
                            { term: 'Volume Deficit', def: 'When training hours fall below the aerobic requirements of the pathway.' }
                          ].map(g => (
                             <div key={g.term} className="flex gap-8 p-6 bg-white/2 rounded-xl items-center border border-white/5">
                                <div className="w-40 font-black text-teal-400 text-xs tracking-widest uppercase">{g.term}</div>
                                <div className="flex-1 text-sm text-white/50">{g.def}</div>
                             </div>
                          ))}
                       </div>
                    </div>
                 )}

                 {activeTab === 'faq' && (
                    <div className="max-w-4xl animate-fade-in">
                       <h1 className="text-5xl font-black text-white mb-12 tracking-tighter">Knowledge & <span style={{ color: 'var(--accent-amber)' }}>Support</span></h1>
                       <div className="grid grid-cols-1 gap-8">
                          {[
                            { q: 'How often does data update?', a: 'Attendance is real-time. Competition results and rankings are synchronized nightly via our automated engine.' },
                            { q: 'What is a Health Score?', a: 'An aggregate metric representing squad stability. Low scores usually indicate training gaps or missed competitive milestones.' },
                            { q: 'Who has access?', a: 'Registry data is pathway-wide, but individual "Performance DNA" is restricted to the specific athlete, parents, and coaches.' }
                          ].map(f => (
                             <div key={f.q} className="guide-card-premium">
                                <h4 className="text-white font-black mb-2">{f.q}</h4>
                                <p className="text-sm text-white/40 leading-relaxed">{f.a}</p>
                             </div>
                          ))}
                       </div>
                    </div>
                 )}

                 {activeTab === 'v21_update' && (
                     <div className="max-w-4xl animate-fade-in">
                        <h1 className="text-5xl font-black text-white mb-12 tracking-tighter">What's New in <span style={{ color: 'var(--accent-cyan)' }}>v2.1</span></h1>
                        <div className="grid grid-cols-1 gap-8">
                           <div className="guide-card-premium" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
                              <h3 className="text-xl font-black text-white mb-2">⚡ Squad Qualification Predictor</h3>
                              <p className="text-sm text-white/50 leading-relaxed">
                                 Includes dynamic championship year rollover (rolling forward to next season's standards in May), dual-tier Automatic & Consideration targets, and the "Best Path" engine that compares SC and LC times to find the optimal qualification trajectory.
                              </p>
                           </div>

                           <div className="guide-card-premium" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
                              <h3 className="text-xl font-black text-white mb-2">⏱️ Historical PB Reconciler</h3>
                              <p className="text-sm text-white/50 leading-relaxed">
                                 Time-travels to calculate swimmer personal bests (PBs) strictly up to the exact date of any historical meet. This ensures fair entry tracking and accurate speed delta analysis relative to the date of the competition.
                              </p>
                           </div>

                           <div className="guide-card-premium" style={{ borderLeft: '4px solid var(--accent-rose)' }}>
                              <h3 className="text-xl font-black text-white mb-2">📊 Aggregate Block ROI Tracker</h3>
                              <p className="text-sm text-white/50 leading-relaxed">
                                 Cascades the Training Efficiency Index (TEI) from individual swimmers up to the squad and club levels. Allows coaches to measure macro-cycle training return-on-investment and monitor performance progression over dedicated training blocks.
                              </p>
                           </div>
                        </div>
                     </div>
                  )}
               </div>
            </div>
         </div>
       )}

      <IssueModal 
        isOpen={isIssueModalOpen} 
        onClose={() => setIsIssueModalOpen(false)} 
        session={session}
      />

      <style jsx global>{`
        .squad-overlay-system {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(1, 4, 10, 0.99);
          backdrop-filter: blur(40px);
          z-index: 5000;
          overflow: hidden;
        }
        .btn-close-overlay {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          font-size: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s;
        }
        .btn-close-overlay:hover {
          background: #f87171;
          border-color: #f87171;
          transform: rotate(90deg);
        }
        .animate-fade-in {
          animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        :root {
          --bg-deep: #01040a;
          --bg-card: rgba(13, 17, 23, 0.85);
          --accent-cyan: #00d4ff;
          --accent-amber: #ffea00;
          --text-main: #ffffff;
          --text-dim: #e4e4e7; /* High contrast Zinc-200 */
          --glass-border: rgba(255, 255, 255, 0.2);
        }

        body {
          background-color: var(--bg-deep);
          color: var(--text-main);
          margin: 0;
          font-family: 'Inter', -apple-system, sans-serif;
          overflow-x: hidden;
        }

        .layout-root {
          display: flex;
          min-height: 100vh;
        }

        .mockup-sidebar {
          width: 140px;
          height: 100vh;
          position: fixed;
          left: 0;
          top: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding-left: 20px;
        }

        .sidebar-pill {
          width: 100px;
          height: 96vh;
          background: rgba(13, 17, 23, 0.85);
          backdrop-filter: blur(30px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 45px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 30px 0;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(255,255,255,0.02);
          position: relative;
          overflow: hidden;
        }

        .sidebar-header {
          margin-bottom: 40px;
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 32px;
          width: 100%;
          align-items: center;
        }

        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          position: relative;
          width: 100%;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .nav-icon-container {
          width: 60px;
          height: 60px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(255,255,255,0.4);
          transition: all 0.4s ease;
          position: relative;
        }

        .nav-item.active .nav-icon-container {
          background: linear-gradient(135deg, #00f2ff 0%, var(--accent-cyan) 100%);
          color: white;
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 0 0 25px rgba(0, 212, 255, 0.6), inset 0 0 15px rgba(255,255,255,0.4);
        }

        .nav-label {
          font-size: 0.65rem;
          font-weight: 800;
          color: rgba(255,255,255,0.3);
          transition: all 0.3s;
          text-align: center;
          max-width: 80px;
        }

        .nav-item.active .nav-label {
          color: white;
          text-shadow: 0 0 10px var(--accent-cyan);
        }

        .nav-indicator-bar {
          position: absolute;
          left: 0;
          width: 5px;
          height: 40px;
          background: var(--accent-cyan);
          border-radius: 0 10px 10px 0;
          box-shadow: 0 0 20px var(--accent-cyan), 0 0 40px rgba(0, 212, 255, 0.4);
          top: 10px;
        }

        .sidebar-footer {
          margin-top: auto;
          padding-bottom: 10px;
        }

        .btn-signout-mock {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(248, 113, 113, 0.1);
          border: 1px solid rgba(248, 113, 113, 0.2);
          color: #f87171;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn-signout-mock:hover {
          background: #f87171;
          color: white;
          transform: rotate(90deg);
        }

        .content-main {
          flex: 1;
          margin-left: 140px;
          padding: 40px 60px;
          max-width: 1600px;
        }

        .glass-card {
          background: var(--bg-card);
          backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border);
          border-radius: 24px;
        }

        .section-title {
          font-size: 0.75rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--accent-cyan);
          margin-bottom: 2rem;
        }

        .kpi-label {
          font-size: 1.1rem;
          font-weight: 900;
          color: white;
        }

        /* Utils */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
