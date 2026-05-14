import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import Layout from '../../components/Layout';
import PremiumOrb from '../../components/PremiumOrb';
import TalentIntelligenceCard from '../../components/TalentIntelligenceCard';
import { calculateReliability, calculateSquadHealth, generateSquadNarrative } from '../../lib/analytics-utils';
import { getKentBenchmark } from '../../lib/qualifying-times';
import { 
  ResponsiveContainer, 
  AreaChart,
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine,
  Bar,
  BarChart,
  Cell,
  ReferenceArea,
  Legend
} from 'recharts';

export async function getServerSideProps(context) {
  const { id } = context.params;
  const { data: squad } = await supabase.from('squads').select('*').eq('id', id).single();
  if (!squad) return { props: { error: 'Squad not found' } };

  const { data: swimmers } = await supabase.from('swimmers').select('*, squads(*)').eq('squad_id', id);

  const [sessions, exemptions, meets] = await Promise.all([
    supabase.from('sessions').select('*').limit(1000),
    supabase.from('club_exemptions').select('*'),
    supabase.from('meets').select('*'),
  ]);

  return { 
    props: { 
      id,
      initialSwimmers: swimmers || [],
      initialSquad: squad || null,
      initialSessions: sessions.data || [],
      initialExemptions: exemptions.data || [],
      initialMeets: meets.data || [],
      initialAttendance: [],
      initialResults: []
    } 
  };
}

