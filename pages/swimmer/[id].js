import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';

export default function SwimmerDetail({ session }) {
  const router = useRouter();
  const { id } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [swimmer, setSwimmer] = useState(null);
  const [results, setResults] = useState([]);
  const [squad, setSquad] = useState(null);

  useEffect(() => {
    if (id && session) {
      fetchSwimmerData();
    }
  }, [id, session]);

  const fetchSwimmerData = async () => {
    setLoading(true);
    try {
      // 1. Fetch swimmer details
      const { data: swimmerData, error: swimmerError } = await supabase
        .from('swimmers')
        .select('*, squads(*)')
        .eq('id', id)
        .single();
        
      if (swimmerError) throw swimmerError;
      setSwimmer(swimmerData);
      setSquad(swimmerData.squads);

      // 2. Fetch all results for this swimmer
      const { data: resultsData, error: resultsError } = await supabase
        .from('results')
        .select('*, meets(*)')
        .eq('swimmer_id', id)
        .order('meets(date)', { ascending: false });

      if (resultsError) throw resultsError;
      setResults(resultsData || []);
    } catch (error) {
      console.error('Error fetching swimmer data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Layout session={session}><p className="text-center">Loading swimmer profile...</p></Layout>;
  if (!swimmer) return <Layout session={session}><p className="text-center">Swimmer not found.</p></Layout>;

  const uniqueMeets = new Set(results.map(r => r.meet_id)).size;
  const targetMeets = squad?.target_meets || 0;
  const progressPercent = targetMeets > 0 ? Math.min((uniqueMeets / targetMeets) * 100, 100) : 100;

  return (
    <Layout session={session}>
      <div className="mb-8">
        <button onClick={() => router.back()} className="btn btn-secondary mb-4">&larr; Back to Dashboard</button>
        <h1>{swimmer.full_name}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
          {squad?.name || 'Unassigned Swimmer'} | SE ID: {swimmer.member_id}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="stat-box">
          <div className="stat-value">{uniqueMeets}</div>
          <div className="stat-label">Meets Attended</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{results.length}</div>
          <div className="stat-label">Individual Entries</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{targetMeets > 0 ? `${Math.round(progressPercent)}%` : 'N/A'}</div>
          <div className="stat-label">Season KPI Target ({targetMeets} Meets)</div>
          {targetMeets > 0 && (
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '10px', overflow: 'hidden' }}>
              <div style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.5s ease' }}></div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-6">Meet History & Results</h2>
        <div className="table-wrapper">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Meet Name</th>
                <th>Event</th>
                <th>Time</th>
                <th>WA Pts</th>
              </tr>
            </thead>
            <tbody>
              {results.length > 0 ? (
                results.map((r) => (
                  <tr key={r.id}>
                    <td>{r.meets?.date ? new Date(r.meets.date).toLocaleDateString('en-GB') : 'N/A'}</td>
                    <td style={{ fontWeight: 500 }}>{r.meets?.name}</td>
                    <td>{r.event}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{r.time}</td>
                    <td><span className="badge badge-primary">{r.wa_pts}</span></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center" style={{ color: 'var(--text-secondary)' }}>No results found for this swimmer.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
