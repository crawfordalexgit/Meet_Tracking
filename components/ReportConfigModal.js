import React, { useState } from 'react';

export default function ReportConfigModal({ isOpen, onClose, onGenerate, swimmerName, loading }) {
  const [sections, setSections] = useState({
    attendance: true,
    openMeets: true,
    internalGalas: true,
    aiTechnical: true,
    aiDeepDive: true,
    performanceNarrative: true,
    strokeRoadmap: true,
    progression: true
  });
  const [audience, setAudience] = useState('Coach');

  if (!isOpen) return null;

  const handleToggle = (section) => {
    setSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const modalOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  };

  const modalContentStyle = {
    background: 'rgba(20, 20, 25, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '600px',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  };

  const headerStyle = {
    padding: '40px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
  };

  const bodyStyle = {
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px'
  };

  const footerStyle = {
    padding: '32px 40px',
    background: 'rgba(255, 255, 255, 0.03)',
    display: 'flex',
    gap: '16px'
  };

  const btnAudienceStyle = (active) => ({
    padding: '12px',
    borderRadius: '12px',
    border: active ? '2px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
    background: active ? 'rgba(6, 182, 212, 0.1)' : 'rgba(255, 255, 255, 0.05)',
    color: active ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.4)',
    fontWeight: '700',
    fontSize: '0.85rem',
    cursor: 'pointer',
    flex: 1,
    transition: 'all 0.2s'
  });

  const checkboxCardStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer'
  };

  if (loading) {
    return (
      <div style={modalOverlayStyle} className="no-print">
        <div style={{ ...modalContentStyle, padding: '60px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
          <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--accent-cyan-rgb), 0.1)', borderRadius: '50%', border: '1px solid rgba(var(--accent-cyan-rgb), 0.2)' }}>
            <span style={{ fontSize: '2.5rem', display: 'inline-block', animation: 'spin-glow 2s linear infinite' }}>✨</span>
          </div>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Compiling AI Reports</h3>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', margin: 0, fontSize: '0.9rem', maxWidth: '380px', lineHeight: 1.6 }}>
            CoachesEye is running deep diagnostic workflows on {swimmerName}'s physiological and technical datasets...
          </p>
          <style jsx>{`
            @keyframes spin-glow {
              0% { transform: rotate(0deg) scale(1); filter: drop-shadow(0 0 5px rgba(var(--accent-cyan-rgb), 0.3)); }
              50% { transform: rotate(180deg) scale(1.1); filter: drop-shadow(0 0 15px rgba(var(--accent-cyan-rgb), 0.6)); }
              100% { transform: rotate(360deg) scale(1); filter: drop-shadow(0 0 5px rgba(var(--accent-cyan-rgb), 0.3)); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={modalOverlayStyle} className="no-print">
      <div style={modalContentStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="section-title" style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>REPORT ENGINE v2</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>Configure Review</h2>
          <p style={{ margin: '8px 0 0 0', opacity: 0.5, fontSize: '0.9rem' }}>Tailor the intelligence focus for {swimmerName}.</p>
        </div>

        <div style={bodyStyle}>
          <div>
            <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', display: 'block', marginBottom: '16px' }}>Target Audience</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {['Coach', 'Parent', 'Swimmer'].map(a => (
                <button key={a} onClick={() => setAudience(a)} style={btnAudienceStyle(audience === a)}>{a}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', display: 'block', marginBottom: '16px' }}>Data Inclusions</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {Object.entries(sections).map(([key, val]) => (
                <div key={key} style={checkboxCardStyle} onClick={() => handleToggle(key)}>
                  <input 
                    type="checkbox" 
                    checked={val} 
                    onChange={() => {}} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button 
            onClick={() => onGenerate(sections, audience)}
            className="btn-premium-intel"
            style={{ flex: 2, padding: '16px', borderRadius: '12px', border: 'none', fontWeight: 900, cursor: 'pointer' }}
          >
            GENERATE & PRINT
          </button>
        </div>
      </div>
    </div>
  );
}
