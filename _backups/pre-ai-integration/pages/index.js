import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { calculateReliability } from '../lib/analytics-utils';
import Head from 'next/head';
import PremiumOrb from '../components/PremiumOrb';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar, Line, Legend, ReferenceLine } from 'recharts';


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
      
      <div className="orb-layout" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
        <PremiumOrb value={squad.meets} label="Meets" size={75} />
        <PremiumOrb value={squad.training} label="Training" size={75} />
        <PremiumOrb 
          value={squad.velocity} 
          label="Velocity" 
          size={75} 
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
  const [data, setData] = useState({ swimmers: [], squads: [], results: [], attendance: [], sessions: [], meets: [], pbs: [] });
  const [search, setSearch] = useState('');
  const [periodDays, setPeriodDays] = useState(365);
  
  const PERIOD_OPTIONS = [
    { label: '90 Days', days: 90 },
    { label: '6 Months', days: 180 },
    { label: '12 Months', days: 365 },
  ];

  useEffect(() => { fetchAll(); }, []);

  const fetchPaged = async (table, select = '*', filter = null) => {
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
      const [swimmers, squads, results, attendance, sessions, meets, pbs] = await Promise.all([
        fetchPaged('swimmers', '*, squads(id,name,target_meets,target_sessions_per_week,target_training_percent,target_hours_per_week,require_weekend,use_or_logic)', q => q.order('full_name')),
        fetchPaged('squads', '*', q => q.eq('is_squad', true).order('name')),
        fetchPaged('results', '*', q => q.gte('date', y1ago).order('date', { ascending: false })),
        fetchPaged('training_attendance', '*', q => q.gte('date', y1ago).order('date', { ascending: false })),
        fetchPaged('sessions', '*', q => q.order('id')),
        fetchPaged('meets', '*', q => q.order('date', { ascending: false })),
        fetchPaged('swimmer_pbs', 'id,date', q => q.gte('date', y1ago).order('date', { ascending: false })),
      ]);
      setData({ swimmers, squads, results, attendance, sessions, meets, pbs: pbs || [] });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const { squadKPIs, stats, filteredSwimmers, clubTrend } = useMemo(() => {
    const { swimmers, squads, results, attendance, sessions, pbs } = data;
    const now = new Date();
    const periodStart = new Date(now - periodDays * 86400000);
    const halfPeriod  = Math.floor(periodDays / 2);
    const velRecentStart = new Date(now - halfPeriod * 86400000);
    const velPriorStart  = new Date(now - periodDays * 86400000);

    const periodResults = results.filter(r => new Date(r.date) >= periodStart);
    const periodPbs = pbs.filter(p => new Date(p.date) >= periodStart);

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
      const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
      const intercept = (sy - slope * sx) / n;
      clubTrend.forEach((d, i) => { d.trend = Math.round(slope * i + intercept); });
    }

    const squadKPIs = squads.map(sq => {
      const sqSwimmers = swimmers.filter(s => s.squad_id === sq.id && s.is_active !== false);
      if (!sqSwimmers.length) return null;

      let overallMet = 0, meetsMet = 0, reliabilityMet = 0;
      const trainPct = sq.target_training_percent || 75;

      sqSwimmers.forEach(sw => {
        const swAtt = attendance.filter(a => a.swimmer_id === sw.id);
        const swRes = periodResults.filter(r => r.swimmer_id === sw.id);
        const swWithSquad = { ...sw, squads: sq };
        const rel = calculateReliability(swWithSquad, swAtt, sessions, swRes, periodDays);

        const uniqueSwMeets = new Set(swRes.map(r => r.meet_id)).size;
        const adjTarget = Math.ceil((sq.target_meets || 0) * Math.min(1, periodDays / 365));
        const isMeetsMet = uniqueSwMeets >= adjTarget;
        const effectiveVolPct = rel.annualTarget > 0 ? rel.volumePct : rel.percentage;
        const isRelMet = rel.percentage >= trainPct || effectiveVolPct >= trainPct;
        if (isMeetsMet) meetsMet++;
        if (isRelMet) reliabilityMet++;
        if (isMeetsMet && isRelMet) overallMet++;
      });

      const num = sqSwimmers.length;
      const avg = arr => arr.length ? arr.reduce((a, b) => a + Number(b), 0) / arr.length : 0;
      const swimmerVelocities = sqSwimmers.filter(s => !s.is_exempt).map(sw => {
        const swRes = results.filter(r => r.swimmer_id === sw.id);
        const recentPts = swRes.filter(r => new Date(r.date) >= velRecentStart).map(r => r.wa_pts || 0);
        const priorPts  = swRes.filter(r => new Date(r.date) >= velPriorStart && new Date(r.date) < velRecentStart).map(r => r.wa_pts || 0);
        if (!recentPts.length && !priorPts.length) return null;
        return avg(recentPts) - avg(priorPts);
      }).filter(v => v !== null);

      const velocity = swimmerVelocities.length ? Math.round(swimmerVelocities.reduce((a,b) => a + b, 0) / swimmerVelocities.length) : 0;

      return { 
        id: sq.id, 
        name: sq.name, 
        count: num, 
        overall: Math.round((overallMet / num) * 100), 
        meets: Math.round((meetsMet / num) * 100), 
        training: Math.round((reliabilityMet / num) * 100), 
        velocity 
      };
    }).filter(Boolean);

    const filteredSwimmers = search.trim() ? swimmers.filter(s => s.full_name?.toLowerCase().includes(search.toLowerCase())) : [];

    return { 
      squadKPIs, 
      stats: { athletes: swimmers.filter(s => s.is_active !== false).length, pbs: totalPBs, meets: uniqueMeets }, 
      filteredSwimmers, 
      clubTrend 
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
        `}</style>
      </Head>

      <div className="profile-header no-print" style={{ marginBottom: '3rem' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3.5rem', margin: 0, lineHeight: 1 }}>Club Dashboard</h1>
          <div className="swimmer-meta">
            <span className="meta-item">Season 2025/26 Analytics</span>
            <span className="meta-item">•</span>
            <span className="meta-item">Tonbridge Swimming Club</span>
          </div>
        </div>
        <div className="flex gap-4 items-center">
           <div className="period-selector">
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.days} className={`period-btn ${periodDays === opt.days ? 'active' : ''}`} onClick={() => setPeriodDays(opt.days)}>
                  {opt.label}
                </button>
              ))}
           </div>
        </div>
      </div>

      {/* Global Fact Sheet */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
         <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.4, marginBottom: 8, letterSpacing: '0.1em' }}>TOTAL ATHLETES</div>
            <div className="flex items-end gap-3">
               <div className="text-4xl font-black">{stats.athletes}</div>
               <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.4, paddingBottom: 4 }}>REGISTERED</div>
            </div>
         </div>
         <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-emerald)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.4, marginBottom: 8, letterSpacing: '0.1em' }}>PERFORMANCE BREAKTHROUGHS</div>
            <div className="flex items-end gap-3">
               <div className="text-4xl font-black">{stats.pbs}</div>
               <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-emerald)', paddingBottom: 4 }}>LIFETIME PBs</div>
            </div>
         </div>
         <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.4, marginBottom: 8, letterSpacing: '0.1em' }}>COMPETITION ENGAGEMENT</div>
            <div className="flex items-end gap-3">
               <div className="text-4xl font-black">{stats.meets}</div>
               <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.4, paddingBottom: 4 }}>UNIQUE MEETS</div>
            </div>
         </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 mb-16">
        <div className="glass-card lg:col-span-2" style={{ padding: '2rem' }}>
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
                
                <ReferenceLine y={400} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" label={{ value: 'COUNTY BASELINE', fill: 'rgba(255,255,255,0.3)', fontSize: 10, position: 'insideBottomLeft', fontWeight: 900 }} />
                <ReferenceLine y={550} stroke="var(--accent-cyan)" strokeDasharray="3 3" label={{ value: 'REGIONAL BASELINE', fill: 'var(--accent-cyan)', fontSize: 10, position: 'insideTopLeft', opacity: 0.6, fontWeight: 900 }} />
                
                <Area type="monotone" dataKey="avg" stroke="var(--accent-cyan)" strokeWidth={3} fill="url(#clubGrad)" />
                <Line type="monotone" dataKey="trend" stroke="var(--accent-amber)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

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
             <div className="space-y-4">
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
    </Layout>
  );
}
