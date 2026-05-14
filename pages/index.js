import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { calculateReliability, calculateSquadHealth } from '../lib/analytics-utils';
import Head from 'next/head';
import PremiumOrb from '../components/PremiumOrb';
import SquadIntelligenceCard from '../components/SquadIntelligenceCard';
import ChatBot from '../components/ChatBot';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar, BarChart, Line, Legend, ReferenceLine, ReferenceArea } from 'recharts';

function SquadCard({ squad, periodDays }) {
  const router = useRouter();
  const isCritical = squad.overall < 50;
  const needsAttention = squad.overall >= 50 && squad.overall < 75;
  const statusClass = isCritical ? 'critical' : needsAttention ? 'attention' : 'success';

  return (
    <div 
      className="glass-card squad-card animate-fade-in"
      onClick={() => router.push(`/squad/${squad.id}?period=${periodDays}`)}
    >
      <div className="squad-header">
        <div className="squad-info">
          <h3>{squad.name}</h3>
          <div className="squad-count">{squad.count} swimmers</div>
        </div>
        <div className={`status-badge ${statusClass}`} style={{ fontSize: '0.85rem', fontWeight: 900 }}>
          {squad.overall}% HEALTH
        </div>
      </div>
      
      <div className="orb-layout" style={{ marginTop: '1.5rem' }}>
        <PremiumOrb value={squad.meets} label="Meets" size={68} />
        <PremiumOrb value={squad.training} label="Attendance" size={68} />
        <PremiumOrb value={squad.volume} label="Volume" size={68} />
        <PremiumOrb value={squad.avgPts} label="Avg WA" size={68} color="amber" unit="" />
        <PremiumOrb 
          value={squad.velocity} 
          label="Velocity" 
          size={68} 
          icon="⚡" 
          customValue={`${squad.velocity > 0 ? '+' : ''}${squad.velocity}`}
        />
      </div>

      <button className="btn-view-squad">View Squad Analytics →</button>
    </div>
  );
}

