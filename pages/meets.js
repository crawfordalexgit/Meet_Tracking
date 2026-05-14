import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';

export default function MeetManagement({ session }) {
  const [loading, setLoading] = useState(true);
  const [meets, setMeets] = useState([]);
  const [status, setStatus] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.push('/login');
      return;
    }
    fetchMeets();
  }, [session, router]);

  const fetchMeets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('meets')
      .select('*, results!inner(id)')
      .order('date', { ascending: false });
    
    if (data) {
      const uniqueMeets = data.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      setMeets(uniqueMeets);
    }
    setLoading(false);
  };

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
  const sortedMeets = useMemo(() => {
    return [...meets].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [meets, sortConfig]);

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
        <div>
          <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3rem', marginBottom: 8 }}>Meet Management</h1>
          <div className="swimmer-meta">
            <span className="meta-item">Categorize meets as Open Meets or Team Galas</span>
          </div>
        </div>
      </div>

      {status && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', marginBottom: '2rem', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-emerald)', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>
          {status.text}
        </div>
      )}

      <div className="glass-card" style={{ padding: '1rem' }}>
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
            ) : sortedMeets.map(m => (
              <tr key={m.id}>
                <td>{new Date(m.date).toLocaleDateString('en-GB')}</td>
                <td style={{ fontWeight: 800 }}>{m.name}</td>
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
    </Layout>
  );
}
