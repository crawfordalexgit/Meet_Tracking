import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import { calculateWorkload, calculateReliability, calculateSquadHealth, generateSquadNarrative } from '../../lib/analytics-utils';
import { getCategoryBenchmark } from '../../lib/qualifying-times';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Bar, BarChart, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import Link from 'next/link';
import PremiumOrb from '../../components/PremiumOrb';
import BenchmarkModal from '../../components/BenchmarkModal';

export default function SquadDetail({ session }) {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [showGlossary, setShowGlossary] = useState(false);
  const [squad, setSquad] = useState(null);
  const [swimmers, setSwimmers] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState({});
  const [narrative, setNarrative] = useState([]);
  const [healthData, setHealthData] = useState({ total: 0, components: [] });
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);

  useEffect(() => {
    if (id && router.isReady) {
      fetchSquadData();
    }
  }, [id, router.isReady, router.query.period]);

  const fetchAll = async (table, select = '*', filter = null, maxPages = 15) => {
    let allData = [];
    let page = 0;
    let hasMore = true;
    while (hasMore && page < maxPages) {
      let q = supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error) throw error;
      allData = [...allData, ...data];
      if (data.length < 1000) hasMore = false;
      page++;
    }
    return allData;
  };

  const fetchSquadData = async () => {
    setLoading(true);
    try {
      const { data: rawSwimmers } = await supabase.from('swimmers').select('*, squads(*)').eq('squad_id', id);
      const squadSwimmerIds = rawSwimmers.map(s => s.id);

      const now = new Date();
      const period = parseInt(router.query.period) || 365;
      const START = new Date(now.getTime() - (period * 24 * 60 * 60 * 1000));
      const startStr = START.toISOString().split('T')[0];

      const [squadRes, resultsRaw, meetsData, attendanceData, sessionsData] = await Promise.all([
        supabase.from('squads').select('*').eq('id', id).single(),
        fetchAll('results', '*', q => q.in('swimmer_id', squadSwimmerIds).gte('date', startStr)),
        fetchAll('meets', '*'),
        fetchAll('training_attendance', '*', q => q.in('swimmer_id', squadSwimmerIds).gte('date', startStr)),
        fetchAll('sessions', '*')
      ]);

      if (squadRes.error) throw squadRes.error;
      const squadData = squadRes.data;
      
      const squadSwimmers = rawSwimmers.filter(s => !s.is_exempt);
      const squadResults = resultsRaw.filter(r => r.date >= startStr);
      const openMeetIds = new Set(meetsData.filter(m => (m.type || 'open').toLowerCase() === 'open').map(m => m.id));

      const dateMap = {};
      squadResults.forEach(r => {
        if (!dateMap[r.date]) dateMap[r.date] = { date: r.date, points: [] };
        dateMap[r.date].points.push(Number(r.wa_pts || 0));
      });

      let processedChart = Object.values(dateMap).sort((a,b) => a.date.localeCompare(b.date)).map(d => ({
        date: new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        avgWA: Math.round(d.points.reduce((a,b) => a+b, 0) / d.points.length)
      }));

      if (processedChart.length > 1) {
        const n = processedChart.length;
        let sx = 0, sy = 0, sxy = 0, sx2 = 0;
        processedChart.forEach((d, i) => { sx += i; sy += d.avgWA; sxy += i * d.avgWA; sx2 += i * i; });
        const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
        const intercept = (sy - slope * sx) / n;
        processedChart = processedChart.map((d, i) => ({ ...d, trend: Math.round(slope * i + intercept) }));
      }

      const avgAge = Math.round(squadSwimmers.reduce((acc, s) => {
         if (!s.date_of_birth) return acc + 13;
         const birth = new Date(s.date_of_birth);
         let age = now.getFullYear() - birth.getFullYear();
         if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
         return acc + age;
      }, 0) / (squadSwimmers.length || 1));

      const halfPeriod = Math.floor(period / 2);
      const velRecentStart = new Date(now - halfPeriod * 86400000);
      const velPriorStart  = new Date(now - period * 86400000);
      const avgPts = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      const swimmerStats = squadSwimmers.map(sw => {
        const swRes = squadResults.filter(r => r.swimmer_id === sw.id);
        const rel = calculateReliability(sw, attendanceData.filter(a => a.swimmer_id === sw.id), sessionsData, squadResults, period);
        const ratio = Math.max(0, Math.min(1, (now - (sw.squad_join_date ? new Date(sw.squad_join_date) : START)) / (period * 86400000)));
        const targetMeets = Math.ceil((squadData.target_meets || 0) * ratio);
        const uniqueMeets = new Set(swRes.filter(r => openMeetIds.has(r.meet_id)).map(r => r.meet_id)).size;

        return {
          ...sw,
          velocity: Math.round(avgPts(swRes.filter(r => new Date(r.date) >= velRecentStart).map(r => r.wa_pts || 0)) - avgPts(swRes.filter(r => new Date(r.date) >= velPriorStart && new Date(r.date) < velRecentStart).map(r => r.wa_pts || 0))),
          peakWA: swRes.length ? Math.max(...swRes.map(r => r.wa_pts || 0)) : 0,
          totalPoints: swRes.reduce((a, r) => a + (r.wa_pts || 0), 0),
          meetCount: uniqueMeets,
          targetMeets,
          resultsCount: swRes.length,
          totalRaces: swRes.length,
          trainingPct: rel.percentage,
          volumePct: rel.volumePct,
          totalHours: Math.round(rel.totalHours),
          isMet: uniqueMeets >= targetMeets && (rel.percentage >= (squadData.target_training_percent || 75) || rel.volumePct >= (squadData.target_training_percent || 75))
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
        strokeData[k] = { avg: v.pts.reduce((a,b)=>a+b,0) / v.count, peak: Math.max(...v.pts), count: v.count };
      });

      const statsObj = {
        athletes: rawSwimmers.length,
        avgVelocity: Math.round(swimmerStats.reduce((a,b) => a+b.velocity, 0) / (swimmerStats.length || 1)),
        peakStandard: swimmerStats.length ? Math.max(...swimmerStats.map(s => s.peakWA)) : 0,
        totalPoints: swimmerStats.reduce((a,b) => a+b.totalPoints, 0),
        avgTraining: Math.round(swimmerStats.reduce((a,b) => a+b.trainingPct, 0) / (swimmerStats.length || 1)),
        avgVolume: Math.round(swimmerStats.reduce((a,b) => a+b.volumePct, 0) / (swimmerStats.length || 1)),
        complianceRate: Math.round((swimmerStats.filter(s => s.isMet).length / (swimmerStats.length || 1)) * 100),
        totalRaces: squadResults.length,
        targetMeets: squadData.target_meets,
        avgAge,
        gender: squadSwimmers[0]?.gender || 'M',
        strokeData
      };

      setSquad(squadData);
      setSwimmers(swimmerStats);
      setChartData(processedChart);
      setStats(statsObj);
      setHealthData(calculateSquadHealth(statsObj, squadData));
      setNarrative(generateSquadNarrative(statsObj));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  if (loading) return <Layout session={session}><div style={{ marginTop: 100, textAlign: 'center', opacity: 0.5 }}>Loading Squad Analytics...</div></Layout>;
  if (!squad) return <Layout session={session}><div>Squad not found.</div></Layout>;

  return (
    <Layout session={session}>
      <Head>
        <title>{squad.name} | Squad Analytics</title>
        <style>{`
          @media print {
            .no-print, button, nav, .profile-header { display: none !important; }
            .print-only { display: block !important; }
            body { background: white !important; color: #111 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .glass-card { border: 1px solid #eee !important; background: white !important; box-shadow: none !important; color: black !important; page-break-inside: avoid; padding: 2.5rem !important; margin-bottom: 2rem !important; border-radius: 12px !important; }
            .kpi-label, .section-title, h1, h2, h3 { color: #000 !important; font-weight: 900 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
            div, span, p { color: #333 !important; }
            .recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line { stroke: #f0f0f0 !important; }
            .recharts-line-curve { stroke: #1a56db !important; stroke-width: 2px !important; }
            .recharts-text { fill: #000 !important; font-weight: 900 !important; }
          }
        `}</style>
      </Head>

      <div className="profile-header no-print" style={{ marginBottom: '2.5rem' }}>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-6 mb-4">
            <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3.5rem', margin: 0, lineHeight: 1 }}>{squad.name}</h1>
            <div className={`status-badge ${healthData.total > 75 ? 'success' : 'attention'}`} style={{ fontSize: '0.8rem', padding: '8px 16px' }}>
               {healthData.total > 75 ? 'OPTIMAL HEALTH' : 'STABILIZING'}
            </div>
          </div>
          <div className="swimmer-meta">
            <span className="meta-item">{stats.athletes} Athletes Registered</span>
            <span className="meta-item">•</span>
            <span className="meta-item">Season 2025/26 Analytics</span>
          </div>
        </div>
        <div className="flex gap-4">
           <PremiumOrb value={healthData.total} label="Overall Health" size={120} />
           <button className="intel-toggle" style={{ height: 'fit-content', marginTop: 12 }} onClick={() => setShowGlossary(!showGlossary)}>{showGlossary ? 'Hide Intel' : 'Coaching Intel ⓘ'}</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 mb-16">
        <div className="glass-card lg:col-span-2" style={{ borderLeft: '4px solid var(--accent-cyan)', padding: '2rem 2.5rem' }}>
          <div className="section-title" style={{ fontSize: '0.65rem', marginBottom: 20, letterSpacing: '0.2em', opacity: 0.8 }}>Squad Performance Story</div>
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

        <div className="glass-card">
          <div className="kpi-label" style={{ marginBottom: 32 }}>Squad Health & Compliance</div>
          
          <div className="flex justify-center mb-8">
             <PremiumOrb value={healthData.total} label="Overall Health Score" size={130} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
             <PremiumOrb value={stats.avgTraining} label="Reliability" size={80} />
             <PremiumOrb value={stats.avgVolume} label="Volume" size={80} />
             <PremiumOrb value={stats.complianceRate} label="Competition" size={80} />
             <PremiumOrb value={healthData.components.find(c => c.label === 'Progress')?.score || 0} label="Progress" size={80} />
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
             <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest opacity-50">
                <span>Metric Breakdown</span>
                <span>Squad Status</span>
             </div>
             {healthData.components.map(c => {
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
        <div className="glass-card" style={{ padding: '2rem' }}>
           <div className="flex justify-between items-start mb-6">
             <div>
               <div className="kpi-label">Squad Average Points Trend</div>
               <div style={{ fontSize: '0.6rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>
                  Note: Regional/County benchmarks are averaged across all strokes and distances based on squad avg age ({stats.avgAge}).
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
                 <XAxis dataKey="date" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                 <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                 <Tooltip contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--glass-border)', borderRadius: '12px' }} />
                 <ReferenceLine y={getCategoryBenchmark(stats.avgAge, stats.gender, '', 'COUNTY')} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" label={{ value: 'COUNTY AVG', fill: 'rgba(255,255,255,0.4)', fontSize: 10, position: 'insideBottomLeft', fontWeight: 900 }} />
                 <ReferenceLine y={getCategoryBenchmark(stats.avgAge, stats.gender, '', 'REGIONAL')} stroke="var(--accent-cyan)" strokeDasharray="3 3" label={{ value: 'REGIONAL AVG', fill: 'var(--accent-cyan)', fontSize: 10, position: 'insideTopLeft', opacity: 0.8, fontWeight: 900 }} />
                 <Area type="monotone" dataKey="avgWA" stroke="var(--accent-cyan)" strokeWidth={3} fill="url(#sqGrad)" />
                 <Line type="monotone" dataKey="trend" stroke="var(--accent-amber)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>
        
      </div>

      <div className="glass-card mb-16" style={{ padding: '2.5rem' }}>
         <div className="flex justify-between items-start mb-6">
           <div>
             <div className="kpi-label">Squad Stroke Performance Roadmap</div>
             <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', opacity: 0.5, fontStyle: 'italic', marginTop: 4 }}>
               Note: Benchmarks represent the average qualification standard across all distances (50m, 100m, 200m) based on squad avg age ({stats.avgAge}).
             </div>
           </div>
           <div style={{ textAlign: 'right' }}>
              <div className="kpi-label" style={{ fontSize: '0.55rem', opacity: 0.4 }}>SQUAD PEAK</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{stats.peakStandard} <span style={{ fontSize: '0.7rem', opacity: 0.3 }}>PTS</span></div>
           </div>
         </div>
         <div style={{ marginBottom: 32, height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>
         
         <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
            {Object.entries(stats.strokeData)
              .filter(([_, d]) => d.count > 0)
              .map(([name, d]) => {
                const county = getCategoryBenchmark(stats.avgAge, stats.gender, name, 'COUNTY');
                const regional = getCategoryBenchmark(stats.avgAge, stats.gender, name, 'REGIONAL');
                const peak = Math.round(d.peak);
                const avg = Math.round(d.avg);
                const scale = (val) => Math.min((val / 600) * 100, 100);
                
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ width: '120px', flexShrink: 0 }}>
                       <div className="roadmap-label" style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '2px' }}>{name}</div>
                       <div style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.4 }}>PEAK: {peak} | AVG: {avg}</div>
                    </div>
                    <div style={{ flex: 1, position: 'relative', paddingTop: '16px', paddingBottom: '24px' }}>
                      <div className="roadmap-track" style={{ height: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                        <div className="roadmap-bar" style={{ width: `${scale(peak)}%`, height: '100%', background: 'linear-gradient(90deg, #00d4ff, #0082ff)', borderRadius: '0 4px 4px 0' }} />
                        <div className="roadmap-avg" style={{ position: 'absolute', left: `${scale(avg)}%`, top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.8)', zIndex: 10 }} />
                      </div>
                      <div className="roadmap-target" style={{ position: 'absolute', left: `${scale(county)}%`, top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.15)', borderLeft: '1px dashed rgba(255,255,255,0.4)', zIndex: 5 }}>
                         <div style={{ position: 'absolute', top: '-14px', left: '-20px', width: '40px', textAlign: 'center', fontSize: '7px', opacity: 0.5, fontWeight: 900 }}>COUNTY</div>
                      </div>
                      <div className="roadmap-regional" style={{ position: 'absolute', left: `${scale(regional)}%`, top: 0, bottom: 0, width: '2px', background: 'rgba(245, 158, 11, 0.2)', borderLeft: '1px dashed rgba(245, 158, 11, 0.5)', zIndex: 5 }}>
                         <div style={{ position: 'absolute', bottom: '-14px', left: '-20px', width: '40px', textAlign: 'center', fontSize: '7px', color: '#f59e0b', opacity: 0.7, fontWeight: 900 }}>REGIONAL</div>
                      </div>
                    </div>
                  </div>
                );
              })}
         </div>
      </div>

      <div className="section-title">Athlete Performance Roster</div>
      <div className="glass-card mb-16" style={{ padding: '1rem' }}>
        <table className="stats-table-glass">
          <thead>
            <tr>
              <th>Athlete</th>
              <th>Compliance</th>
              <th>Training %</th>
              <th>Volume (Hrs)</th>
              <th>Races</th>
              <th>Meets</th>
              <th>Velocity</th>
              <th style={{ textAlign: 'right' }}>Current Status</th>
            </tr>
          </thead>
          <tbody>
            {swimmers.map(sw => (
              <tr key={sw.id} onClick={() => router.push(`/swimmer/${sw.id}?period=${router.query.period || 365}`)} style={{ cursor: 'pointer' }}>
                <td>
                  <div style={{ fontWeight: 800 }}>{sw.full_name}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>{sw.peakWA} PEAK</div>
                </td>
                <td>
                   <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 8, maxWidth: 80 }}>
                      <div style={{ height: '100%', width: `${(sw.trainingPct + sw.volumePct) / 2}%`, background: 'var(--accent-cyan)', borderRadius: 2 }}></div>
                   </div>
                </td>
                <td style={{ fontWeight: 900, color: sw.trainingPct >= 75 ? 'var(--accent-emerald)' : '#fff' }}>{sw.trainingPct}%</td>
                <td>
                  <div style={{ fontWeight: 900 }}>{sw.volumePct}%</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.5 }}>{sw.totalHours}h banked</div>
                </td>
                <td style={{ fontWeight: 900 }}>{sw.totalRaces}</td>
                <td>
                  <div style={{ fontWeight: 900 }}>{sw.meetCount}</div>
                  <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>Target: {sw.targetMeets}</div>
                </td>
                <td style={{ fontWeight: 900, color: sw.velocity > 0 ? 'var(--accent-emerald)' : sw.velocity < 0 ? 'var(--accent-rose)' : 'inherit' }}>
                  {sw.velocity > 0 ? `+${sw.velocity}` : sw.velocity}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`status-badge ${sw.isMet ? 'success' : (sw.meetCount >= sw.targetMeets - 1 ? 'attention' : 'critical')}`}>
                    {sw.isMet ? 'COMPLIANT' : (sw.meetCount >= sw.targetMeets - 1 ? 'NEARLY' : 'NOT MET')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BenchmarkModal isOpen={isBenchmarkOpen} onClose={() => setIsBenchmarkOpen(false)} />
    </Layout>
  );
}
