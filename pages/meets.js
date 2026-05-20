import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import Link from 'next/link';
import ConsolidationModal from '../components/ConsolidationModal';

export default function MeetManagement({ session }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [meets, setMeets] = useState([]);
  const [status, setStatus] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [selectedMeets, setSelectedMeets] = useState([]);
  const [merging, setMerging] = useState(false);
  const [isConsolidateOpen, setIsConsolidateOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [filterTonbridge, setFilterTonbridge] = useState(true);

  const fetchMeets = async (activeSearch = search, activeFilter = filterTonbridge) => {
    setLoading(true);
    try {
      let query = supabase
        .from('meets')
        .select(activeFilter ? '*, results!inner(id)' : '*, results(id)');
      
      const searchStr = activeSearch?.trim();
      if (searchStr) {
        query = query.or(`name.ilike.%${searchStr}%,license.ilike.%${searchStr}%,course.ilike.%${searchStr}%,level.ilike.%${searchStr}%`);
      }
      
      query = query.order('date', { ascending: false });
      
      const { data, error } = await query;
      if (error) throw error;
      
      if (data) {
        const uniqueMeets = data.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        setMeets(uniqueMeets);
      }
    } catch (err) {
      console.error('Error fetching meets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchMeets(search, filterTonbridge);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [search, filterTonbridge]);

  const updateMeetType = async (meetId, newType) => {
    setMeets(meets.map(m => m.id === meetId ? { ...m, type: newType } : m));
    const { error } = await supabase.from('meets').update({ type: newType }).eq('id', meetId);
    if (error) {
      fetchMeets();
    } else {
      setStatus({ text: 'Meet updated successfully.' });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const updateMeetEndDate = async (meetId, newEndDate) => {
    setMeets(meets.map(m => m.id === meetId ? { ...m, end_date: newEndDate } : m));
    const { error } = await supabase.from('meets').update({ end_date: newEndDate }).eq('id', meetId);
    if (error) {
      console.error('Error updating meet end date:', error);
      fetchMeets();
    } else {
      setStatus({ text: 'Meet end date updated successfully.' });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleMergeComplete = (message) => {
    setStatus({ text: message });
    fetchMeets();
    setTimeout(() => setStatus(null), 5000);
  };

  const filteredMeets = useMemo(() => {
    let result = meets;
    if (filterTonbridge) {
      result = result.filter(m => m.results && m.results.length > 0);
    }
    if (!search.trim()) return result;
    const query = search.toLowerCase();
    return result.filter(m => 
      m.name?.toLowerCase().includes(query) ||
      m.license?.toLowerCase().includes(query) ||
      m.course?.toLowerCase().includes(query) ||
      m.level?.toLowerCase().includes(query)
    );
  }, [meets, search, filterTonbridge]);

  const sortedMeets = useMemo(() => {
    return [...filteredMeets].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredMeets, sortConfig]);

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
    <Layout session={session}>
      <Head>
        <title>Meet Management | CoachesEye</title>
      </Head>

      <div className="profile-header">
        <div className="flex justify-between items-end">
          <div>
            <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3rem', marginBottom: 8 }}>Meet Management</h1>
            <div className="swimmer-meta">
              <span className="meta-item">Categorize meets as Open Meets or Team Galas</span>
            </div>
          </div>
          {selectedMeets.length >= 2 && (
            <button 
              className="btn-premium-intel" 
              onClick={handleMerge}
              disabled={merging}
              style={{ background: 'var(--accent-cyan)', color: 'black' }}
            >
              {merging ? 'CONSOLIDATING...' : `CONSOLIDATE ${selectedMeets.length} MEETS`}
            </button>
          )}
        </div>
      </div>

      {status && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', marginBottom: '2rem', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-emerald)', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>
          {status.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        <div className="glass-card lg:col-span-2" style={{ borderLeft: '4px solid var(--accent-cyan)', padding: '2rem' }}>
          <div className="flex justify-between items-center mb-6">
            <div style={{ fontSize: '0.65rem', fontWeight: 950, letterSpacing: '0.2em', opacity: 0.8, textTransform: 'uppercase' }}>CoachesEye Intelligence Brain</div>
            <button 
              className="btn-premium-intel" 
              onClick={() => setIsConsolidateOpen(true)}
              style={{ background: 'rgba(0, 212, 255, 0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(0, 212, 255, 0.2)', fontSize: '0.6rem', padding: '6px 16px' }}
            >
              🧬 CONSOLIDATE SESSIONS
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Strategic Pathway', text: `The current calendar contains ${meets.filter(m => m.type === 'open').length} Open Meets. These are the primary qualification vectors for County, Regional, and National championships.`, type: 'success' },
              { label: 'Team Dynamics', text: `With ${meets.filter(m => m.type === 'team').length} Team Galas identified, the schedule provides critical opportunities for squad cohesion and race-pace practice.`, type: 'warning' },
              { label: 'Data Integrity', text: meets.filter(m => !m.type).length > 0 ? `${meets.filter(m => !m.type).length} meets require categorization to ensure accurate Achievement DNA tracking.` : "All meets correctly categorized. Operational data is high-fidelity.", type: meets.filter(m => !m.type).length > 0 ? 'danger' : 'success' }
            ].map((insight, idx) => (
              <div key={idx} style={{ 
                background: insight.type === 'success' ? 'rgba(16,185,129,0.03)' : insight.type === 'danger' ? 'rgba(244,63,94,0.03)' : 'rgba(245,158,11,0.03)',
                borderLeft: `3px solid ${insight.type === 'success' ? '#10b981' : insight.type === 'danger' ? '#f43f5e' : '#f59e0b'}`,
                padding: '1.2rem',
                borderRadius: '0 8px 8px 0'
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 950, color: insight.type === 'success' ? '#10b981' : insight.type === 'danger' ? '#f43f5e' : '#f59e0b', marginBottom: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{insight.label}</div>
                <p style={{ fontSize: '0.85rem', fontWeight: 500, lineHeight: 1.4, color: 'rgba(255,255,255,0.9)', margin: 0 }}>{insight.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 950, opacity: 0.8, letterSpacing: '0.1em', marginBottom: 12 }}>CALENDAR MIX</div>
          <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyCenter: 'center' }}>
             <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                {meets.length > 0 && (
                  <circle 
                    cx="50" cy="50" r="45" fill="none" 
                    stroke="var(--accent-cyan)" 
                    strokeWidth="10" 
                    strokeDasharray={`${(meets.filter(m => m.type === 'open').length / meets.length) * 283} 283`}
                    transform="rotate(-90 50 50)"
                  />
                )}
             </svg>
             <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '1.2rem', fontWeight: 950 }}>
                {meets.length ? Math.round((meets.filter(m => m.type === 'open').length / meets.length) * 100) : 0}%
             </div>
          </div>
          <div style={{ fontSize: '0.6rem', fontWeight: 900, marginTop: 12, opacity: 0.8 }}>OPEN MEET RATIO</div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '2rem' }}>
        <div className="flex justify-between items-center mb-6" style={{ flexWrap: 'wrap', gap: '1.5rem' }}>
          <div className="section-title" style={{ margin: 0 }}>Registered Meets</div>
          
          <div className="flex items-center gap-6" style={{ flexWrap: 'wrap' }}>
            <div className="period-selector-premium" style={{ display: 'flex', gap: '4px' }}>
              <button 
                className={`period-btn-premium ${filterTonbridge ? 'active' : ''}`}
                onClick={() => setFilterTonbridge(true)}
                style={{ fontSize: '0.7rem', padding: '6px 14px' }}
              >
                Tonbridge Swimmers
              </button>
              <button 
                className={`period-btn-premium ${!filterTonbridge ? 'active' : ''}`}
                onClick={() => setFilterTonbridge(false)}
                style={{ fontSize: '0.7rem', padding: '6px 14px' }}
              >
                All Meets
              </button>
            </div>

            <div style={{ position: "relative", width: "260px" }}>
               <svg style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--accent-cyan)", opacity: 0.7 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
               <input 
                 type="text" 
                 placeholder="Search meets..." 
                 style={{ 
                   width: "100%", 
                   background: "rgba(0,0,0,0.2)", 
                   border: "1px solid rgba(255,255,255,0.08)", 
                   borderRadius: "12px", 
                   padding: "10px 16px 10px 2.5rem", 
                   color: "white", 
                   fontSize: "0.85rem",
                   outline: "none"
                 }}
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
               />
            </div>
          </div>
        </div>

        <table className="stats-table-glass">
          <thead>
            <tr>
              <th onClick={() => requestSort('date')} style={{ cursor: 'pointer' }}>Date{getSortIndicator('date')}</th>
              <th onClick={() => requestSort('name')} style={{ cursor: 'pointer' }}>Meet Name{getSortIndicator('name')}</th>
              <th onClick={() => requestSort('license')} style={{ cursor: 'pointer' }}>License{getSortIndicator('license')}</th>
              <th onClick={() => requestSort('course')} style={{ cursor: 'pointer' }}>Course{getSortIndicator('course')}</th>
              <th onClick={() => requestSort('level')} style={{ cursor: 'pointer' }}>Level{getSortIndicator('level')}</th>
              <th onClick={() => requestSort('type')} style={{ textAlign: 'right', cursor: 'pointer' }}>Category Selection{getSortIndicator('type')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>Loading meets...</td></tr>
            ) : sortedMeets.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>No meets found matching "{search}"</td></tr>
            ) : sortedMeets.map(m => (
              <tr key={m.id} style={{ opacity: m.parent_id ? 0.6 : 1, background: m.parent_id ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <td style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>{new Date(m.date).toLocaleDateString('en-GB')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>End:</span>
                      <input 
                        type="date" 
                        value={m.end_date || ''} 
                        onChange={(e) => updateMeetEndDate(m.id, e.target.value)}
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '0.75rem',
                          padding: '2px 4px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td style={{ fontWeight: 800 }}>
                  <Link href={`/meet/${m.id}`} style={{ textDecoration: 'none', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {m.parent_id && <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>↳</span>}
                    {m.name}
                    {m.parent_id && <span style={{ fontSize: '0.5rem', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-amber)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>CHILD</span>}
                    {meets.some(child => child.parent_id === m.id) && <span style={{ fontSize: '0.5rem', background: 'rgba(0, 212, 255, 0.1)', color: 'var(--accent-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 212, 255, 0.2)' }}>MASTER</span>}
                  </Link>
                </td>
                <td style={{ opacity: 0.5, fontSize: '0.8rem' }}>{m.license}</td>
                <td>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    fontWeight: 900, 
                    padding: '4px 8px', 
                    background: m.course === 'LC' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                    color: m.course === 'LC' ? 'var(--accent-cyan)' : 'var(--accent-emerald)',
                    borderRadius: '4px'
                  }}>
                    {m.course || 'N/A'}
                  </span>
                </td>
                <td>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    fontWeight: 900, 
                    color: m.level ? 'var(--accent-amber)' : 'inherit',
                    opacity: m.level ? 1 : 0.3
                  }}>
                    {m.level || '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="period-selector" style={{ justifyContent: 'flex-end' }}>
                    <button 
                      className={`period-btn ${m.type === 'open' ? 'active' : ''}`}
                      onClick={() => updateMeetType(m.id, 'open')}
                    >
                      Open Meet
                    </button>
                    <button 
                      className={`period-btn ${m.type === 'team' ? 'active' : ''}`}
                      onClick={() => updateMeetType(m.id, 'team')}
                    >
                      Team Gala
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConsolidationModal 
        isOpen={isConsolidateOpen} 
        onClose={() => setIsConsolidateOpen(false)} 
        meets={meets}
        onComplete={handleMergeComplete}
      />
    </Layout>
  );
}
