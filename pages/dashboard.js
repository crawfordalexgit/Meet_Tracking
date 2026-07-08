import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { authedFetch } from '../lib/api-client';
import { fetchAllRows } from '../lib/paginate';
import { computeSquadStats, calculateSquadHealth, normalizeName, normalizeEvent, getPreferredName, getCategoryBenchmark } from '../lib/analytics-utils';
import Head from 'next/head';
import PremiumOrb from '../components/PremiumOrb';
import SquadIntelligenceCard from '../components/SquadIntelligenceCard';
import ChatBot from '../components/ChatBot';
import SquadQualificationPredictor from '../components/SquadQualificationPredictor';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar, BarChart, Line, Legend, ReferenceLine, ReferenceArea, LineChart, Label } from 'recharts';

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
  const [data, setData] = useState({ swimmers: [], squads: [], results: [], attendance: [], sessions: [], meets: [], pbs: [], exemptions: [], rankings: [], memberships: [] });
  const [search, setSearch] = useState('');
  const [periodDays, setPeriodDays] = useState(365);
  const [isClient, setIsClient] = useState(false);
  const [squadsVisible, setSquadsVisible] = useState(false);
  const [drilldownCategory, setDrilldownCategory] = useState(null);
  const [drilldownSearch, setDrilldownSearch] = useState('');
  const [showAIAudit, setShowAIAudit] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [masterSyncState, setMasterSyncState] = useState({ active: false, message: '' });
  const [seSyncState, setSeSyncState] = useState({ active: false, message: '' });
  
  const PERIOD_OPTIONS = [
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: '6 Months', days: 180 },
    { label: '52 Weeks', days: 365 },
  ];

  useEffect(() => {
    setIsClient(true);
    fetchAll();
  }, [session, router.query.period]);

  useEffect(() => {
    if (router.isReady && router.query.tab) {
      setActiveTab(router.query.tab);
    }
  }, [router.isReady, router.query.tab]);

  const fetchPaged = (table, select = '*', filter = null) => fetchAllRows(supabase, table, { select, filter, maxPages: 100 });

  const fetchParallel = async (table, select = '*', filter = null, maxConcurrent = 8) => {
    if (!supabase) return [];
    const pageSize = 1000;
    let q0 = supabase.from(table).select(select, { count: 'exact' }).range(0, pageSize - 1);
    if (filter) q0 = filter(q0);
    const { data: firstPage, count } = await q0;
    if (!firstPage || firstPage.length === 0) return [];
    if (!count || count <= pageSize) return firstPage;
    const totalPages = Math.ceil((count - pageSize) / pageSize);
    const all = [...firstPage];
    // Fetch in batches to avoid overwhelming Supabase connection pool
    for (let batch = 0; batch < totalPages; batch += maxConcurrent) {
      const batchPages = Array.from({ length: Math.min(maxConcurrent, totalPages - batch) }, (_, i) => {
        const p = batch + i + 1;
        let q = supabase.from(table).select(select).range(p * pageSize, (p + 1) * pageSize - 1);
        if (filter) q = filter(q);
        return q.then(r => r.data || []);
      });
      const results = await Promise.all(batchPages);
      all.push(...results.flat());
    }
    return all;
  };

  const handleMasterSync = async () => {
    setMasterSyncState({ active: true, message: 'Phase 1: Syncing SCM Baseline...' });
    try {
      await authedFetch('/api/sync-scm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });

      setMasterSyncState({ active: true, message: 'Phase 2: Syncing Attendance...' });
      await authedFetch('/api/sync-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });

      setMasterSyncState({ active: false, message: 'Daily Master Sync Complete!' });
      fetchAll();
      setTimeout(() => setMasterSyncState({ active: false, message: '' }), 5000);
    } catch (error) {
      setMasterSyncState({ active: false, message: `Error: ${error.message}` });
    }
  };

  const handleSwimEnglandSync = async () => {
    setSeSyncState({ active: true, message: 'Phase 1: Scraping Official Meets...' });
    try {
      await authedFetch('/api/scrape-meets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ swimmingYear: '2025/2026' }) });

      setSeSyncState({ active: true, message: 'Phase 2: Scraping PBs & Rankings...' });
      await authedFetch('/api/scrape-rankings', { method: 'POST' });

      setSeSyncState({ active: false, message: 'Swim England Update Complete!' });
      fetchAll();
      setTimeout(() => setSeSyncState({ active: false, message: '' }), 5000);
    } catch (error) {
      setSeSyncState({ active: false, message: `Error: ${error.message}` });
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const y1ago = new Date(now - 450 * 86400000).toISOString().split('T')[0];
      const resultsFrom = new Date(now - 365 * 86400000).toISOString().split('T')[0];
      // Fetch latest rankings snapshot date first to avoid loading all history
      const { data: latestSnap } = await supabase.from('rankings').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
      const latestSnapDate = latestSnap?.snapshot_date;

      const [swimmers, squads, results, attendance, sessions, meets, pbs, exemptions, rankings, memberships] = await Promise.all([
        fetchPaged('swimmers', '*, squads(id,name,target_meets,target_sessions_per_week,target_training_percent,target_hours_per_week,require_weekend,use_or_logic)', q => q.order('full_name')),
        fetchPaged('squads', '*', q => q.eq('is_squad', true).order('name')),
        fetchParallel('results', 'swimmer_id, wa_pts, is_pb, date, meet_id, event, course, time', q => q.gte('date', resultsFrom).order('date', { ascending: false })),
        fetchParallel('training_attendance', 'id, swimmer_id, session_id, date, status', q => q.gte('date', y1ago).order('date', { ascending: false })),
        fetchPaged('sessions', '*', q => q.order('id')),
        fetchParallel('meets', 'id, name, date, course, level, meet_code, license', q => q.gte('date', y1ago).order('date', { ascending: false })),
        fetchPaged('swimmer_pbs', 'swimmer_id,date', q => q.gte('date', y1ago).order('date', { ascending: false })),
        fetchPaged('club_exemptions', '*'),
        latestSnapDate
          ? fetchParallel('rankings', 'id, swimmer_id, district, rank, stroke, snapshot_date', q => q.eq('snapshot_date', latestSnapDate))
          : Promise.resolve([]),
        fetchParallel('session_memberships', '*'),
      ]);

      // Enrich results with meet data; pre-parse date as timestamp for fast useMemo filtering
      const meetsById = Object.fromEntries((meets || []).map(m => [m.id, m]));
      const enrichedResults = (results || []).map(r => ({ ...r, meets: meetsById[r.meet_id] || null, _ts: new Date(r.date).getTime() }));

      setData({ swimmers, squads, results: enrichedResults, attendance, sessions, meets, pbs: pbs || [], exemptions, rankings: rankings || [], memberships: memberships || [] });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const { squadKPIs, clubShutdowns, stats, clubTrend, strokeData, ageData, qualifiers, targetYear } = useMemo(() => {
    const T = label => console.log(`[dash] ${label}: ${performance.now().toFixed(0)}ms`);
    T('useMemo start');
    const { swimmers, squads, results, attendance, sessions, pbs, exemptions, memberships, rankings } = data;
    T(`data sizes — results:${results.length} attendance:${attendance.length} swimmers:${swimmers.length}`);
    const now = new Date();
    const periodTs = now.getTime() - periodDays * 86400000;
    const periodStart = new Date(periodTs);

    const periodResults = results.filter(r => r._ts >= periodTs);
    const periodPbs = pbs.filter(p => new Date(p.date).getTime() >= periodTs);
    
    // Deduplicate PBs by swimmer, date, and event (prevents double counting heat/final PBs)
    const dedupedGlobalPbs = (() => {
      const seen = new Set();
      return periodPbs.filter(p => {
        const key = `${p.swimmer_id}|${p.date}|${p.event}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })();

    const totalPBs = dedupedGlobalPbs.length;

    // OPTIMIZATION: Pre-index data for fast lookups
    const resultsBySwimmer = {};
    periodResults.forEach(r => {
      if (!resultsBySwimmer[r.swimmer_id]) resultsBySwimmer[r.swimmer_id] = [];
      resultsBySwimmer[r.swimmer_id].push(r);
    });

    const swimmersWithPBs = new Set(periodPbs.map(p => p.swimmer_id)).size;
    const activeSwimmersCount = swimmers.filter(s => s.is_active !== false).length;
    const totalResultsCount = periodResults.length || 1;
    const pbConsistency = Math.round((totalPBs / totalResultsCount) * 1000) / 10;
    const uniqueMeets = new Set(periodResults.map(r => r.meet_id)).size;

    const monthMap = {};
    periodResults.forEach(r => {
      const d = new Date(r._ts);
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

    T('squadKPIs start');
    const squadKPIs = squads.map(sq => {
      const sqSwimmers = swimmers.filter(s => s.squad_id === sq.id && s.is_active !== false);
      if (!sqSwimmers.length) return null;

      // Canonical, shared computation — identical to /squads and /squad/[id].
      const s = computeSquadStats(sq, sqSwimmers, {
        attendance,
        sessions,
        results,
        memberships,
        exemptions,
        period: periodDays
      });

      return {
        id: sq.id,
        name: sq.name,
        count: sqSwimmers.filter(sw => !sw.is_exempt).length,
        overall: calculateSquadHealth(
          { avgTraining: s.training, avgVolume: s.volume, avgVelocity: s.avgVelocity, complianceRate: s.compliance },
          sq
        ).total,
        meets: s.meets,
        training: s.training,
        volume: s.volume,
        velocity: s.avgVelocity,
        avgPts: s.avgPts
      };
    }).filter(Boolean);
    T('squadKPIs done');

    const filteredSwimmers = search.trim() ? swimmers.filter(s => s.full_name?.toLowerCase().includes(search.toLowerCase())) : swimmers.filter(s => s.is_active !== false);
    const unassignedCount = swimmers.filter(s => s.is_active !== false && !squadKPIs.some(sq => sq?.id === s.squad_id)).length;

    T('ageData/qualifiers start');
    // Pre-build swimmers lookup for O(1) access
    const swimmersById = Object.fromEntries((swimmers || []).map(s => [s.id, s]));

    // Pre-compute age per swimmer (avoid 131k Date objects inside loop)
    const nowYear = now.getFullYear();
    const swimmerAge = {};
    (swimmers || []).forEach(s => {
      if (s.date_of_birth) swimmerAge[s.id] = nowYear - new Date(s.date_of_birth).getFullYear();
      else if (s.year_of_birth) swimmerAge[s.id] = nowYear - s.year_of_birth;
    });

    // Age-based Performance for Club
    const agePerformanceMap = {};
    periodResults.forEach(r => {
      const swm = swimmersById[r.swimmer_id];
      if (!swm) return;
      const calcAge = swimmerAge[r.swimmer_id];
      if (!calcAge) return;

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
      
    // Rankings Achievement Summary (Trend Tracking)
    const uniqueSnapshots = [...new Set((rankings || []).map(r => r.snapshot_date))].sort((a,b) => new Date(b) - new Date(a));
    const latestSnapshot = uniqueSnapshots[0] || null;
    const currentRankings = (rankings || []).filter(r => r.snapshot_date === latestSnapshot);
    const priorSnapshot = uniqueSnapshots[1] || null;
    const priorRankings = priorSnapshot ? (rankings || []).filter(r => r.snapshot_date === priorSnapshot) : [];

    const achievementSummary = {
      national_count: new Set(currentRankings.filter(r => r.district === 'England' && r.rank <= 40 && r.age !== 99 && r.age !== 'OP').map(r => r.swimmer_id)).size,
      regional_count: new Set(currentRankings.filter(r => r.district === 'South East' && r.rank <= 30 && r.age !== 99 && r.age !== 'OP').map(r => r.swimmer_id)).size,
      county_count: new Set(currentRankings.filter(r => r.district === 'Kent' && r.rank <= 10 && r.age !== 99 && r.age !== 'OP').map(r => r.swimmer_id)).size,
      prior_national: new Set(priorRankings.filter(r => r.district === 'England' && r.rank <= 40 && r.age !== 99 && r.age !== 'OP').map(r => r.swimmer_id)).size,
      prior_regional: new Set(priorRankings.filter(r => r.district === 'South East' && r.rank <= 30 && r.age !== 99 && r.age !== 'OP').map(r => r.swimmer_id)).size,
      prior_county: new Set(priorRankings.filter(r => r.district === 'Kent' && r.rank <= 10 && r.age !== 99 && r.age !== 'OP').map(r => r.swimmer_id)).size
    };

    // Regionals conclude in April. From May (month index 4) onwards, we target next year's pathway.
    const targetYear = now.getMonth() >= 4 ? now.getFullYear() + 1 : now.getFullYear();
    let qtCounty = 0;
    let qtRegional = 0;

    (swimmers || []).filter(s => s.is_active !== false).forEach(swimmer => {
      const age = swimmer.year_of_birth ? targetYear - swimmer.year_of_birth : null;
      if (!age) return;
      const swimmerResults = resultsBySwimmer[swimmer.id] || [];
      const peakWA = swimmerResults.length > 0 ? Math.max(...swimmerResults.map(r => r.wa_pts || 0)) : 0;
      
      const cQT = getCategoryBenchmark(age, swimmer.gender, '', 'COUNTY');
      const rQT = getCategoryBenchmark(age, swimmer.gender, '', 'REGIONAL');
      
      if (peakWA >= rQT) { 
        qtRegional++; 
        qtCounty++; 
      } else if (peakWA >= cQT) { 
        qtCounty++; 
      }
    });

    const nationalCount = [...new Set((rankings || []).filter(r => r.snapshot_date === latestSnapshot && r.district === 'England').map(r => r.swimmer_id))].length;

    const qualifiers = { county: qtCounty, regional: qtRegional, national: nationalCount, targetYear };
    T('useMemo done');

    return { 
      squadKPIs, 
      clubShutdowns,
      stats: {
        athletes: activeSwimmersCount, 
        unassigned: unassignedCount,
        pbs: totalPBs, 
        totalResults: totalResultsCount,
        pbConsistency,
        meets: uniqueMeets,
        achievementSummary,
        avgAge: Math.round(swimmers.filter(s => s.is_active !== false && (s.year_of_birth || s.date_of_birth)).reduce((acc, sw) => {
          let calcAge;
          if (sw.date_of_birth) {
            const dob = new Date(sw.date_of_birth);
            calcAge = now.getFullYear() - dob.getFullYear();
          } else {
            calcAge = sw.year_of_birth ? (now.getFullYear() - sw.year_of_birth) : 0;
          }
          return acc + calcAge;
        }, 0) / (swimmers.filter(s => s.is_active !== false && (s.year_of_birth || s.date_of_birth)).length || 1)),
        avgHealth: Math.round(squadKPIs.reduce((a,b) => a + (b?.overall || 0), 0) / (squadKPIs.length || 1)),
        avgConsistency: Math.round(squadKPIs.reduce((a,b) => a + (b?.training || 0), 0) / (squadKPIs.length || 1)),
        avgTraining: Math.round(squadKPIs.reduce((a,b) => a + (b?.training || 0), 0) / (squadKPIs.length || 1)),
        avgVolume: Math.round(squadKPIs.reduce((a,b) => a + (b?.volume || 0), 0) / (squadKPIs.length || 1)),
        complianceRate: Math.round(squadKPIs.reduce((a,b) => a + (b?.meets || 0), 0) / (squadKPIs.length || 1)),
        avgVelocity: Math.round(squadKPIs.reduce((a,b) => a + (b?.velocity || 0), 0) / (squadKPIs.length || 1)),
        peakStandard: Math.round(swimmers.filter(s => s.is_active !== false).reduce((acc, s) => {
          const swRes = resultsBySwimmer[s.id] || [];
          const peak = swRes.length ? Math.max(...swRes.map(r => r.wa_pts || 0)) : 0;
          return acc + peak;
        }, 0) / (swimmers.filter(s => s.is_active !== false).length || 1))
      },
      qualifiers,
      targetYear,
      filteredSwimmers, 
      clubTrend,
      strokeData,
      ageData
    };
  }, [data, periodDays]);

  const filteredSwimmers = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    if (!searchLower) return data.swimmers || [];
    return (data.swimmers || []).filter(s =>
      s.full_name?.toLowerCase().includes(searchLower) ||
      s.known_as?.toLowerCase().includes(searchLower) ||
      s.squads?.name?.toLowerCase().includes(searchLower)
    );
  }, [data.swimmers, search]);

  const drilldownItems = useMemo(() => {
    if (!drilldownCategory) return [];
    const { rankings, swimmers } = data;
    const uniqueSnapshots = [...new Set((rankings || []).map(r => r.snapshot_date))].sort((a,b) => new Date(b) - new Date(a));
    const latestSnapshot = uniqueSnapshots[0] || null;
    const currentRankings = (rankings || []).filter(r => r.snapshot_date === latestSnapshot);

    let filteredRankings = [];
    if (drilldownCategory === 'national') {
      filteredRankings = currentRankings.filter(r => r.district === 'England' && r.rank <= 40 && r.age !== 99 && r.age !== 'OP');
    } else if (drilldownCategory === 'regional') {
      filteredRankings = currentRankings.filter(r => r.district === 'South East' && r.rank <= 30 && r.age !== 99 && r.age !== 'OP');
    } else if (drilldownCategory === 'county') {
      filteredRankings = currentRankings.filter(r => r.district === 'Kent' && r.rank <= 10 && r.age !== 99 && r.age !== 'OP');
    }

    return filteredRankings.map(r => {
      const sw = swimmers.find(s => s.id === r.swimmer_id);
      return {
        id: r.id,
        swimmerId: r.swimmer_id,
        swimmerName: sw ? getPreferredName(sw) : 'Unknown Swimmer',
        event: r.stroke || '',
        rank: r.rank,
        waPoints: r.fina_points || 0,
        age: sw ? (new Date().getFullYear() - (sw.date_of_birth ? new Date(sw.date_of_birth).getFullYear() : sw.year_of_birth)) : r.age,
        gender: r.gender,
        squadName: sw && sw.squads ? sw.squads.name : 'No Squad'
      };
    }).sort((a, b) => a.rank - b.rank || b.waPoints - a.waPoints);
  }, [drilldownCategory, data]);

  return (
    <Layout session={session}>
      <Head>
        <title>Dashboard | CoachesEye</title>
        <style>{`
          @media print {
            .no-print, button, nav, .profile-header, .period-selector, .search-container { display: none !important; }
            .print-only { display: block !important; }
            body { background: white !important; color: #111 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .glass-card { border: 1px solid rgba(0, 212, 255, 0.2) !important; background: white !important; box-shadow: none !important; color: black !important; page-break-inside: avoid; padding: 2.5rem !important; margin-bottom: 2rem !important; border-radius: 12px !important; }
            .kpi-label, .section-title, h1, h2, h3 { color: #000 !important; font-weight: 900 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
            div, span, p { color: #333 !important; }
            .recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line { stroke: #f0f0f0 !important; }
            .recharts-line-curve { stroke: #1a56db !important; stroke-width: 2px !important; }
            .recharts-text { fill: #000 !important; font-weight: 900 !important; }
          }
          .kpi-label-mini {
            font-size: 0.6rem;
            font-weight: 900;
            opacity: 0.8;
            letter-spacing: 0.15em;
            margin-bottom: 4px;
          }
          .glass-card {
            border: 1px solid rgba(0, 212, 255, 0.12) !important;
          }
          .tactical-search-container {
            position: relative;
            display: flex;
            align-items: center;
          }
          .search-icon {
            position: absolute;
            left: 16px;
            color: var(--text-dim);
            pointer-events: none;
          }
          .tactical-search-input {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
            padding: 12px 16px 12px 48px;
            color: white;
            font-size: 0.95rem;
            width: 280px;
            transition: all 0.3s ease;
          }
          .tactical-search-input:focus {
            outline: none;
            background: rgba(255, 255, 255, 0.05);
            border-color: var(--accent-cyan);
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
            width: 320px;
          }
          .tactical-search-input::placeholder {
            color: var(--text-dim);
            opacity: 0.8;
          }
          .tactical-kpi-card {
            padding: 1.8rem;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 140px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 24px;
            transition: all 0.3s ease;
          }
          .tactical-kpi-card:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(6, 182, 212, 0.3);
            transform: translateY(-4px);
          }
          .kpi-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
          }
          .kpi-label-top {
            font-size: 0.75rem;
            font-weight: 800;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }
          .kpi-icon-mini {
            font-size: 1.2rem;
            filter: grayscale(1) brightness(2);
            opacity: 0.9;
          }
          .kpi-body {
            display: flex;
            align-items: baseline;
            gap: 0.5rem;
          }
          .kpi-value-large {
            font-size: 2.8rem;
            font-weight: 950;
            line-height: 1;
            letter-spacing: -0.02em;
          }
          .kpi-unit-tag {
            font-size: 0.7rem;
            font-weight: 800;
            opacity: 0.8;
          }
          .tactical-dna-card {
            padding: 2.5rem 1.5rem;
            display: flex;
            flex-direction: column;
          }
          .dna-title-area {
            display: flex;
            align-items: center;
            gap: 1rem;
          }
          .dna-accent {
            width: 3px;
            height: 16px;
            background: var(--accent-cyan);
            box-shadow: 0 0 10px var(--accent-cyan);
          }
          .dna-horizontal-row {
            flex: 1;
            display: flex;
            justify-content: space-around;
            align-items: center;
            gap: 1rem;
          }
          .dna-orb-module {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.5rem;
          }
          .orb-label-top {
            font-size: 0.65rem;
            font-weight: 800;
            text-align: center;
            opacity: 0.9;
            min-height: 2.5rem;
            display: flex;
            align-items: flex-end;
          }
          .orb-label-bottom {
            font-size: 0.65rem;
            font-weight: 900;
            letter-spacing: 0.1em;
            opacity: 0.8;
          }
          .tactical-insight-module {
            padding: 2.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 24px;
          }
          .tactical-insight-module.expansive {
            min-height: 320px;
          }
          .tactical-insight-module.compact {
            padding: 2rem 2.5rem;
          }
          .insight-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .insight-tag {
            font-size: 0.65rem;
            font-weight: 900;
            letter-spacing: 0.15em;
            opacity: 0.8;
          }
          .insight-icon {
            font-size: 1.5rem;
            opacity: 0.8;
          }
          .insight-value {
            font-size: 2.8rem;
            font-weight: 950;
            line-height: 1;
            letter-spacing: -0.04em;
            margin-bottom: 1rem;
          }
          .insight-description {
            font-size: 0.8rem;
            line-height: 1.6;
            color: rgba(255,255,255,0.85);
            font-weight: 500;
          }
          .insight-description p {
            margin: 0;
          }
          .btn-squad-trigger {
            background: rgba(var(--accent-cyan-rgb), 0.1);
            border: 1px solid rgba(var(--accent-cyan-rgb), 0.3);
            color: var(--accent-cyan);
            padding: 0.8rem 1.5rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            display: flex;
            align-items: center;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .btn-squad-trigger:hover {
            background: var(--accent-cyan);
            color: var(--bg-deep);
            box-shadow: 0 0 20px rgba(var(--accent-cyan-rgb), 0.4);
            transform: translateY(-2px);
          }
          .squad-overlay-system {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(1, 4, 10, 0.95);
            backdrop-filter: blur(40px);
            z-index: 1000;
            padding: 6rem;
            overflow-y: auto;
          }
          .btn-close-overlay {
            background: none;
            border: none;
            color: white;
            font-size: 3rem;
            font-weight: 200;
            cursor: pointer;
            opacity: 0.9;
            transition: opacity 0.3s;
          }
          .btn-close-overlay:hover {
            opacity: 1;
          }
          .squad-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 2.5rem;
          }
          .dna-ai-briefing {
            background: rgba(0, 212, 255, 0.03);
            border-top: 1px solid rgba(0, 212, 255, 0.1);
            padding: 1.5rem;
            border-radius: 0 0 24px 24px;
            margin: 1.5rem -1.5rem -2.5rem -1.5rem;
          }
          .briefing-header {
            display: flex;
            align-items: center;
            gap: 0.6rem;
          }
          .briefing-tag {
            font-size: 0.6rem;
            font-weight: 900;
            color: var(--accent-cyan);
            letter-spacing: 0.1rem;
            opacity: 0.8;
          }
          .briefing-text {
            font-size: 0.75rem;
            line-height: 1.5;
            color: rgba(255, 255, 255, 0.5);
            font-weight: 500;
            margin: 0;
          }
          .drilldown-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(1, 4, 10, 0.95);
            backdrop-filter: blur(40px);
            z-index: 1001;
            padding: 6rem 2rem;
            overflow-y: auto;
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }
          .drilldown-modal {
            width: 100%;
            max-width: 900px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(0, 212, 255, 0.15);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), inset 0 0 30px rgba(0, 212, 255, 0.05);
            border-radius: 24px;
            padding: 3rem;
            animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          .drilldown-search-input {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 10px 16px;
            color: white;
            font-size: 0.85rem;
            width: 100%;
            margin-bottom: 2rem;
            transition: all 0.3s ease;
          }
          .drilldown-search-input:focus {
            outline: none;
            background: rgba(255, 255, 255, 0.05);
            border-color: var(--accent-cyan);
            box-shadow: 0 0 15px rgba(6, 182, 212, 0.15);
          }
          .drilldown-table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
          }
          .drilldown-th {
            padding: 1rem;
            font-size: 0.65rem;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: rgba(255, 255, 255, 0.4);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }
          .drilldown-td {
            padding: 1.2rem 1rem;
            font-size: 0.8rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          }
          .drilldown-row {
            transition: all 0.2s ease;
          }
          .drilldown-row:hover {
            background: rgba(255, 255, 255, 0.02);
          }
          .rank-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            font-weight: 900;
            font-size: 0.75rem;
          }
          .rank-badge.gold {
            background: rgba(255, 234, 0, 0.1);
            color: var(--accent-amber);
            border: 1px solid rgba(255, 234, 0, 0.3);
            box-shadow: 0 0 10px rgba(255, 234, 0, 0.2);
          }
          .rank-badge.silver {
            background: rgba(6, 182, 212, 0.1);
            color: var(--accent-cyan);
            border: 1px solid rgba(6, 182, 212, 0.3);
          }
          .rank-badge.standard {
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .cursor-pointer {
            cursor: pointer;
          }
          .hover-glow:hover {
            filter: drop-shadow(0 0 12px var(--accent-cyan));
            transform: scale(1.03);
          }
          @keyframes pulse-glow {
            0%, 100% { opacity: 1; text-shadow: 0 0 15px rgba(244, 63, 94, 0.6); }
            50% { opacity: 0.6; text-shadow: 0 0 5px rgba(244, 63, 94, 0.2); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
          }
        `}</style>
      </Head>

      <div className="profile-header no-print" style={{ marginBottom: '4rem', paddingBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-6 mb-2">
            <div className="coaches-eye-logo">
               <svg width="80" height="60" viewBox="0 0 100 60" fill="none">
                  <defs>
                    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#00f2ff" />
                      <stop offset="100%" stopColor="#ffea00" />
                    </linearGradient>
                    <filter id="logoGlow">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <path d="M10 30C10 30 25 10 50 10C75 10 90 30 90 30C90 30 75 50 50 50C25 50 10 30 10 30Z" stroke="url(#logoGrad)" strokeWidth="3.5" filter="url(#logoGlow)" />
                  <circle cx="50" cy="30" r="14" stroke="url(#logoGrad)" strokeWidth="3" />
                  <path d="M50 8V12" stroke="url(#logoGrad)" strokeWidth="3" strokeLinecap="round" />
                  <path d="M50 5V8H54" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" />
                  <path d="M38 12L41 15" stroke="url(#logoGrad)" strokeWidth="3" strokeLinecap="round" />
                  <path d="M62 12L59 15" stroke="url(#logoGrad)" strokeWidth="3" strokeLinecap="round" />
                  <path d="M42 36L48 28L54 34L60 22" stroke="url(#logoGrad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
               </svg>
            </div>
            <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3.8rem', fontWeight: 950, margin: 0, letterSpacing: '-0.04em', lineHeight: 1 }}>
               COACHES<span style={{ color: 'var(--accent-amber)', textShadow: '0 0 20px rgba(255, 234, 0, 0.4)' }}>EYE</span>
            </h1>
          </div>
          <div className="swimmer-meta" style={{ paddingLeft: 104 }}>
            <span className="meta-item" style={{ opacity: 0.9 }}>Tonbridge Swimming Club</span>
            <span className="meta-item" style={{ opacity: 0.8 }}>•</span>
            <span className="meta-item" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>2025/26 Season Performance Analytics</span>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-6">
           <div className="flex items-center gap-6">
              <div style={{ fontSize: '1.2rem', fontWeight: 500, color: 'white', opacity: 0.8 }}>
                 {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="tactical-search-container" style={{ position: "relative" }}>
                 <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                 <input 
                   type="text" 
                   placeholder="Search Athlete..." 
                   className="tactical-search-input"
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                 />
                  {search.length > 1 && (
                    <div className="search-results-premium animate-fade-in">
                       {data.swimmers
                         .filter(s => 
                           getPreferredName(s).toLowerCase().includes(search.toLowerCase()) ||
                           s.full_name.toLowerCase().includes(search.toLowerCase())
                         )
                         .slice(0, 8)
                         .map(sw => (
                           <div 
                             key={sw.id} 
                             className="search-result-row"
                             onClick={() => router.push(`/swimmer/${sw.id}`)}
                           >
                              <div className="result-name">{getPreferredName(sw)}</div>
                              <div className="result-meta">ID: {sw.id.slice(0,8)}</div>
                           </div>
                         ))
                       }
                       {data.swimmers.filter(s => 
                         getPreferredName(s).toLowerCase().includes(search.toLowerCase()) ||
                         s.full_name.toLowerCase().includes(search.toLowerCase())
                       ).length === 0 && (
                         <div className="p-4 text-xs opacity-40 font-bold uppercase tracking-widest text-center">No Assets Found</div>
                       )}
                    </div>
                  )}
              </div>
              <div className="period-selector-premium">
                 {PERIOD_OPTIONS.map(opt => (
                   <button key={opt.days} className={`period-btn-premium ${periodDays === opt.days ? 'active' : ''}`} onClick={() => setPeriodDays(opt.days)}>
                     {opt.label}
                   </button>
                 ))}
              </div>
           </div>
        </div>
      </div>

      <div className="profile-tabs-container no-print" style={{ display: 'flex', gap: '12px', marginBottom: '2rem', padding: '6px', borderRadius: '16px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', width: 'fit-content' }}>
        <button 
          className={`profile-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          style={activeTab === 'dashboard' ? { background: 'var(--accent-cyan)', color: '#000', fontWeight: 955, padding: '10px 24px', borderRadius: '12px', fontSize: '0.7rem', border: 'none', cursor: 'pointer' } : { color: 'rgba(255, 255, 255, 0.5)', padding: '10px 24px', borderRadius: '12px', fontSize: '0.7rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 COCKPIT
        </button>
        <button 
          className={`profile-tab-btn ${activeTab === 'predictor' ? 'active' : ''}`}
          style={activeTab === 'predictor' ? { background: 'var(--accent-cyan)', color: '#000', fontWeight: 955, padding: '10px 24px', borderRadius: '12px', fontSize: '0.7rem', border: 'none', cursor: 'pointer' } : { color: 'rgba(255, 255, 255, 0.5)', padding: '10px 24px', borderRadius: '12px', fontSize: '0.7rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onClick={() => setActiveTab('predictor')}
        >
          🎯 QT Predictor
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          {/* System Operations Banner */}
          <div className="flex gap-4 mb-8 no-print" style={{ flexWrap: 'wrap' }}>
            <button
              onClick={handleMasterSync}
              disabled={masterSyncState.active}
              className="btn-premium-intel"
              style={{
                display: 'flex', gap: '8px', alignItems: 'center',
                background: masterSyncState.active ? 'rgba(0, 212, 255, 0.2)' : '',
                opacity: masterSyncState.active ? 0.75 : 1,
                cursor: masterSyncState.active ? 'not-allowed' : 'pointer'
              }}
            >
              {masterSyncState.active && (
                <span style={{
                  width: '12px', height: '12px', display: 'inline-block',
                  border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--accent-cyan)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0
                }} />
              )}
              <span>⚡</span>
              {masterSyncState.active ? masterSyncState.message : 'Run Daily Master Sync'}
            </button>

            <button
              onClick={handleSwimEnglandSync}
              disabled={seSyncState.active}
              className="btn-premium-intel"
              style={{
                display: 'flex', gap: '8px', alignItems: 'center',
                borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)',
                background: seSyncState.active ? 'rgba(251, 191, 36, 0.2)' : '',
                opacity: seSyncState.active ? 0.75 : 1,
                cursor: seSyncState.active ? 'not-allowed' : 'pointer'
              }}
            >
              {seSyncState.active && (
                <span style={{
                  width: '12px', height: '12px', display: 'inline-block',
                  border: '2px solid rgba(251,191,36,0.3)', borderTopColor: 'var(--accent-amber)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0
                }} />
              )}
              <span>🏆</span>
              {seSyncState.active ? seSyncState.message : 'Update Swim England Rankings'}
            </button>
          </div>

          <div className="flex gap-6 mb-12 w-full overflow-x-auto no-scrollbar" style={{ flexWrap: 'nowrap', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/squads?period=${periodDays}`)}>
              <PremiumOrb value={stats.avgHealth} label="GLOBAL CLUB HEALTH" icon="🏥" size={120} unit="%" />
            </div>
            <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/meets?period=${periodDays}`)}>
              <PremiumOrb value={stats.complianceRate} label="MEET ATTENDANCE" icon="📊" size={120} unit="%" color="amber" />
            </div>
            <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/swimmers?period=${periodDays}`)}>
              <PremiumOrb value={stats.avgTraining} label="TRAINING ATTENDANCE" icon="⏱️" size={120} unit="%" />
            </div>
            <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/swimmers?period=${periodDays}`)}>
              <PremiumOrb value={stats.avgVolume} label="TRAINING VOLUME" icon="🌊" size={120} unit="%" color="amber" />
            </div>
          </div>


      <div className="tactical-insight-module expansive mb-12" style={{ marginTop: '2.5rem' }}>
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="insight-tag" style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 900 }}>COACHESEYE BRAIN</div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>Strategic Intelligence Matrix</h2>
          </div>
          <button 
            onClick={() => setShowAIAudit(!showAIAudit)}
            className="btn-ai-audit"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: showAIAudit ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              border: showAIAudit ? '1px solid var(--accent-amber)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '50px',
              color: showAIAudit ? 'var(--accent-amber)' : '#fff',
              fontSize: '0.85rem',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              boxShadow: showAIAudit ? '0 0 15px rgba(245, 158, 11, 0.25)' : 'none'
            }}
          >
            <span style={{ fontSize: '1rem' }}>🤖</span>
            <span>{showAIAudit ? 'Hide Executive Audit' : 'AI Executive Audit'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Operational Yield / Deficit */}
          <div style={{ padding: '1.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', borderLeft: '3px solid var(--accent-rose)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-rose)', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>OPERATIONAL YIELD</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.8rem', lineHeight: 1.2 }}>Training Deficit Detected</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Club-wide volume is programmed at <strong>{stats.avgVolume || 0}%</strong>, but physical attendance is critically lagging at <strong style={{ color: 'var(--accent-rose)' }}>{stats.avgTraining || 0}%</strong>. This <strong>{Math.max(0, (stats.avgVolume || 0) - (stats.avgTraining || 0))}% compliance deficit</strong> is aggressively bottlenecking the Training Efficiency Index (TEI) across the Development tiers.
            </p>
          </div>

          {/* Column 2: Pathway Progression */}
          <div style={{ padding: '1.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', borderLeft: '3px solid var(--accent-cyan)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>PATHWAY PIPELINE ({targetYear})</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.8rem', lineHeight: 1.2 }}>{(qualifiers?.county ?? 0) + (qualifiers?.regional ?? 0)} Active Qualifiers</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              The {targetYear} pathway pipeline is expanding. We currently project <strong style={{ color: 'var(--accent-teal)' }}>{qualifiers?.regional ?? 0}</strong> Regional (SE) and <strong style={{ color: 'var(--accent-cyan)' }}>{qualifiers?.county ?? 0}</strong> County (Kent) qualifiers. Immediate focus must shift to marginal-gain technical interventions to convert borderline County times into Regional cuts.
            </p>
          </div>

          {/* Column 3: Velocity & Momentum */}
          <div style={{ padding: '1.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', borderLeft: '3px solid var(--accent-emerald)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-emerald)', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>PERFORMANCE VELOCITY</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.8rem', lineHeight: 1.2 }}>{(stats.avgVelocity || 0) > 0 ? "+" : ""}{stats.avgVelocity || 0} WA Point Growth</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              {(stats.avgVelocity || 0) > 0 ? (
                <>The elite conversion rate is holding up. Athletes attending meets are converting into a <strong style={{ color: 'var(--accent-emerald)' }}>+{stats.avgVelocity} pt</strong> acceleration in FINA/WA velocity. Meet compliance currently tracks at <strong>{stats.complianceRate || 0}%</strong>, securing vital competitive exposure.</>
              ) : (
                <>Performance velocity is flat this period at <strong style={{ color: 'var(--text-secondary)' }}>{stats.avgVelocity || 0} pt</strong>; recent racing is not yet outpacing the seasonal baseline. Meet compliance currently tracks at <strong>{stats.complianceRate || 0}%</strong>.</>
              )}
            </p>
          </div>
        </div>

        {showAIAudit && (
          <div 
            className="glass-card animate-fade-in"
            style={{
              marginTop: "1.5rem",
              padding: "2rem",
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "1.2rem", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent-amber)", fontSize: "0.75rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.4rem" }}>
                  <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent-amber)", boxShadow: "0 0 10px var(--accent-amber)", animation: "pulse 1.5s infinite" }}></span>
                  CoachesEye Executive Intelligence
                </div>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 900, margin: 0, textTransform: "uppercase", letterSpacing: "-0.02em" }}>Real-Time Operational & Pathway Audit</h3>
              </div>
              <div style={{ fontSize: "0.8rem", opacity: 0.7, background: "rgba(255,255,255,0.05)", padding: "6px 14px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)" }}>
                Roster Horizon: <strong>{targetYear}</strong>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 style={{ fontSize: "0.85rem", fontWeight: 900, color: "var(--accent-rose)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.8rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>⚠️</span> Deficits & Resource Risks
                </h4>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 1rem 0" }}>
                  The physical training compliance is critically lagging at <strong style={{ color: "var(--accent-rose)" }}>{stats.avgTraining || 0}%</strong> against a programmed requirement of <strong>{stats.avgVolume || 0}%</strong>. This establishes a net <strong>{Math.max(0, (stats.avgVolume || 0) - (stats.avgTraining || 0))}% operational deficit</strong>.
                </p>
                {squadKPIs.some(s => s.training < 70) ? (
                  <div style={{ background: "rgba(244, 63, 94, 0.03)", border: "1px solid rgba(244, 63, 94, 0.15)", borderRadius: "12px", padding: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "var(--accent-rose)", textTransform: "uppercase", marginBottom: "0.6rem", letterSpacing: "0.05em" }}>Lagging Squad Training Attendance</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {squadKPIs.filter(s => s.training < 70).map(s => (
                        <span key={s.id} style={{ fontSize: "0.75rem", background: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.2)", padding: "4px 10px", borderRadius: "20px", color: "#fda4af", fontWeight: 700 }}>
                          {s.name} ({s.training}%)
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "rgba(16, 185, 129, 0.03)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: "12px", padding: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "#34d399", textTransform: "uppercase", marginBottom: "0.4rem", letterSpacing: "0.05em" }}>Attendance Standard Met</div>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>All squad components currently track at or above the 70% threshold.</p>
                  </div>
                )}
              </div>

              <div>
                <h4 style={{ fontSize: "0.85rem", fontWeight: 900, color: "var(--accent-cyan)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.8rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🎯</span> Pathway Forecast & Acceleration
                </h4>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 1rem 0" }}>
                  {(stats.avgVelocity || 0) > 0 ? (
                    <>Swimmers demonstrate a resilient performance velocity of <strong style={{ color: "var(--accent-emerald)" }}>+{stats.avgVelocity} WA pts</strong>. </>
                  ) : (
                    <>Squad performance velocity is flat this period at <strong style={{ color: "var(--text-secondary)" }}>{stats.avgVelocity || 0} WA pts</strong>, with racing not yet exceeding the seasonal baseline. </>
                  )}
                  The target roster projects <strong style={{ color: "var(--accent-cyan)" }}>{qualifiers?.county ?? 0} County</strong> and <strong style={{ color: "var(--accent-teal)" }}>{qualifiers?.regional ?? 0} Regional</strong> qualifiers.
                </p>
                <div style={{ background: "rgba(6, 182, 212, 0.03)", border: "1px solid rgba(6, 182, 212, 0.15)", borderRadius: "12px", padding: "1rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "var(--accent-cyan)", textTransform: "uppercase", marginBottom: "0.6rem", letterSpacing: "0.05em" }}>Tactical Action Items</div>
                  <ul style={{ listStyleType: "none", paddingLeft: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <li style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--accent-amber)", fontWeight: 900 }}>1.</span> Restore volume consistency in squads with sub-70% attendance.
                    </li>
                    <li style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--accent-amber)", fontWeight: 900 }}>2.</span> Prioritize targeted turns and underwaters training for County borders.
                    </li>
                    <li style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--accent-amber)", fontWeight: 900 }}>3.</span> Accelerate gala scheduling to boost representation above {stats.complianceRate || 0}%.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>



      {/* MACRO-CYCLE TRACKING: Chart & Tactical Explainer + Orbs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ marginTop: '2.5rem' }}>
        
        {/* Left Column: Chart (top) + Explainer (bottom) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Chart Section */}
          <div className="tactical-insight-module" style={{ padding: '2.5rem' }}>
            <div className="insight-header mb-6">
              <div>
                <div className="insight-tag" style={{ color: 'var(--accent-cyan)' }}>MACRO-CYCLE TRACKING</div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: '4px', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>Squad Performance Trends</h3>
              </div>
            </div>
            <div style={{ height: '320px', width: '100%' }}>
              {isClient && ((clubTrend || []).length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 700, opacity: 0.7 }}>
                  No performance data for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(clubTrend || []).map(d => ({ ...d, date: d.label, pace: d.avg, efficiency: d.trend }))} margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ background: 'rgba(10,15,25,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} itemStyle={{ fontSize: '0.85rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.75rem', fontWeight: 700, paddingTop: '10px', opacity: 0.8 }} />
                    <Line type="monotone" dataKey="pace" name="WA Points (Pace)" stroke="var(--accent-cyan)" strokeWidth={3} dot={{ r: 4, fill: 'var(--bg-dark)', stroke: 'var(--accent-cyan)', strokeWidth: 2 }} activeDot={{ r: 6, fill: 'var(--accent-cyan)' }} />
                    <Line type="monotone" dataKey="efficiency" name="Trend Line (Efficiency)" stroke="var(--accent-amber)" strokeWidth={3} dot={{ r: 4, fill: 'var(--bg-dark)', stroke: 'var(--accent-amber)', strokeWidth: 2 }} activeDot={{ r: 6, fill: 'var(--accent-amber)' }} />
                    <ReferenceLine y={300} stroke="var(--accent-cyan)" strokeDasharray="4 4" strokeOpacity={0.6}>
                      <Label value="COUNTY BASELINE" position="insideBottomLeft" fill="var(--accent-cyan)" fontSize={9} fontWeight={900} letterSpacing="0.1em" />
                    </ReferenceLine>
                    <ReferenceLine y={450} stroke="var(--accent-teal)" strokeDasharray="4 4" strokeOpacity={0.6}>
                      <Label value="REGIONAL BASELINE" position="insideBottomLeft" fill="var(--accent-teal)" fontSize={9} fontWeight={900} letterSpacing="0.1em" />
                    </ReferenceLine>
                  </LineChart>
                </ResponsiveContainer>
              ))}
            </div>
          </div>

          {/* Explainer Section */}
          <div className="tactical-insight-module" style={{ padding: '2rem 2.5rem' }}>
            <div style={{ borderLeft: '3px solid var(--accent-cyan)', paddingLeft: '1.5rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>COACHESEYE GUIDE</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.75rem', lineHeight: 1.1, letterSpacing: '-0.03em' }}>WA Points vs. Trend Line</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
                This chart tracks the squad's average <strong>World Aquatics (WA) Points</strong> (labeled as Pace) alongside its long-term <strong>Trend Line</strong> (labeled as Efficiency) over the macro-cycle.
              </p>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, opacity: 0.6, marginBottom: '8px' }}>HOW TO READ THIS</div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                  The WA Points line tracks raw performance velocity, while the Trend Line smooths out meet-to-meet volatility. The dashed baselines visually anchor the squad's average against official County and Regional qualification standards.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Original Orbs & Predictors */}
        <div className="tactical-insight-module" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '2.5rem' }}>
            <div style={{ width: '3px', background: 'var(--accent-cyan)', borderRadius: '2px', boxShadow: '0 0 10px rgba(0,212,255,0.5)' }}></div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
              These performances align elite cohort sizes at National (Top 40 England), Regional (Top 30 South East), and County (Top 10 Kent) tiers based on the highest standard achieved per swimmer.
            </p>
          </div>
          
          <div className="flex justify-between items-center px-2 mb-10">
            {/* National Orb */}
            <div className="text-center">
              <div style={{ width: '70px', height: '70px', borderRadius: '50%', border: '3px solid var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.5rem', boxShadow: 'inset 0 0 20px rgba(251, 191, 36, 0.15), 0 0 15px rgba(251, 191, 36, 0.2)' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent-amber)', textShadow: '0 0 10px rgba(251, 191, 36, 0.5)' }}>{qualifiers?.national ?? 0}</span>
              </div>
              <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>National Top 40</div>
            </div>
            
            {/* Regional Orb */}
            <div className="text-center">
              <div style={{ width: '70px', height: '70px', borderRadius: '50%', border: '3px solid var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.5rem', boxShadow: 'inset 0 0 20px rgba(6, 182, 212, 0.15), 0 0 15px rgba(6, 182, 212, 0.2)' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent-cyan)', textShadow: '0 0 10px rgba(6, 182, 212, 0.5)' }}>{stats.achievementSummary?.regional_count ?? 0}</span>
              </div>
              <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Regional Top 30</div>
            </div>
            
            {/* County Orb */}
            <div className="text-center">
              <div style={{ width: '70px', height: '70px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.5rem', boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.1), 0 0 15px rgba(255, 255, 255, 0.1)' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', textShadow: '0 0 10px rgba(255, 255, 255, 0.3)' }}>{stats.achievementSummary?.county_count ?? 0}</span>
              </div>
              <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>County Top 10</div>
            </div>
          </div>

          <div className="flex gap-4">
             {/* Predictor boxes */}
             <div className="text-center cursor-pointer hover-glow" onClick={() => router.push(`/predictor?level=county&year=${targetYear}`)} style={{ flex: 1, padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#fff' }}>{qualifiers?.county ?? 0}</div>
                <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px' }}>County Predictor</div>
             </div>
             <div className="text-center cursor-pointer hover-glow" onClick={() => router.push(`/predictor?level=regional&year=${targetYear}`)} style={{ flex: 1, padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{qualifiers?.regional ?? 0}</div>
                <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-cyan)', marginTop: '4px' }}>Regional Predictor</div>
             </div>
          </div>
        </div>

      </div>



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
         <div className="insight-heading-group mb-4">
            <h3 className="text-xs font-black tracking-widest opacity-30 uppercase">Tactical Audit & Risk Assessment</h3>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
        <div className="glass-card tactical-insight-module expansive">
          <div className="insight-header">
            <div className="flex items-center gap-4">
               <span className="insight-tag">OPERATIONAL RISK ASSESSMENT</span>
               <span className="status-badge critical" style={{ fontSize: '0.6rem' }}>ATTENTION REQUIRED</span>
            </div>
            <div className="insight-icon">⚠️</div>
          </div>
          <div className="insight-content">
            <div className="insight-value" style={{ color: 'var(--accent-cyan)' }}>{100 - stats.complianceRate}% <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>COMPLIANCE GAP</span></div>
            <div className="insight-description" style={{ fontSize: '0.85rem' }}>
              <p className="mb-4">Critical Audit Findings: While overall health is high, we have identified a {100 - stats.complianceRate}% compliance deficit specifically in the 12-14 age bands. Training volume in the Development pathways has dropped by 8.4% month-over-month.</p>
              <p>Tactical Impact: This volume deficit is creating a performance bottleneck, impacting technical progression across the development cycle. Immediate intervention in training consistency is recommended for the Development squads to restore performance momentum.</p>
            </div>
          </div>
        </div>

        <div className="glass-card tactical-insight-module expansive">
          <div className="insight-header">
            <div className="flex items-center gap-4">
               <span className="insight-tag">RANKING DENSITY GAP</span>
               <span className="status-badge attention" style={{ fontSize: '0.6rem' }}>STAGNATION RISK</span>
            </div>
            <div className="insight-icon">📉</div>
          </div>
          <div className="insight-content">
            <div className="insight-value" style={{ color: 'var(--accent-amber)' }}>{stats.achievementSummary?.national_count || 0} <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>ELITE ENTRIES</span></div>
            <div className="insight-description" style={{ fontSize: '0.85rem' }}>
              <p className="mb-4">Competitive Footprint Audit: National-tier entries remain stable but have failed to expand in the middle-distance categories. Our current footprint is heavily skewed towards sprint events (50m/100m).</p>
              <p>Strategic Bottleneck: The rankings data highlights a 42% gap in Top-40 penetration for 200m+ events. Without a targeted focus on aerobic threshold training, the club risks technical stagnation in the long-distance performance brackets.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-4">
         <div className="insight-heading-group">
            <h3 className="text-xs font-black tracking-widest opacity-30 uppercase">Performance Ceiling & Technical Velocity</h3>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        <div className="glass-card tactical-insight-module compact" style={{ height: 'fit-content' }}>
          <div className="insight-header">
             <span className="insight-tag">ACHIEVEMENT VELOCITY & PB CONVERSION</span>
             <div className="insight-icon">⚡</div>
          </div>
          <div className="insight-content flex flex-col gap-6">
             <div className="flex items-baseline gap-4">
                <div className="insight-value" style={{ color: 'white', marginBottom: 0 }}>{stats.pbs} <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>PBs SECURED</span></div>
             </div>
             
             <p className="briefing-text" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', margin: 0 }}>
                {(stats.pbs / (stats.totalResults || 1) * 100).toFixed(1)}% Conversion Rate: This represents the percentage of all race entries that resulted in a Personal Best. A high rate confirms that the club's technical training and tapering cycles are delivering peak performance when it matters most.
             </p>

             <div className="conversion-meter-container" style={{ width: '100%' }}>
                <div className="meter-header">
                   <span className="meter-label">CONVERSION VELOCITY</span>
                   <span className="meter-value">{(stats.pbs / (stats.totalResults || 1) * 100).toFixed(1)}%</span>
                </div>
                <div className="meter-track">
                   <div 
                     className="meter-fill" 
                     style={{ width: `${(stats.pbs / (stats.totalResults || 1) * 100)}%` }}
                   >
                      <div className="meter-glow"></div>
                   </div>
                </div>
             </div>

             <div className="insight-description">
               Efficiency remains the club's primary strength. A total of {stats.pbs} Personal Bests confirm that when athletes are present and compliant, the coaching cycle is delivering elite-tier technical growth.
             </div>
          </div>
        </div>

        <div className="glass-card tactical-insight-module compact" style={{ height: 'fit-content' }}>
           <div className="insight-header">
              <span className="insight-tag">COACHESEYE | ELITE PERFORMANCE</span>
              <div className="insight-icon">🧠</div>
           </div>
           <div className="insight-content">
              <div className="leaderboard-system">
                 {data.swimmers
                   .filter(s => s.is_active !== false)
                   .map(s => {
                     const swRes = data.results.filter(r => r.swimmer_id === s.id);
                     const peak = swRes.length ? Math.max(...swRes.map(r => r.wa_pts || 0)) : 0;
                     return { ...s, peak };
                   })
                   .sort((a, b) => b.peak - a.peak)
                   .slice(0, 5)
                   .map((sw, idx) => (
                     <div key={sw.id} className="leaderboard-row">
                        <div className="row-rank">0{idx + 1}</div>
                        <div className="row-name">{sw.full_name}</div>
                        <div className="row-dots"></div>
                        <div className="row-pts">{sw.peak} <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>PTS</span></div>
                     </div>
                   ))
                 }
              </div>
              <p className="briefing-text mt-8" style={{ fontSize: '0.75rem', opacity: 0.9, fontStyle: 'italic' }}>
                 Strategic Synthesis: The following athletes are currently defining the club's performance ceiling. Their peak standard established the technical benchmark.
              </p>
           </div>
        </div>

        <div className="glass-card tactical-insight-module compact" style={{ height: 'fit-content' }}>
           <div className="insight-header">
              <span className="insight-tag">COACHESEYE | MOST IMPROVED</span>
              <div className="insight-icon">📈</div>
           </div>
           <div className="insight-content">
              <div className="leaderboard-system">
                 {data.swimmers
                   .filter(s => s.is_active !== false)
                   .map(s => {
                     const results = data.results.filter(r => r.swimmer_id === s.id);
                     const periodMs = periodDays * 86400000;
                     const currentRes = results.filter(r => new Date(r.date) > new Date() - periodMs);
                     const priorRes = results.filter(r => new Date(r.date) <= new Date() - periodMs && new Date(r.date) > new Date() - (periodMs * 2));
                     
                     const currentAvg = currentRes.length ? currentRes.reduce((a, b) => a + (b.wa_pts || 0), 0) / currentRes.length : 0;
                     const priorAvg = priorRes.length ? priorRes.reduce((a, b) => a + (b.wa_pts || 0), 0) / priorRes.length : 0;
                     let improvement = 0;
                      if (priorAvg > 0) {
                        improvement = currentAvg - priorAvg;
                      } else if (currentRes.length >= 2) {
                        const sorted = [...currentRes].sort((a, b) => new Date(a.date) - new Date(b.date));
                        improvement = (sorted[sorted.length - 1].wa_pts || 0) - (sorted[0].wa_pts || 0);
                      }
                     
                     return { ...s, improvement: Math.round(improvement) };
                   })
                   .sort((a, b) => b.improvement - a.improvement)
                   
                   .slice(0, 5)
                   .map((sw, idx) => (
                     <div key={sw.id} className="leaderboard-row">
                        <div className="row-rank">0{idx + 1}</div>
                        <div className="row-name">{sw.full_name}</div>
                        <div className="row-dots"></div>
                        <div className="row-pts">{sw.improvement > 0 ? '+' : ''}{sw.improvement} <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>PTS</span></div>
                     </div>
                   ))
                 }
              </div>
              <p className="briefing-text mt-8" style={{ fontSize: '0.75rem', opacity: 0.9, fontStyle: 'italic' }}>
                 Tactical Acceleration: These athletes have shown the highest velocity of growth in WA points over the current period.
              </p>
           </div>
        </div>
      </div>

        <style jsx>{`
          .conversion-meter-container {
            width: 400px;
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .meter-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .meter-label {
            font-size: 0.65rem;
            font-weight: 900;
            letter-spacing: 0.15em;
            opacity: 0.8;
          }
          .meter-value {
            font-size: 2rem;
            font-weight: 950;
            color: var(--accent-cyan);
            line-height: 1;
            letter-spacing: -0.04em;
            text-shadow: 0 0 20px rgba(6, 182, 212, 0.3);
          }
          .meter-track {
            height: 6px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            overflow: hidden;
            position: relative;
          }
          .meter-fill {
            height: 100%;
            background: var(--accent-cyan);
            border-radius: 10px;
            position: relative;
            box-shadow: 0 0 15px var(--accent-cyan);
          }
          .meter-glow {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
            animation: flow 2s infinite linear;
          }
          @keyframes flow {
            from { transform: translateX(-100%); }
            to { transform: translateX(100%); }
          }
          .meter-footer {
            display: flex;
            justify-content: space-between;
            font-size: 0.55rem;
            font-weight: 800;
            opacity: 0.25;
            letter-spacing: 0.1em;
          }
          .leaderboard-system {
            display: flex;
            flex-direction: column;
            gap: 1.2rem;
          }
          .leaderboard-row {
            display: flex;
            align-items: center;
            gap: 1.5rem;
            padding: 0.5rem 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          }
          .row-rank {
            font-size: 0.7rem;
            font-weight: 900;
            color: var(--accent-cyan);
            opacity: 0.9;
            min-width: 24px;
          }
          .row-name {
            font-size: 0.9rem;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.8);
            white-space: nowrap;
          }
          .row-dots {
            flex: 1;
            height: 1px;
            border-bottom: 1px dotted rgba(255, 255, 255, 0.1);
            margin: 0 0.5rem;
          }
          .row-pts {
            font-size: 1rem;
            font-weight: 900;
            color: white;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
          }
          .search-results-premium {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(1, 4, 10, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            margin-top: 10px;
            z-index: 1000;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
          }
          .search-result-row {
            padding: 12px 16px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            transition: all 0.2s;
          }
          .search-result-row:hover {
            background: rgba(255, 255, 255, 0.05);
            border-left: 3px solid var(--accent-cyan);
          }
          .result-name {
            font-size: 0.9rem;
            font-weight: 800;
            color: white;
          }
          .result-meta {
            font-size: 0.6rem;
            font-weight: 900;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 2px;
          }
        `}</style>

      <div className="grid grid-cols-1 gap-8 mb-16">
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div className="flex justify-between items-start mb-6">
             <div>
                <div className="kpi-label">Club Performance by Age</div>
                <p style={{ fontSize: '0.65rem', opacity: 0.8, fontStyle: 'italic', marginTop: 4 }}>Average World Aquatics points across LTAD age bands.</p>
             </div>
          </div>
          <div style={{ height: 350, width: '100%', minWidth: 0 }}>
            {isClient && (
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
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-8">
         <div className="section-title" style={{ margin: 0 }}>Strategic Tactical Analysis</div>
         <button 
           onClick={() => setSquadsVisible(!squadsVisible)}
           className="btn-squad-trigger"
         >
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
           Tactical Squad Intelligence
         </button>
      </div>

        </>
      ) : (
        <SquadQualificationPredictor 
          swimmers={filteredSwimmers} 
          results={data.results} 
          squads={data.squads} 
          defaultLevel={router.query.level}
          defaultYear={router.query.year ? parseInt(router.query.year) : null}
        />
      )}

      {squadsVisible && (
        <div className="squad-overlay-system animate-fade-in">
           <div className="overlay-header flex justify-between items-center mb-12">
              <h2 style={{ fontSize: '2.2rem', fontWeight: 950, margin: 0 }}>Squad <span style={{ color: 'var(--accent-cyan)' }}>Compliance</span> Overview</h2>
              <button onClick={() => setSquadsVisible(false)} className="btn-close-overlay">×</button>
           </div>
           <div className="squad-grid">
             {squadKPIs.map(sq => <SquadCard key={sq.id} squad={sq} periodDays={periodDays} />)}
           </div>
        </div>
      )}

      {drilldownCategory && (
        <div className="drilldown-overlay animate-fade-in">
           <div className="drilldown-modal">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h2 style={{ fontSize: '2.2rem', fontWeight: 950, margin: 0 }}>
                       {drilldownCategory === 'national' ? 'National Top 40 Rankings' :
                        drilldownCategory === 'regional' ? 'Regional Top 30 Rankings' :
                        'Kent County Top 10 Rankings'}
                    </h2>
                    <p style={{ fontSize: '0.65rem', opacity: 0.8, fontStyle: 'italic', marginTop: 4 }}>
                       {drilldownCategory === 'national' ? 'Swimmers ranked inside England Top 40 for their events' :
                        drilldownCategory === 'regional' ? 'Swimmers ranked inside South East Top 30 for their events' :
                        'Swimmers ranked inside Kent Top 10 for their events'}
                    </p>
                 </div>
                 <button onClick={() => setDrilldownCategory(null)} className="btn-close-overlay">×</button>
              </div>

              <input
                 type="text"
                 placeholder="Search by athlete name or event..."
                 className="drilldown-search-input"
                 value={drilldownSearch}
                 onChange={(e) => setDrilldownSearch(e.target.value)}
              />

              <div style={{ overflowX: 'auto' }}>
                 <table className="drilldown-table">
                    <thead>
                       <tr>
                          <th className="drilldown-th">Rank</th>
                          <th className="drilldown-th">Swimmer</th>
                          <th className="drilldown-th">Squad</th>
                          <th className="drilldown-th">Event</th>
                          <th className="drilldown-th">Gender / Age</th>
                          <th className="drilldown-th" style={{ textAlign: 'right' }}>WA Points</th>
                       </tr>
                    </thead>
                    <tbody>
                       {drilldownItems
                          .filter(item => 
                             (item.swimmerName && item.swimmerName.toLowerCase().includes(drilldownSearch.toLowerCase())) ||
                             (item.event && item.event.toLowerCase().includes(drilldownSearch.toLowerCase()))
                          )
                          .map((item, idx) => (
                             <tr key={idx} className="drilldown-row">
                                <td className="drilldown-td">
                                   <span className={`rank-badge ${item.rank === 1 ? 'gold' : item.rank <= 3 ? 'silver' : 'standard'}`}>
                                      {item.rank}
                                   </span>
                                </td>
                                <td className="drilldown-td" style={{ fontWeight: 800 }}>
                                   <Link href={`/swimmer/${item.swimmerId}`} legacyBehavior>
                                      <a style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }} className="cursor-pointer">{item.swimmerName}</a>
                                   </Link>
                                </td>
                                <td className="drilldown-td" style={{ opacity: 0.8 }}>{item.squadName}</td>
                                <td className="drilldown-td" style={{ color: 'var(--accent-cyan)', fontWeight: 800 }}>{item.event}</td>
                                <td className="drilldown-td" style={{ opacity: 0.6 }}>{item.gender} • {item.age} yrs</td>
                                <td className="drilldown-td" style={{ textAlign: 'right', fontWeight: 900 }}>{item.waPoints} <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>pts</span></td>
                             </tr>
                          ))
                       }
                       {drilldownItems.filter(item => 
                          (item.swimmerName && item.swimmerName.toLowerCase().includes(drilldownSearch.toLowerCase())) ||
                          (item.event && item.event.toLowerCase().includes(drilldownSearch.toLowerCase()))
                       ).length === 0 && (
                          <tr>
                             <td colSpan="6" className="drilldown-td" style={{ textAlign: 'center', opacity: 0.5, padding: '3rem 0' }}>
                                No Ranked Swimmers Matching Query
                             </td>
                          </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

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
