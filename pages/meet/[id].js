import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export default function MeetReport({ session }) {
  const router = useRouter();
  const { id } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [meet, setMeet] = useState(null);
  const [results, setResults] = useState([]);
  const [pbs, setPbs] = useState([]);
  const [swimmers, setSwimmers] = useState([]);
  
  useEffect(() => {
    if (id && session) {
      fetchMeetData();
    }
  }, [id, session]);

  const fetchMeetData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Meet Info
      const { data: meetData } = await supabase
        .from('meets')
        .select('*')
        .eq('id', id)
        .single();
      setMeet(meetData);

      // 2. Fetch Results for this meet
      const { data: resultsData } = await supabase
        .from('results')
        .select('*, swimmers(full_name, squad_id, squads(name))')
        .eq('meet_id', id);
      setResults(resultsData || []);

      // 3. Fetch PBs for the swimmers in this meet to double check
      const swimmerIds = [...new Set((resultsData || []).map(r => r.swimmer_id))];
      if (swimmerIds.length > 0) {
        const { data: pbsData } = await supabase
          .from('swimmer_pbs')
          .select('*')
          .in('swimmer_id', swimmerIds);
        setPbs(pbsData || []);
      }
    } catch (error) {
      console.error('Error fetching meet report:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Layout session={session}><p className="text-center mt-20">Generating Race Report...</p></Layout>;
  if (!meet) return <Layout session={session}><p className="text-center mt-20">Meet not found.</p></Layout>;

  // Calculate Stats
  const squadStats = {};
  results.forEach(r => {
    const squadName = r.swimmers?.squads?.name || 'Unassigned';
    if (!squadStats[squadName]) {
      squadStats[squadName] = { swimmers: new Set(), pbs: 0, totalPts: 0, count: 0 };
    }
    squadStats[squadName].swimmers.add(r.swimmer_id);
    squadStats[squadName].count++;
    squadStats[squadName].totalPts += r.wa_pts || 0;
    
    // Check if this was a PB
    const isPb = pbs.some(pb => pb.swimmer_id === r.swimmer_id && pb.event === r.event && (pb.date === r.date || pb.date === meet.date) && pb.time === r.time);
    if (isPb) squadStats[squadName].pbs++;
  });

  const totalPBs = Object.values(squadStats).reduce((acc, curr) => acc + curr.pbs, 0);

  return (
    <Layout session={session}>
      <div className="flex justify-between items-start mb-8">
        <div>
          <Link href="/" className="btn btn-secondary mb-4" style={{ display: 'inline-block', fontSize: '0.8rem' }}>&larr; Back to Dashboard</Link>
          <h1>Race Report: {meet.name}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>{new Date(meet.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} • {meet.license || 'No License'}</p>
        </div>
        <div className="stat-box" style={{ padding: '1rem 2rem', border: '1px solid #4ade80' }}>
          <div className="stat-value" style={{ color: '#4ade80' }}>{totalPBs}</div>
          <div className="stat-label">Total PBs Achieved</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {Object.entries(squadStats).sort().map(([name, stats]) => (
          <div key={name} className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>{name}</h3>
            <div className="flex justify-between mb-2">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Swimmers:</span>
              <span style={{ fontWeight: 600 }}>{stats.swimmers.size}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>PBs:</span>
              <span style={{ fontWeight: 700, color: '#4ade80' }}>{stats.pbs}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Avg WA Pts:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{Math.round(stats.totalPts / stats.count)}</span>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-4">Full Result Listings</h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Swimmer</th>
                <th>Squad</th>
                <th>Event</th>
                <th className="text-center">Time</th>
                <th className="text-center">WA Pts</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.sort((a, b) => a.swimmers.full_name.localeCompare(b.swimmers.full_name)).map(r => {
                const isPb = pbs.some(pb => pb.swimmer_id === r.swimmer_id && pb.event === r.event && (pb.date === r.date || pb.date === meet.date) && pb.time === r.time);
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.swimmers.full_name}</td>
                    <td>{r.swimmers.squads?.name}</td>
                    <td>{r.event}</td>
                    <td className="text-center" style={{ fontWeight: 700 }}>{r.time}</td>
                    <td className="text-center" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>{r.wa_pts}</td>
                    <td className="text-center">
                      {isPb ? (
                        <span style={{ 
                          color: '#4ade80', 
                          fontWeight: 700, 
                          background: 'rgba(74, 222, 128, 0.1)', 
                          padding: '2px 8px', 
                          borderRadius: '12px',
                          fontSize: '0.7rem'
                        }}>★ PERSONAL BEST</span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Completed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
