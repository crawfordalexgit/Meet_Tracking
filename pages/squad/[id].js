import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export default function SquadDetail({ session }) {
  const router = useRouter();
  const { id } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [squad, setSquad] = useState(null);
  const [swimmers, setSwimmers] = useState([]);

  useEffect(() => {
    if (id && session) {
      fetchSquadData();
    }
  }, [id, session]);

  const fetchSquadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch squad details
      const { data: squadData, error: squadError } = await supabase
        .from('squads')
        .select('*')
        .eq('id', id)
        .single();
        
      if (squadError) throw squadError;
      setSquad(squadData);

      // 2. Fetch all swimmers in this squad
      const { data: swimmersData, error: swimmersError } = await supabase
        .from('swimmers')
        .select('*')
        .eq('squad_id', id);

      if (swimmersError) throw swimmersError;

      // 3. Fetch result counts to calculate meet attendance per swimmer
      const swimmerIds = swimmersData.map(s => s.id);
      const { data: resultsData } = await supabase
        .from('results')
        .select('swimmer_id, meet_id')
        .in('swimmer_id', swimmerIds);

      // Group results by swimmer and count unique meets
      const swimmerMeetCounts = {};
      resultsData?.forEach(r => {
        if (!swimmerMeetCounts[r.swimmer_id]) swimmerMeetCounts[r.swimmer_id] = new Set();
        swimmerMeetCounts[r.swimmer_id].add(r.meet_id);
      });

      const processedSwimmers = swimmersData.map(s => ({
        ...s,
        meetCount: swimmerMeetCounts[s.id]?.size || 0
      })).sort((a, b) => b.meetCount - a.meetCount);

      setSwimmers(processedSwimmers);
    } catch (error) {
      console.error('Error fetching squad data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Layout session={session}><p className="text-center">Loading squad data...</p></Layout>;
  if (!squad) return <Layout session={session}><p className="text-center">Squad not found.</p></Layout>;

  const target = squad.target_meets || 0;
  const meetingKPI = swimmers.filter(s => s.meetCount >= target).length;
  const kpiPercent = swimmers.length > 0 ? (meetingKPI / swimmers.length) * 100 : 0;

  return (
    <Layout session={session}>
      <div className="mb-8">
        <button onClick={() => router.back()} className="btn btn-secondary mb-4">&larr; Back to Dashboard</button>
        <h1>{squad.name} KPI Tracker</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
          Target: {target} Open Meets per Swimmer
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="stat-box">
          <div className="stat-value">{swimmers.length}</div>
          <div className="stat-label">Total Swimmers</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{meetingKPI}</div>
          <div className="stat-label">Meeting KPI ({target}+ Meets)</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{Math.round(kpiPercent)}%</div>
          <div className="stat-label">Squad Success Rate</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-6">Swimmer KPI Breakdown</h2>
        <div className="table-wrapper">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Swimmer Name</th>
                <th>Meets Attended</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {swimmers.map((s) => {
                const isMeeting = s.meetCount >= target;
                return (
                  <tr key={s.id} style={{ borderLeft: `4px solid ${isMeeting ? '#4ade80' : '#f87171'}` }}>
                    <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                    <td style={{ fontWeight: 600 }}>{s.meetCount} / {target}</td>
                    <td>
                      <span className={`badge ${isMeeting ? 'badge-success' : 'badge-error'}`} style={{ 
                        background: isMeeting ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)',
                        color: isMeeting ? '#4ade80' : '#f87171',
                        border: `1px solid ${isMeeting ? '#4ade80' : '#f87171'}`
                      }}>
                        {isMeeting ? 'KPI MET' : `${target - s.meetCount} MORE NEEDED`}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link href={`/swimmer/${s.id}`} className="btn btn-secondary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                        View Details
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
