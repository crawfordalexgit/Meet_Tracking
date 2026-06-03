import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { getSessionDuration } from '../lib/analytics-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function CapacityDashboard({ session }) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [activeTab, setActiveTab] = useState('heatmap');
  const [swimmers, setSwimmers] = useState([]);
  const [graphSession, setGraphSession] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [simAdjustments, setSimAdjustments] = useState({});
  const [globalSquadFilter, setGlobalSquadFilter] = useState('All');
  const [updating, setUpdating] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [periodDays]);

  const fetchPaged = async (table, select = '*', filter = null) => {
    let all = [];
    let page = 0;
    let more = true;
    while (more && page < 20) {
      let q = supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
      if (filter) q = filter(q);
      const { data: d, error } = await q;
      if (error || !d) break;
      all = [...all, ...d];
      if (d.length < 1000) more = false;
      page++;
    }
    return all;
  };

  const fetchData = async () => {
    setLoading(true);
    const startDate = new Date(Date.now() - periodDays * 86400000).toISOString();
    const [sessRes, allMemberships, allAttendance, swimRes] = await Promise.all([
      supabase.from('sessions').select('*').order('day_of_week').order('start_time'),
      fetchPaged('session_memberships', 'session_id, swimmer_id'),
      fetchPaged('training_attendance', 'session_id, swimmer_id, date', q => q.eq('status', 'present').gte('date', startDate)),
      supabase.from('swimmers').select('id, full_name, year_of_birth, squads(name, target_hours_per_week, target_sessions_per_week)')
    ]);

    if (sessRes.data) setSessions(sessRes.data);
    if (allMemberships) setMemberships(allMemberships);
    if (allAttendance) setAttendance(allAttendance);
    if (swimRes.data) setSwimmers(swimRes.data);
    setLoading(false);
  };

  const updateLanes = async (id, lanes) => {
    setUpdating(id);
    await supabase.from('sessions').update({ lanes_allocated: lanes }).eq('id', id);
    setSessions(sessions.map(s => s.id === id ? { ...s, lanes_allocated: lanes } : s));
    setUpdating(null);
  };

  const getDayOrder = (day) => {
    const days = { 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 7 };
    return days[day?.toLowerCase()] || 99;
  };

  const sortedSessions = [...sessions].sort((a, b) => getDayOrder(a.day_of_week) - getDayOrder(b.day_of_week));
  const squadsList = [...new Set(swimmers.map(s => s.squads?.name).filter(Boolean))].sort();

  // Ghost Allocations: memberships with zero 'present' attendance records in the current period
  const ghostAllocations = useMemo(() => {
    return memberships.map(m => {
      const swimmer = swimmers.find(s => s.id === m.swimmer_id);
      if (!swimmer) return null;

      const squadName = swimmer.squads?.name || '';
      if (globalSquadFilter !== 'All' && squadName !== globalSquadFilter) return null;

      const session = sessions.find(s => s.id === m.session_id || s.scm_guid === m.session_id);
      if (!session) return null;

      const presentCount = attendance.filter(a =>
        a.swimmer_id === m.swimmer_id && a.session_id === m.session_id
      ).length;

      if (presentCount > 0) return null;

      return {
        swimmerId: swimmer.id,
        swimmerName: swimmer.full_name,
        squadName,
        sessionName: session.name,
        sessionDay: session.day_of_week,
        sessionTime: session.start_time,
      };
    }).filter(Boolean).sort((a, b) =>
      (a.squadName || '').localeCompare(b.squadName || '') ||
      (a.sessionName || '').localeCompare(b.sessionName || '')
    );
  }, [memberships, swimmers, sessions, attendance, globalSquadFilter]);

  const handlePrintReport = () => { window.print(); };

  const handleCapacityExport = () => {
    setIsExporting(true);
    // Simulation state is ephemeral React state — must use browser print, not Puppeteer
    setTimeout(() => {
      window.print();
      setIsExporting(false);
    }, 300);
  };

  // Waitlist Yield: how many new swimmers can be admitted per squad if ghost allocations are removed
  const waitlistYields = useMemo(() => {
    if (ghostAllocations.length === 0) return [];

    // Count freed session slots per squad
    const freedBySquad = ghostAllocations.reduce((acc, g) => {
      acc[g.squadName] = (acc[g.squadName] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(freedBySquad).map(([squadName, freedSessions]) => {
      // Find target_sessions_per_week via any swimmer in this squad
      const ref = swimmers.find(s => s.squads?.name === squadName);
      const targetSessions = ref?.squads?.target_sessions_per_week;
      if (!targetSessions || targetSessions <= 0) return null;

      const yieldCount = Math.floor(freedSessions / targetSessions);
      if (yieldCount <= 0) return null;

      return { squadName, yield: yieldCount };
    }).filter(Boolean);
  }, [ghostAllocations, swimmers]);

  return (
    <Layout session={session}>
      <Head><title>Pool Space & Capacity | CoachesEye</title></Head>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; color: black !important; }
          .glass-card { background: white !important; border: none !important; box-shadow: none !important; color: black !important; padding: 0 !important; }
          .stats-table-glass th, .stats-table-glass td { color: black !important; border-bottom: 1px solid #ccc !important; }
        }
      `}</style>
      <div className="container animate-fade-in">
        <div className="flex justify-between items-end mb-8">
          <div>
            <div className="section-title">Operations Command</div>
            <h1 className="text-5xl font-black tracking-tighter uppercase mb-2">Pool Space Capacity</h1>
            <p className="text-white/50 max-w-2xl">Manage lane allocations and monitor swimmer density across all weekly sessions. Calculations strictly enforce a maximum safe working capacity of 8 athletes per lane in a 25m pool.</p>
          </div>
          <div className="flex items-center gap-4 mb-2 no-print">
            <div className="period-selector" style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.4)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              {[30, 90, 180, 365].map(days => (
                <button
                  key={days}
                  onClick={() => setPeriodDays(days)}
                  disabled={loading}
                  style={{
                    padding: '6px 16px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '0.05em', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                    background: periodDays === days ? 'var(--accent-cyan)' : 'transparent',
                    color: periodDays === days ? '#000' : 'rgba(255, 255, 255, 0.5)',
                    boxShadow: periodDays === days ? '0 4px 12px rgba(0, 212, 255, 0.3)' : 'none'
                  }}
                >
                  {days === 30 ? '1 Month' : days === 90 ? '3 Months' : days === 180 ? '6 Months' : '1 Year'}
                </button>
              ))}
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="hover-glow"
              style={{
                padding: '10px 16px', borderRadius: '12px', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.05)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)', transition: 'all 0.3s',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              <span>{loading ? '⏳' : '🔄'}</span> {loading ? 'SYNCING...' : 'REFRESH'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400"></div>
            <div className="text-xs font-black tracking-widest uppercase text-cyan-400/80">Loading Sessions...</div>
          </div>
        ) : (
          <>
            <div className="no-print" style={{ background: 'linear-gradient(135deg, #0f172a, rgba(30,58,138,0.8))', padding: '16px', borderRadius: '16px', marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveTab('heatmap')}
                style={activeTab === 'heatmap'
                  ? { background: 'linear-gradient(180deg, rgba(80,150,255,0.3) 0%, rgba(20,50,255,0.1) 100%)', border: '1px solid rgba(100,200,255,0.6)', borderRadius: '50px', color: '#ffffff', textShadow: '0 0 5px rgba(255,255,255,0.5)', boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,150,255,0.8), 0 0 15px rgba(0,150,255,0.6)', padding: '10px 24px', fontSize: '13px', fontWeight: '700', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }
                  : { background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'rgba(255,255,255,0.8)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)', padding: '10px 24px', fontSize: '13px', fontWeight: '600', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }}
              >
                🔥 Session Heatmap
              </button>
              <button
                onClick={() => setActiveTab('deficits')}
                style={activeTab === 'deficits'
                  ? { background: 'linear-gradient(180deg, rgba(80,150,255,0.3) 0%, rgba(20,50,255,0.1) 100%)', border: '1px solid rgba(100,200,255,0.6)', borderRadius: '50px', color: '#ffffff', textShadow: '0 0 5px rgba(255,255,255,0.5)', boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,150,255,0.8), 0 0 15px rgba(0,150,255,0.6)', padding: '10px 24px', fontSize: '13px', fontWeight: '700', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }
                  : { background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'rgba(255,255,255,0.8)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)', padding: '10px 24px', fontSize: '13px', fontWeight: '600', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }}
              >
                📋 Session Catch-Up Finder
              </button>
              <button
                onClick={() => setActiveTab('modeler')}
                style={activeTab === 'modeler'
                  ? { background: 'linear-gradient(180deg, rgba(80,150,255,0.3) 0%, rgba(20,50,255,0.1) 100%)', border: '1px solid rgba(100,200,255,0.6)', borderRadius: '50px', color: '#ffffff', textShadow: '0 0 5px rgba(255,255,255,0.5)', boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,150,255,0.8), 0 0 15px rgba(0,150,255,0.6)', padding: '10px 24px', fontSize: '13px', fontWeight: '700', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }
                  : { background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'rgba(255,255,255,0.8)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)', padding: '10px 24px', fontSize: '13px', fontWeight: '600', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }}
              >
                🛠️ Scenario Modeler
              </button>
              <button
                onClick={() => setActiveTab('ghosts')}
                style={activeTab === 'ghosts'
                  ? { background: 'linear-gradient(180deg, rgba(80,150,255,0.3) 0%, rgba(20,50,255,0.1) 100%)', border: '1px solid rgba(100,200,255,0.6)', borderRadius: '50px', color: '#ffffff', textShadow: '0 0 5px rgba(255,255,255,0.5)', boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,150,255,0.8), 0 0 15px rgba(0,150,255,0.6)', padding: '10px 24px', fontSize: '13px', fontWeight: '700', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }
                  : { background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'rgba(255,255,255,0.8)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)', padding: '10px 24px', fontSize: '13px', fontWeight: '600', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }}
              >
                👻 Ghost Allocations
              </button>
            </div>

            {/* GLOBAL SQUAD FILTER BAR */}
            <div className="no-print" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '24px' }}>
              <button onClick={() => setGlobalSquadFilter('All')} style={globalSquadFilter === 'All' ? { background: 'linear-gradient(180deg, rgba(80,150,255,0.3) 0%, rgba(20,50,255,0.1) 100%)', border: '1px solid rgba(100,200,255,0.6)', borderRadius: '50px', color: '#ffffff', textShadow: '0 0 5px rgba(255,255,255,0.5)', boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,150,255,0.8), 0 0 10px rgba(0,150,255,0.6)', padding: '8px 20px', fontSize: '12px', fontWeight: '700', textTransform: 'capitalize', backdropFilter: 'blur(12px)', flexShrink: 0, cursor: 'pointer' } : { background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'rgba(255,255,255,0.7)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)', padding: '8px 20px', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize', backdropFilter: 'blur(12px)', flexShrink: 0, cursor: 'pointer' }}>All Squads</button>
              {squadsList.map(sq => (
                <button key={sq} onClick={() => setGlobalSquadFilter(sq)} style={globalSquadFilter === sq ? { background: 'linear-gradient(180deg, rgba(80,150,255,0.3) 0%, rgba(20,50,255,0.1) 100%)', border: '1px solid rgba(100,200,255,0.6)', borderRadius: '50px', color: '#ffffff', textShadow: '0 0 5px rgba(255,255,255,0.5)', boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,150,255,0.8), 0 0 10px rgba(0,150,255,0.6)', padding: '8px 20px', fontSize: '12px', fontWeight: '700', textTransform: 'capitalize', backdropFilter: 'blur(12px)', flexShrink: 0, cursor: 'pointer' } : { background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'rgba(255,255,255,0.7)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)', padding: '8px 20px', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize', backdropFilter: 'blur(12px)', flexShrink: 0, cursor: 'pointer' }}>{sq}</button>
              ))}
            </div>

            {activeTab === 'heatmap' ? (
              <div className="grid gap-6">
                {sortedSessions.filter(sess => globalSquadFilter === 'All' || sess.name.toLowerCase().includes(globalSquadFilter.toLowerCase())).map(sess => {
                  const activeSwimmers = memberships.filter(m => m.session_id === sess.id || m.session_id === sess.scm_guid).length;
                  const lanes = sess.lanes_allocated || 6;
                  const maxCapacity = lanes * 8;

                  // Calculate Enrolled Roster Density
                  const rosterDensity = maxCapacity > 0 ? Math.round((activeSwimmers / maxCapacity) * 100) : 0;

                  // Calculate Actual Historical Utilization (Last 30 Days)
                  const sessionAtt = attendance.filter(a => a.session_id === sess.id || a.session_id === sess.scm_guid);
                  const dates = [...new Set(sessionAtt.map(a => a.date))];
                  let peakAtt = 0;
                  let totalAtt = 0;
                  dates.forEach(d => {
                    const count = sessionAtt.filter(a => a.date === d).length;
                    if (count > peakAtt) peakAtt = count;
                    totalAtt += count;
                  });
                  const avgAtt = dates.length > 0 ? Math.round(totalAtt / dates.length) : 0;
                  const actualDensity = maxCapacity > 0 ? Math.round((avgAtt / maxCapacity) * 100) : 0;

                  let statusColor = 'var(--accent-emerald)';
                  let statusText = 'OPTIMAL (ACTUAL)';
                  if (actualDensity > 100 || rosterDensity > 100) { statusColor = 'var(--accent-rose)'; statusText = 'OVER CAPACITY'; }
                  else if (actualDensity >= 85 || rosterDensity >= 85) { statusColor = 'var(--accent-amber)'; statusText = 'NEAR CAPACITY'; }

                  return (
                    <div key={sess.id} className="glass-card flex items-center justify-between" style={{ borderLeft: `4px solid ${statusColor}`, padding: '1.5rem 2rem' }}>
                      <div style={{ flex: 1 }}>
                        <div className="text-xs font-bold uppercase tracking-widest text-white/50 mb-1">{sess.day_of_week} • {sess.start_time} - {sess.end_time}</div>
                        <h3 className="text-xl font-black uppercase">{sess.name}</h3>
                      </div>

                      <div className="flex items-center gap-12">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-bold uppercase text-white/50 mb-2">Lanes Allocated</span>
                          <select
                            value={lanes}
                            onChange={(e) => updateLanes(sess.id, parseInt(e.target.value))}
                            disabled={updating === sess.id}
                            className="border border-white/10 rounded-lg px-4 py-2 text-white font-bold outline-none focus:border-cyan-400"
                            style={{ background: '#0f172a', color: '#fff' }}
                          >
                            {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                              <option key={num} value={num} style={{ background: '#0f172a', color: '#fff' }}>{num} Lanes</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-bold uppercase text-white/50 mb-2">Roster / Max</span>
                          <div className="text-2xl font-black text-white/80">{activeSwimmers} <span className="text-white/30 text-lg">/ {maxCapacity}</span></div>
                        </div>

                        <div
                          className="flex flex-col items-center cursor-pointer hover-glow transition-all"
                          onClick={() => setGraphSession({ sess, sessionAtt, maxCapacity })}
                          style={{ background: 'rgba(6, 182, 212, 0.05)', padding: '8px 16px', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.1)' }}
                          title="Click to view week-by-week attendance graph"
                        >
                          <span className="text-[10px] font-bold uppercase text-cyan-400/80 mb-2 flex items-center gap-1">📊 Avg (Peak)</span>
                          <div className="text-2xl font-black text-cyan-400">{avgAtt} <span className="text-cyan-400/50 text-lg">({peakAtt})</span></div>
                        </div>

                        <div className="flex flex-col items-end min-w-[150px]">
                          <span className="text-[10px] font-bold uppercase mb-2" style={{ color: statusColor }}>{statusText}</span>
                          <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden flex relative">
                            <div className="h-full rounded-full transition-all duration-500 z-10" style={{ width: `${Math.min(actualDensity, 100)}%`, backgroundColor: statusColor }} />
                            <div className="h-full rounded-full transition-all duration-500 absolute top-0 left-0 bg-white/10" style={{ width: `${Math.min(rosterDensity, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-bold mt-2 text-white/50">Roster {rosterDensity}% • <span className="text-white">Actual {actualDensity}%</span></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : activeTab === 'deficits' ? (
              <div className="grid gap-4">
                {swimmers.filter(s => s.squads?.target_hours_per_week > 0 && (globalSquadFilter === 'All' || s.squads?.name === globalSquadFilter)).map(swimmer => {
                  const target = swimmer.squads.target_hours_per_week;
                  const myMemberships = memberships.filter(m => m.swimmer_id === swimmer.id);

                  const myHours = myMemberships.reduce((total, m) => {
                    const s = sessions.find(sess => sess.id === m.session_id || sess.scm_guid === m.session_id);
                    return total + (s ? getSessionDuration(s) : 0);
                  }, 0);

                  const deficit = target - myHours;
                  if (deficit <= 0) return null;

                  const squadName = swimmer.squads?.name || '';
                  const squadKey = squadName.split(' ')[0].toLowerCase();

                  const availableSessions = sortedSessions.filter(sess => {
                    if (!sess.name.toLowerCase().includes(squadKey)) return false;
                    if (myMemberships.some(m => m.session_id === sess.id || m.session_id === sess.scm_guid)) return false;
                    const active = memberships.filter(m => m.session_id === sess.id || m.session_id === sess.scm_guid).length;
                    const maxCap = (sess.lanes_allocated || 6) * 8;
                    return (maxCap - active) > 0;
                  });

                  return (
                    <div key={swimmer.id} className="glass-card" style={{ borderLeft: '4px solid var(--accent-rose)', padding: '1.5rem' }}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-widest text-white/50 mb-1">{squadName}</div>
                          <h3 className="text-xl font-black">{swimmer.full_name}</h3>
                          <div className="text-rose-400 font-bold mt-2 flex items-center gap-2">
                            <span>⚠️ {deficit} Hour Deficit</span>
                            <span className="text-white/40 text-xs">({myHours}h Roster / {target}h Target)</span>
                          </div>
                        </div>

                        <div className="bg-black/20 rounded-xl p-4 border border-white/5 min-w-[300px]">
                          <div className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Available Sessions ({availableSessions.length})</div>
                          {availableSessions.length === 0 ? (
                            <div className="text-amber-400 text-sm font-bold">No squad sessions have physical lane space available.</div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {availableSessions.map(s => {
                                const active = memberships.filter(m => m.session_id === s.id || m.session_id === s.scm_guid).length;
                                const spaces = ((s.lanes_allocated || 6) * 8) - active;
                                return (
                                  <div key={s.id} className="flex justify-between items-center text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                    <div>
                                      <span className="font-bold text-cyan-400 mr-2">{s.day_of_week}</span>
                                      <span className="text-white/70">{s.start_time}</span>
                                    </div>
                                    <span className="text-emerald-400 font-bold text-xs">{spaces} Spaces</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : activeTab === 'modeler' ? (
              <div className="grid gap-6 animate-fade-in">
                <div className="glass-card mb-16" style={{ padding: '2.5rem', borderTop: '4px solid var(--accent-teal)' }}>
                  <div className="section-title">Micro-Capacity Modeler</div>
                  <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '1.5rem', maxWidth: '48rem' }}>
                    Add swimmers to a squad to see exactly which existing sessions they would be routed into to hit their minimum hours. The engine packs simulated swimmers into open lane spaces (max 8 per lane) without requiring new pool time, showing the precise impact on your session density.
                  </p>
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '2rem 0' }} />

                  {(() => {
                    let simulatedPlacements = [];
                    let systemWarnings = [];

                    // 1. Calculate Squad Yield Coefficients (Oversubscription Math)
                    const squadYields = {};
                    squadsList.forEach(squadName => {
                      const squadSwimmers = swimmers.filter(s => s.squads?.name === squadName);
                      const rosterSize = squadSwimmers.length;
                      if (rosterSize === 0) { squadYields[squadName] = 1; return; }

                      const squadKey = squadName.toLowerCase();
                      const squadSessions = sortedSessions.filter(sess => sess.name.toLowerCase().includes(squadKey));

                      let totalAtt = 0;
                      let totalPossible = 0;

                      squadSessions.forEach(sess => {
                        const sessionAtt = attendance.filter(a => a.session_id === sess.id || a.session_id === sess.scm_guid);
                        const dates = [...new Set(sessionAtt.map(a => a.date))];
                        dates.forEach(d => {
                          totalAtt += sessionAtt.filter(a => a.date === d).length;
                          totalPossible += rosterSize;
                        });
                      });

                      const yieldCoeff = totalPossible > 0 ? (totalAtt / totalPossible) : 1;
                      squadYields[squadName] = Math.max(0.5, Math.min(1, yieldCoeff));
                    });

                    // 2. Map True Physical Capacities (Using Historical Session Yield)
                    let sessionSimCapacities = sortedSessions.map(sess => {
                      const activeRoster = memberships.filter(m => m.session_id === sess.id || m.session_id === sess.scm_guid).length;
                      const physicalCap = (sess.lanes_allocated || 6) * 8;

                      const sessionAtt = attendance.filter(a => a.session_id === sess.id || a.session_id === sess.scm_guid);
                      const dates = [...new Set(sessionAtt.map(a => a.date))];
                      let totalAtt = 0;
                      dates.forEach(d => { totalAtt += sessionAtt.filter(a => a.date === d).length; });

                      const avgOccupied = dates.length > 0 ? (totalAtt / dates.length) : activeRoster;

                      return {
                        ...sess,
                        currentRoster: activeRoster,
                        simRoster: activeRoster,
                        physicalCap,
                        openPhysicalSpaces: Math.max(0, physicalCap - avgOccupied),
                        duration: getSessionDuration(sess)
                      };
                    });

                    // 2.5 PRE-SIMULATION: Calculate Maximum Safe Oversubscription per Squad
                    const maxSafeAdditions = {};
                    squadsList.forEach(squadName => {
                      const targetHours = swimmers.find(s => s.squads?.name === squadName)?.squads?.target_hours_per_week || 0;
                      if (targetHours === 0) { maxSafeAdditions[squadName] = 0; return; }

                      const squadKey = squadName.toLowerCase();
                      const yieldCoeff = squadYields[squadName] || 1;
                      const isSharedSquad = squadKey.includes('bronze') || squadKey.includes('silver');

                      let testSessions = sessionSimCapacities.map(sess => ({ ...sess }));
                      let testSquadSessions = testSessions.filter(sess => {
                        const sName = sess.name.toLowerCase();
                        if (isSharedSquad) return sName.includes('bronze') || sName.includes('silver');
                        return sName.includes(squadKey);
                      });

                      let possibleAdditions = 0;
                      let canPack = true;

                      while (canPack && possibleAdditions < 200) {
                        let hoursAssigned = 0;
                        testSquadSessions.sort((a, b) => b.openPhysicalSpaces - a.openPhysicalSpaces);

                        for (let j = 0; j < testSquadSessions.length; j++) {
                          if (hoursAssigned >= targetHours) break;

                          const sess = testSquadSessions[j];
                          const maxAllowedRoster = sess.physicalCap * 1.75;

                          if (sess.openPhysicalSpaces >= yieldCoeff && (sess.simRoster + 1) <= maxAllowedRoster) {
                            hoursAssigned += sess.duration;
                            sess.openPhysicalSpaces -= yieldCoeff;
                            sess.simRoster += 1;
                          }
                        }

                        if (hoursAssigned >= targetHours) possibleAdditions++;
                        else canPack = false;
                      }
                      maxSafeAdditions[squadName] = possibleAdditions;
                    });

                    squadsList.forEach(squadName => {
                      const adjustment = simAdjustments[squadName] || 0;
                      if (adjustment <= 0) return;

                      const targetHours = swimmers.find(s => s.squads?.name === squadName)?.squads?.target_hours_per_week || 0;
                      const squadKey = squadName.toLowerCase();
                      const yieldCoeff = squadYields[squadName] || 1;

                      // 3. Enforce Strict Lane Isolation Rules
                      const isSharedSquad = squadKey.includes('bronze') || squadKey.includes('silver');

                      let squadSessions = sessionSimCapacities.filter(sess => {
                        const sName = sess.name.toLowerCase();
                        if (isSharedSquad) return sName.includes('bronze') || sName.includes('silver');
                        return sName.includes(squadKey);
                      });

                      // 4. Pack Swimmers using Fractional Yield Math with 175% Hard Limit
                      for (let i = 0; i < adjustment; i++) {
                        let hoursAssigned = 0;
                        let assignments = [];

                        squadSessions.sort((a, b) => b.openPhysicalSpaces - a.openPhysicalSpaces);

                        for (let j = 0; j < squadSessions.length; j++) {
                          if (hoursAssigned >= targetHours) break;

                          const maxAllowedRoster = squadSessions[j].physicalCap * 1.75;

                          if (squadSessions[j].openPhysicalSpaces >= yieldCoeff && (squadSessions[j].simRoster + 1) <= maxAllowedRoster) {
                            hoursAssigned += squadSessions[j].duration;
                            squadSessions[j].openPhysicalSpaces -= yieldCoeff;
                            squadSessions[j].simRoster += 1;

                            assignments.push({
                              sess: squadSessions[j],
                              newSimRoster: squadSessions[j].simRoster,
                              physicalCap: squadSessions[j].physicalCap
                            });
                          }
                        }

                        simulatedPlacements.push({
                          squad: squadName,
                          swimmerNum: i + 1,
                          targetHours,
                          hoursAssigned,
                          assignments,
                          yieldCoeff
                        });

                        if (hoursAssigned < targetHours) {
                          systemWarnings.push(`Swimmer #${i + 1} (${squadName}): Could only find ${hoursAssigned}h of open space (Limit hit: Physical capacity or 75% max oversubscription limit).`);
                        }
                      }
                    });

                    return (
                      <div className="grid lg:grid-cols-12 gap-10 mt-4">

                        {/* LEFT: ROSTER CONTROLS — hidden on print */}
                        <div className="lg:col-span-5 xl:col-span-4 grid gap-4 h-fit sticky top-6 no-print" style={{ alignSelf: 'start' }}>
                          <h3 className="text-sm font-bold tracking-widest text-teal-400 uppercase mb-2">1. Add Simulated Swimmers</h3>

                          {squadsList.filter(squadName => globalSquadFilter === 'All' || squadName === globalSquadFilter).map(squadName => {
                            const targetHours = swimmers.find(s => s.squads?.name === squadName)?.squads?.target_hours_per_week || 0;
                            if (targetHours === 0) return null;

                            const adjustment = simAdjustments[squadName] || 0;
                            const yieldPct = Math.round((squadYields[squadName] || 1) * 100);
                            const safeAdditions = maxSafeAdditions[squadName];

                            return (
                              <div key={squadName} className="bg-black/20 rounded-xl p-4 border border-white/5 flex items-center justify-between transition-all hover:border-white/10">
                                <div>
                                  <h3 className="font-black uppercase text-sm">{squadName}</h3>
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                    <div style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: '8px', padding: '5px 10px', textAlign: 'center', minWidth: '58px', flex: '0 0 auto' }}>
                                      <div className="kpi-value" style={{ fontSize: '0.9rem', color: 'var(--accent-cyan)', fontWeight: 900, lineHeight: 1.2 }}>{targetHours}h</div>
                                      <div className="kpi-label" style={{ fontSize: '0.5rem', opacity: 0.7, marginTop: '2px' }}>Per Week</div>
                                    </div>
                                    <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '8px', padding: '5px 10px', textAlign: 'center', minWidth: '58px', flex: '0 0 auto' }}>
                                      <div className="kpi-value" style={{ fontSize: '0.9rem', color: 'var(--accent-amber)', fontWeight: 900, lineHeight: 1.2 }}>{yieldPct}%</div>
                                      <div className="kpi-label" style={{ fontSize: '0.5rem', opacity: 0.7, marginTop: '2px' }}>Yield</div>
                                    </div>
                                    <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '8px', padding: '5px 10px', textAlign: 'center', minWidth: '58px', flex: '0 0 auto' }}>
                                      <div className="kpi-value" style={{ fontSize: '0.9rem', color: 'var(--accent-emerald)', fontWeight: 900, lineHeight: 1.2 }}>+{safeAdditions}</div>
                                      <div className="kpi-label" style={{ fontSize: '0.5rem', opacity: 0.7, marginTop: '2px' }}>Safe Add</div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2 border border-white/10">
                                  <button
                                    onClick={() => setSimAdjustments(prev => ({ ...prev, [squadName]: Math.max(0, (prev[squadName] || 0) - 1) }))}
                                    className="w-7 h-7 flex items-center justify-center rounded bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 transition-all font-bold text-sm"
                                  >−</button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={adjustment}
                                    onChange={e => setSimAdjustments(prev => ({ ...prev, [squadName]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                    className="w-12 text-center font-black outline-none appearance-none"
                                    style={{ color: '#2dd4bf', backgroundColor: 'transparent', MozAppearance: 'textfield' }}
                                  />
                                  <button
                                    onClick={() => setSimAdjustments(prev => ({ ...prev, [squadName]: (prev[squadName] || 0) + 1 }))}
                                    className="w-7 h-7 flex items-center justify-center rounded bg-white/5 hover:bg-teal-500/20 hover:text-teal-400 transition-all font-bold text-sm"
                                  >+</button>
                                </div>
                              </div>
                            );
                          })}

                          {/* CoachesEye Guide */}
                          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 mt-2">
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>📘 CoachesEye — Yield Management Guide</div>
                            <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '0.5rem' }}><span style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>Yield coefficient</span> = historical show-up rate per squad (capped 50–100%). A 70% yield means only ~70 of every 100 enrolled swimmers physically attend on any given session.</p>
                            <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '0.5rem' }}><span style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>Oversubscription</span> allows enrolling more athletes than physical lane slots, because not all attend simultaneously. Each simulated swimmer consumes fractional space equal to their yield coefficient.</p>
                            <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}><span style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>175% hard cap</span>: roster cannot exceed 1.75× physical capacity. <span className="text-emerald-400 font-bold">Green</span> = under 100%. <span className="text-amber-400 font-bold">Amber</span> = over 100%. <span className="text-rose-400 font-bold">Red</span> = over 175% (blocked).</p>
                          </div>
                        </div>

                        {/* RIGHT: RESULTS */}
                        <div className="lg:col-span-7 xl:col-span-8">
                          <style>{`
                            @media print {
                              @page { margin: 10mm; }
                              body, html, main, .container { max-width: 100% !important; width: 100% !important; padding: 0 !important; margin: 0 !important; }
                              .grid.lg\\:grid-cols-12 { display: block !important; }
                              .lg\\:col-span-7, .xl\\:col-span-8 { width: 100% !important; max-width: 100% !important; }
                            }
                          `}</style>
                          <div className="flex items-center justify-between mb-4" style={{ marginTop: '3rem' }}>
                            <h3 className="text-sm font-bold tracking-widest text-teal-400 uppercase">2. Simulated Routing Impact</h3>
                            {simulatedPlacements.length > 0 && (
                              <button
                                onClick={handleCapacityExport}
                                disabled={isExporting}
                                className="btn-premium-intel no-print"
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', marginLeft: 'auto', marginBottom: '1rem', opacity: isExporting ? 0.7 : 1 }}
                              >
                                {isExporting ? (
                                  <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span> GENERATING PDF...</>
                                ) : (
                                  <><span>📄</span> EXPORT COMMITTEE PDF</>
                                )}
                              </button>
                            )}
                          </div>

                          {simulatedPlacements.length === 0 ? (
                            <div className="text-white/40 text-sm border border-white/5 p-6 rounded-xl text-center border-dashed">
                              No swimmers added.<br/>Use the controls to simulate new athletes.
                            </div>
                          ) : (
                            <div className="grid gap-6">
                              {systemWarnings.length > 0 && (
                                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                                  <div className="text-rose-400 font-bold text-xs uppercase tracking-widest mb-2">⚠️ Bottleneck Detected</div>
                                  <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '0', listStyle: 'none' }}>
                                    {systemWarnings.map((warn, i) => <li key={i} style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}>{warn}</li>)}
                                  </ul>
                                </div>
                              )}

                              {/* COMMITTEE AGGREGATE TIMETABLE REPORT */}
                              {(() => {
                                const impactedSessions = sessionSimCapacities.filter(s => s.simRoster > s.currentRoster);
                                if (impactedSessions.length === 0) return null;
                                return (
                                  <div className="bg-slate-900/80 border border-white/10 rounded-xl p-8 print:bg-white print:border-gray-200 print:text-black">
                                    <div className="border-b border-white/10 print:border-gray-300 pb-6 mb-6">
                                      <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem', marginTop: '3rem' }}>Committee Proposal: Capacity Expansion</h3>

                                      {/* YIELD MANAGEMENT EXPLANATION */}
                                      <div className="bg-teal-500/10 print:bg-gray-50 border border-teal-500/20 print:border-gray-300 rounded-lg p-6 mt-6 mb-8">
                                        <h5 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '1rem' }}>
                                          👁️ Methodology: Yield Management &amp; Oversubscription
                                        </h5>
                                        <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '1rem' }}>
                                          This proposal utilises <strong style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>Yield Management</strong>. Based on historical attendance data, a percentage of rostered athletes are absent from any given session (due to illness, school commitments, or fatigue).
                                        </p>
                                        <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '1.25rem' }}>
                                          By decoupling Roster Limits from Physical Lane Limits, we can safely oversubscribe squads. The projections below demonstrate that even with waitlisted athletes added, the <em>actual physical density</em> of the water remains within strict safety parameters.
                                        </p>
                                        <div className="bg-black/20 print:bg-white p-4 rounded-lg border border-white/5 print:border-gray-200">
                                          <h6 className="text-teal-400 print:text-gray-800 font-bold text-[11px] uppercase tracking-widest mb-3">Data Context &amp; Safety Parameters</h6>
                                          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '0', listStyle: 'none' }}>
                                            <li style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}><strong style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>Time Period:</strong> Yield coefficients are dynamically calculated using a trailing {periodDays}-day historical attendance analysis. This ensures we accurately capture seasonal illness spikes, school exam periods, and fatigue cycles rather than just peak periods.</li>
                                            <li style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}><strong style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>Hard Safety Cap:</strong> A strict 175% roster oversubscription ceiling is enforced. The engine mathematically blocks any waitlist additions that would push theoretical maximums beyond this physical pool limit.</li>
                                            <li style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}><strong style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>Dynamic Packing:</strong> Simulated athletes are routed mathematically into the timetable to fill fractional "empty water", allowing us to clear the waitlist without requiring additional pool hire or lane space.</li>
                                          </ul>
                                        </div>
                                      </div>
                                    </div>

                                    {/* SQUAD IMPACT SUMMARY */}
                                    <div className="mb-10">
                                      <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem', marginTop: '3rem' }}>Squad Size Projections</h3>
                                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                        {Object.entries(simAdjustments).filter(([sq, val]) => val > 0 && (globalSquadFilter === 'All' || sq === globalSquadFilter)).map(([squadName, added], idx) => {
                                          const currentSize = swimmers.filter(s => s.squads?.name === squadName).length;
                                          return (
                                            <div key={idx} className="bg-black/20 print:bg-gray-50 p-5 rounded-lg border border-white/5 print:border-gray-200">
                                              <div className="text-teal-400 print:text-gray-500 font-bold text-xs uppercase tracking-widest mb-3">{squadName}</div>
                                              <div className="flex items-center gap-4">
                                                <span className="text-2xl font-bold text-white/70 print:text-gray-600">{currentSize}</span>
                                                <span className="text-white/20 print:text-gray-400 text-xl">→</span>
                                                <span className="text-3xl font-black text-emerald-400 print:text-emerald-600">{currentSize + added}</span>
                                              </div>
                                              <div className="text-[11px] text-emerald-400/70 print:text-emerald-600/80 uppercase tracking-widest mt-2 font-bold">
                                                Waitlist Cleared: +{added}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="grid gap-4 mt-4">
                                      <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem', marginTop: '3rem' }}>Impacted Session Details</h3>
                                      {/* TABLE HEADERS */}
                                      <div className="flex justify-between items-center px-4 pb-2 border-b border-white/10 print:border-gray-300 text-xs font-bold text-white/50 print:text-gray-500 uppercase tracking-widest">
                                        <div>Session Timeline</div>
                                        <div className="flex gap-8 text-right">
                                          <div className="w-28">Current State</div>
                                          <div className="w-4"></div>
                                          <div className="w-28 text-teal-400 print:text-black">Projected Yield</div>
                                        </div>
                                      </div>

                                      {/* BEFORE & AFTER ROWS */}
                                      {impactedSessions.filter(s => globalSquadFilter === 'All' || s.name.toLowerCase().includes(globalSquadFilter.toLowerCase())).map((s, idx) => {
                                        // 1. Calculate the expected physical yield for this specific session
                                        let sessionYield = 1;
                                        squadsList.forEach(sq => {
                                          if (s.name.toLowerCase().includes(sq.toLowerCase())) {
                                            sessionYield = squadYields[sq] || 1;
                                          }
                                        });

                                        const added = s.simRoster - s.currentRoster;

                                        // 2. Roster Numbers (What's on paper)
                                        const currentRosterDensity = Math.round((s.currentRoster / s.physicalCap) * 100);
                                        const newRosterDensity = Math.round((s.simRoster / s.physicalCap) * 100);

                                        // 3. Yield Numbers (What's actually in the water)
                                        const expectedCurrentBodies = Math.round(s.currentRoster * sessionYield);
                                        const expectedSimBodies = Math.round(s.simRoster * sessionYield);
                                        const currentPhysicalDensity = Math.round((expectedCurrentBodies / s.physicalCap) * 100);
                                        const expectedPhysicalDensity = Math.round((expectedSimBodies / s.physicalCap) * 100);

                                        return (
                                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '8px' }}>
                                            <div style={{ width: '33%' }}>
                                              <div style={{ color: 'var(--accent-teal)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{s.day_of_week} • {s.start_time}</div>
                                              <div style={{ opacity: 1, fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.4, color: 'var(--text-primary)' }}>{s.name}</div>
                                              <div style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginTop: '6px' }}>Waitlist Cleared: <span style={{ opacity: 1, fontWeight: 600, color: 'var(--accent-emerald)' }}>+{added} Swimmer{added !== 1 ? 's' : ''}</span></div>
                                            </div>
                                            <div style={{ width: '66%', display: 'flex', gap: '24px', alignItems: 'center', justifyContent: 'flex-end' }}>

                                              {/* BEFORE STATS & GRAPHIC */}
                                              <div style={{ width: '190px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                                                  <div>
                                                    <div style={{ fontSize: '0.6rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-primary)' }}>Roster</div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.4 }}>{currentRosterDensity}% <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.8 }}>({s.currentRoster}/{s.physicalCap})</span></div>
                                                  </div>
                                                  <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-teal)', fontWeight: 600 }}>Actual</div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-teal)', lineHeight: 1.4 }}>{currentPhysicalDensity}% <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.8 }}>({expectedCurrentBodies}/{s.physicalCap})</span></div>
                                                  </div>
                                                </div>
                                                {/* Graphic Bar */}
                                                <div style={{ width: '100%', height: '12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '999px', position: 'relative', border: '1px solid rgba(255,255,255,0.1)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: '999px', width: `${Math.min(100, currentRosterDensity)}%`, backgroundColor: currentRosterDensity > 100 ? 'var(--accent-rose)' : 'rgba(255,255,255,0.2)' }}></div>
                                                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: '999px', width: `${Math.min(100, currentPhysicalDensity)}%`, backgroundColor: currentPhysicalDensity > 100 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}></div>
                                                  <div style={{ position: 'absolute', top: '-3px', bottom: '-3px', right: 0, width: '2px', backgroundColor: 'var(--accent-rose)' }} title="Physical Limit"></div>
                                                </div>
                                              </div>

                                              {/* ARROW */}
                                              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '18px', fontWeight: 900 }}>→</div>

                                              {/* AFTER STATS & GRAPHIC */}
                                              <div style={{ width: '190px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                                                  <div>
                                                    <div style={{ fontSize: '0.6rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-primary)' }}>Roster</div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.4, color: newRosterDensity > 100 ? 'var(--accent-rose)' : 'inherit' }}>{newRosterDensity}% <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.8 }}>({s.simRoster}/{s.physicalCap})</span></div>
                                                  </div>
                                                  <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-teal)', fontWeight: 600 }}>Actual</div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.4, color: expectedPhysicalDensity > 100 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>{expectedPhysicalDensity}% <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.8 }}>({expectedSimBodies}/{s.physicalCap})</span></div>
                                                  </div>
                                                </div>
                                                {/* Graphic Bar */}
                                                <div style={{ width: '100%', height: '12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '999px', position: 'relative', border: '1px solid rgba(255,255,255,0.1)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: '999px', width: `${Math.min(100, newRosterDensity)}%`, backgroundColor: newRosterDensity > 100 ? 'var(--accent-rose)' : 'rgba(255,255,255,0.2)' }}></div>
                                                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: '999px', width: `${Math.min(100, expectedPhysicalDensity)}%`, backgroundColor: expectedPhysicalDensity > 100 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}></div>
                                                  <div style={{ position: 'absolute', top: '-3px', bottom: '-3px', right: 0, width: '2px', backgroundColor: 'var(--accent-rose)' }} title="Physical Limit"></div>
                                                </div>
                                              </div>

                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* INDIVIDUAL ROUTING BREAKDOWN — hidden on print */}
                              <div className="no-print grid gap-4">
                                {simulatedPlacements.filter(sim => globalSquadFilter === 'All' || sim.squad === globalSquadFilter).map((sim, i) => (
                                  <div key={i} className="bg-teal-500/5 border border-teal-500/20 rounded-xl p-6">
                                    <div className="flex justify-between items-start mb-4">
                                      <div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent-teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{sim.squad} ({(sim.yieldCoeff * 100).toFixed(0)}% Yield)</div>
                                        <h4 className="text-xl font-black uppercase">Simulated Swimmer #{sim.swimmerNum}</h4>
                                      </div>
                                      <div className="text-right">
                                        <div style={{ fontSize: '0.6rem', opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', color: 'var(--text-primary)' }}>Assigned Hours</div>
                                        <div className={`text-lg font-black ${sim.hoursAssigned < sim.targetHours ? 'text-rose-400' : 'text-emerald-400'}`}>
                                          {sim.hoursAssigned}h <span style={{ fontSize: '0.85rem', opacity: 0.8, fontWeight: 500 }}>/ {sim.targetHours}h</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="bg-black/40 rounded-lg p-4 border border-white/5">
                                      <div style={{ fontSize: '0.6rem', opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Timetable Routing & Oversubscription Density</div>

                                      {sim.assignments.length === 0 && (
                                        <div style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, color: 'var(--accent-rose)' }}>No physical lane space exists under current isolation rules.</div>
                                      )}

                                      {sim.assignments.map((assignment, j) => {
                                        const s = assignment.sess;
                                        const newDensity = Math.round((assignment.newSimRoster / assignment.physicalCap) * 100);
                                        return (
                                          <div key={j} className="flex justify-between items-center border-b border-white/5 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                                            <div>
                                              <span style={{ color: 'var(--accent-teal)', fontWeight: 600, marginRight: '0.5rem' }}>{s.day_of_week}</span>
                                              <span style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                                              <span style={{ opacity: 0.5, marginLeft: '0.5rem', fontSize: '0.8rem' }}>({s.start_time})</span>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                              <span style={{ fontSize: '0.6rem', opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', color: 'var(--text-primary)' }}>Roster vs Physical Cap</span>
                                              <span className="font-black text-sm px-2 py-1 rounded border" style={{
                                                backgroundColor: newDensity > 175 ? 'rgba(244, 63, 94, 0.1)' : (newDensity > 100 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(16, 185, 129, 0.1)'),
                                                borderColor: newDensity > 175 ? 'rgba(244, 63, 94, 0.2)' : (newDensity > 100 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(16, 185, 129, 0.2)'),
                                                color: newDensity > 175 ? 'var(--accent-rose)' : (newDensity > 100 ? 'var(--accent-amber)' : 'var(--accent-emerald)')
                                              }}>
                                                {assignment.newSimRoster} / {assignment.physicalCap} <span className="opacity-50 text-xs">({newDensity}%)</span>
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>

                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : activeTab === 'ghosts' ? (
              <div className="glass-card animate-fade-in" style={{ padding: '2.5rem' }}>
                <div className="print-only" style={{ display: 'none', textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '2px solid #000' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '0.1em', margin: '0 0 8px 0' }}>COACHESEYE STRATEGIC INTELLIGENCE</h1>
                  <h2 style={{ fontSize: '16px', fontWeight: '600', opacity: 0.8, margin: 0 }}>Ghost Allocations & Capacity Reclamation Report</h2>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div className="section-title">Capacity Reclamation</div>
                    <h3 className="text-3xl font-black uppercase mb-2">Ghost Allocations <span style={{ color: 'var(--accent-rose)' }}>({ghostAllocations.length})</span></h3>
                    <p className="text-white/50 text-sm max-w-2xl" style={{ margin: 0 }}>
                      Swimmers with a formal session membership but <strong className="text-white">zero recorded swims</strong> in the selected period ({periodDays} days).
                      These allocations hold lane capacity without contributing to session utilisation.
                      Review for removal or follow-up.
                    </p>
                  </div>
                  {ghostAllocations.length > 0 && (
                    <button
                      onClick={handlePrintReport}
                      className="btn-premium-action mini no-print"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
                    >
                      <span>📄</span> Export PDF Report
                    </button>
                  )}
                </div>

                {waitlistYields.length > 0 && (
                  <div className="yield-matrix mb-8 no-print">
                    <div className="kpi-label-mini text-emerald-400 mb-2" style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#34d399', marginBottom: '0.5rem' }}>
                      💡 Waitlist Admission Yield
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {waitlistYields.map(y => (
                        <div key={y.squadName} style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.05) 100%)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '2rem', fontWeight: '900', color: '#34d399', lineHeight: '1' }}>+{y.yield}</div>
                          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, marginTop: '4px', color: '#fff' }}>{y.squadName} Slots</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ghostAllocations.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', gap: '1rem', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '16px' }}>
                    <div style={{ fontSize: '3rem' }}>✅</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--accent-emerald)' }}>All Clear — No Ghost Allocations</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                      Every scheduled allocation has at least one recorded swim in the last {periodDays} days.
                    </div>
                  </div>
                ) : (
                  <table className="stats-table-glass w-full" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Swimmer</th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Squad</th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Scheduled Session</th>
                        <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ghostAllocations.map((g, idx) => (
                        <tr key={`${g.swimmerId}-${g.sessionName}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '14px 16px', fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{g.swimmerName}</td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--accent-cyan)', borderRadius: '6px', padding: '3px 10px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {g.squadName}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'rgba(255,255,255,0.9)' }}>{g.sessionDay}</span>
                            {g.sessionTime && <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '6px' }}>{g.sessionTime}</span>}
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{g.sessionName}</div>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: '6px', padding: '4px 12px', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              👻 0 Recorded Swims
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
        {graphSession && (
          <div className="modal-overlay no-print" onClick={() => setGraphSession(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-card animate-scale-in" style={{ width: '100%', maxWidth: '700px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-xs font-bold text-cyan-400 tracking-widest uppercase mb-1">{graphSession.sess.day_of_week} • {graphSession.sess.start_time}</div>
                  <h2 className="text-2xl font-black uppercase text-white">{graphSession.sess.name}</h2>
                  <div className="text-sm text-white/50 mt-1">{periodDays}-Day Attendance Verification</div>
                </div>
                <button onClick={() => setGraphSession(null)} className="text-white/40 hover:text-white text-2xl font-bold">✕</button>
              </div>

              <div style={{ height: '300px', width: '100%', marginTop: '2rem' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...new Set(graphSession.sessionAtt.map(a => a.date))].sort().map(d => ({
                      date: new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                      count: graphSession.sessionAtt.filter(a => a.date === d).length
                    }))}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} domain={[0, graphSession.maxCapacity > 0 ? Math.max(graphSession.maxCapacity, 10) : 'auto']} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(0, 212, 255, 0.3)', borderRadius: '12px', color: '#fff', fontWeight: 'bold' }} />
                    <Bar dataKey="count" fill="var(--accent-cyan)" radius={[1]} name="Swimmers Present" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
    </Layout>
  );
}
