import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export default function ConsolidationModal({ isOpen, onClose, meets, onComplete }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterMode, setFilterMode] = useState('duplicates'); // 'all' or 'duplicates'
  const [merging, setMerging] = useState(false);

  // Identify potential duplicates (meets with the same name)
  const duplicates = useMemo(() => {
    if (!meets) return [];
    const nameMap = {};
    meets.forEach(m => {
      if (!nameMap[m.name]) nameMap[m.name] = [];
      nameMap[m.name].push(m);
    });
    
    return Object.values(nameMap)
      .filter(group => group.length > 1)
      .flat()
      .sort((a, b) => a.name.localeCompare(b.name) || new Date(a.date) - new Date(b.date));
  }, [meets]);

  if (!isOpen) return null;

  const displayedMeets = filterMode === 'duplicates' ? duplicates : meets;

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(mId => mId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleMerge = async () => {
    if (selectedIds.length < 2) return;
    
    setMerging(true);
    
    // Fetch selected meets objects
    const selectedMeets = meets.filter(m => selectedIds.includes(m.id));
    
    // Crucial check: Is one of the selected meets already a Master meet?
    // A meet is a Master if another meet in the database has m.id as its parent_id
    const existingMaster = selectedMeets.find(m => meets.some(child => child.parent_id === m.id));
    
    let masterId;
    let masterName;
    
    if (existingMaster) {
      // If we are adding to an existing group, preserve the master to keep all current children linked!
      masterId = existingMaster.id;
      masterName = existingMaster.name;
    } else {
      // Otherwise, sort by date and take the earliest meet as Master
      const sortedSelected = [...selectedMeets].sort((a, b) => new Date(a.date) - new Date(b.date));
      masterId = sortedSelected[0].id;
      masterName = sortedSelected[0].name;
    }
    
    const childrenIds = selectedIds.filter(id => id !== masterId);

    try {
      const { error } = await supabase
        .from('meets')
        .update({ parent_id: masterId })
        .in('id', childrenIds);

      if (error) throw error;
      
      onComplete(`Successfully consolidated meets into "${masterName}"`);
      setSelectedIds([]);
      onClose();
    } catch (err) {
      console.error("Merge error:", err);
      alert('Failed to consolidate meets. Please check database permissions.');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card consolidation-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 950, letterSpacing: '-0.03em' }}>
              Consolidate Meets
            </h2>
            <div className="text-xs opacity-50 uppercase tracking-widest mt-1">Combine multi-weekend sessions for aggregate intelligence</div>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="level-toggle">
            <button 
              className={filterMode === 'duplicates' ? 'active' : ''} 
              onClick={() => setFilterMode('duplicates')}
            >POTENTIAL DUPLICATES ({duplicates.length})</button>
            <button 
              className={filterMode === 'all' ? 'active' : ''} 
              onClick={() => setFilterMode('all')}
            >ALL MEETS ({meets.length})</button>
          </div>
        </div>

        <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="benchmark-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>MEET NAME</th>
                <th>DATE</th>
                <th>LICENSE</th>
                <th>STATUS & ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayedMeets.map((m) => {
                const isMaster = meets.some(child => child.parent_id === m.id);
                const childCount = meets.filter(child => child.parent_id === m.id).length;
                const parentMeet = m.parent_id ? meets.find(p => p.id === m.parent_id) : null;

                return (
                  <tr 
                    key={m.id} 
                    onClick={() => toggleSelect(m.id)} 
                    style={{ 
                      cursor: 'pointer', 
                      background: selectedIds.includes(m.id) ? 'rgba(6, 182, 212, 0.05)' : 'transparent',
                      borderLeft: selectedIds.includes(m.id) ? '3px solid var(--accent-cyan)' : '3px solid transparent'
                    }}
                  >
                    <td>
                      <input 
                        type="checkbox" 
                        readOnly
                        checked={selectedIds.includes(m.id)}
                      />
                    </td>
                    <td className="event-name">
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.parent_id && <span style={{ opacity: 0.5 }}>↳</span>}
                        <span>{m.name}</span>
                        {m.parent_id && (
                          <span className="child-badge">
                            LINKED CHILD
                          </span>
                        )}
                        {isMaster && (
                          <span className="master-badge">
                            MASTER ({childCount} SESSIONS)
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(m.date).toLocaleDateString('en-GB')}</td>
                    <td style={{ opacity: 0.6, fontSize: '0.7rem' }}>{m.license}</td>
                    <td>
                      <div className="flex items-center gap-4">
                        {selectedIds.includes(m.id) && (
                          <span style={{ fontSize: '0.55rem', color: 'var(--accent-cyan)', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {selectedIds.indexOf(m.id) === 0 ? '★ Master Target' : '✚ To Consolidate'}
                          </span>
                        )}
                        {m.parent_id && (
                          <button 
                            className="unlink-btn"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Unlink "${m.name}" from its consolidated group?\nThis will restore it as an independent session.`)) {
                                try {
                                  const { error } = await supabase
                                    .from('meets')
                                    .update({ parent_id: null })
                                    .eq('id', m.id);
                                  if (error) throw error;
                                  onComplete(`Successfully unlinked "${m.name}"`);
                                  setSelectedIds([]);
                                } catch (err) {
                                  console.error("Unlink error:", err);
                                  alert("Failed to unlink meet.");
                                }
                              }
                            }}
                          >
                            Unlink Meet
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayedMeets.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>
                    No potential duplicates found. Switch to "All Meets" to select manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center mt-8">
          <p style={{ fontSize: '0.75rem', opacity: 0.6, margin: 0, maxWidth: '60%', lineHeight: 1.4 }}>
            * You can select any meet, including linked child sessions. If your selection contains an existing <b>Master</b> meet, the system will automatically preserve it to keep all current children linked.
          </p>
          <button 
            className="btn-premium-intel"
            disabled={selectedIds.length < 2 || merging}
            onClick={handleMerge}
            style={{ 
              background: selectedIds.length >= 2 ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
              color: selectedIds.length >= 2 ? 'black' : 'rgba(255,255,255,0.2)',
              padding: '12px 30px'
            }}
          >
            {merging ? 'CONSOLIDATING...' : `CONSOLIDATE ${selectedIds.length} SESSIONS`}
          </button>
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
        .consolidation-modal {
          width: 95%;
          max-width: 800px;
          padding: 2.5rem;
          border: 1px solid rgba(0, 212, 255, 0.2);
          box-shadow: 0 0 50px rgba(0, 212, 255, 0.1);
        }
        .level-toggle {
          display: flex;
          background: rgba(255,255,255,0.05);
          padding: 4px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .level-toggle button {
          background: none;
          border: none;
          color: white;
          font-size: 0.6rem;
          font-weight: 900;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          opacity: 0.4;
          transition: all 0.2s;
        }
        .level-toggle button.active {
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
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .benchmark-table td {
          padding: 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.02);
          background: rgba(10, 25, 33, 0.4);
        }
        .event-name {
          font-weight: 800;
          color: #fff;
        }
        .child-badge {
          font-size: 0.5rem;
          background: rgba(245, 158, 11, 0.1);
          color: var(--accent-amber);
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid rgba(245, 158, 11, 0.2);
          margin-left: 8px;
          font-weight: 900;
        }
        .master-badge {
          font-size: 0.5rem;
          background: rgba(0, 212, 255, 0.1);
          color: var(--accent-cyan);
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid rgba(0, 212, 255, 0.2);
          margin-left: 8px;
          font-weight: 900;
        }
        .unlink-btn {
          background: rgba(244, 63, 94, 0.1);
          border: 1px solid rgba(244, 63, 94, 0.2);
          color: var(--accent-rose);
          font-size: 0.6rem;
          font-weight: 900;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: uppercase;
        }
        .unlink-btn:hover {
          background: rgba(244, 63, 94, 0.2);
          box-shadow: 0 0 10px rgba(244, 63, 94, 0.2);
          transform: translateY(-1px);
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