export default function SquadDetail({ 
  session, 
  id: initialId,
  initialSquad, 
  initialSwimmers = [], 
  initialSessions = [],
  initialExemptions = [],
  initialMeets = [],
  initialAttendance = [],
  initialResults = [],
  error: initialError 
}) {
  const router = useRouter();
  const { id: queryId } = router.query;
  const id = queryId || initialId;
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [squad, setSquad] = useState(initialSquad);
  const [swimmers, setSwimmers] = useState(initialSwimmers);
  const [attendance, setAttendance] = useState(initialAttendance);
  const [sessions, setSessions] = useState(initialSessions);
  const [results, setResults] = useState(initialResults);
  const [exemptions, setExemptions] = useState(initialExemptions);
  const [periodDays, setPeriodDays] = useState(365);
  const [chartData, setChartData] = useState([]);
  const [ageData, setAgeData] = useState([]);
  const [shutdowns, setShutdowns] = useState([]);
  const [stats, setStats] = useState({});
  const [healthData, setHealthData] = useState(null);
  const [narrative, setNarrative] = useState([]);
  const [isRosterOnly, setIsRosterOnly] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'trainingPct', direction: 'desc' });
  const [error, setError] = useState(initialError);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.push('/login');
      return;
    }
    if (id && router.isReady) {
      fetchSquadData();
    }
  }, [session, router, id, router.isReady, router.query.period]);

  useEffect(() => {
    if (router.query.rosterOnly === 'true') {
      setIsRosterOnly(true);
    }
  }, [router.query.rosterOnly]);

  const fetchAll = async (table, select = '*', filter = null) => {
    let allData = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      let q = supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error) throw error;
      allData = [...allData, ...data];
      if (data.length < 1000) hasMore = false;
      else page++;
      if (page > 100) break; 
    }
    return allData;
  };

  const fetchSquadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const period = parseInt(router.query.period) || 365;
      setPeriodDays(period);
      const START = new Date(new Date() - period * 86400000);
      const startStr = START.toISOString().split('T')[0];

      const [squadRes, swimmersRes, sessionsRes, exemptionsRes, meetsRes] = await Promise.all([
        initialSquad ? Promise.resolve({ data: initialSquad }) : supabase.from('squads').select('*').eq('id', id).single(),
        initialSwimmers.length > 0 ? Promise.resolve({ data: initialSwimmers }) : supabase.from('swimmers').select('*, squads(*)').eq('squad_id', id),
        initialSessions.length > 0 ? Promise.resolve({ data: initialSessions }) : fetchAll('sessions', '*').then(data => ({ data })),
        initialExemptions.length > 0 ? Promise.resolve({ data: initialExemptions }) : supabase.from('club_exemptions').select('*'),
        initialMeets.length > 0 ? Promise.resolve({ data: initialMeets }) : fetchAll('meets', '*').then(data => ({ data }))
      ]);
      
      const squadData = squadRes.data;
      if (!squadData) throw new Error('Squad not found');
      
      const rawSwimmers = swimmersRes.data || [];
      const sessionsData = sessionsRes.data || [];
      const exemptionsData = exemptionsRes.data || [];
      const meetsData = meetsRes.data || [];
      
      const swimmerIds = rawSwimmers.map(s => s.id);
      
      const [attRes, resRes, memRes, allSwimmers, allResults] = await Promise.all([
        fetchAll('training_attendance', '*', q => q.in('swimmer_id', swimmerIds)),
        fetchAll('results', '*, meets(*)', q => q.in('swimmer_id', swimmerIds)),
        fetch('/api/memberships').then(r => r.json()),
        fetchAll('swimmers', '*'),
        fetchAll('results', '*', q => q.gte('date', startStr))
      ]);

      // Robust Deduplication to prevent double-counting
      const uniqueAttMap = new Map();
      (attRes || []).forEach(a => uniqueAttMap.set(a.id, a));
      const rawAttendance = Array.from(uniqueAttMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

      const uniqueResMap = new Map();
      (resRes || []).forEach(r => uniqueResMap.set(r.id, r));
      const rawResults = Array.from(uniqueResMap.values());
      
      const memberships = memRes || [];
      
      setAttendance(rawAttendance);
      setResults(rawResults);

      const attendanceBySwimmer = {};
      rawAttendance.forEach(att => {
        if (!attendanceBySwimmer[att.swimmer_id]) attendanceBySwimmer[att.swimmer_id] = [];
        attendanceBySwimmer[att.swimmer_id].push(att);
      });
      
      const resultsBySwimmer = {};
      rawResults.forEach(res => {
        if (!resultsBySwimmer[res.swimmer_id]) resultsBySwimmer[res.swimmer_id] = [];
        resultsBySwimmer[res.swimmer_id].push(res);
      });

      const squadSwimmers = rawSwimmers.filter(s => s.is_active !== false && !s.is_exempt);
      const squadResults = (rawResults || []).filter(r => r.date >= startStr);

      const dateMap = {};
      squadResults.forEach(r => {
        if (!dateMap[r.date]) dateMap[r.date] = { date: r.date, points: [] };
        dateMap[r.date].points.push(Number(r.wa_pts || 0));
      });

      let processedChart = Object.values(dateMap).sort((a,b) => a.date.localeCompare(b.date)).map(d => ({
        date: new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        avgWA: Math.round(d.points.reduce((a,b) => a+b, 0) / (d.points.length || 1))
      }));

      if (processedChart.length > 1) {
        const n = processedChart.length;
        let sx = 0, sy = 0, sxy = 0, sx2 = 0;
        processedChart.forEach((d, i) => { sx += i; sy += d.avgWA; sxy += i * d.avgWA; sx2 += i * i; });
        const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
        const intercept = (sy - slope * sx) / n;
        processedChart = processedChart.map((d, i) => ({ ...d, trend: Math.round(slope * i + intercept) }));
      }

      // Process shutdowns for ReferenceArea
      const shutdowns = (exemptionsData || [])
        .filter(ex => !ex.squad_id || ex.squad_id === id)
        .map(ex => {
          const start = new Date(ex.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          const end = new Date(ex.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          return { start, end, name: ex.name, type: ex.type };
        });
      
      setShutdowns(shutdowns);

      const avgAge = Math.round(squadSwimmers.reduce((acc, s) => {
          let calcAge;
          if (s.date_of_birth) {
            const dob = new Date(s.date_of_birth);
            calcAge = now.getFullYear() - dob.getFullYear();
            const mDiff = now.getMonth() - dob.getMonth();
            if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) calcAge--;
          } else if (s.year_of_birth) {
            calcAge = now.getFullYear() - s.year_of_birth;
          } else {
            calcAge = 13; // Fallback
          }
          return acc + calcAge;
      }, 0) / (squadSwimmers.length || 1));

      const halfPeriod = Math.floor(period / 2);
      const velRecentStart = new Date(now - halfPeriod * 86400000);
      const velPriorStart  = new Date(now - period * 86400000);
      const avgPts = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      const swimmerStats = rawSwimmers.filter(s => s.is_active !== false).map(s => {
        const swAtt = attendanceBySwimmer[s.id] || [];
        const swRes = resultsBySwimmer[s.id] || [];
        const swMemberships = (memberships || []).filter(m => m.swimmer_id === s.id);
        const rel = calculateReliability(s, swAtt, sessionsData, swRes, period, exemptionsData, swMemberships);
        
        return {
          ...s,
          velocity: Math.round(avgPts(swRes.filter(r => new Date(r.date) >= velRecentStart).map(r => r.wa_pts || 0)) - avgPts(swRes.filter(r => new Date(r.date) >= velPriorStart && new Date(r.date) < velRecentStart).map(r => r.wa_pts || 0))),
          peakWA: swRes.filter(r => new Date(r.date) >= velPriorStart).length ? Math.max(...swRes.filter(r => new Date(r.date) >= velPriorStart).map(r => r.wa_pts || 0)) : 0,
          totalPoints: swRes.reduce((a, r) => a + (r.wa_pts || 0), 0),
          meetCount: rel.meetsAttended,
          targetMeets: rel.targetMeets,
          resultsCount: swRes.length,
          totalRaces: swRes.length,
          trainingPct: rel.percentage,
          volumePct: rel.volumePct,
          totalHours: Math.round(rel.totalHours),
          isMet: rel.complianceRate >= 100 && (rel.percentage >= (squadData.target_training_percent || 75) || rel.volumePct >= (squadData.target_training_percent || 75))
        };
      });

      const strokeMap = {};
      squadResults.forEach(r => {
        let stroke = 'Other';
        const evt = r.event?.toLowerCase() || '';
        if (evt.includes('fly')) stroke = 'Butterfly';
        else if (evt.includes('back')) stroke = 'Backstroke';
        else if (evt.includes('breast')) stroke = 'Breaststroke';
        else if (evt.includes('free')) stroke = 'Freestyle';
        else if (evt.includes('medley') || evt.includes('im')) stroke = 'Individual Medley';
        if (!strokeMap[stroke]) strokeMap[stroke] = { pts: [], count: 0 };
        if (r.wa_pts) {
          strokeMap[stroke].pts.push(r.wa_pts);
          strokeMap[stroke].count++;
        }
      });
      const strokeData = {};
      Object.entries(strokeMap).forEach(([k, v]) => {
        strokeData[k] = { avg: v.pts.reduce((a,b)=>a+b,0) / (v.count || 1), peak: v.pts.length ? Math.max(...v.pts) : 0, count: v.count };
      });

      const activeNonExempt = swimmerStats.filter(s => !s.is_exempt);

      const statsObj = {
        athletes: squadSwimmers.length,
        avgVelocity: Math.round(activeNonExempt.reduce((a,b) => a+b.velocity, 0) / (activeNonExempt.length || 1)),
        peakStandard: Math.round(activeNonExempt.reduce((a,b) => a+b.peakWA, 0) / (activeNonExempt.length || 1)),
        totalPoints: activeNonExempt.reduce((a,b) => a+b.totalPoints, 0),
        avgConsistency: Math.round(activeNonExempt.reduce((a,b) => a+b.trainingPct, 0) / (activeNonExempt.length || 1)),
        avgVolume: Math.round(activeNonExempt.reduce((a,b) => a+b.volumePct, 0) / (activeNonExempt.length || 1)),
        complianceRate: Math.round((activeNonExempt.filter(s => s.isMet).length / (activeNonExempt.length || 1)) * 100),
        totalRaces: squadResults.length,
        targetMeets: squadData.target_meets,
        avgAge,
        gender: squadSwimmers[0]?.gender || 'M',
        strokeData
      };

      const healthObj = { ...statsObj, avgTraining: statsObj.avgConsistency };
      
      setSquad(squadData);
      setSwimmers(swimmerStats);
      setChartData(processedChart);
      const agePerformanceMap = {};
      allResults.forEach(r => {
        const s = allSwimmers.find(sw => sw.id === r.swimmer_id);
        if (!s || (!s.year_of_birth && !s.date_of_birth)) return;
        
        let calcAge;
        if (s.date_of_birth) {
          const dob = new Date(s.date_of_birth);
          calcAge = now.getFullYear() - dob.getFullYear();
          const mDiff = now.getMonth() - dob.getMonth();
          if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) calcAge--;
        } else {
          calcAge = now.getFullYear() - s.year_of_birth;
        }
        
        if (calcAge < 8 || calcAge > 22) return;
        if (!agePerformanceMap[calcAge]) agePerformanceMap[calcAge] = { age: calcAge, squadPts: [], clubPts: [] };
        
        if (r.wa_pts) {
          agePerformanceMap[calcAge].clubPts.push(Number(r.wa_pts));
          if (s.squad_id === id) agePerformanceMap[calcAge].squadPts.push(Number(r.wa_pts));
        }
      });

      const ageData = Object.keys(agePerformanceMap)
        .map(ageStr => Number(ageStr))
        .sort((a,b) => a - b)
        .map(ageNum => {
          const group = agePerformanceMap[ageNum];
          return {
            age: `${ageNum}yrs`,
            squad: group.squadPts.length ? Math.round(group.squadPts.reduce((a,b)=>a+b,0) / group.squadPts.length) : 0,
            club: group.clubPts.length ? Math.round(group.clubPts.reduce((a,b)=>a+b,0) / group.clubPts.length) : 0
          };
        });

      setAgeData(ageData);
      setStats(statsObj);
      setSessions(sessionsData);
      setExemptions(exemptionsData);
      
      try {
        setHealthData(calculateSquadHealth(healthObj, squadData));
        setNarrative(generateSquadNarrative(healthObj));
      } catch (e) {
        console.error("Health/Narrative calculation error:", e);
      }
    } catch (err) { 
      console.error(err); 
      setError(err.message);
    } finally { 
      setLoading(false); 
    }
  };

  const sortedSwimmers = useMemo(() => {
    if (!sortConfig) return swimmers;
    return [...swimmers].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'compliance') {
        aVal = (a.trainingPct + a.volumePct) / 2;
        bVal = (b.trainingPct + b.volumePct) / 2;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [swimmers, sortConfig]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const handleRosterExport = () => {
    setIsRosterOnly(true);
    setTimeout(() => {
      window.print();
      setIsRosterOnly(false);
    }, 500);
  };

  if (loading && !squad) return <Layout session={session}><div style={{ marginTop: 100, textAlign: 'center', opacity: 0.5 }}>Loading Squad Analytics...</div></Layout>;
  if (error) return <Layout session={session}><div style={{ marginTop: 100, textAlign: 'center', color: 'var(--accent-rose)' }}>Error loading squad: {error}</div></Layout>;
  if (!squad) return <Layout session={session}><div>Squad not found.</div></Layout>;

  return (
    <Layout session={session}>
      <Head>
        <title>{squad.name} | Squad Analytics</title>
        <style>{`
          @media print {
            @page { size: portrait; margin: 0 !important; }
            html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; background: #050b10 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .no-print, button, nav, .profile-header { display: none !important; }
            .roster-only-mode { padding: 0 !important; margin: 0 !important; }
            .roster-cover-page { display: flex !important; height: 100vh; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; break-after: page; background: #050b10; color: white !important; }
            .glass-card { border: 1px solid rgba(255,255,255,0.1) !important; background: rgba(10,10,20,0.8) !important; color: white !important; page-break-inside: avoid; }
            .stats-table-glass th { color: rgba(255,255,255,0.4) !important; }
            .stats-table-glass td { color: white !important; border-bottom: 1px solid rgba(255,255,255,0.05) !important; }
          }
        `}</style>
      </Head>

      <div className={`roster-only-mode ${isRosterOnly ? 'active' : ''}`}>
        {isRosterOnly ? (
           <div className="roster-only-mode">
             {/* PAGE 1: COVER PAGE */}
             <div className="roster-cover-page">
                <img src="/coacheseye-logo.png" alt="CoachesEye" style={{ height: '160px', marginBottom: '4rem' }} />
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.6em', marginBottom: '3rem', textTransform: 'uppercase' }}>Squad Audit Report</div>
                <h1 style={{ fontSize: '7rem', fontWeight: 900, margin: 0, lineHeight: 1, letterSpacing: '-0.04em', textTransform: 'uppercase' }}>{squad.name}</h1>
                <div style={{ height: '12px', width: '160px', background: 'var(--accent-cyan)', margin: '5rem 0' }}></div>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Performance Period: {periodDays} Days</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 500, opacity: 0.5, marginTop: '1.5rem' }}>Analytical Engine: CoachesEye DNA v2.0</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 500, opacity: 0.3, marginTop: '4rem' }}>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
             </div>

             {/* PAGE 2: SQUAD PERFORMANCE CRITERIA */}
             <div style={{ padding: '6rem 4rem', minHeight: '100vh', background: '#050b10', color: 'white', pageBreakBefore: 'always' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.4em', marginBottom: '2rem', textTransform: 'uppercase' }}>Section II: Performance Criteria</div>
                <h2 style={{ fontSize: '4rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', marginBottom: '4rem' }}>Squad Standards & Benchmarks</h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '3rem' }}>
                   <div style={{ padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>Training Consistency (Reliability)</div>
                      <div style={{ display: 'flex', gap: '2rem', alignItems: 'end', marginBottom: '1.5rem' }}>
                         <div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.2)' }}>{squad.target_training_percent || 75}%</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.3 }}>TARGET</div>
                         </div>
                         <div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: stats.avgConsistency >= (squad.target_training_percent || 75) ? '#10b981' : '#f43f5e' }}>{stats.avgConsistency}%</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.3 }}>ACTUAL SQUAD AVG</div>
                         </div>
                      </div>
                      <p style={{ fontSize: '1.1rem', opacity: 0.6, lineHeight: 1.6, margin: 0 }}>
                         Attendance baseline required for skill consolidation. The current squad average reflects the overall commitment to the training program.
                      </p>
                   </div>

                   <div style={{ padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>Session Intensity (Volume)</div>
                      <div style={{ display: 'flex', gap: '2rem', alignItems: 'end', marginBottom: '1.5rem' }}>
                         <div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.2)' }}>100%</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.3 }}>TARGET</div>
                         </div>
                         <div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: stats.avgVolume >= 75 ? 'var(--accent-cyan)' : '#f43f5e' }}>{stats.avgVolume}%</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.3 }}>ACTUAL SQUAD AVG</div>
                         </div>
                      </div>
                      <p style={{ fontSize: '1.1rem', opacity: 0.6, lineHeight: 1.6, margin: 0 }}>
                         Ratio of actual hours trained vs target. This drives the aerobic foundation necessary for championship performance.
                      </p>
                   </div>

                   <div style={{ padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>Competition Engagement</div>
                      <div style={{ display: 'flex', gap: '2rem', alignItems: 'end', marginBottom: '1.5rem' }}>
                         <div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.2)' }}>{squad.target_open_meets || 5}</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.3 }}>TARGET ATTENDANCE</div>
                         </div>
                         <div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: stats.complianceRate >= 100 ? '#10b981' : '#f59e0b' }}>{stats.complianceRate}%</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.3 }}>COMPLIANCE RATE</div>
                         </div>
                      </div>
                      <p style={{ fontSize: '1.1rem', opacity: 0.6, lineHeight: 1.6, margin: 0 }}>
                         Percentage of athletes meeting the open meet frequency targets. High compliance correlates with technical maturity under pressure.
                      </p>
                   </div>

                   <div style={{ padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>Squad Technical Standard</div>
                      <div style={{ display: 'flex', gap: '2rem', alignItems: 'end', marginBottom: '1.5rem' }}>
                         <div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.2)' }}>{squad.county_standard || 350}</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.3 }}>COUNTY TARGET</div>
                         </div>
                         <div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{stats.peakStandard}</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.3 }}>SQUAD PEAK AVG</div>
                         </div>
                      </div>
                      <p style={{ fontSize: '1.1rem', opacity: 0.6, lineHeight: 1.6, margin: 0 }}>
                         Current peak World Aquatics points average. This is the primary indicator of the squad's competitive ranking.
                      </p>
                   </div>
                </div>

                <div style={{ marginTop: '6rem', padding: '4rem', background: 'rgba(14,165,233,0.05)', borderRadius: '32px', border: '1px solid rgba(14,165,233,0.1)' }}>
                   <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '1.5rem' }}>Coaching Philosophy</h3>
                   <p style={{ fontSize: '1.2rem', opacity: 0.8, lineHeight: 1.8, maxWidth: '950px' }}>
                      These criteria are not merely benchmarks but the foundation of our LTAD strategy. Athletes meeting these targets demonstrate the physiological base necessary to withstand the increased load of competitive peak-performance cycles.
                   </p>
                </div>
             </div>

             {/* PAGE 3: PERFORMANCE ROSTER */}
             <div style={{ padding: '6rem 4rem', minHeight: '100vh', background: '#050b10', color: 'white', pageBreakBefore: 'always' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '2rem' }}>
                   <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0, textTransform: 'uppercase' }}>Athlete Performance Roster</h2>
                   <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 900, opacity: 0.4 }}>{squad.name}</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>COACHESEYE AUDIT</div>
                   </div>
                </div>

                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                   <thead>
                      <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                         <th style={{ padding: '1.5rem 1rem', fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase' }}>Athlete</th>
                         <th style={{ padding: '1.5rem 1rem', fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase' }}>Training Consistency</th>
                         <th style={{ padding: '1.5rem 1rem', fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase' }}>Volume</th>
                         <th style={{ padding: '1.5rem 1rem', fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase' }}>Meet Attendance</th>
                         <th style={{ padding: '1.5rem 1rem', fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase' }}>Velocity</th>
                         <th style={{ padding: '1.5rem 1rem', fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase' }}>Peak WA</th>
                         <th style={{ padding: '1.5rem 1rem', fontSize: '0.8rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', textAlign: 'right' }}>Status</th>
                      </tr>
                   </thead>
                   <tbody>
                      {swimmers.map(sw => (
                         <tr key={sw.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', pageBreakInside: 'avoid' }}>
                            <td style={{ padding: '1.5rem 1rem' }}>
                               <div style={{ fontSize: '1.3rem', fontWeight: 900, textTransform: 'uppercase' }}>{sw.full_name}</div>
                               <div style={{ fontSize: '0.7rem', opacity: 0.4 }}>Member ID: {sw.member_id}</div>
                            </td>
                            <td style={{ padding: '1.5rem 1rem', fontSize: '1.2rem', fontWeight: 900, color: sw.trainingPct >= 75 ? '#10b981' : '#fff' }}>{sw.trainingPct}%</td>
                            <td style={{ padding: '1.5rem 1rem', fontSize: '1.2rem', fontWeight: 900 }}>{sw.volumePct}% <span style={{ fontSize: '0.7rem', opacity: 0.3, fontWeight: 500 }}>({sw.totalHours}h)</span></td>
                            <td style={{ padding: '1.5rem 1rem', fontSize: '1.2rem', fontWeight: 900, color: sw.meetCount >= sw.targetMeets ? '#10b981' : (sw.meetCount >= sw.targetMeets - 1 ? '#f59e0b' : '#f43f5e') }}>{sw.meetCount} / {sw.targetMeets}</td>
                            <td style={{ padding: '1.5rem 1rem', fontSize: '1.2rem', fontWeight: 900, color: sw.velocity >= 0 ? '#10b981' : '#f43f5e' }}>{sw.velocity > 0 ? '+' : ''}{sw.velocity}</td>
                            <td style={{ padding: '1.5rem 1rem', fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{sw.peakWA}</td>
                            <td style={{ padding: '1.5rem 1rem', textAlign: 'right' }}>
                               <div style={{ 
                                  fontSize: '0.7rem', 
                                  fontWeight: 900, 
                                  padding: '8px 20px', 
                                  borderRadius: '4px', 
                                  display: 'inline-block',
                                  background: sw.is_exempt ? 'rgba(255,255,255,0.05)' : (sw.isMet ? 'rgba(16,185,129,0.1)' : (sw.meetCount >= sw.targetMeets - 1 ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)')), 
                                  color: sw.is_exempt ? 'rgba(255,255,255,0.4)' : (sw.isMet ? '#10b981' : (sw.meetCount >= sw.targetMeets - 1 ? '#f59e0b' : '#f43f5e')),
                                  border: `1px solid ${sw.is_exempt ? 'rgba(255,255,255,0.1)' : (sw.isMet ? '#10b981' : (sw.meetCount >= sw.targetMeets - 1 ? '#f59e0b' : '#f43f5e'))}`
                                }}>
                                  {sw.is_exempt ? 'EXEMPT' : (sw.isMet ? 'COMPLIANT' : (sw.meetCount >= sw.targetMeets - 1 ? 'NEARLY' : 'NOT MET'))}
                               </div>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>

             {/* PAGE 3: GLOSSARY & INTEL */}
             <div style={{ padding: '6rem 4rem', minHeight: '100vh', background: '#050b10', color: 'white', pageBreakBefore: 'always' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.4em', marginBottom: '2rem', textTransform: 'uppercase' }}>Analytical Appendix</div>
                <h2 style={{ fontSize: '4rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', marginBottom: '4rem' }}>Intelligence Glossary</h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem' }}>
                   <div style={{ padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <h4 style={{ color: 'var(--accent-cyan)', fontWeight: 900, textTransform: 'uppercase', fontSize: '1.1rem', marginBottom: '1.5rem' }}>Training Consistency</h4>
                      <p style={{ fontSize: '1.1rem', opacity: 0.6, lineHeight: 1.6 }}>Percentage of expected sessions attended based on the squad's weekly target. This metric represents the psychological and physical commitment to the training program.</p>
                   </div>
                   <div style={{ padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <h4 style={{ color: 'var(--accent-amber)', fontWeight: 900, textTransform: 'uppercase', fontSize: '1.1rem', marginBottom: '1.5rem' }}>Volume % (Banked Hours)</h4>
                      <p style={{ fontSize: '1.1rem', opacity: 0.6, lineHeight: 1.6 }}>Ratio of actual hours trained vs the squad's target hours. High volume correlates with aerobic threshold stability and technical consolidation.</p>
                   </div>
                   <div style={{ padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <h4 style={{ color: 'var(--accent-emerald)', fontWeight: 900, textTransform: 'uppercase', fontSize: '1.1rem', marginBottom: '1.5rem' }}>Squad Velocity</h4>
                      <p style={{ fontSize: '1.1rem', opacity: 0.6, lineHeight: 1.6 }}>The average change in WA Points standard over the selected period. A positive velocity indicates technical and physiological progression.</p>
                   </div>
                   <div style={{ padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <h4 style={{ color: 'var(--accent-rose)', fontWeight: 900, textTransform: 'uppercase', fontSize: '1.1rem', marginBottom: '1.5rem' }}>Compliance Status</h4>
                      <p style={{ fontSize: '1.1rem', opacity: 0.6, lineHeight: 1.6 }}>A binary status based on meeting both training consistency thresholds AND open meet frequency targets set by the coaching staff.</p>
                   </div>
                </div>

                <div style={{ marginTop: '8rem', padding: '4rem', background: 'rgba(6,182,212,0.05)', borderRadius: '32px', border: '1px solid rgba(6,182,212,0.1)' }}>
                   <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '1.5rem' }}>CoachesEye Methodology</h3>
                   <p style={{ fontSize: '1.1rem', opacity: 0.8, lineHeight: 1.8, maxWidth: '900px' }}>
                      The CoachesEye DNA engine utilizes multi-dimensional data points from training attendance, meet results, and club exemptions to build a comprehensive athlete performance profile. 
                      Standardization ensures that athletes are compared fairly against squad-specific benchmarks and LTAD (Long-Term Athlete Development) milestones.
                   </p>
                </div>
             </div>
           </div>
        ) : (
          <div className="container mx-auto px-4 py-8">
            <div className="profile-header no-print" style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-6 mb-4">
                  <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3.5rem', margin: 0, lineHeight: 1, fontWeight: 900 }}>{squad.name}</h1>
                  <div className={`status-badge ${(healthData?.total || 0) > 75 ? 'success' : 'attention'}`} style={{ fontSize: '0.8rem', padding: '8px 16px' }}>
                     {(healthData?.total || 0) > 75 ? 'OPTIMAL HEALTH' : 'STABILIZING'}
                  </div>
                </div>
                <div className="swimmer-meta">
                  <span className="meta-item" style={{ fontWeight: 700, opacity: 0.6 }}>{stats.athletes} Athletes Registered</span>
                  <span className="meta-item" style={{ margin: '0 10px', opacity: 0.3 }}>•</span>
                  <span className="meta-item" style={{ fontWeight: 700, opacity: 0.6 }}>Season 2025/26 Analytics</span>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                 <PremiumOrb value={healthData?.total || 0} label="Overall Health" size={120} />
                 <button className="intel-toggle" style={{ height: 'fit-content', marginTop: 12 }} onClick={() => setShowGlossary(!showGlossary)}>{showGlossary ? 'Hide Intel' : 'Coaching Intel ⓘ'}</button>
                 <button className="btn-premium-intel" style={{ height: 'fit-content', marginTop: 12, background: 'var(--accent-cyan)', color: '#000' }} onClick={handleRosterExport}>Export Audit</button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
               <div className="glass-card lg:col-span-2" style={{ borderLeft: '4px solid var(--accent-cyan)', padding: '2rem 2.5rem' }}>
                  <div className="section-title" style={{ fontSize: '0.65rem', marginBottom: 20, letterSpacing: '0.2em', opacity: 0.8, fontWeight: 900, textTransform: 'uppercase' }}>Squad Performance Story</div>
                  <div className="space-y-6">
                     {Array.isArray(narrative) ? narrative.map((part, idx) => (
                       <div key={idx} style={{ 
                         background: part.type === 'success' ? 'rgba(16,185,129,0.03)' : part.type === 'danger' ? 'rgba(244,63,94,0.03)' : part.type === 'warning' ? 'rgba(245,158,11,0.03)' : 'rgba(255,255,255,0.02)',
                         borderLeft: `4px solid ${part.type === 'success' ? '#10b981' : part.type === 'danger' ? '#f43f5e' : part.type === 'warning' ? '#f59e0b' : 'var(--accent-cyan)'}`,
                         padding: '1.5rem',
                         borderRadius: '0 12px 12px 0'
                       }}>
                          <div style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', color: part.type === 'success' ? '#10b981' : part.type === 'danger' ? '#f43f5e' : part.type === 'warning' ? '#f59e0b' : 'var(--accent-cyan)', marginBottom: 8, letterSpacing: '0.1em' }}>{part.category}</div>
                          <p style={{ fontSize: '1rem', fontWeight: 500, lineHeight: 1.5, color: '#fff', margin: 0 }}>{part.text}</p>
                       </div>
                     )) : <p>{narrative}</p>}
                  </div>
               </div>

               <div className="glass-card" style={{ padding: '2rem' }}>
                  <div className="kpi-label" style={{ marginBottom: 32, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', opacity: 0.5 }}>Squad Health & Compliance</div>
                  
                  <div className="flex justify-center mb-8">
                     <PremiumOrb value={healthData?.total || 0} label="Overall Health Score" size={130} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                     <PremiumOrb value={stats.avgConsistency} label="Consistency" size={80} />
                     <PremiumOrb value={stats.avgVolume} label="Volume" size={80} />
                     <PremiumOrb value={stats.complianceRate} label="Meets" size={80} />
                     <PremiumOrb value={stats.peakStandard} label="Avg WA Pts" size={80} color="amber" unit="" />
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                     {healthData?.components?.map(c => {
                       const barColor = c.score < 50 ? '#f43f5e' : (c.score < 75 ? '#f59e0b' : '#10b981');
                       return (
                         <div key={c.label}>
                           <div className="flex justify-between text-[9px] mb-1 font-black opacity-40 uppercase tracking-tighter"><span>{c.label}</span><span>{c.score}%</span></div>
                           <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${c.score}%`, background: barColor, borderRadius: 2 }}></div>
                           </div>
                         </div>
                       );
                     })}
                  </div>
               </div>
            </div>

            <div className="mb-16">
               <TalentIntelligenceCard 
                 squadId={id}
                 squadName={squad.name}
                 stats={stats}
                 strokeData={stats.strokeData}
                 trend={chartData}
                 swimmers={swimmers}
               />
            </div>

            <div className="grid lg:grid-cols-2 gap-8 mb-16">
               <div className="glass-card" style={{ padding: '2rem' }}>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="kpi-label" style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', opacity: 0.5 }}>Squad Average Points Trend</div>
                      <div style={{ fontSize: '0.6rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>
                         Note: Regional/County benchmarks are averaged based on squad avg age ({stats.avgAge}).
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                       <div style={{ fontSize: '0.55rem', opacity: 0.4, fontWeight: 900 }}>SQUAD VELOCITY</div>
                       <div style={{ fontSize: '1.2rem', fontWeight: 900, color: stats.avgVelocity >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{stats.avgVelocity > 0 ? '+' : ''}{stats.avgVelocity}</div>
                    </div>
                  </div>
                  <div style={{ height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="sqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                        
                        {shutdowns.map((sh, idx) => (
                          <ReferenceArea 
                            key={idx} 
                            yAxisId="left"
                            x1={sh.start} 
                            x2={sh.end} 
                            fill={sh.type === 'credit' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)'} 
                            strokeOpacity={0.3}
                            label={{ value: sh.name, position: 'top', fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 900 }}
                          />
                        ))}

                        <Area yAxisId="left" type="monotone" dataKey="avgWA" stroke="var(--accent-cyan)" strokeWidth={3} fill="url(#sqGrad)" />
                        <Line yAxisId="left" type="monotone" dataKey="trend" stroke="var(--accent-amber)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                        {stats.avgAge && stats.gender && (
                           <>
                             <ReferenceLine 
                               y={getKentBenchmark(stats.avgAge, stats.gender, '50 Free', 'COUNTY')} 
                               yAxisId="left" 
                               stroke="rgba(255,255,255,0.7)" 
                               strokeDasharray="4 4"
                               label={{ value: 'KENT COUNTY', position: 'top', fill: 'rgba(255,255,255,1)', fontSize: 11, fontWeight: 900 }} 
                             />
                             <ReferenceLine 
                               y={getKentBenchmark(stats.avgAge, stats.gender, '50 Free', 'REGIONAL')} 
                               yAxisId="left" 
                               stroke="var(--accent-cyan)" 
                               strokeDasharray="4 4"
                               strokeOpacity={0.9}
                               label={{ value: 'REGIONALS', position: 'top', fill: 'var(--accent-cyan)', fontSize: 11, fontWeight: 900 }} 
                             />
                           </>
                         )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
               </div>

               <div className="glass-card" style={{ padding: '2rem' }}>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="kpi-label" style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', opacity: 0.5 }}>Squad vs Club Performance by Age</div>
                      <div style={{ fontSize: '0.6rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>
                         Direct comparison across all LTAD age bands.
                      </div>
                    </div>
                  </div>
                  <div style={{ height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ageData}>
                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="age" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                        <Legend wrapperStyle={{ paddingTop: 20, fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase' }} />
                        <Bar dataKey="squad" name="This Squad" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="club" name="Club Average" fill="rgba(255,255,255,0.1)" radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>

            <div className="flex justify-between items-end mb-6">
              <div className="section-title" style={{ fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase', margin: 0, letterSpacing: '0.1em' }}>Athlete Performance Roster</div>
              <button 
                className="btn-premium-intel" 
                style={{ background: 'var(--accent-cyan)', color: '#000', padding: '8px 20px', fontSize: '0.7rem' }}
                onClick={handleRosterExport}
              >
                Export Roster PDF
              </button>
            </div>
            <div className="glass-card mb-16" style={{ padding: '1rem', overflow: 'hidden' }}>
              <table className="w-full text-left border-collapse stats-table-glass">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '1.5rem', fontSize: '0.7rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase' }}>Athlete</th>
                    <th style={{ padding: '1.5rem', fontSize: '0.7rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase' }}>Compliance</th>
                    <th style={{ padding: '1.5rem', fontSize: '0.7rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase' }}>Consistency</th>
                    <th style={{ padding: '1.5rem', fontSize: '0.7rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase' }}>Volume</th>
                    <th style={{ padding: '1.5rem', fontSize: '0.7rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase' }}>Meet Attendance</th>
                    <th style={{ padding: '1.5rem', fontSize: '0.7rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase' }}>Races</th>
                    <th style={{ padding: '1.5rem', fontSize: '0.7rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase' }}>Velocity</th>
                    <th style={{ padding: '1.5rem', fontSize: '0.7rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSwimmers.map(sw => (
                    <tr key={sw.id} onClick={() => router.push(`/swimmer/${sw.id}`)} style={{ cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.05)' }} className="hover:bg-white/[0.02] transition-all">
                      <td style={{ padding: '1.5rem' }}>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{sw.full_name}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>{sw.peakWA} PEAK</div>
                      </td>
                      <td style={{ padding: '1.5rem' }}>
                         <div style={{ width: '80px', height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${(sw.trainingPct + sw.volumePct) / 2}%`, background: 'var(--accent-cyan)', borderRadius: 2 }}></div>
                         </div>
                      </td>
                      <td style={{ padding: '1.5rem', fontWeight: 900, color: sw.trainingPct >= 75 ? 'var(--accent-emerald)' : '#fff' }}>{sw.trainingPct}%</td>
                      <td style={{ padding: '1.5rem' }}>
                        <div style={{ fontWeight: 900 }}>{sw.volumePct}%</div>
                        <div style={{ fontSize: '0.65rem', opacity: 0.5 }}>{sw.totalHours}h banked</div>
                      </td>
                      <td style={{ padding: '1.5rem', fontWeight: 900, color: sw.meetCount >= sw.targetMeets ? 'var(--accent-emerald)' : (sw.meetCount >= sw.targetMeets - 1 ? 'var(--accent-amber)' : 'var(--accent-rose)') }}>
                        {sw.meetCount} / {sw.targetMeets}
                      </td>
                      <td style={{ padding: '1.5rem', fontWeight: 900 }}>{sw.totalRaces}</td>
                      <td style={{ padding: '1.5rem', fontWeight: 900, color: sw.velocity > 0 ? 'var(--accent-emerald)' : sw.velocity < 0 ? 'var(--accent-rose)' : 'inherit' }}>
                        {sw.velocity > 0 ? `+${sw.velocity}` : sw.velocity}
                      </td>
                      <td style={{ padding: '1.5rem', textAlign: 'right' }}>
                        <span className={`status-badge ${sw.is_exempt ? 'exempt' : (sw.isMet ? 'success' : (sw.meetCount >= sw.targetMeets - 1 ? 'attention' : 'critical'))}`}>
                          {sw.is_exempt ? 'EXEMPT' : (sw.isMet ? 'COMPLIANT' : (sw.meetCount >= sw.targetMeets - 1 ? 'NEARLY' : 'NOT MET'))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showGlossary && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-8 backdrop-blur-xl bg-black/60">
           <div className="glass-card max-w-2xl w-full p-10 relative">
              <button 
                onClick={() => setShowGlossary(false)}
                className="absolute top-8 right-8 text-white/20 hover:text-white transition-colors"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <h2 className="text-3xl font-black mb-8">Intelligence Glossary</h2>
              <div className="space-y-8">
                 <div>
                    <h4 className="text-cyan-400 font-black uppercase text-[10px] tracking-widest mb-2">Consistency (Attendance %)</h4>
                    <p className="text-white/50 text-sm leading-relaxed">Percentage of expected sessions attended based on the squad's weekly target.</p>
                 </div>
                 <div>
                    <h4 className="text-amber-400 font-black uppercase text-[10px] tracking-widest mb-2">Volume % (Banked Hours)</h4>
                    <p className="text-white/50 text-sm leading-relaxed">Ratio of actual hours trained vs the squad's target hours per week.</p>
                 </div>
              </div>
           </div>
        </div>
      )}
    </Layout>
  );
}
