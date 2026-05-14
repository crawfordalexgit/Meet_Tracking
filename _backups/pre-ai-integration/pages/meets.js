import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';

export default function MeetManagement({ session }) {
  const [loading, setLoading] = useState(true);
  const [meets, setMeets] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetchMeets();
  }, []);

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
              <th>Date</th>
              <th>Meet Name</th>
              <th>License</th>
              <th style={{ textAlign: 'right' }}>Category Selection</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>Loading meets...</td></tr>
            ) : meets.map(m => (
              <tr key={m.id}>
                <td>{new Date(m.date).toLocaleDateString('en-GB')}</td>
                <td style={{ fontWeight: 800 }}>{m.name}</td>
                <td style={{ opacity: 0.5, fontSize: '0.8rem' }}>{m.license}</td>
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
