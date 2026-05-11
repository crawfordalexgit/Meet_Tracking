import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';

export default function MeetManagement({ session }) {
  const [loading, setLoading] = useState(true);
  const [meets, setMeets] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (session) {
      fetchMeets();
    }
  }, [session]);

  const fetchMeets = async () => {
    setLoading(true);
    // Use !inner to only return meets that have at least one result linked to them
    const { data, error } = await supabase
      .from('meets')
      .select('*, results!inner(id)')
      .order('date', { ascending: false });
    
    if (data) {
      // Deduplicate results (Supabase might return multiple rows per meet with !inner)
      const uniqueMeets = data.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      setMeets(uniqueMeets);
    }
    setLoading(false);
  };

  const updateMeetType = async (meetId, newType) => {
    setMeets(meets.map(m => m.id === meetId ? { ...m, type: newType } : m));
    
    const { error } = await supabase
      .from('meets')
      .update({ type: newType })
      .eq('id', meetId);
      
    if (error) {
      setStatus({ type: 'error', text: 'Failed to update meet type.' });
      fetchMeets(); // Refresh
    } else {
      setStatus({ type: 'success', text: 'Meet updated successfully.' });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <Layout session={session}>
      <div className="flex justify-between items-center mb-8">
        <h1>Meet Management</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Categorize meets as Open Meets or Team Galas</p>
      </div>

      {status && (
        <div className={`alert ${status.type === 'error' ? 'alert-error' : 'alert-success'} mb-6`}>
          {status.text}
        </div>
      )}

      {loading ? (
        <p className="text-center">Loading meets...</p>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meet Name</th>
                  <th>License</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {meets.map(m => (
                  <tr key={m.id}>
                    <td>{new Date(m.date).toLocaleDateString('en-GB')}</td>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{m.license}</td>
                    <td>
                      <div className="flex gap-2">
                        <button 
                          className={`btn btn-secondary ${m.type === 'open' ? 'btn-primary' : ''}`}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                          onClick={() => updateMeetType(m.id, 'open')}
                        >
                          Open Meet
                        </button>
                        <button 
                          className={`btn btn-secondary ${m.type === 'team' ? 'btn-primary' : ''}`}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
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
        </div>
      )}
    </Layout>
  );
}
