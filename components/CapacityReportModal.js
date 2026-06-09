import React, { useState, useEffect } from 'react';

export default function CapacityReportModal({ isOpen, onClose, onGenerate, squadsList, loading }) {
  const [selectedSquads, setSelectedSquads] = useState([]);
  const [includeYield, setIncludeYield] = useState(true);
  const [includeTable, setIncludeTable] = useState(true);
  const [audience, setAudience] = useState('Coach');
  const [printTheme, setPrintTheme] = useState('dark');

  useEffect(() => {
    if (isOpen && squadsList) {
      setSelectedSquads(squadsList);
    }
  }, [isOpen, squadsList]);

  if (!isOpen) return null;

  const handleToggleSquad = (squad) => {
    setSelectedSquads(prev =>
      prev.includes(squad)
        ? prev.filter(s => s !== squad)
        : [...prev, squad]
    );
  };

  const handleSelectAllSquads = () => {
    setSelectedSquads(squadsList);
  };

  const handleClearAllSquads = () => {
    setSelectedSquads([]);
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
    background: 'rgba(20, 20, 25, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '650px',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  };

  const headerStyle = {
    padding: '32px 40px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
  };

  const bodyStyle = {
    padding: '32px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    maxHeight: '60vh',
    overflowY: 'auto'
  };

  const footerStyle = {
    padding: '24px 40px',
    background: 'rgba(255, 255, 255, 0.03)',
    display: 'flex',
    gap: '16px'
  };

  const btnAudienceStyle = (active) => ({
    padding: '10px 14px',
    borderRadius: '12px',
    border: active ? '2px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
    background: active ? 'rgba(6, 182, 212, 0.1)' : 'rgba(255, 255, 255, 0.05)',
    color: active ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.4)',
    fontWeight: '700',
    fontSize: '0.8rem',
    cursor: 'pointer',
    flex: 1,
    transition: 'all 0.2s',
    textAlign: 'center'
  });

  const checkboxCardStyle = (isChecked) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '12px',
    background: isChecked ? 'rgba(6, 182, 212, 0.05)' : 'rgba(255, 255, 255, 0.03)',
    border: isChecked ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  if (loading) {
    return (
      <div style={modalOverlayStyle} className="no-print">
        <div style={{ ...modalContentStyle, padding: '60px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
          <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6, 182, 212, 0.1)', borderRadius: '50%', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
            <span style={{ fontSize: '2.5rem', display: 'inline-block', animation: 'spin-glow 2s linear infinite' }}>✨</span>
          </div>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Compiling Reclamation Report</h3>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', margin: 0, fontSize: '0.9rem', maxWidth: '380px', lineHeight: 1.6 }}>
            CoachesEye is running strategic density and waitlist yield diagnostic checks across the selected squads...
          </p>
          <style jsx>{`
            @keyframes spin-glow {
              0% { transform: rotate(0deg) scale(1); filter: drop-shadow(0 0 5px rgba(6, 182, 212, 0.3)); }
              50% { transform: rotate(180deg) scale(1.1); filter: drop-shadow(0 0 15px rgba(6, 182, 212, 0.6)); }
              100% { transform: rotate(360deg) scale(1); filter: drop-shadow(0 0 5px rgba(6, 182, 212, 0.3)); }
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
            <div className="section-title" style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>RECLAMATION ENGINE v2</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>Configure Report</h2>
          <p style={{ margin: '8px 0 0 0', opacity: 0.5, fontSize: '0.85rem' }}>Tailor the squads and metrics included in the reclamation proposal.</p>
        </div>

        <div style={bodyStyle}>
          {/* Squad Filter Section (Multiselect) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', letterSpacing: '0.05em' }}>
                Select Squads to Include ({selectedSquads.length} Selected)
              </label>
              <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
                <span onClick={handleSelectAllSquads} style={{ color: 'var(--accent-cyan)', cursor: 'pointer', fontWeight: 700 }}>Select All</span>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                <span onClick={handleClearAllSquads} style={{ color: 'var(--accent-rose)', cursor: 'pointer', fontWeight: 700 }}>Clear All</span>
              </div>
            </div>
            
            {squadsList.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)', padding: '12px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', textAlign: 'center' }}>
                No squads loaded.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {squadsList.map(sq => {
                  const isChecked = selectedSquads.includes(sq);
                  return (
                    <div key={sq} style={checkboxCardStyle(isChecked)} onClick={() => handleToggleSquad(sq)}>
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={() => {}} 
                        style={{ width: '15px', height: '15px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }} 
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isChecked ? '#fff' : 'rgba(255,255,255,0.6)' }}>{sq}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-rose)', display: 'block', marginBottom: '12px' }}>Target Audience</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {['Coach', 'Committee'].map(a => (
                  <button key={a} onClick={() => setAudience(a)} style={btnAudienceStyle(audience === a)}>{a}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-rose)', display: 'block', marginBottom: '12px' }}>Print Theme</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {['Dark Theme', 'Light Theme'].map((t, idx) => {
                  const val = idx === 0 ? 'dark' : 'light';
                  return (
                    <button key={val} onClick={() => setPrintTheme(val)} style={btnAudienceStyle(printTheme === val)}>{t}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Include Sections */}
          <div>
            <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', display: 'block', marginBottom: '12px', letterSpacing: '0.05em' }}>
              Report Modules
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={checkboxCardStyle(includeYield)} onClick={() => setIncludeYield(!includeYield)}>
                <input 
                  type="checkbox" 
                  checked={includeYield} 
                  onChange={() => {}} 
                  style={{ width: '15px', height: '15px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }} 
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: includeYield ? '#fff' : 'rgba(255,255,255,0.6)' }}>💡 Waitlist Admission Yield</span>
              </div>
              <div style={checkboxCardStyle(includeTable)} onClick={() => setIncludeTable(!includeTable)}>
                <input 
                  type="checkbox" 
                  checked={includeTable} 
                  onChange={() => {}} 
                  style={{ width: '15px', height: '15px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }} 
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: includeTable ? '#fff' : 'rgba(255,255,255,0.6)' }}>👻 Ghost Allocations Table</span>
              </div>
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
          <button 
            onClick={() => onGenerate({ selectedSquads, includeYield, includeTable, audience, printTheme })}
            className="btn-premium-intel"
            disabled={selectedSquads.length === 0}
            style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', fontWeight: 900, cursor: 'pointer', fontSize: '0.85rem', opacity: selectedSquads.length === 0 ? 0.5 : 1 }}
          >
            GENERATE & PRINT
          </button>
        </div>
      </div>
    </div>
  );
}
