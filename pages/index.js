import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import MeetCard from '../components/MeetCard';
import SwimmerStats from '../components/SwimmerStats';
import Link from 'next/link';

export default function Home({ session }) {
  const [loading, setLoading] = useState(true);
  const [meets, setMeets] = useState([]);
  const [swimmers, setSwimmers] = useState([]);
  
  // Filtering state
  const [searchName, setSearchName] = useState('');
  const [filterSquad, setFilterSquad] = useState('all');
  const [filterMeet, setFilterMeet] = useState('all');
  const [availableSquads, setAvailableSquads] = useState([]);
  const [squadKPIs, setSquadKPIs] = useState([]);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary', 'team', 'analytics', or 'swimmers'
  const [squadTeamStats, setSquadTeamStats] = useState([]);
  const [meetSearch, setMeetSearch] = useState('');
  const [selectedMeetAnalytics, setSelectedMeetAnalytics] = useState(null);
  const [selectedSquadAnalytics, setSelectedSquadAnalytics] = useState(null);
  const [results, setResults] = useState([]);
  const [analytics, setAnalytics] = useState({
    topSwimmers: [],
    popularGalas: [],
    squadActivity: []
  });

  useEffect(() => {
    if (session) {
      fetchDashboardData();
    }
  }, [session]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Helper to fetch all rows by bypassing the 1000 limit
      const fetchAll = async (table, select = '*', maxPages = 10) => {
        let allData = [];
        let page = 0;
        let hasMore = true;
        while (hasMore && page < maxPages) {
          const { data, error } = await supabase
            .from(table)
            .select(select)
            .range(page * 1000, (page + 1) * 1000 - 1);
          if (error) throw error;
          allData = [...allData, ...data];
          if (data.length < 1000) hasMore = false;
          page++;
        }
        return allData;
      };

      // 1. Fetch meets
      const meetsData = await fetchAll('meets', '*');
      
      // 2. Fetch results
      const resultsData = await fetchAll('results', 'id, event, meet_id, swimmer_id, wa_pts');

      // 3. Fetch swimmers
      const swimmersData = await fetchAll('swimmers', '*, squads(name)');
      
      const swimmersWithSquads = (swimmersData || []).map(s => ({
        ...s,
        squad_name: s.squads?.name
      }));

      // 4. Process data
      const processedMeets = (meetsData || []).map(meet => {
        const meetResults = (resultsData || []).filter(r => r.meet_id === meet.id);
        const squadCounts = {};
        
        meetResults.forEach(r => {
          const s = swimmersWithSquads.find(sw => sw.id === r.swimmer_id);
          if (s && s.squad_name) {
            squadCounts[s.squad_name] = (squadCounts[s.squad_name] || 0) + 1;
          }
        });

        return {
          ...meet,
          totalAttendance: meetResults.length,
          uniqueSwimmers: new Set(meetResults.map(r => r.swimmer_id)).size,
          squadsCount: Object.keys(squadCounts)
            .map(name => ({
              squad_name: name,
              count: squadCounts[name]
            }))
        };
      }).filter(meet => {
        const isTypeOpen = !meet.type || meet.type === 'open';
        return meet.totalAttendance > 0 && isTypeOpen;
      });

      setMeets(processedMeets);
      
      const { data: squadsData } = await supabase
        .from('squads')
        .select('*')
        .eq('is_squad', true)
        .order('name');
      setAvailableSquads(squadsData || []);

      const processedSwimmers = (swimmersWithSquads || []).map(swimmer => {
        const swimmerResults = resultsData.filter(r => r.swimmer_id === swimmer.id);
        const uniqueMeets = new Set(swimmerResults.map(r => r.meet_id));
        
        return {
          ...swimmer,
          meetCount: uniqueMeets.size,
          eventCount: swimmerResults.length
        };
      });

      setSwimmers(processedSwimmers.sort((a, b) => b.eventCount - a.eventCount));
      
      // Calculate Squad KPIs
      const openMeetIds = (meetsData || []).filter(m => !m.type || m.type === 'open').map(m => m.id);
      const kpis = (squadsData || []).map(squad => {
        const squadSwimmers = processedSwimmers.filter(sw => sw.squad_id === squad.id);
        
        const swimmerOpenMeetCounts = squadSwimmers.map(s => {
          const uniqueMeets = new Set(
            (resultsData || [])
              .filter(r => r.swimmer_id === s.id && openMeetIds.includes(r.meet_id))
              .map(r => r.meet_id)
          );
          return uniqueMeets.size;
        });

        const swimmersMeetingKPI = swimmerOpenMeetCounts.filter(count => count >= squad.target_meets).length;
        const successRate = squadSwimmers.length > 0 ? (swimmersMeetingKPI / squadSwimmers.length) * 100 : 0;
        
        return {
          ...squad,
          swimmersMeetingKPI,
          successRate,
          swimmerCount: squadSwimmers.length
        };
      });
      setSquadKPIs(kpis);

      // Team Gala Stats
      const teamMeetIds = (meetsData || []).filter(m => m.type === 'team').map(m => m.id);
      const teamStats = (squadsData || []).map(squad => {
        const squadSwimmers = processedSwimmers.filter(sw => sw.squad_id === squad.id);
        const teamResults = (resultsData || []).filter(r => teamMeetIds.includes(r.meet_id) && squadSwimmers.some(sw => sw.id === r.swimmer_id));
        
        return {
          id: squad.id,
          name: squad.name,
          resultsCount: teamResults.length,
          uniqueSwimmers: new Set(teamResults.map(r => r.swimmer_id)).size,
          avgWAPts: teamResults.length > 0 ? Math.round(teamResults.reduce((acc, curr) => acc + curr.wa_pts, 0) / teamResults.length) : 0
        };
      });
      setSquadTeamStats(teamStats);
      setResults(resultsData);

      // 6. Calculate Analytics
      const topSwimmers = [...processedSwimmers]
        .sort((a, b) => b.meetCount - a.meetCount)
        .slice(0, 10);
      
      const popularGalas = [...processedMeets]
        .sort((a, b) => b.totalAttendance - a.totalAttendance)
        .slice(0, 10);
        
      const squadActivity = (squadsData || []).map(s => {
        const squadResults = (resultsData || []).filter(r => processedSwimmers.find(sw => sw.id === r.swimmer_id)?.squad_id === s.id);
        return {
          id: s.id,
          name: s.name,
          totalSwims: squadResults.length,
          avgWAPts: squadResults.length > 0 ? Math.round(squadResults.reduce((acc, curr) => acc + curr.wa_pts, 0) / squadResults.length) : 0
        };
      }).sort((a, b) => b.totalSwims - a.totalSwims);

      setAnalytics({ topSwimmers, popularGalas, squadActivity });
    } catch (error) {
      console.error('Error fetching dashboard data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout session={session}>
      <h1 className="mb-8">Dashboard</h1>
      
      {loading ? (
        <p className="text-center" style={{ color: 'var(--text-secondary)' }}>Loading your dashboard...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="stat-box">
              <div className="stat-value">{meets.length}</div>
              <div className="stat-label">Meets Tracked</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{swimmers.length}</div>
              <div className="stat-label">Swimmers Tracked</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">
                {swimmers.reduce((acc, curr) => acc + curr.eventCount, 0)}
              </div>
              <div className="stat-label">Total Events Swum</div>
            </div>
          </div>

          <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
            <div className="flex gap-4">
              <button className={`btn ${activeTab === 'summary' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('summary')}>Open Meet KPIs</button>
              <button className={`btn ${activeTab === 'team' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('team')}>Team Gala Stats</button>
              <button className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('analytics')}>Club Analytics</button>
              <button className={`btn ${activeTab === 'swimmers' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('swimmers')}>Detailed Swimmers</button>
            </div>
            <Link href="/meets" className="btn btn-secondary" style={{ border: '1px dashed var(--accent-primary)' }}>Manage Meet Types &rarr;</Link>
          </div>

          {activeTab === 'summary' ? (
            <>
              <h2 className="mb-4">Squad Criteria Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {squadKPIs.map(s => (
                  <Link href={`/squad/${s.id}`} key={s.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="card hover-scale" style={{ cursor: 'pointer', height: '100%', border: s.successRate >= 100 ? '1px solid #4ade80' : 'none' }}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{s.name}</h3>
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 600 }}>DETAILS &rarr;</span>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <div className="flex justify-between mb-1">
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>KPI Success Rate:</span>
                          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{Math.round(s.successRate)}%</span>
                        </div>
                        <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${s.successRate}%`, 
                            height: '100%', 
                            background: s.successRate < 33 ? '#f87171' : s.successRate < 66 ? '#fbbf24' : '#4ade80',
                            transition: 'width 0.8s ease',
                            boxShadow: '0 0 10px rgba(0,0,0,0.1)'
                          }}></div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.swimmersMeetingKPI}</span>
                        <span>/</span>
                        <span>{s.swimmerCount} Swimmers Meeting Goal</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="flex justify-between items-center mb-4">
                <h2>Recent Meet Attendance</h2>
                <div style={{ width: '300px' }}>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Search meets..." 
                    value={meetSearch}
                    onChange={(e) => setMeetSearch(e.target.value)}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                {meets
                  .filter(m => (filterMeet === 'all' || m.id === filterMeet) && m.name.toLowerCase().includes(meetSearch.toLowerCase()))
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map(meet => <MeetCard key={meet.id} meet={meet} />)}
              </div>
            </>
          ) : activeTab === 'analytics' ? (
            <>
              <h2 className="mb-4">Club Analytics Overview</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                <div className="card">
                  <h3 className="mb-4" style={{ color: 'var(--accent-color)' }}>Most Active Swimmers</h3>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr><th>Swimmer</th><th>Squad</th><th className="text-center">Meets</th></tr>
                      </thead>
                      <tbody>
                        {analytics.topSwimmers.map(s => (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                            <td>{s.squad_name}</td>
                            <td className="text-center" style={{ fontWeight: 700, color: 'var(--accent-color)' }}>{s.meetCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <h3 className="mb-4" style={{ color: 'var(--success-color)' }}>Most Popular Galas</h3>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr><th>Gala Name</th><th>Date</th><th className="text-center">Entries</th><th className="text-center">Swimmers</th></tr>
                      </thead>
                      <tbody>
                        {analytics.popularGalas.map(m => (
                          <tr key={m.id} 
                              onClick={() => setSelectedMeetAnalytics(m)}
                              style={{ cursor: 'pointer' }}
                              className={selectedMeetAnalytics?.id === m.id ? 'active-row' : ''}
                          >
                            <td style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{m.name}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(m.date).toLocaleDateString('en-GB')}</td>
                            <td className="text-center" style={{ fontWeight: 700 }}>{m.totalAttendance}</td>
                            <td className="text-center" style={{ fontWeight: 700, color: 'var(--success-color)' }}>{m.uniqueSwimmers}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {selectedMeetAnalytics && (
                    <div className="mt-8 p-4 border-t border-white/10">
                      <div className="flex justify-between items-center mb-4">
                        <h4 style={{ color: 'var(--accent-color)' }}>Swimmers at {selectedMeetAnalytics.name}</h4>
                        <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }} onClick={() => setSelectedMeetAnalytics(null)}>Close List</button>
                      </div>
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <ol style={{ paddingLeft: '1.5rem' }}>
                          {swimmers
                            .filter(s => {
                              // Check if this swimmer has ANY result in the selected meet
                              return results.some(r => r.swimmer_id === s.id && r.meet_id === selectedMeetAnalytics.id);
                            })
                            .map((s, idx) => (
                              <li key={s.id} style={{ padding: '0.25rem 0', fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                {s.full_name} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>({s.squad_name})</span>
                              </li>
                            ))}
                        </ol>
                      </div>
                    </div>
                  )}
                </div>

                <div className="card lg:col-span-2">
                  <h3 className="mb-4">Squad Participation (Total Swims)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {analytics.squadActivity.map(sq => (
                      <div 
                        key={sq.name} 
                        className={`stat-box hover-scale ${selectedSquadAnalytics?.id === sq.id ? 'active-stat' : ''}`} 
                        style={{ 
                          background: 'rgba(255,255,255,0.02)', 
                          padding: '1rem',
                          cursor: 'pointer',
                          border: selectedSquadAnalytics?.id === sq.id ? '1px solid var(--accent-color)' : '1px solid var(--surface-border)'
                        }}
                        onClick={() => setSelectedSquadAnalytics(sq)}
                      >
                        <div className="stat-value" style={{ fontSize: '1.5rem', color: selectedSquadAnalytics?.id === sq.id ? 'var(--accent-color)' : 'inherit' }}>{sq.totalSwims}</div>
                        <div className="stat-label" style={{ fontSize: '0.65rem' }}>{sq.name}</div>
                      </div>
                    ))}
                  </div>

                  {selectedSquadAnalytics && (
                    <div className="p-4 border-t border-white/10 mt-4">
                      <div className="flex justify-between items-center mb-4">
                        <h4 style={{ color: 'var(--accent-color)' }}>Detailed Swimmers: {selectedSquadAnalytics.name}</h4>
                        <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }} onClick={() => setSelectedSquadAnalytics(null)}>Close Details</button>
                      </div>
                      <div className="table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>Swimmer</th>
                              <th className="text-center">Total Swims</th>
                              <th className="text-center">Avg WA Pts</th>
                              <th className="text-center">Meets</th>
                            </tr>
                          </thead>
                          <tbody>
                            {swimmers
                              .filter(s => s.squad_id === selectedSquadAnalytics.id)
                              .sort((a, b) => b.eventCount - a.eventCount)
                              .map(s => {
                                const sResults = results.filter(r => r.swimmer_id === s.id);
                                const avgPts = sResults.length > 0 ? Math.round(sResults.reduce((acc, curr) => acc + curr.wa_pts, 0) / sResults.length) : 0;
                                return (
                                  <tr key={s.id}>
                                    <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                                    <td className="text-center">{s.eventCount}</td>
                                    <td className="text-center" style={{ color: 'var(--accent-color)', fontWeight: 700 }}>{avgPts}</td>
                                    <td className="text-center">{s.meetCount}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : activeTab === 'team' ? (
            <>
              <h2 className="mb-4">Team Gala Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {squadTeamStats.map(s => (
                  <div key={s.id} className="card">
                    <h3 className="mb-4">{s.name}</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Swims</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{s.resultsCount}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Swimmers</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success-color)' }}>{s.uniqueSwimmers}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Avg WA</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{s.avgWAPts}</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5"><Link href={`/squad/${s.id}`} className="btn btn-secondary w-full text-center" style={{ fontSize: '0.8rem' }}>View Detailed Performance</Link></div>
                  </div>
                ))}
              </div>
              <h2 className="mb-4">Recent Team Galas</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {meets.filter(m => m.type === 'team').slice(0, 4).map(meet => <MeetCard key={meet.id} meet={meet} />)}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="form-group"><label className="form-label">Search Swimmer</label><input type="text" className="input-field" placeholder="Name..." value={searchName} onChange={(e) => setSearchName(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Filter by Squad</label><select className="input-field" value={filterSquad} onChange={(e) => setFilterSquad(e.target.value)}><option value="all">All Squads</option>{availableSquads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <h2 className="mb-4">Swimmer Performance</h2>
              <SwimmerStats swimmers={swimmers.filter(s => s.full_name.toLowerCase().includes(searchName.toLowerCase()) && (filterSquad === 'all' || s.squad_id === filterSquad))} />
            </>
          )}
        </>
      )}
    </Layout>
  );
}
