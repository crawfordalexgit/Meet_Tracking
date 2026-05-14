import React, { useState, useMemo } from 'react';
import { getBenchmarkTable } from '../lib/analytics-utils';

export default function BenchmarkModal({ isOpen, onClose }) {
  const [gender, setGender] = useState('F');
  const [level, setLevel] = useState('COUNTY');
  const [sortConfig, setSortConfig] = useState({ key: 'event', direction: 'asc' });
  
  if (!isOpen) return null;

  const tableData = useMemo(() => getBenchmarkTable(gender, level), [gender, level]);
  const ages = [11, 12, 13, 14, 15, 16, 17];

  const sortedTable = useMemo(() => {
    return [...tableData].sort((a, b) => {
      let aVal, bVal;
      if (sortConfig.key === 'event') {
        aVal = a.event;
        bVal = b.event;
      } else if (sortConfig.key.startsWith('age')) {
        aVal = a[sortConfig.key]?.pts || 0;
        bVal = b[sortConfig.key]?.pts || 0;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tableData, sortConfig]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card benchmark-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>
              {level === 'COUNTY' ? 'Kent County' : 'South East Regional'} Standards
            </h2>
            <div className="text-xs opacity-50 uppercase tracking-widest mt-1">2026 Qualifying Standards to WA Points</div>
          </div>
          <div className="flex gap-4 items-center">
            <div className="level-toggle">
              <button 
                className={level === 'COUNTY' ? 'active' : ''} 
                onClick={() => setLevel('COUNTY')}
              >COUNTY</button>
              <button 
                className={level === 'REGIONAL' ? 'active' : ''} 
                onClick={() => setLevel('REGIONAL')}
              >REGIONAL</button>
            </div>
            <div className="gender-toggle">
              <button 
                className={gender === 'F' ? 'active' : ''} 
                onClick={() => setGender('F')}
              >FEMALE</button>
              <button 
                className={gender === 'M' ? 'active' : ''} 
                onClick={() => setGender('M')}
              >MALE</button>
            </div>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="table-container">
          <table className="benchmark-table">
            <thead>
              <tr>
                <th onClick={() => requestSort('event')} style={{ cursor: 'pointer' }}>Event{getSortIndicator('event')}</th>
                {ages.map(a => (
                  <th key={a} onClick={() => requestSort(`age${a}`)} style={{ cursor: 'pointer' }}>
                    {a === 11 ? '10/11' : a === 17 ? '17+' : a}{getSortIndicator(`age${a}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTable.map((row, idx) => (
                <tr key={idx}>
                  <td className="event-name">{row.event}</td>
                  {ages.map(a => {
                    const data = row[`age${a}`];
                    return (
                      <td key={a} className="pts-cell">
                        {data ? (
                          <>
                            <div className="pts-val">{data.pts}</div>
                            <div className="time-val">{data.time}</div>
                          </>
                        ) : (
                          <div className="opacity-20 text-[10px]">N/A</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-xs opacity-60 leading-relaxed m-0">
            <b>Note:</b> These are the WA Points equivalents of the official <b>{level === 'COUNTY' ? 'Kent County' : 'South East Regional'} 2026 Standards</b>. 
            Targets vary by stroke as qualifying times are not uniformly tied to a single point value. Coaches should use these as age-group specific performance goals.
          </p>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .benchmark-modal {
          width: 95%;
          max-width: 1000px;
          padding: 2.5rem;
          border: 1px solid rgba(0, 212, 255, 0.2);
          box-shadow: 0 0 50px rgba(0, 212, 255, 0.1);
          max-height: 90vh;
          overflow-y: auto;
        }
        .level-toggle, .gender-toggle {
          display: flex;
          background: rgba(255,255,255,0.05);
          padding: 4px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .level-toggle button, .gender-toggle button {
          background: none;
          border: none;
          color: white;
          font-size: 0.65rem;
          font-weight: 900;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          opacity: 0.4;
          transition: all 0.2s;
        }
        .level-toggle button.active {
          background: var(--accent-emerald);
          color: #000;
          opacity: 1;
        }
        .gender-toggle button.active {
          background: var(--accent-cyan);
          color: #000;
          opacity: 1;
        }
        .close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 2rem;
          cursor: pointer;
          opacity: 0.5;
          transition: opacity 0.2s;
          line-height: 1;
        }
        .close-btn:hover { opacity: 1; }
        
        .table-container {
          overflow-x: auto;
          margin-top: 1rem;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .benchmark-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          text-align: left;
        }
        .benchmark-table th {
          background: rgba(255,255,255,0.05);
          padding: 1rem;
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--accent-cyan);
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .benchmark-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.02);
          background: rgba(10, 25, 33, 0.4);
        }
        .event-name {
          font-weight: 800;
          color: #fff;
          white-space: nowrap;
        }
        .pts-cell {
          text-align: center;
          color: var(--accent-cyan);
        }
        .pts-val {
          font-weight: 800;
          font-size: 0.85rem;
          font-family: monospace;
        }
        .time-val {
          font-size: 0.6rem;
          opacity: 0.6;
          font-weight: 400;
          margin-top: 2px;
        }
        
        @keyframes scaleIn {
          from { transform: scale(0.98); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
