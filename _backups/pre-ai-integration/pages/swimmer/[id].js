import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import PremiumOrb from '../../components/PremiumOrb';
import Layout from '../../components/Layout';
import BenchmarkModal from '../../components/BenchmarkModal';
import { supabase } from '../../lib/supabase';
import { calculateWorkload, isGalaDate, getSessionDuration, isExemptDate, calculateReliability, generateSwimmerNarrative, calculateSquadHealth, getKentBenchmark, getCategoryBenchmark } from '../../lib/analytics-utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell, ComposedChart, LabelList, ReferenceLine } from 'recharts';
import Link from 'next/link';


export default function SwimmerDetail({ session }) {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [swimmer, setSwimmer] = useState(null);
  const [results, setResults] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [squad, setSquad] = useState(null);
  const [selectedStroke, setSelectedStroke] = useState('All');
  const [periodWeeks, setPeriodWeeks] = useState(12);
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [narrative, setNarrative] = useState([]);
  const [healthData, setHealthData] = useState({ total: 0, components: [] });
  const [personalStats, setPersonalStats] = useState({});
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);

  useEffect(() => {
    if (id && router.isReady) { fetchSwimmerData(); }
  }, [id, router.isReady]);

  const fetchSwimmerData = async () => {
    setLoading(true);
    try {
      const { data: swData } = await supabase.from('swimmers').select('*, squads(*)').eq('id', id).single();
      if (!swData) return;
      setSwimmer(swData);
      setSquad(swData.squads);

      const fetchPaged = async (table, select = '*', filter = null) => {
        let all = []; let page = 0; let more = true;
        while (more && page < 20) {
          let q = supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
          if (filter) q = filter(q);
          const { data, error } = await q;
          if (error) break;
          all = [...all, ...data];
          if (data.length < 1000) more = false;
          page++;
        }
        return all;
      };

      const [resData, attData, sessData] = await Promise.all([
        fetchPaged('results', '*, meets(*)', q => q.eq('swimmer_id', id)),
        fetchPaged('training_attendance', '*', q => q.eq('swimmer_id', id)),
        fetchPaged('sessions', '*')
      ]);

      setAttendance(attData || []);
      setSessions(sessData || []);
      setResults((resData || []).sort((a,b) => new Date(a.meets?.date || 0) - new Date(b.meets?.date || 0)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const { rollingMeets, rollingTarget, progressPercent, rollingPeak, rollingAvg, workloadChartData, attendancePct, seasonVolumePct, totalActualHours, annualTargetHours, isCompliant, velocity, filteredMeets, statsObj } = useMemo(() => {
    if (!swimmer) return { attendancePct: 0, seasonVolumePct: 0, workloadChartData: [], filteredMeets: [] };
    const now = new Date();
    const period = parseInt(router.query.period) || 365;
    const START = new Date(now - period * 86400000);
    const uniqueMeets = new Set(results.filter(r => new Date(r.date) >= START && (r.meets?.type || 'open').toLowerCase() === 'open').map(r => r.meet_id)).size;
    const ratio = Math.max(0, Math.min(1, (now - (swimmer.squad_join_date ? new Date(swimmer.squad_join_date) : START)) / (period * 86400000)));
    const adjTarget = Math.ceil((squad?.target_meets || 0) * ratio);
    const yearResults = results.filter(r => new Date(r.meets?.date || 0) >= START);
    
    const workload = calculateWorkload(attendance, sessions, results, swimmer.id);
    const chartData = Object.entries(workload).sort((a,b) => a[0].localeCompare(b[0])).slice(-periodWeeks).map(([k, d]) => ({
      week: k.split('-W')[1], training: Math.round(d.trainingHours * 10) / 10, gala: Math.round(d.galaHours * 10) / 10, target: squad?.target_hours_per_week || 0
    }));

    const rel = calculateReliability(swimmer, attendance, sessions, results, period);
    const half = Math.floor(period / 2);
    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
    const velocity = Math.round(avg(results.filter(r => new Date(r.date) >= new Date(now - half * 86400000)).map(r => r.wa_pts || 0)) - avg(results.filter(r => new Date(r.date) >= new Date(now - period * 86400000) && new Date(r.date) < new Date(now - half * 86400000)).map(r => r.wa_pts || 0)));

    // Stroke-specific analysis
    const strokeMap = {};
    yearResults.forEach(r => {
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
      strokeData[k] = { 
        avg: v.pts.reduce((a,b)=>a+b,0) / v.count, 
        peak: Math.max(...v.pts),
        count: v.count 
      };
    });

    // Swimming age = age as at 31 Dec of current year
    const age = swimmer?.year_of_birth ? new Date().getFullYear() - swimmer.year_of_birth : null;

    // Window-based current average (90 days) for "Current Form"
    const recentResults = results.filter(r => new Date(r.date) >= new Date(now - 90 * 86400000));
    const recentAvg = Math.round(recentResults.reduce((a,r)=>a+(r.wa_pts||0),0)/(recentResults.length || 1));

    // Personal Best Tracking (Lifetime bests achieved in the selected period)
    const sortedAll = [...results].sort((a,b) => new Date(a.date) - new Date(b.date));
    let seasonPBs = 0;
    const lifetimeBestMap = {}; // Event -> Best Time (seconds)
    
    sortedAll.forEach(r => {
      const isWithinPeriod = new Date(r.date) >= START;
      // Convert time 'MM:SS.ms' or 'SS.ms' to total seconds
      const timeParts = r.time?.split(':') || [];
      const seconds = timeParts.length === 2 ? (parseFloat(timeParts[0]) * 60 + parseFloat(timeParts[1])) : parseFloat(timeParts[0] || 9999);
      
      if (!lifetimeBestMap[r.event] || seconds < lifetimeBestMap[r.event]) {
        if (isWithinPeriod) seasonPBs++;
        lifetimeBestMap[r.event] = seconds;
      }
    });

    const statsObj = {
      velocity,
      trainingPct: rel.percentage,
      volumePct: rel.volumePct,
      totalActualHours: rel.totalHours,
      annualTargetHours: rel.annualTarget,
      weeksMet: rel.weeksMet,
      totalWeeks: rel.totalWeeks,
      meetsMet: uniqueMeets >= adjTarget,
      targetMeets: adjTarget,
      meetsAttended: uniqueMeets,
      totalRaces: yearResults.length,
      avgWA: Math.round(yearResults.reduce((a,r)=>a+(r.wa_pts||0),0)/(yearResults.length || 1)),
      recentAvg,
      peakWA: yearResults.length ? Math.max(...yearResults.map(r => r.wa_pts || 0)) : 0,
      seasonPBs,
      strokeData,
      age
    };

    return {
      rollingMeets: uniqueMeets, rollingTarget: adjTarget, progressPercent: adjTarget > 0 ? (uniqueMeets / adjTarget) * 100 : 100,
      rollingPeak: yearResults.length ? Math.max(...yearResults.map(r => r.wa_pts || 0)) : 0,
      rollingAvg: yearResults.length ? Math.round(yearResults.reduce((a,r)=>a+(r.wa_pts||0),0)/yearResults.length) : 0,
      workloadChartData: chartData, attendancePct: rel.percentage, seasonVolumePct: rel.volumePct,
      totalActualHours: Math.round(rel.totalHours), annualTargetHours: rel.annualTarget,
      seasonPBs,
      isCompliant: uniqueMeets >= adjTarget && (rel.percentage >= (squad?.target_training_percent || 75) || rel.volumePct >= (squad?.target_training_percent || 75)),
      velocity, 
      filteredMeets: results.filter(r => {
        const monthMatch = selectedMonth === 'All' || new Date(r.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) === selectedMonth;
        const strokeMatch = selectedStroke === 'All' || r.event?.toLowerCase().includes(selectedStroke.toLowerCase());
        return monthMatch && strokeMatch;
      }).sort((a,b)=>new Date(b.date)-new Date(a.date)),
      statsObj
    };
  }, [results, swimmer, squad, attendance, sessions, periodWeeks, selectedMonth, selectedStroke, router.query.period]);

  const strokeChartData = useMemo(() => {
    if (!statsObj?.strokeData) return [];
    return Object.entries(statsObj.strokeData).map(([name, d]) => ({
      name,
      Peak: Math.round(d.peak),
      Average: Math.round(d.avg),
      Target: getKentBenchmark(statsObj.age, swimmer?.gender, name)
    }));
  }, [statsObj, swimmer]);

  useEffect(() => {
    if (attendancePct !== undefined && statsObj) {
      const hStats = {
         complianceRate: progressPercent,
         avgVelocity: velocity,
         avgTraining: attendancePct,
         avgVolume: seasonVolumePct
      };
      setHealthData(calculateSquadHealth(hStats, squad || {}));
      setNarrative(generateSwimmerNarrative(statsObj, swimmer));
    }
  }, [attendancePct, statsObj, squad, progressPercent, velocity, seasonVolumePct]);

  if (loading) return <Layout session={session}><div style={{ marginTop: 100, textAlign: 'center', opacity: 0.5 }}>Loading Athlete Profile...</div></Layout>;
  if (!swimmer) return <Layout session={session}><div>Athlete not found.</div></Layout>;

  return (
    <Layout session={session}>
      <Head>
        <title>{swimmer.full_name} | Athlete Profile</title>
        <style>{`
          @media print {
            .no-print, button, nav, .profile-header { display: none !important; }
            .print-only { display: block !important; }
            body { 
               background: white !important; 
               color: #111 !important; 
               padding: 0 !important; 
               -webkit-print-color-adjust: exact !important; 
               print-color-adjust: exact !important; 
            }
            .glass-card { 
               border: 1px solid #eee !important; 
               background: white !important; 
               box-shadow: none !important; 
               color: black !important; 
               page-break-inside: avoid; 
               padding: 2.5rem !important;
               margin-bottom: 2rem !important;
               border-radius: 12px !important;
            }
            .kpi-label, .section-title, h1, h2, h3 { 
               color: #000 !important; 
               font-weight: 900 !important; 
               text-transform: uppercase !important;
               letter-spacing: 0.05em !important;
            }
            
            div, span, p { color: #333 !important; }
            
            /* Chart Adjustments */
            .recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line { stroke: #e0e0e0 !important; }
            .recharts-line-curve { stroke: #1a56db !important; stroke-width: 3px !important; }
            .recharts-line-dot { display: none !important; }
            .recharts-reference-line-line { stroke: #000 !important; stroke-width: 2px !important; }
            .recharts-text { fill: #000 !important; font-weight: 900 !important; }
            .recharts-cartesian-axis-tick-value { fill: #444 !important; font-size: 10px !important; }
            .recharts-label { fill: #000 !important; font-weight: 900 !important; font-size: 12px !important; }
            
            /* Roadmap Specifics - Professional Print Palette */
            .roadmap-bar { 
               background: #1a56db !important; 
               border: none !important;
               -webkit-print-color-adjust: exact !important;
            }
            .roadmap-track { 
               background: #f8fafc !important; 
               border: 1px solid #e2e8f0 !important; 
               height: 12px !important;
               -webkit-print-color-adjust: exact !important;
            }
            .roadmap-avg { 
               background: #000 !important; 
               width: 2px !important;
               z-index: 20 !important;
            }
            .roadmap-target { 
               border-left: 2px solid #64748b !important; 
               z-index: 25 !important;
            }
            .roadmap-regional { 
               border-left: 2px solid #1a56db !important; 
               z-index: 25 !important;
            }
            .roadmap-label { 
               color: #1a56db !important; 
               font-size: 0.8rem !important;
               text-decoration: none !important;
            }
          }
        `}</style>
      </Head>
      
      <div className="profile-header flex justify-between items-center mb-12 no-print">
        <div>
          <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3.5rem', marginBottom: 8 }}>{swimmer.full_name}</h1>
          <div className="swimmer-meta">
            <span className="meta-item">{squad?.name}</span>
            <span className="meta-item">•</span>
            <span className="meta-item">SE ID: {swimmer.member_id}</span>
            {isCompliant && <span className="status-badge success" style={{ marginLeft: 8 }}>COMPLIANT</span>}
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <button 
            onClick={() => setIsBenchmarkOpen(true)}
            style={{ 
              background: 'rgba(0, 212, 255, 0.1)', 
              color: 'var(--accent-cyan)', 
              border: '1px solid rgba(0, 212, 255, 0.3)', 
              padding: '10px 20px', 
              borderRadius: '12px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            WA STANDARDS CHART
          </button>
          <button 
            onClick={() => window.print()}
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              color: 'var(--accent-cyan)', 
              border: '1px solid var(--accent-cyan)', 
              padding: '10px 20px', 
              borderRadius: '12px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            PRINT PERFORMANCE REPORT
          </button>
          <PremiumOrb value={healthData.total} label="Personal Health Score" size={130} />
        </div>
      </div>

      <div className="print-only" style={{ display: 'none', textAlign: 'center', marginBottom: 40 }}>
         <h1 style={{ fontSize: '2.5rem', marginBottom: 8 }}>PERFORMANCE REVIEW REPORT</h1>
         <h2 style={{ fontSize: '1.5rem', color: '#666' }}>{swimmer.full_name} - {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
         <p style={{ fontSize: '0.9rem', color: '#999' }}>Generated via Tonbridge Swimming Analytics Engine</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }} className="mb-16">
        <div className="glass-card" style={{ gridColumn: 'span 1', borderLeft: '4px solid var(--accent-cyan)', padding: '2rem 2.5rem' }}>
          <div className="section-title" style={{ fontSize: '0.75rem', marginBottom: 24, fontWeight: 900, letterSpacing: '0.2em', opacity: 0.9, color: 'var(--accent-cyan)' }}>PERSONAL PERFORMANCE STORY</div>
          <div style={{ display: 'grid', gap: '1rem' }}>
             {narrative.map((item, idx) => {
               const colors = {
                 success: { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', text: '#10b981' },
                 warning: { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', text: '#f59e0b' },
                 danger: { bg: 'rgba(244, 63, 94, 0.1)', border: '#f43f5e', text: '#f43f5e' },
                 info: { bg: 'rgba(14, 165, 233, 0.1)', border: '#0ea5e9', text: '#0ea5e9' }
               };
               const c = colors[item.type] || colors.info;
               const isStroke = item.category === 'strokes';
               
               return (
                 <div key={idx} style={{ 
                   display: 'flex', 
                   gap: '1.25rem', 
                   alignItems: 'center', 
                   padding: '1rem 1.5rem', 
                   paddingLeft: isStroke ? '3.5rem' : '1.5rem',
                   background: c.bg, 
                   borderRadius: '12px', 
                   borderLeft: `4px solid ${c.border}`,
                   transition: 'transform 0.2s',
                   opacity: isStroke ? 0.9 : 1
                 }}>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: 900, 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.1em', 
                      width: isStroke ? '60px' : '80px', 
                      color: c.text,
                      opacity: 0.8
                    }}>{item.category}</div>
                    <p style={{ 
                      fontSize: isStroke ? '0.95rem' : '1rem', 
                      fontWeight: 500, 
                      lineHeight: 1.5, 
                      color: 'rgba(255,255,255,0.9)', 
                      margin: 0,
                      flex: 1
                    }}>{item.text}</p>
                 </div>
               );
             })}
          </div>
        </div>
        <div className="glass-card" style={{ gridColumn: 'span 1', padding: '2rem' }}>
          <div className="flex justify-between items-start mb-6">
            <div className="kpi-label">Squad Compliance Fact-Sheet</div>
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: statsObj.volumePct >= 75 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: statsObj.volumePct >= 75 ? '#10b981' : '#f43f5e', fontSize: '0.6rem', fontWeight: 900 }}>
              {statsObj.volumePct >= 75 ? 'STABLE VOLUME' : 'VOLUME DEFICIT'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
             <div className="flex flex-col items-center p-4 rounded-2xl bg-white/[0.02] border border-white/5">
               <PremiumOrb value={statsObj.trainingPct} label="Weekly Consistency" size={80} />
               <div style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: 8, fontWeight: 900, textAlign: 'center' }}>{squad?.target_sessions_per_week} Sessions / {squad?.target_hours_per_week}h Target</div>
             </div>
             <div className="flex flex-col items-center p-4 rounded-2xl bg-white/[0.02] border border-white/5">
               <PremiumOrb value={statsObj.volumePct} label="Volume Compliance" size={80} />
               <div style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: 8, fontWeight: 900, textAlign: 'center' }}>{Math.round(totalActualHours)}h of {annualTargetHours}h Banked</div>
             </div>
             <div className="flex flex-col items-center p-4 rounded-2xl bg-white/[0.02] border border-white/5">
               <PremiumOrb value={Math.round(progressPercent)} label="Meet Engagement" size={80} />
               <div style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: 8, fontWeight: 900, textAlign: 'center' }}>{statsObj.meetsAttended} of {statsObj.targetMeets} Meets</div>
             </div>
             <div className="flex flex-col items-center p-4 rounded-2xl bg-white/[0.02] border border-white/5">
               <PremiumOrb value={isCompliant ? 100 : 0} customValue={isCompliant ? 'MET' : 'GAP'} label="Squad Status" size={80} />
               <div style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: 8, fontWeight: 900, textAlign: 'center' }}>{isCompliant ? 'All Criteria Met' : 'Action Required'}</div>
             </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
             <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>TOTAL HOURS</div>
                <div className="text-xl font-black">{Math.round(totalActualHours)} <span className="text-[10px] opacity-30">/ {annualTargetHours}</span></div>
             </div>
             <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>HOUR GAP</div>
                <div className="text-xl font-black text-rose-500">-{Math.round(Math.max(0, annualTargetHours - totalActualHours))}</div>
             </div>
             <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>MISSED SESSIONS</div>
                <div className="text-xl font-black text-amber-500">~{Math.round(Math.max(0, annualTargetHours - totalActualHours) / 1.5)}</div>
             </div>
             <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>STATUS</div>
                <div className="text-xs font-black leading-tight" style={{ color: statsObj.volumePct >= 75 ? '#10b981' : '#f43f5e' }}>
                   {statsObj.volumePct >= 75 ? 'DEVELOPING CEILING' : 'AEROBIC LIMITATION'}
                </div>
             </div>
          </div>

          <p className="mt-6 text-[10px] opacity-30 leading-relaxed italic">
            Note: For competitive swimmers, training volume directly dictates the aerobic threshold. A deficit in hours translates to faster physiological fatigue during multi-event championship meets.
          </p>
          <div className="mt-8 pt-6 border-t border-white/5">
             <div className="flex justify-between items-center mb-6">
                <div className="kpi-label">Meet Engagement Summary</div>
                <div style={{ padding: '4px 10px', borderRadius: '20px', background: statsObj.meetsMet ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: statsObj.meetsMet ? '#10b981' : '#f43f5e', fontSize: '0.6rem', fontWeight: 900 }}>
                   {statsObj.meetsMet ? 'CRITERIA MET' : 'ENGAGEMENT GAP'}
                </div>
             </div>
             
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                   <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>OPEN MEETS</div>
                   <div className="text-xl font-black">{statsObj.meetsAttended} <span className="text-[10px] opacity-30">/ {statsObj.targetMeets}</span></div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                   <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>TOTAL RACES</div>
                   <div className="text-xl font-black">{statsObj.totalRaces}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                   <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>CONVERSION</div>
                   <div className="text-xl font-black">{Math.round((statsObj.totalRaces / (statsObj.meetsAttended || 1)) * 10) / 10} <span className="text-[10px] opacity-30">R/M</span></div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                   <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>PB RATE</div>
                   <div className="text-xl font-black" style={{ color: 'var(--accent-cyan)' }}>{Math.round((statsObj.seasonPBs / (statsObj.totalRaces || 1)) * 100)}%</div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }} className="mb-16">
        <div className="glass-card" style={{ padding: '2rem', minHeight: '400px' }}>
           <div className="flex justify-between items-center mb-6">
             <div>
                <div className="kpi-label">Points Progression Trend</div>
                <div style={{ fontSize: '0.6rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>
                  {selectedStroke === 'All' 
                    ? 'Global Average: Benchmarks are averaged across all strokes and distances.' 
                    : `Discipline Average: Benchmarks are averaged across all distances for ${selectedStroke}.`}
                </div>
             </div>
             <div className="flex gap-2 no-print">
                {['All', 'Fly', 'Back', 'Breast', 'Free', 'IM'].map(s => (
                  <button 
                    key={s} 
                    onClick={() => setSelectedStroke(s)}
                    style={{ 
                      fontSize: '0.6rem', 
                      padding: '6px 12px', 
                      borderRadius: '8px', 
                      background: selectedStroke === s ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
                      color: selectedStroke === s ? '#000' : 'var(--text-dim)',
                      fontWeight: 900,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {s}
                  </button>
                ))}
             </div>
           </div>
           <div style={{ height: 350 }}>
             <ResponsiveContainer width="100%" height="100%">
                <LineChart data={results.filter(r => selectedStroke === 'All' || r.event?.toLowerCase().includes(selectedStroke.toLowerCase())).map(r=>({ date: new Date(r.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}), wa_pts: r.wa_pts }))}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--glass-border)', borderRadius: '12px' }} />
                  
                  {/* Championship Reference Lines */}
                  <ReferenceLine 
                    y={getCategoryBenchmark(statsObj.age, swimmer?.gender, selectedStroke === 'All' ? '' : selectedStroke, 'COUNTY')} 
                    stroke="rgba(255,255,255,0.4)" 
                    strokeDasharray="3 3" 
                    label={{ 
                      value: selectedStroke === 'All' ? 'COUNTY GLOBAL AVG' : 'COUNTY AVG', 
                      fill: 'rgba(255,255,255,0.5)', 
                      fontSize: 10, 
                      position: 'insideBottomLeft',
                      fontWeight: 900
                    }} 
                  />
                  <ReferenceLine 
                    y={getCategoryBenchmark(statsObj.age, swimmer?.gender, selectedStroke === 'All' ? '' : selectedStroke, 'REGIONAL')} 
                    stroke="var(--accent-cyan)" 
                    strokeDasharray="3 3" 
                    label={{ 
                      value: selectedStroke === 'All' ? 'REGIONAL GLOBAL AVG' : 'REGIONAL AVG', 
                      fill: 'var(--accent-cyan)', 
                      fontSize: 10, 
                      position: 'insideTopLeft', 
                      opacity: 0.8,
                      fontWeight: 900
                    }} 
                  />
                  
                  <Line type="monotone" dataKey="wa_pts" stroke="var(--accent-cyan)" strokeWidth={3} dot={{ fill: 'var(--accent-cyan)', r: 4 }} />
                </LineChart>
             </ResponsiveContainer>
           </div>
        </div>
        
        <div className="glass-card" style={{ padding: '2.5rem' }}>
           <div className="flex justify-between items-center mb-2">
             <div className="kpi-label">Stroke Performance Roadmap</div>
             <button 
               onClick={() => setIsBenchmarkOpen(true)}
               style={{ 
                 fontSize: '0.65rem', 
                 color: 'var(--accent-cyan)', 
                 background: 'none', 
                 border: 'none', 
                 textDecoration: 'underline', 
                 cursor: 'pointer',
                 fontWeight: 800
               }}
             >
               VIEW WA POINTS CHART
             </button>
           </div>
           <div style={{ marginBottom: 32, height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>
           
           <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
              {Object.entries(statsObj.strokeData)
                .filter(([_, d]) => d.count > 0)
                .map(([name, d]) => {
                  const county = getCategoryBenchmark(statsObj.age, swimmer?.gender, name, 'COUNTY');
                  const regional = getCategoryBenchmark(statsObj.age, swimmer?.gender, name, 'REGIONAL');
                  const peak = Math.round(d.peak);
                  const avg = Math.round(d.avg);
                  
                  // Scaling: max points for the bar is 600
                  const scale = (val) => Math.min((val / 600) * 100, 100);
                  
                  return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      {/* Label Section */}
                      <div style={{ width: '120px', flexShrink: 0 }}>
                         <div className="roadmap-label" style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '2px' }}>{name}</div>
                         <div style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.4 }}>P: {peak} | A: {avg}</div>
                      </div>

                      {/* Bar Section */}
                      <div style={{ flex: 1, position: 'relative', paddingTop: '16px', paddingBottom: '24px' }}>
                        {/* Background Track */}
                        <div className="roadmap-track" style={{ height: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                          {/* Peak Bar */}
                          <div 
                            className="roadmap-bar"
                            style={{ 
                              width: `${scale(peak)}%`, 
                              height: '100%', 
                              background: 'linear-gradient(90deg, #00d4ff, #0082ff)', 
                              boxShadow: '0 0 15px rgba(0,212,255,0.3)',
                              borderRadius: '0 4px 4px 0',
                              transition: 'width 1s ease-out'
                            }} 
                          />
                          
                          {/* Average Marker */}
                          <div 
                            className="roadmap-avg"
                            style={{ 
                              position: 'absolute',
                              left: `${scale(avg)}%`,
                              top: 0,
                              bottom: 0,
                              width: '2px',
                              background: 'rgba(255,255,255,0.8)',
                              zIndex: 10
                            }}
                          />
                        </div>

                        {/* Target Markers (Absolute overlay) */}
                        <div 
                           className="roadmap-target"
                           style={{ 
                             position: 'absolute', 
                             left: `${scale(county)}%`, 
                             top: 0, 
                             bottom: 0, 
                             width: '2px', 
                             background: 'rgba(255,255,255,0.15)', 
                             borderLeft: '1px dashed rgba(255,255,255,0.4)',
                             zIndex: 5
                           }}
                        >
                           <div style={{ position: 'absolute', top: '-14px', left: '-20px', width: '40px', textAlign: 'center', fontSize: '7px', opacity: 0.5, fontWeight: 900 }}>COUNTY</div>
                        </div>

                        <div 
                           className="roadmap-regional"
                           style={{ 
                             position: 'absolute', 
                             left: `${scale(regional)}%`, 
                             top: 0, 
                             bottom: 0, 
                             width: '2px', 
                             background: 'rgba(245, 158, 11, 0.2)', 
                             borderLeft: '1px dashed rgba(245, 158, 11, 0.5)',
                             zIndex: 5
                           }}
                        >
                           <div style={{ position: 'absolute', bottom: '-14px', left: '-20px', width: '40px', textAlign: 'center', fontSize: '7px', color: '#f59e0b', opacity: 0.7, fontWeight: 900 }}>REGIONAL</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
           </div>

           <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center', gap: '40px', fontSize: '9px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 900 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '16px', height: '4px', background: 'linear-gradient(90deg, #00d4ff, #0082ff)' }}></div> Peak Performance</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '4px', height: '12px', background: 'rgba(255,255,255,0.8)' }}></div> Season Average</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '1px', height: '12px', borderLeft: '1px dashed rgba(255,255,255,0.4)' }}></div> County AQT</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '1px', height: '12px', borderLeft: '1px dashed rgba(245, 158, 11, 0.5)' }}></div> Regional Auto</div>
           </div>
        </div>
      </div>

      <details className="glass-card mb-16 no-print" style={{ border: 'none', padding: 0, overflow: 'hidden' }}>
        <summary style={{ 
          padding: '2rem', 
          cursor: 'pointer', 
          listStyle: 'none', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          fontWeight: 800,
          color: 'var(--accent-cyan)',
          letterSpacing: '0.05em'
        }}>
           <span>RACING RESULTS LOG</span>
           <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>CLICK TO EXPAND/COLLAPSE</span>
        </summary>
        <div style={{ padding: '0 2rem 2rem 2rem' }}>
          <div className="flex justify-between items-center mb-8">
            <div className="flex gap-4">
              <select 
                value={selectedStroke} 
                onChange={(e) => setSelectedStroke(e.target.value)}
                className="glass-input"
                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
              >
                {['All', 'Fly', 'Back', 'Breast', 'Free', 'IM'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Meet</th>
                  <th style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Event</th>
                  <th style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Time</th>
                  <th style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase' }}>WA</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeets.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>{new Date(r.date).toLocaleDateString('en-GB')}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.meets?.name}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{r.event}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--accent-cyan)' }}>{r.time}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>{r.wa_pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <BenchmarkModal isOpen={isBenchmarkOpen} onClose={() => setIsBenchmarkOpen(false)} />
    </Layout>
  );
}