export default function Dashboard({ session }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ swimmers: [], squads: [], results: [], attendance: [], sessions: [], meets: [], pbs: [], exemptions: [], memberships: [] });
  const [search, setSearch] = useState('');
  const [periodDays, setPeriodDays] = useState(365);
  
  const PERIOD_OPTIONS = [
    { label: '90 Days', days: 90 },
    { label: '6 Months', days: 180 },
    { label: '12 Months', days: 365 },
  ];

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.push('/login');
      return;
    }
    fetchAll();
  }, [session, router]);

  const fetchPaged = async (table, select = '*', filter = null) => {
    if (!supabase) {
      console.warn(`Supabase not initialized. Skipping fetch for ${table}`);
      return [];
    }
    let all = []; let page = 0; let more = true;
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

  const fetchAll = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const y1ago = new Date(now - 450 * 86400000).toISOString().split('T')[0];
      const [swimmers, squads, results, attendance, sessions, meets, pbs, exemptions, memberships] = await Promise.all([
        fetchPaged('swimmers', '*, squads(id,name,target_meets,target_sessions_per_week,target_training_percent,target_hours_per_week,require_weekend,use_or_logic)', q => q.order('full_name')),
        fetchPaged('squads', '*', q => q.eq('is_squad', true).order('name')),
        fetchPaged('results', '*', q => q.gte('date', y1ago).order('date', { ascending: false })),
        fetchPaged('training_attendance', '*', q => q.gte('date', y1ago).order('date', { ascending: false })),
        fetchPaged('sessions', '*', q => q.order('id')),
        fetchPaged('meets', '*', q => q.order('date', { ascending: false })),
        fetchPaged('swimmer_pbs', 'id,date', q => q.gte('date', y1ago).order('date', { ascending: false })),
        fetchPaged('club_exemptions', '*'),
        fetch('/api/memberships').then(r => r.json()).catch(() => [])
      ]);
      setData({ swimmers, squads, results, attendance, sessions, meets, pbs: pbs || [], exemptions, memberships: memberships || [] });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const { squadKPIs, clubShutdowns, stats, filteredSwimmers, clubTrend, strokeData, ageData } = useMemo(() => {
    const { swimmers, squads, results, attendance, sessions, pbs, exemptions, memberships } = data;
    const now = new Date();
    const periodStart = new Date(now - periodDays * 86400000);
    const halfPeriod  = Math.floor(periodDays / 2);
    const velRecentStart = new Date(now - halfPeriod * 86400000);
    const velPriorStart  = new Date(now - periodDays * 86400000);

    const periodResults = results.filter(r => new Date(r.date) >= periodStart);
    const periodPbs = pbs.filter(p => new Date(p.date) >= periodStart);

    // OPTIMIZATION: Pre-index data for fast lookups
    const attendanceBySwimmer = {};
    attendance.forEach(a => {
      if (!attendanceBySwimmer[a.swimmer_id]) attendanceBySwimmer[a.swimmer_id] = [];
      attendanceBySwimmer[a.swimmer_id].push(a);
    });

    const resultsBySwimmer = {};
    periodResults.forEach(r => {
      if (!resultsBySwimmer[r.swimmer_id]) resultsBySwimmer[r.swimmer_id] = [];
      resultsBySwimmer[r.swimmer_id].push(r);
    });

    const fullResultsBySwimmer = {};
    results.forEach(r => {
      if (!fullResultsBySwimmer[r.swimmer_id]) fullResultsBySwimmer[r.swimmer_id] = [];
      fullResultsBySwimmer[r.swimmer_id].push(r);
    });

    const totalPBs = periodPbs.length;
    const uniqueMeets = new Set(periodResults.map(r => r.meet_id)).size;

    const monthMap = {};
    periodResults.forEach(r => {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      if (!monthMap[key]) monthMap[key] = { label, pts: [], key };
      if (r.wa_pts) monthMap[key].pts.push(Number(r.wa_pts));
    });
    const clubTrend = Object.values(monthMap)
      .sort((a,b) => a.key.localeCompare(b.key))
      .map(m => ({ label: m.label, avg: m.pts.length ? Math.round(m.pts.reduce((a,b)=>a+b,0)/m.pts.length) : 0, count: m.pts.length }));

    const n = clubTrend.length;
    if (n > 1) {
      let sx = 0, sy = 0, sxy = 0, sx2 = 0;
      clubTrend.forEach((d, i) => { sx += i; sy += d.avg; sxy += i * d.avg; sx2 += i * i; });
      const slope = (n * sx2 - sx * sx) !== 0 ? (n * sxy - sx * sy) / (n * sx2 - sx * sx) : 0;
      const intercept = (sy - slope * sx) / n;
      clubTrend.forEach((d, i) => { d.trend = Math.round(slope * i + intercept); });
    }

    // Process club-wide shutdowns for ReferenceArea
    const clubShutdowns = (exemptions || [])
      .filter(ex => !ex.squad_id)
      .map(ex => {
        // Map dates to the labels in clubTrend
        const start = new Date(ex.start_date);
        const end = new Date(ex.end_date);
        const startLabel = start.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
        const endLabel = end.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
        return { start: startLabel, end: endLabel, name: ex.name, type: ex.type };
      });

    const clubStrokes = {};
    periodResults.forEach(r => {
      let stroke = 'Other';
      const evt = r.event?.toLowerCase() || '';
      if (evt.includes('fly')) stroke = 'Butterfly';
      else if (evt.includes('back')) stroke = 'Backstroke';
      else if (evt.includes('breast')) stroke = 'Breaststroke';
      else if (evt.includes('free')) stroke = 'Freestyle';
      else if (evt.includes('medley') || evt.includes('im')) stroke = 'Individual Medley';
      
      if (!clubStrokes[stroke]) clubStrokes[stroke] = { pts: [], count: 0 };
      if (r.wa_pts) { clubStrokes[stroke].pts.push(r.wa_pts); clubStrokes[stroke].count++; }
    });
    const strokeData = {};
    Object.entries(clubStrokes).forEach(([k, v]) => {
      strokeData[k] = { avg: v.pts.reduce((a,b)=>a+b,0) / v.count, peak: Math.max(...v.pts), count: v.count };
    });

    const squadKPIs = squads.map(sq => {
      const sqSwimmers = swimmers.filter(s => s.squad_id === sq.id && s.is_active !== false);
      if (!sqSwimmers.length) return null;

      let totalConsistency = 0, totalVolume = 0, totalMeets = 0;
      sqSwimmers.forEach(sw => {
        const swAtt = attendanceBySwimmer[sw.id] || [];
        const swRes = resultsBySwimmer[sw.id] || [];
        const swWithSquad = { ...sw, squads: sq };
        const swMemberships = (memberships || []).filter(m => m.swimmer_id === sw.id);
        const rel = calculateReliability(swWithSquad, swAtt, sessions, swRes, periodDays, exemptions, swMemberships);

        totalConsistency += rel.percentage;
        totalVolume += rel.volumePct;
        totalMeets += rel.complianceRate;
      });

      const num = sqSwimmers.length;
      const avg = arr => arr.length ? arr.reduce((a, b) => a + Number(b), 0) / arr.length : 0;
      const swimmerVelocities = sqSwimmers.filter(s => !s.is_exempt).map(sw => {
        const swRes = fullResultsBySwimmer[sw.id] || [];
        const recentPts = swRes.filter(r => new Date(r.date) >= velRecentStart).map(r => r.wa_pts || 0);
        const priorPts  = swRes.filter(r => new Date(r.date) >= velPriorStart && new Date(r.date) < velRecentStart).map(r => r.wa_pts || 0);
        if (!recentPts.length && !priorPts.length) return null;
        return avg(recentPts) - avg(priorPts);
      }).filter(v => v !== null);

      const velocity = swimmerVelocities.length ? Math.round(swimmerVelocities.reduce((a,b) => a + b, 0) / swimmerVelocities.length) : 0;

      const squadStats = {
        avgVelocity: velocity,
        avgConsistency: Math.round(totalConsistency / num),
        avgVolume: Math.round(totalVolume / num),
        complianceRate: Math.round(totalMeets / num),
        athletes: num
      };

      const health = calculateSquadHealth(squadStats, sq);

      return { 
        id: sq.id, 
        name: sq.name, 
        count: num, 
        overall: health.total,
        meets: squadStats.complianceRate, 
        training: squadStats.avgConsistency, 
        volume: squadStats.avgVolume,
        velocity,
        avgPts: Math.round(avg(sqSwimmers.map(s => {
          const swRes = fullResultsBySwimmer[s.id] || [];
          return swRes.length ? Math.max(...swRes.map(r => r.wa_pts || 0)) : 0;
        })))
      };
    }).filter(Boolean);

    const filteredSwimmers = search.trim() ? swimmers.filter(s => s.full_name?.toLowerCase().includes(search.toLowerCase())) : [];
    const unassignedCount = swimmers.filter(s => s.is_active !== false && !squadKPIs.some(sq => sq?.id === s.squad_id)).length;

    // Age-based Performance for Club
    const agePerformanceMap = {};
    results.forEach(r => {
      const swm = swimmers.find(sw => sw.id === r.swimmer_id);
      if (!swm || (!swm.year_of_birth && !swm.date_of_birth)) return;
      
      let calcAge;
      if (swm.date_of_birth) {
        const dob = new Date(swm.date_of_birth);
        calcAge = now.getFullYear() - dob.getFullYear();
        const mDiff = now.getMonth() - dob.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) calcAge--;
      } else {
        calcAge = now.getFullYear() - swm.year_of_birth;
      }
      
      if (calcAge >= 8 && calcAge <= 22) {
        if (!agePerformanceMap[calcAge]) agePerformanceMap[calcAge] = { male: [], female: [] };
        if (r.wa_pts) {
          if (swm.gender === 'M' || swm.gender === 'Male') agePerformanceMap[calcAge].male.push(Number(r.wa_pts));
          else agePerformanceMap[calcAge].female.push(Number(r.wa_pts));
        }
      }
    });

    const ageData = Object.keys(agePerformanceMap)
      .map(ageStr => Number(ageStr))
      .sort((a, b) => a - b)
      .map(ageNum => {
        const group = agePerformanceMap[ageNum];
        return {
          age: `${ageNum}yrs`,
          male: group.male.length ? Math.round(group.male.reduce((a, b) => a + b, 0) / group.male.length) : 0,
          female: group.female.length ? Math.round(group.female.reduce((a, b) => a + b, 0) / group.female.length) : 0
        };
      });

    return { 
      squadKPIs, 
      clubShutdowns,
      stats: {
        athletes: swimmers.filter(s => s.is_active !== false).length, 
        unassigned: unassignedCount,
        pbs: totalPBs, 
        meets: uniqueMeets,
        avgAge: Math.round(swimmers.filter(s => s.is_active !== false && (s.year_of_birth || s.date_of_birth)).reduce((acc, sw) => {
          let calcAge;
          if (sw.date_of_birth) {
            const dob = new Date(sw.date_of_birth);
            calcAge = now.getFullYear() - dob.getFullYear();
            const mDiff = now.getMonth() - dob.getMonth();
            if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) calcAge--;
          } else {
            calcAge = now.getFullYear() - sw.year_of_birth;
          }
          return acc + calcAge;
        }, 0) / (swimmers.filter(s => s.is_active !== false && (s.year_of_birth || s.date_of_birth)).length || 1)),
        avgConsistency: Math.round(squadKPIs.reduce((a,b) => a + (b?.training || 0), 0) / (squadKPIs.length || 1)),
        avgVolume: Math.round(squadKPIs.reduce((a,b) => a + (b?.volume || 0), 0) / (squadKPIs.length || 1)),
        complianceRate: Math.round(squadKPIs.reduce((a,b) => a + (b?.meets || 0), 0) / (squadKPIs.length || 1)),
        avgVelocity: Math.round(squadKPIs.reduce((a,b) => a + (b?.velocity || 0), 0) / (squadKPIs.length || 1)),
        peakStandard: Math.round(swimmers.filter(s => s.is_active !== false).reduce((acc, s) => {
          const swRes = fullResultsBySwimmer[s.id] || [];
          const peak = swRes.length ? Math.max(...swRes.map(r => r.wa_pts || 0)) : 0;
          return acc + peak;
        }, 0) / (swimmers.filter(s => s.is_active !== false).length || 1))
      }, 
      filteredSwimmers, 
      clubTrend,
      strokeData,
      ageData
    };
  }, [data, search, periodDays]);

  return (
    <Layout session={session}>
      <Head>
        <title>Dashboard | CoachesEye</title>
        <style>{`
          @media print {
            .no-print, button, nav, .profile-header, .period-selector, .search-container { display: none !important; }
            .print-only { display: block !important; }
            body { background: white !important; color: #111 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .glass-card { border: 1px solid #eee !important; background: white !important; box-shadow: none !important; color: black !important; page-break-inside: avoid; padding: 2.5rem !important; margin-bottom: 2rem !important; border-radius: 12px !important; }
            .kpi-label, .section-title, h1, h2, h3 { color: #000 !important; font-weight: 900 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
            div, span, p { color: #333 !important; }
            .recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line { stroke: #f0f0f0 !important; }
            .recharts-line-curve { stroke: #1a56db !important; stroke-width: 2px !important; }
            .recharts-text { fill: #000 !important; font-weight: 900 !important; }
          }
          .kpi-label-mini {
            font-size: 0.6rem;
            font-weight: 900;
            opacity: 0.3;
            letter-spacing: 0.15em;
            margin-bottom: 4px;
          }
        `}</style>
      </Head>

      <div className="profile-header no-print" style={{ marginBottom: '4rem', paddingBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-4 mb-2">
            <div style={{ width: 4, height: 40, background: 'var(--accent-cyan)', borderRadius: 2 }}></div>
            <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3.8rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>Club Dashboard</h1>
          </div>
          <div className="swimmer-meta" style={{ paddingLeft: 18 }}>
            <span className="meta-item" style={{ opacity: 0.6 }}>Tonbridge Swimming Club</span>
            <span className="meta-item" style={{ opacity: 0.3 }}>•</span>
            <span className="meta-item" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>2025/26 Season Performance Analytics</span>
          </div>
        </div>
        <div className="flex gap-6 items-center">
           <div className="period-selector-premium">
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.days} className={`period-btn-premium ${periodDays === opt.days ? 'active' : ''}`} onClick={() => setPeriodDays(opt.days)}>
                  {opt.label}
                </button>
              ))}
           </div>
        </div>
      </div>

      <div className="glass-card mb-12" style={{ padding: '2.5rem 1.5rem' }}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 w-full max-w-6xl mx-auto">
          <div className="flex flex-col items-center gap-3">
            <PremiumOrb value={stats.complianceRate} label="" size={85} />
            <div className="kpi-label-mini text-center opacity-40">MEET ATTENDANCE</div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <PremiumOrb value={stats.avgConsistency} label="" size={85} />
            <div className="kpi-label-mini text-center opacity-40">ATTENDANCE<br/>CONSISTENCY</div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <PremiumOrb value={stats.avgVolume} label="" size={85} />
            <div className="kpi-label-mini text-center opacity-40">VOLUME</div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <PremiumOrb value={stats.peakStandard} label="" size={85} color="amber" unit="" />
            <div className="kpi-label-mini text-center opacity-40">AVG WA PTS</div>
          </div>
          <div className="flex flex-col items-center gap-3 col-span-2 md:col-span-1">
            <PremiumOrb 
              value={stats.avgVelocity} 
              label="" 
              size={85} 
              icon="⚡" 
              customValue={`${stats.avgVelocity > 0 ? '+' : ''}${stats.avgVelocity}`}
            />
            <div className="kpi-label-mini text-center opacity-40">VELOCITY</div>
          </div>
        </div>
      </div>

      <div className="mb-16">
        <SquadIntelligenceCard 
          type="club"
          squadName="Tonbridge Swimming Club"
          stats={stats}
          strokeData={strokeData}
          trend={clubTrend}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-16">
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div className="flex justify-between items-start mb-6">
             <div>
                <div className="kpi-label">Club-Wide Performance Trend</div>
                <p style={{ fontSize: '0.65rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>Note: Benchmarks reflect global Senior standards (Age 17).</p>
             </div>
             <div style={{ textAlign: 'right' }}>
                <div className="kpi-label" style={{ fontSize: '0.5rem', opacity: 0.3 }}>LATEST CLUB AVG</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{clubTrend[clubTrend.length-1]?.avg || 0} <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>PTS</span></div>
             </div>
          </div>
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={clubTrend}>
                <defs>
                  <linearGradient id="clubGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--glass-border)', borderRadius: '12px' }} />
                <ReferenceLine y={380} stroke="rgba(255,255,255,0.6)" strokeDasharray="4 4" label={{ value: 'KENT COUNTY AQT', fill: 'rgba(255,255,255,1)', fontSize: 11, position: 'top', fontWeight: 900 }} />
                <ReferenceLine y={520} stroke="var(--accent-cyan)" strokeOpacity={0.9} strokeDasharray="4 4" label={{ value: 'REGIONALS', fill: 'var(--accent-cyan)', fontSize: 11, position: 'top', fontWeight: 900 }} />
                <ReferenceLine y={650} stroke="var(--accent-amber)" strokeOpacity={0.8} strokeDasharray="2 2" label={{ value: 'NATIONALS', fill: 'var(--accent-amber)', fontSize: 11, position: 'top', fontWeight: 900 }} />
                
                {clubShutdowns.map((sh, idx) => (
                  <ReferenceArea 
                    key={idx} 
                    x1={sh.start} 
                    x2={sh.end} 
                    fill={sh.type === 'credit' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)'} 
                    strokeOpacity={0.3}
                    label={{ value: sh.name, position: 'top', fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 900 }}
                  />
                ))}
                <Area type="monotone" dataKey="avg" stroke="var(--accent-cyan)" strokeWidth={4} fill="url(#clubGrad)" />
                <Line type="monotone" dataKey="trend" stroke="var(--accent-amber)" strokeWidth={2} dot={false} strokeDasharray="6 6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          <div className="flex justify-between items-start mb-6">
             <div>
                <div className="kpi-label">Club Performance by Age</div>
                <p style={{ fontSize: '0.65rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>Average World Aquatics points across LTAD age bands.</p>
             </div>
          </div>
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageData}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="age" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--glass-border)', borderRadius: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                <Bar dataKey="female" name="Female" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="male" name="Male" fill="var(--accent-amber)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-1 gap-8 mb-16">
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div className="kpi-label mb-8">Athlete Quick Search</div>
          <div className="relative search-container">
             <div className="search-input-wrapper">
                <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input className="search-input" placeholder="Search athletes..." value={search} onChange={e => setSearch(e.target.value)} />
             </div>
             {search && filteredSwimmers.length > 0 && (
               <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-deep)', border: '1px solid var(--glass-border)', borderRadius: '12px', marginTop: 8, zIndex: 100, maxHeight: 300, overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                 {filteredSwimmers.slice(0, 10).map(s => (
                   <Link key={s.id} href={`/swimmer/${s.id}`}>
                     <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.2s' }} className="hover:bg-white/5">
                        <div style={{ fontWeight: 700 }}>{s.full_name}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)' }}>{s.squads?.name}</div>
                     </div>
                   </Link>
                 ))}
               </div>
             )}
          </div>
          <div className="mt-12">
             <div className="kpi-label mb-4" style={{ fontSize: '0.55rem', opacity: 0.5 }}>CLUB SNAPSHOT</div>
             <div className="grid grid-cols-2 gap-8">
                <div className="flex justify-between items-center">
                   <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Active Swimmers</span>
                   <span style={{ fontWeight: 900 }}>{stats.athletes}</span>
                </div>
                <div className="flex justify-between items-center">
                   <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Total Meets Tracked</span>
                   <span style={{ fontWeight: 900 }}>{stats.meets}</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="section-title mb-8">Squad Compliance Overview</div>
      <div className="squad-grid mb-16">
        {squadKPIs.map(sq => <SquadCard key={sq.id} squad={sq} periodDays={periodDays} />)}
      </div>

      <ChatBot 
        clubDNA={{
          type: 'club',
          metadata: { squad_name: 'Club Overview' },
          stats,
          squads: squadKPIs,
          stroke_data: strokeData,
          trends: clubTrend
        }}
      />
    </Layout>
  );
}
