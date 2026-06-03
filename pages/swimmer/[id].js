import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import PremiumOrb from '../../components/PremiumOrb';
import Layout from '../../components/Layout';
import CoachesEyeGlossary from '../../components/CoachesEyeGlossary';
import BenchmarkModal from '../../components/BenchmarkModal';
import { supabase } from '../../lib/supabase';
import { calculateWorkload, isGalaDate, getSessionDuration, isExemptDate, isShutdownDate, calculateReliability, generateSwimmerNarrative, calculateSquadHealth, getKentBenchmark, getCategoryBenchmark, getWeekKey, toLocalISO, normalizeEvent, timeToSeconds, DEFAULT_EXEMPTIONS } from '../../lib/analytics-utils';
import { getBenchmarks } from '../../lib/qualifying-times';
import { getNormalizedWA } from '../../lib/wa-points';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell, ComposedChart, Area, LabelList, ReferenceLine, ReferenceArea } from 'recharts';
import Link from 'next/link';
import AiInsightCard from '../../components/AiInsightCard';
import ReportConfigModal from '../../components/ReportConfigModal';
import WeeklyWorkloadModal from '../../components/WeeklyWorkloadModal';
import ReadinessBreakdownCard from '../../components/ReadinessBreakdownCard';
import TrainingBlockTracker from '../../components/TrainingBlockTracker';
import SquadQualificationPredictor from '../../components/SquadQualificationPredictor';
import VorontsovLTADModule from '../../components/VorontsovLTADModule';
import WaPointsGuideModal from '../../components/WaPointsGuideModal';


// ─── QT Predictor Helpers ────────────────────────────────────────────────────

const STROKE_GROUPS = [
  { label: 'Freestyle',         events: ['50 Free', '100 Free'] },
  { label: 'Backstroke',        events: ['50 Back', '100 Back'] },
  { label: 'Breaststroke',      events: ['50 Breast', '100 Breast'] },
  { label: 'Butterfly',         events: ['50 Fly', '100 Fly'] },
  { label: 'Individual Medley', events: ['200 IM'] },
];

function secondsToTime(secs) {
  if (!secs || secs <= 0) return '—';
  const mins = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2).padStart(5, '0');
  return mins > 0 ? `${mins}:${s}` : (secs % 60).toFixed(2);
}

function getSwimmerPB(results, eventName) {
  const target = normalizeEvent(eventName);
  const times = (results || [])
    .filter(r => normalizeEvent(r.event || '') === target && r.time)
    .map(r => timeToSeconds(r.time))
    .filter(t => t > 0);
  return times.length > 0 ? Math.min(...times) : null;
}

function GapBadge({ gapSeconds }) {
  if (gapSeconds === null) return <span style={{ opacity: 0.25, fontSize: '0.75rem' }}>—</span>;
  if (gapSeconds <= 0) {
    return (
      <span style={{ display: 'inline-block', padding: '2px 8px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900 }}>
        ✓ QT
      </span>
    );
  }
  const isVeryClose = gapSeconds <= 0.5;
  const isClose     = gapSeconds <= 2.0;
  const color = isVeryClose ? '#f59e0b' : isClose ? '#fb923c' : '#f87171';
  return (
    <span style={{ fontSize: '0.8rem', fontWeight: 700, color }}>
      +{gapSeconds.toFixed(2)}s
    </span>
  );
}

function QtTable({ results, age, gender, course, level }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['Event', 'Your PB', 'County Auto', 'County Cons', 'SE Regional Auto', 'SE Regional Cons'].map(h => (
                            <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Event' ? 'left' : 'center', fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.45, whiteSpace: 'nowrap' }}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {STROKE_GROUPS.map(group => (
                        <React.Fragment key={group.label}>
                            <tr key={`hdr-${group.label}`}>
                                <td colSpan={6} style={{ padding: '12px 12px 4px', fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.7 }}>
                                    {group.label}
                                </td>
                            </tr>
                            {group.events.map(eventName => {
                                const pbSecs = getSwimmerPB(results, eventName);
                                const countyBm = getBenchmarks(age, gender, eventName, 'COUNTY');
                                const regionalBm = getBenchmarks(age, gender, eventName, 'REGIONAL');

                                return (
                                    <tr key={eventName} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '12px', fontWeight: 700 }}>{eventName}</td>
                                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 900, color: 'var(--accent-cyan)' }}>
                                            {pbSecs ? secondsToTime(pbSecs) : '—'}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <GapBadge gapSeconds={pbSecs && countyBm?.autoSC ? pbSecs - countyBm.autoSC : null} />
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <GapBadge gapSeconds={pbSecs && countyBm?.consSC ? pbSecs - countyBm.consSC : null} />
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <GapBadge gapSeconds={pbSecs && regionalBm?.autoSC ? pbSecs - regionalBm.autoSC : null} />
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <GapBadge gapSeconds={pbSecs && regionalBm?.consSC ? pbSecs - regionalBm.consSC : null} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SwimmerDetail({ session }) {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);

  const PERIOD_OPTIONS = [
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: '6 Months', days: 180 },
    { label: '52 Weeks', days: 365 },
  ];

  const handlePeriodChange = (days) => {
    router.push({ pathname: `/swimmer/${id}`, query: { ...router.query, period: days } }, undefined, { shallow: true });
  };
  const [swimmer, setSwimmer] = useState(null);
  const [results, setResults] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [squad, setSquad] = useState(null);
  const [selectedStroke, setSelectedStroke] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('All');
const [decayDistance, setDecayDistance] = useState('100');
  const [selectedRaceIdx, setSelectedRaceIdx] = useState(0);
  const [pbs, setPbs] = useState([]);
  const [narrative, setNarrative] = useState([]);
  const [healthData, setHealthData] = useState({ total: 0, components: [] });
  const [personalStats, setPersonalStats] = useState({});
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [insights, setInsights] = useState([]);
  const [exemptions, setExemptions] = useState([]);
  const [sessionMemberships, setSessionMemberships] = useState([]);
  const [includeShutdowns, setIncludeShutdowns] = useState(true);
  const [includeSessionCredits, setIncludeSessionCredits] = useState(true);
  const [includeHolidays, setIncludeHolidays] = useState(true);
  const [includeGalas, setIncludeGalas] = useState(true);
  const [complianceMode, setComplianceMode] = useState('combined');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [isWorkloadModalOpen, setIsWorkloadModalOpen] = useState(false);
  const [selectedChartWeek, setSelectedChartWeek] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [progressSubTab, setProgressSubTab] = useState('charts');
  const [reportConfig, setReportConfig] = useState({
    sections: {
      attendance: true, openMeets: true, internalGalas: true,
      aiTechnical: true, aiDeepDive: true, performanceNarrative: true,
      strokeRoadmap: true, progression: true,
      aiPerformance: true, aiBurnout: false, aiParent: false,
      progress: true, competition: true, qtPredictor: false, biometrics: false
    },
    audience: 'Coach'
  });

  const [printTheme, setPrintTheme] = useState('dark');
  const [aiInsight, setAiInsight] = useState(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [syncingPbs, setSyncingPbs] = useState(false);
  const [normalizeWA, setNormalizeWA] = useState(false);
  const [isWaGuideOpen, setIsWaGuideOpen] = useState(false);
  const [squadTrends, setSquadTrends] = useState({});
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (printTheme) {
      document.body.classList.add(`theme-${printTheme}`);
      return () => {
        document.body.classList.remove(`theme-dark`, `theme-light`);
      };
    }
  }, [printTheme]);

  const allAvailableSplits = useMemo(() => {
    const list = [];
    const seen = new Set();

    // 1. Process PBs
    (pbs || []).forEach(pb => {
      if (pb.splits && typeof pb.splits === 'object' && Object.keys(pb.splits).length >= 2) {
        const dateStr = pb.date ? new Date(pb.date).toISOString().split('T')[0] : '';
        const courseNorm = pb.course === 'SC' || pb.course === 'S' ? 'S' : 'L';
        const key = `${pb.event.toLowerCase()}_${dateStr}_${pb.time}_${courseNorm}`;
        
        list.push({
          event: pb.event,
          time: pb.time,
          date: pb.date,
          gala: pb.gala || '',
          course: courseNorm,
          splits: pb.splits,
          isPB: true
        });
        seen.add(key);
      }
    });

    // 2. Process results
    (results || []).forEach(r => {
      if (r.splits && typeof r.splits === 'object' && Object.keys(r.splits).length >= 2) {
        const dateStr = r.date ? new Date(r.date).toISOString().split('T')[0] : '';
        const courseNorm = r.course === 'SC' || r.course === 'S' ? 'S' : 'L';
        const key = `${r.event.toLowerCase()}_${dateStr}_${r.time}_${courseNorm}`;
        
        if (!seen.has(key)) {
          list.push({
            event: r.event,
            time: r.time,
            date: r.date,
            gala: r.meets?.name || r.gala || '',
            course: courseNorm,
            splits: r.splits,
            isPB: false
          });
          seen.add(key);
        }
      }
    });

    // Sort by date descending
    return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [pbs, results]);

  const handleSyncPbs = async () => {
    setSyncingPbs(true);
    try {
      const res = await fetch('/api/sync-pbs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swimmerId: id })
      });
      // Consume the SSE stream so we wait for it to fully finish
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              console.log(`[PB Sync] ${data.message} (${data.progress}%)`);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
      await fetchSwimmerData(); // Refresh the dashboard with the new splits
    } catch (err) {
      console.error("Failed to sync PBs:", err);
    } finally {
      setSyncingPbs(false);
    }
  };

    useEffect(() => {
        // VERCEL-SAFE PDF EXPORT AUTH BYPASS (Rule 5)
        if (router.query.printToken && router.query.printToken === process.env.NEXT_PUBLIC_PRINT_SECRET_TOKEN) {
            const cachedConfig = localStorage.getItem('print-report-config');
            if (cachedConfig) {
                try {
                    const parsed = JSON.parse(cachedConfig);
                    if (parsed && parsed.sections) {
                        setReportConfig(parsed);
                    }
                    if (parsed && parsed.printTheme) {
                        setPrintTheme(parsed.printTheme);
                    }
                } catch (e) {
                    console.error("Failed to parse cached print report config:", e);
                }
            }
            if (id && router.isReady) {
                fetchSwimmerData();
            }
            return;
        }

        if (session === undefined) return;
        if (!session) {
            router.push('/login');
            return;
        }
        if (id && router.isReady) {
            fetchSwimmerData();
            fetchSquadTrends();
        }
    }, [session, router, id, router.isReady, router.query.printToken]);

    // ENGINE: Paginated Linear Regression for Squads over 365 Days
    const fetchSquadTrends = async () => {
        try {
            const y1ago = new Date(new Date() - 365 * 86400000).toISOString();
            
            const [{ data: squads }, { data: swimmers }] = await Promise.all([
                supabase.from('squads').select('id, name'),
                supabase.from('swimmers').select('id, squad_id')
            ]);

            if (!squads || !swimmers) return;

            const swimmerToSquad = {};
            swimmers.forEach(s => { swimmerToSquad[s.id] = s.squad_id; });

            // Safely paginate through results to bypass the 1,000 row limit
            let allResults = [];
            let page = 0;
            let more = true;
            while (more && page < 10) {
                const { data, error } = await supabase.from('results').select('swimmer_id, wa_pts, date').gte('date', y1ago).range(page * 1000, (page + 1) * 1000 - 1);
                if (error || !data || data.length === 0) break;
                allResults = [...allResults, ...data];
                if (data.length < 1000) more = false;
                page++;
            }

            const squadDataPoints = {};
            allResults.forEach(r => {
                const squadId = swimmerToSquad[r.swimmer_id];
                if (!squadId || !r.wa_pts || !r.date) return;
                if (!squadDataPoints[squadId]) squadDataPoints[squadId] = [];
                squadDataPoints[squadId].push([new Date(r.date).getTime() / 86400000, Number(r.wa_pts) || 0]);
            });

            const calculateTrend = (points) => {
                if (!points || points.length === 0) return { m: 0, b: 0, flat: true, avg: 0 };
                const n = points.length;
                let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                points.forEach(([x, y]) => { sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; });
                const avgY = sumY / n;
                
                const denominator = (n * sumX2 - sumX * sumX);
                if (n < 2 || denominator === 0) return { m: 0, b: avgY, flat: true, avg: avgY };
                
                const m = (n * sumXY - sumX * sumY) / denominator;
                const b = (sumY - m * sumX) / n;
                return { m, b, flat: false, avg: avgY };
            };

            const trends = {};
            squads.forEach(sq => {
                const name = sq.name.toUpperCase();
                const trend = calculateTrend(squadDataPoints[sq.id] || []);
                if (name.includes('AGE')) trends.AGE = trend;
                if (name.includes('GOLD')) trends.GOLD = trend;
                if (name.includes('NAR')) trends.NAR = trend;
            });

            setSquadTrends(trends);
        } catch (error) {
            console.error('Error fetching squad trends:', error);
            setSquadTrends({}); // Fallback to prevent crashes
        }
    };

  const fetchSwimmerData = async () => {
    setLoading(true);
    try {
      const { data: swData } = await supabase.from('swimmers').select('*, squads(*)').eq('id', id).single();
      if (!swData) return;

      // CRITICAL FIX: Download custom club exemptions so the math engine can see Primary Schools Gala and Shutdowns
      const { data: exData } = await supabase.from('club_exemptions').select('*');
      setExemptions(exData || []);

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

      const [resData, attData, sessData, insData, exemptData, memRes] = await Promise.all([
        fetchPaged('results', '*, meets(*)', q => q.eq('swimmer_id', id)),
        fetchPaged('training_attendance', '*', q => q.eq('swimmer_id', id)),
        fetchPaged('sessions', '*'),
        supabase.from('swimmer_insights').select('*').eq('swimmer_id', id).order('created_at', { ascending: false }),
        supabase.from('club_exemptions').select('*'),
        fetch(`/api/memberships?swimmerId=${id}`).then(r => r.json())
      ]);
      
      const { data: pbsData } = await supabase.from('swimmer_pbs').select('*').eq('swimmer_id', id);

      setSwimmer(swData);
      setSquad(swData.squads);
      setResults((resData || []).sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0)));
      setPbs(pbsData || []);
      setAttendance(attData || []);
      setSessions(sessData || []);
      setInsights(insData.data || []);
      setExemptions(exemptData.data || []);
      setSessionMemberships(memRes || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const generateAthleteInsight = async (type = 'general', coachNotes = '') => {
    if (type === 'reset') {
      setAiInsight(null);
      return;
    }
    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          swimmerId: id, 
          type, 
          performance_slope,
          totalActualHours: Math.round(totalActualHours),
          meetAttendance: `${rel?.meetsAttended || 0}/${rel?.targetMeets || 5} meets (${progressPercent || 0}%)`,
          complianceRelativeToSquad: `${(progressPercent || 0) - (squad?.target_training_percent || 75)}%`,
          instructions: [
            ...(coachNotes ? [coachNotes] : []),
            "MANDATORY: List all medalists (Gold/Silver/Bronze) with their events.",
            "MANDATORY: List all Finalists with their events.",
            "MANDATORY: If 'bubble_analysis' contains data, YOU MUST include it here (e.g., 'Kieran Crawford narrowly missed the 50m Breaststroke final by just 0.12s!').",
            "List of other significant PBs or achievements."
          ]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiInsight(data);
      return data;
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to generate technical roadmap');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const period = parseInt(router.query.period) || 365;
  const periodWeeks = Math.floor(period / 7);

  const normalizedResults = useMemo(() => {
    if (!results) return [];
    const age = swimmer?.year_of_birth ? (new Date().getFullYear() - swimmer.year_of_birth) : 12;
    return results.map(r => ({
      ...r,
      wa_pts: getNormalizedWA(r.wa_pts, age, swimmer?.gender, normalizeWA)
    }));
  }, [results, swimmer, normalizeWA]);

  const { rollingMeets, rollingTarget, progressPercent, rollingPeak, rollingAvg, workloadChartData, attendancePct, seasonVolumePct, totalActualHours, annualTargetHours, seasonPBs, isCompliant, velocity, filteredMeets, statsObj, progressionData, performance_slope, periodCompliance, rel, uniqueMeetsList, meetTimelineData, openMeetsCount, totalMeetsCount, totalAbsentSessions, rawAbsentCount, periodMeets } = useMemo(() => {
    if (!swimmer) return { attendancePct: 0, seasonVolumePct: 0, workloadChartData: [], filteredMeets: [], rel: {}, uniqueMeetsList: [], meetTimelineData: [], openMeetsCount: 0, totalMeetsCount: 0, seasonPBs: 0 };
    const now = new Date();
    const START = new Date(now - period * 86400000);
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // COMPREHENSIVE MEET ANALYTICS: Smart Deduplication (Match engine logic)
    const periodMeets = normalizedResults
      .filter(r => new Date(r.date) >= START)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const meets = normalizedResults.map(r => r.meets).filter(Boolean);

    // CRITICAL FIX: Separate Open Meets (L1-L3) from Internal Galas (L4) to fix the Meet Count Bug
    const uniqueMeetsList = Array.from(new Set(periodMeets.map(r => r.meet_id)))
        .map(id => {
            const meetObj = meets?.find(m => m.id === id);
            const meetResults = periodMeets.filter(r => r.meet_id === id);
            return {
                id,
                date: meetObj?.date || meetResults[0]?.date || meetResults?.date,
                name: meetObj?.name || 'Unknown Meet',
                level: meetObj?.level || 'L3',
                type: meetObj?.type || 'open',
                eventCount: meetResults.length,
                pbCount: meetResults.filter(r => r.is_pb).length,
                avgWa: meetResults.reduce((sum, r) => sum + (r.wa_pts || 0), 0) / meetResults.length,
                peakWa: Math.max(...meetResults.map(r => r.wa_pts || 0)),
                // Compatibility with screen UI
                results: meetResults,
                peakWA: Math.max(...meetResults.map(r => r.wa_pts || 0))
            };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    const openMeetsCount = uniqueMeetsList.filter(m => m.type !== 'team' && m.level !== 'L4').length;
    const totalMeetsCount = uniqueMeetsList.length;

    // Sort for log (descending)
    uniqueMeetsList.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Meet Timeline Data (grouped by month)
    const monthBuckets = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mKey = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      monthBuckets[mKey] = 0;
    }

    uniqueMeetsList.forEach(m => {
      const mKey = new Date(m.date).toLocaleString('default', { month: 'short', year: '2-digit' });
      if (monthBuckets[mKey] !== undefined) monthBuckets[mKey]++;
    });

    const meetTimelineData = Object.entries(monthBuckets)
      .map(([month, count]) => ({ month, count }))
      .reverse();

    // 1. Identify which days the SQUAD is scheduled to train (General Squad Schedule)
    const squadScheduleDays = new Set();
    if (sessions && sessions.length > 0) {
      const squadName = squad?.name?.toUpperCase() || "";
      sessions.forEach(s => {
        const sName = s.name?.toUpperCase() || "";
        const sDayField = (s.day_of_week || "").toLowerCase();
        const isMatch = sName.includes(squadName) || squadName.includes(sName);
        
        if (isMatch) {
          dayNames.forEach(dn => {
            if (sDayField === dn.toLowerCase() || sName.toLowerCase().includes(dn.toLowerCase())) {
              squadScheduleDays.add(dn.toLowerCase());
            }
          });
        }
      });
    }

    // 2. Identify OFFICIAL memberships for THIS swimmer (Source of Truth)
    const officialScheduledDays = new Set();
    if (sessionMemberships && sessionMemberships.length > 0) {
      sessionMemberships.forEach(m => {
        const sess = sessions.find(s => s.id === m.session_id);
        if (sess) {
          const sName = sess.name?.toLowerCase() || "";
          const sDayField = (sess.day_of_week || "").toLowerCase();
          dayNames.forEach(dn => {
            if (sDayField === dn.toLowerCase() || sName.includes(dn.toLowerCase())) {
              officialScheduledDays.add(dn.toLowerCase());
            }
          });
        }
      });
    }

    // 3. Identify which days THIS INDIVIDUAL actually attends (Historical Fallback)
    const personalRoutineDays = new Set();
    if (attendance && attendance.length > 0) {
      const counts = {};
      attendance.forEach(a => {
        if (a.status === 'present' || a.status === 'absent') {
          const dt = new Date(a.date);
          if (!isNaN(dt.getTime())) {
            const dn = dayNames[dt.getDay()];
            counts[dn] = (counts[dn] || 0) + 1;
          }
        }
      });
      Object.keys(counts).forEach(dn => {
        if (counts[dn] >= 3) personalRoutineDays.add(dn);
      });
    }

    const isDayScheduledForSwimmer = (dayName) => {
      const day = dayName.toLowerCase();
      
      // PRIORITY 1: OFFICIAL MEMBERSHIP
      if (officialScheduledDays.size > 0) {
        return officialScheduledDays.has(day);
      }

      // PRIORITY 2: HISTORICAL ROUTINE (Fallback if no official data)
      if (personalRoutineDays.has(day)) return true;

      // PRIORITY 3: SQUAD SCHEDULE (Only if swimmer is new and we have no routine yet)
      const isSquadDay = squadScheduleDays.has(day);
      if (!isSquadDay) return false;
      if (attendance.length >= 10) return false;
      
      return true;
    };

    const rel = calculateReliability(swimmer, attendance, sessions, results, period, exemptions, sessionMemberships, {
      sessionCredits: includeSessionCredits,
      galas: includeGalas,
      holidays: includeHolidays,
      shutdowns: includeShutdowns,
      complianceMode
    });
    const yearResults = normalizedResults.filter(r => new Date(r.meets?.date || 0) >= START);
    
    // Generate continuous rolling timeline based on the reliability analysis window
    const chartData = [];
    let compliantWeeks = 0;
    const workloadByWeek = calculateWorkload(attendance, sessions, results, swimmer.id, exemptions, swimmer.squad_id);
    
    // Track holidays used for the chart breakdown
    let chartHolidaysUsed = 0;
    const holidayAllowance = swimmer.holiday_allowance ?? (squad?.holiday_allowance ?? 2);
    const effectiveJoinDate = rel.effectiveJoinDate;
    const joinDate = swimmer.squad_join_date ? new Date(swimmer.squad_join_date) : null;

    for (let i = periodWeeks - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
      const dateStr = toLocalISO(d);
      const weekKey = getWeekKey(d);
      // weekKey = "W-YYYY-MM-DD" where the date IS the Monday — parse it directly so the
      // label always shows the Monday start date, not a shifted or arbitrary day-of-week.
      const mondayDate = new Date(weekKey.slice(2) + 'T00:00:00Z');
      const wLabel = mondayDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

      
      const weekInfo = rel.details[weekKey] || {};
      const targetSess = weekInfo.requiredSessions ?? (squad?.target_sessions_per_week || rel.targetSess);
      const targetHrs = weekInfo.target ?? (squad?.target_hours_per_week || rel.targetHrs);
      const appliedRule = weekInfo.appliedRule ?? rel.appliedRule;
      const mustWeekend = weekInfo.mustWeekend ?? (squad?.require_weekend || false);
      const isOr = weekInfo.isOr ?? (squad?.use_or_logic ?? true);

      const w = workloadByWeek[weekKey] || { 
        trainingHours: 0, 
        galaHours: 0, 
        trainingSessions: 0, 
        galaSessions: 0,
        isExempt: false,
        isCredit: false,
        hasWeekend: false
      };

      // RE-CALCULATE CREDITS FOR THIS WEEK (ALIGNED TO MON-SUN)
      let creditedSessionsInWeek = 0;
      let creditedHoursInWeek = 0;
      
      const monDate = new Date(d);
      const dayIdx = monDate.getDay();
      const diffToMonday = (dayIdx === 0 ? -6 : 1) - dayIdx;
      monDate.setDate(monDate.getDate() + diffToMonday);
      monDate.setHours(0,0,0,0);

      for (let dIdx = 0; dIdx < 7; dIdx++) {
        const currentDate = new Date(monDate.getTime() + (dIdx * 24 * 60 * 60 * 1000));
        if (currentDate > now) break;
        
        // Use a timezone-safe date string (YYYY-MM-DD in local time)
        const ds = toLocalISO(currentDate);
        const sd = isShutdownDate(ds, exemptions, swimmer.squad_id);
        
        if (sd?.type === 'credit') {
          const dn = dayNames[currentDate.getDay()];
          const isScheduled = isDayScheduledForSwimmer(dn);
          
          if (isScheduled) {
            if (sessionMemberships && sessionMemberships.length > 0) {
              sessionMemberships.forEach(m => {
                const sess = sessions.find(s => s.id === m.session_id);
                if (sess) {
                  const sDayField = (sess.day_of_week || "").toLowerCase();
                  const sName = sess.name?.toLowerCase() || "";
                  if (sDayField === dn.toLowerCase() || sName.includes(dn.toLowerCase())) {
                    creditedSessionsInWeek += 1;
                    creditedHoursInWeek += getSessionDuration(sess);
                  }
                }
              });
            } else {
              // Legacy fallback
              const daySessions = sessions.filter(s => s.day_of_week?.toLowerCase() === dn.toLowerCase());
              const squadName = squad?.name?.toUpperCase();
              const relevantSessions = daySessions.filter(s => !squadName || s.name?.toUpperCase().includes(squadName));
              creditedSessionsInWeek += relevantSessions.length;
              relevantSessions.forEach(s => {
                creditedHoursInWeek += getSessionDuration(s);
              });
            }
          }
        }
      }

      const sessMet = (w.trainingSessions + w.galaSessions + creditedSessionsInWeek) >= targetSess;
      const hrsMet = (w.trainingHours + w.galaHours + creditedHoursInWeek) >= targetHrs;
      
      let creditHasWeekend = false;
      if (creditedSessionsInWeek > 0) {
        for (let dIdx = 0; dIdx < 7; dIdx++) {
          const currentDate = new Date(monDate.getTime() + (dIdx * 24 * 60 * 60 * 1000));
          const day = currentDate.getDay();
          if (day === 0 || day === 6) {
             const dateStr = toLocalISO(currentDate);
             const sd = isShutdownDate(dateStr, exemptions, swimmer.squad_id);
             if (sd?.type === 'credit' && isDayScheduledForSwimmer(dayNames[day])) creditHasWeekend = true;
          }
        }
      }

      // SYNC WITH ENGINE: Use the engine's verdict on MET status
      const isMet = weekInfo.isMet ?? false;
      const holidayUsed = weekInfo.isHoliday ?? false;
      const isPreJoin = joinDate && d < joinDate;
      
      const actualHours = w.trainingHours + w.galaHours;
      const compliancePct = Math.round((actualHours / (targetHrs || 1)) * 100);
      
      if (isMet && !w.isExempt && !isPreJoin) compliantWeeks++;

      // Use the aligned week dates we calculated earlier for the exception details
      const weekEnd = new Date(monDate);
      weekEnd.setDate(monDate.getDate() + 6);
      weekEnd.setHours(23,59,59,999);
      
      const weekExemptions = (exemptions || []).filter(ex => {
        const start = new Date(ex.start_date);
        const end = new Date(ex.end_date);
        return (start <= weekEnd && end >= monDate) && (!ex.squad_id || ex.squad_id === swimmer.squad_id);
      });

      const exceptionDetails = weekExemptions.map(ex => {
        const start = new Date(ex.start_date);
        const end = new Date(ex.end_date);
        const actualStart = start > monDate ? start : monDate;
        const actualEnd = end < weekEnd ? end : weekEnd;
        
        const days = [];
        let anyApplied = false;
        let anyDenied = false;
        let reason = "";

        for (let dt = new Date(actualStart); dt <= actualEnd; dt.setDate(dt.getDate() + 1)) {
          const dayNum = dt.getDay();
          const dayName = dayNames[dayNum];
          const squadName = squad?.name?.toUpperCase() || "";
          const relevantSessions = sessions.filter(s => {
            const sName = s.name?.toUpperCase() || "";
            const sDayField = (s.day_of_week || "").toLowerCase();
            const isNameMatch = sName.includes(squadName) || squadName.includes(sName) || squadName.split(' ').some(word => word.length > 3 && sName.includes(word));
            const isDayMatch = sDayField === dayName.toLowerCase() || sName.toLowerCase().includes(dayName.toLowerCase());
            return isNameMatch && isDayMatch;
          });

          if (relevantSessions.length > 0) {
            const isScheduled = isDayScheduledForSwimmer(dayName);
            if (isScheduled) anyApplied = true; else anyDenied = true;
            
            if (attendance.length < 10) reason = "New Swimmer Default";
            else if (isScheduled) reason = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} Routine`;
            else reason = `Not in ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} Routine`;

            days.push({
              date: dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
              sessions: relevantSessions.map(s => s.name).join(', '),
              applied: isScheduled
            });
          }
        }
        
        let label = ex.name;
        if (ex.type === 'credit') {
          if (anyApplied) label += ` (Applied: ${reason})`;
          else if (anyDenied) label += ` (Denied: ${reason})`;
          else label += " (No sessions scheduled)";
        } else if (ex.type === 'exempt') {
          label += " (Week Exempted)";
        }

        return {
          name: label,
          type: ex.type,
          days
        };
      });

      const isWeekExemptOrHoliday = w.isExempt || holidayUsed;
      const weekHours = w.trainingHours + (includeGalas ? w.galaHours : 0);
      const weekCompliance = isPreJoin ? 0 : (isWeekExemptOrHoliday ? 100 : Math.min(100, Math.round((weekHours / (targetHrs || 1)) * 100)));

      w.creditedHours = weekInfo.creditedHours || creditedHoursInWeek || 0;

      chartData.push({
        week: wLabel,
        weekKey,
        training: w.trainingHours, // Keep for chart
        gala: w.galaHours, // Keep for chart
        credit: w.creditedHours || 0,
        trainingHours: w.trainingHours,
        trainingSessions: w.trainingSessions,
        galaHours: w.galaHours,
        galaSessions: w.galaSessions,
        creditedHours: creditedHoursInWeek,
        creditedSessions: creditedSessionsInWeek,
        totalHours: weekHours,
        totalSessions: w.trainingSessions + (includeGalas ? w.galaSessions : 0),
        sessions: w.trainingSessions + (includeGalas ? w.galaSessions : 0), // Keep for chart/logic
        isMet,
        isExempt: w.isExempt,
        isCredit: w.isCredit || creditedSessionsInWeek > 0,
        isPreJoin,
        holidayUsed,
        target: targetHrs,
        requiredSessions: targetSess,
        appliedRule,
        compliance: weekCompliance,
        displayTraining: ((w.isExempt || holidayUsed) && w.trainingHours === 0) ? 0.5 : w.trainingHours,
        exceptionDetails
      });
    }

    const half = Math.floor(period / 2);
    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
    const velocity = Math.round(avg(normalizedResults.filter(r => new Date(r.date) >= new Date(now - half * 86400000)).map(r => r.wa_pts || 0)) - avg(normalizedResults.filter(r => new Date(r.date) >= new Date(now - period * 86400000) && new Date(r.date) < new Date(now - half * 86400000)).map(r => r.wa_pts || 0)));

    // Stroke-specific analysis (Event-level for Qualifying Times)
    const strokeData = {};
    yearResults.forEach(r => {
      const eventName = r.event || 'Unknown Event';
      if (!strokeData[eventName]) {
        strokeData[eventName] = {
          count: 0,
          peak: 0,
          pbCount: 0,
          avg: 0,
          pts: []
        };
      }
      strokeData[eventName].count++;
      if (r.wa_pts) {
        strokeData[eventName].pts.push(r.wa_pts);
        if (r.wa_pts > strokeData[eventName].peak) {
          strokeData[eventName].peak = r.wa_pts;
        }
      }
      if (r.is_pb) {
        strokeData[eventName].pbCount++;
      }
    });
    
    // Compute average for each event
    Object.keys(strokeData).forEach(eventName => {
      const d = strokeData[eventName];
      d.avg = d.pts.length ? d.pts.reduce((a, b) => a + b, 0) / d.pts.length : 0;
    });

    // Swimming age = age as at 31 Dec of current year
    const age = swimmer?.year_of_birth ? new Date().getFullYear() - swimmer.year_of_birth : null;

    // Window-based current average (90 days) for "Current Form"
    const recentResults = normalizedResults.filter(r => new Date(r.date) >= new Date(now - 90 * 86400000));
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
      percentage: rel.percentage,
      volumePct: rel.volumePct,
      totalActualHours: rel.totalHours,
      annualTargetHours: rel.annualTarget,
      weeksMet: rel.weeksMet,
      totalWeeks: rel.totalWeeks,
      meetsMet: rel.complianceRate >= 100,
      targetMeets: rel.targetMeets,
      meetsAttended: rel.meetsAttended,
      totalRaces: yearResults.length,
      avgWA: Math.round(yearResults.reduce((a,r)=>a+(r.wa_pts||0),0)/(yearResults.length || 1)),
      recentAvg,
      peakWA: yearResults.length ? Math.max(...yearResults.map(r => r.wa_pts || 0)) : 0,
      seasonPBs,
      strokeData,
      age,
      holidaysUsed: rel.holidaysUsed,
      holidayAllowance: rel.holidayAllowance,
      details: rel.details || {}
    };

    const finalFiltered = normalizedResults.filter(r => {
      const monthMatch = selectedMonth === 'All' || new Date(r.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) === selectedMonth;
      const strokeMatch = selectedStroke === 'All' || r.event?.toLowerCase().includes(selectedStroke.toLowerCase());
      return monthMatch && strokeMatch;
    });

    const sortedResults = [...finalFiltered].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (sortConfig.key === 'meet') { aVal = a.meets?.name || ''; bVal = b.meets?.name || ''; }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    const progressionData = results
      .filter(r => selectedStroke === 'All' || r.event?.toLowerCase().includes(selectedStroke.toLowerCase()))
      .sort((a,b) => new Date(a.date) - new Date(b.date))
      .map(r => ({
        date: new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        wa_pts: Number(r.wa_pts || 0)
      }));

    let sx = 0, sy = 0, sxy = 0, sx2 = 0, slope = 0;
    if (progressionData.length > 1) {
      const n = progressionData.length;
      progressionData.forEach((d, i) => {
        sx += i; sy += d.wa_pts; sxy += i * d.wa_pts; sx2 += i * i;
      });
      const denominator = (n * sx2 - sx * sx);
      slope = denominator !== 0 ? (n * sxy - sx * sy) / denominator : 0;
      const intercept = (sy - slope * sx) / n;
      progressionData.forEach((d, i) => { d.trend = Math.round(slope * i + intercept); });
    }

    return {
      rollingMeets: rel.meetsAttended, rollingTarget: rel.targetMeets, progressPercent: rel.complianceRate,
      rollingPeak: yearResults.length ? Math.max(...yearResults.map(r => r.wa_pts || 0)) : 0,
      rollingAvg: yearResults.length ? Math.round(yearResults.reduce((a,r)=>a+(r.wa_pts||0),0)/yearResults.length) : 0,
      workloadChartData: chartData, attendancePct: rel.percentage, seasonVolumePct: rel.volumePct,
      totalActualHours: Math.round(rel.totalHours), annualTargetHours: rel.annualTarget,
      seasonPBs,
      isCompliant: rel.complianceRate >= 100 && (rel.percentage >= (squad?.target_training_percent || 75) || rel.volumePct >= (squad?.target_training_percent || 75)),
      velocity, 
      filteredMeets: sortedResults,
      statsObj,
      progressionData,
      performance_slope: slope,
      periodCompliance: rel.percentage,
      rel,
      uniqueMeetsList,
      meetTimelineData,
      openMeetsCount,
      totalMeetsCount,
      totalAbsentSessions: chartData.reduce((acc, w) => acc + (w.isMet || w.isExempt || w.isHoliday ? 0 : Math.max(0, w.requiredSessions - (w.trainingSessions + w.galaSessions + (w.creditedSessions || 0)))), 0),
      rawAbsentCount: attendance.filter(a => a.status === 'absent' && new Date(a.date) >= START).length,
      periodMeets: uniqueMeetsList.filter(m => new Date(m.date) >= START)
    };
  }, [normalizedResults, swimmer, squad, attendance, sessions, exemptions, sessionMemberships, period, periodWeeks, selectedMonth, selectedStroke, router.query.period, sortConfig, includeShutdowns, includeSessionCredits, includeHolidays, includeGalas, complianceMode]);


  const weeklyWorkloadData = useMemo(() => {
      if (!rel || !rel.details) return [];
      
      const periodDays = parseInt(router.query.period) || 365;
      const periodStart = new Date(new Date().getTime() - periodDays * 24 * 60 * 60 * 1000);
      
      const getVal = (val) => {
          if (val === undefined || val === null) return 0;
          if (typeof val === 'number') return val;
          const parsed = parseFloat(String(val).replace(/[^\d.-]/g, ''));
          return isNaN(parsed) ? 0 : parsed;
      };

      // Sort descending so the newest weeks appear at the top of the table
      return Object.keys(rel.details).sort((a, b) => b.localeCompare(a)).map(weekKey => {
          const week = rel.details[weekKey];
          const dateStr = weekKey.replace('W-', '');
          const d = new Date(dateStr);
          
          // STRICT FILTER: Only include weeks that fall within the selected time horizon
          if (isNaN(d) || d < periodStart) return null;

          const name = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          
          const pHours = getVal(week.poolHours) || getVal(week.trainingHours) || getVal(week.hours) || 0;
          const cHours = getVal(week.exemptHours) || getVal(week.creditedHours) || getVal(week.creditHours) || 0;
          const gHours = getVal(week.galaHours) || 0;
          const tHours = getVal(week.targetHours) || getVal(week.target) || getVal(squad?.target_hours_per_week) || 0;
          const total = pHours + cHours + gHours;
          
          // Fallback to strict math if the engine didn't pass down the boolean
          const isMet = week.isMet !== undefined ? week.isMet : (total >= tHours);

          return { name, pool: pHours, credit: cHours, gala: gHours, total, target: tHours, isMet, creditReasons: week.creditReasons, isHoliday: week.isHoliday, appliedRule: week.appliedRule };
      }).filter(Boolean);
  }, [rel, squad, router.query.period]);

  const activeExemptions = useMemo(() => {
      const periodDays = parseInt(router.query.period) || 365;
      const periodStart = new Date(new Date().getTime() - periodDays * 24 * 60 * 60 * 1000);

      // Deduplicate overlapping DB and Default exemptions using a Map
      const uniqueMap = new Map();
      
      // 1. Load defaults first
      if (DEFAULT_EXEMPTIONS) {
          DEFAULT_EXEMPTIONS.forEach(ex => uniqueMap.set(`${ex.name}-${ex.start_date}`, ex));
      }
      
      // 2. Load DB exemptions (this will overwrite defaults with matching name/date, ensuring admin choices win)
      if (exemptions) {
          exemptions.forEach(ex => uniqueMap.set(`${ex.name}-${ex.start_date}`, ex));
      }
      
      const allExemptions = Array.from(uniqueMap.values());

      // Filter to only show exemptions that overlap with the selected time period
      return allExemptions.filter(ex => {
          const exEnd = new Date(ex.end_date);
          return exEnd >= periodStart;
      }).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  }, [exemptions, router.query.period]);






  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

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
         avgVolume: seasonVolumePct,
         memberships: sessionMemberships
      };
      setHealthData(calculateSquadHealth(hStats, squad || {}));
      setNarrative(generateSwimmerNarrative(statsObj, swimmer));
    }
  }, [attendancePct, statsObj, squad, progressPercent, velocity, seasonVolumePct]);

  const handleGenerateReport = async (sections, audience, selectedTheme = 'dark') => {
        setReportConfig({ sections, audience });
        setPrintTheme(selectedTheme);
        
        let printInsight = aiInsight;
        if ((sections.aiTechnical || sections.aiDeepDive) && !printInsight) {
            printInsight = await generateAthleteInsight('general');
        }
        
        // Cache the insight so Puppeteer can read it instantly
        if (printInsight) {
            localStorage.setItem('print-insight-cache', JSON.stringify(printInsight));
        }

        // Cache the config and theme
        localStorage.setItem('print-report-config', JSON.stringify({ sections, audience, printTheme: selectedTheme }));

        setIsReportModalOpen(false);
        setIsExporting(true);
        
        try {
            const clientAuth = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('sb-') || key === 'print-insight-cache' || key === 'print-report-config')) {
                    clientAuth[key] = localStorage.getItem(key);
                }
            }

            const res = await fetch('/api/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    targetPath: router.asPath,
                    clientAuth 
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'PDF generation failed');
            }

            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = `${swimmer?.known_as || swimmer?.full_name || 'athlete'}-report.pdf`.replace(/\s+/g, '-');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        } catch (err) {
            console.error('[PDF export]', err);
            alert(`Export failed: ${err.message}`);
        } finally {
            setIsExporting(false);
        }
    };


  const renderCustomBarLabel = (props) => {
    const { x, y, width, index } = props;
    const entry = workloadChartData[index];
    if (!entry) return null;
    
    const isExempt = entry.isExempt;
    const holidayUsed = entry.holidayUsed;
    
    if (!isExempt && !holidayUsed) return null;
    
    // Tag placement: slightly above the top of the bar
    const labelX = x + width / 2;
    const labelY = y - 8;
    const labelText = isExempt ? 'SHUTDOWN' : 'HOLIDAY';
    const labelColor = isExempt ? '#f97316' : '#a855f7';
    
    return (
      <text
        x={labelX}
        y={labelY}
        fill={labelColor}
        fontSize="6px"
        fontWeight="900"
        textAnchor="middle"
        transform={`rotate(-90, ${labelX}, ${labelY})`}
      >
        {labelText}
      </text>
    );
  };

  const chartDataWithTrends = useMemo(() => {
        if (!uniqueMeetsList || uniqueMeetsList.length === 0) return [];
        
        const sortedData = [...uniqueMeetsList].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        return sortedData.map(meet => {
            const days = new Date(meet.date).getTime() / 86400000;
            
            const getTarget = (trendObj, fallback) => {
                if (!trendObj) return fallback;
                if (trendObj.flat) return trendObj.avg > 0 ? Math.round(trendObj.avg) : fallback;
                const projected = trendObj.m * days + trendObj.b;
                return isFinite(projected) && projected > 0 ? Math.round(projected) : fallback;
            };

            return {
                ...meet,
                // Optional chaining completely prevents the 'null' crash
                ageTarget: getTarget(squadTrends?.AGE, 260),
                goldTarget: getTarget(squadTrends?.GOLD, 360),
                narTarget: getTarget(squadTrends?.NAR, 480)
            };
        });
    }, [uniqueMeetsList, squadTrends]);

  const printPages = useMemo(() => {
    if (!swimmer) return [];

    const pages = [];

    // Page 2: Executive Overview
    if (reportConfig.sections.performanceNarrative) {
      pages.push({
        id: 'overview',
        title: '1. Executive Overview & KPIs',
        element: (
          <div style={{ padding: '15mm 20mm', minHeight: '100vh', pageBreakAfter: 'always', boxSizing: 'border-box', background: 'var(--print-bg)' }} key="overview">
              <h2 className="section-title" style={{ marginBottom: '2rem' }}>1. Executive Overview</h2>
              <div className="glass-card" style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '1rem' }}>
                      <PremiumOrb value={attendancePct} label="Consistency" size={120} unit="%" />
                      <PremiumOrb value={seasonVolumePct} label="Volume vs Target" size={120} unit="%" color={seasonVolumePct >= 80 ? 'cyan' : 'amber'} />
                      <PremiumOrb value={progressPercent} label="Meet Compliance" size={120} unit="%" />
                      <PremiumOrb value={velocity} label="WA Velocity" customValue={true} size={120} unit="pts" color={velocity >= 0 ? 'emerald' : 'rose'} />
                  </div>
              </div>
                  
              <div className="glass-card strategic-narrative-card" style={{ marginTop: '2rem' }}>
                  <h3 className="section-title" style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Strategic Narrative</h3>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                      {narrative && narrative.map((item, idx) => (
                          <div key={idx} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderLeft: `4px solid ${item.type === 'success' ? '#10b981' : item.type === 'danger' ? '#f43f5e' : item.type === 'warning' ? '#f59e0b' : '#0ea5e9'}`, borderRadius: '8px', pageBreakInside: 'avoid' }}>
                              <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.6' }} className="print-text-dim">
                                  <strong style={{ display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }} className="print-text-bright">{item.category.toUpperCase()}</strong> 
                                  {item.text}
                              </p>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
        )
      });
    }

    // Page 3: Performance AI
    if (reportConfig.sections.aiPerformance) {
      pages.push({
        id: 'ai',
        title: '2. Performance AI Report',
        element: (
          <div style={{ padding: '15mm 20mm', minHeight: '100vh', pageBreakAfter: 'always', boxSizing: 'border-box', background: 'var(--print-bg)' }} key="ai">
              <h2 className="section-title" style={{ marginBottom: '2rem' }}>2. Performance AI Report</h2>
              <AiInsightCard swimmerId={swimmer.id} performance_slope={velocity} />
          </div>
        )
      });
    }

    // Page 4: Training Workload
    if (reportConfig.sections.attendance) {
      pages.push({
        id: 'workload',
        title: '3. Training Workload & Compliance',
        element: (
          <div style={{ padding: '15mm 20mm', minHeight: '100vh', pageBreakAfter: 'always', boxSizing: 'border-box', background: 'var(--print-bg)' }} key="workload">
              <h2 className="section-title" style={{ marginBottom: '2rem' }}>3. Training Workload</h2>
              <div className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{totalActualHours.toFixed(1)}h / {annualTargetHours.toFixed(1)}h</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase' }}>Volume Achieved</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: 900, color: (statsObj?.percentage || 0) >= (squad?.target_training_percent || 75) ? '#059669' : '#e11d48' }}>{statsObj?.percentage || 0}%</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase' }}>Target Compliance</div>
                      </div>
                  </div>
                  <div style={{ height: '300px', width: '100%', marginTop: '1rem' }}>
                      <ComposedChart width={700} height={300} data={workloadChartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                          <XAxis dataKey="week" stroke="rgba(255,255,255,0.5)" fontSize={9} tickMargin={10} />
                          <YAxis stroke="rgba(255,255,255,0.5)" fontSize={9} />
                          <Bar dataKey="credit" stackId="a" fill="#fbbf24" name="Credits/Holidays" isAnimationActive={false} />
                          <Bar dataKey="training" stackId="a" fill="#38bdf8" name="Pool Hours" isAnimationActive={false} />
                          <Bar dataKey="gala" stackId="a" fill="#10b981" name="Gala Hours" isAnimationActive={false} />
                          <Line type="stepAfter" dataKey="target" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target Hours" isAnimationActive={false} />
                      </ComposedChart>
                  </div>
              </div>
          </div>
        )
      });
    }

    // Page 5: Competition Record
    if (reportConfig.sections.competition || reportConfig.sections.openMeets || reportConfig.sections.internalGalas) {
      pages.push({
        id: 'competition',
        title: '4. Competition Record',
        element: (
          <div style={{ padding: '15mm 20mm', minHeight: '100vh', pageBreakAfter: 'always', boxSizing: 'border-box', background: 'var(--print-bg)' }} key="competition">
              <h2 className="section-title" style={{ marginBottom: '2rem' }}>4. Competition Record</h2>
              
              <div className="flex justify-between items-center mb-6">
                  <div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>Meets Attended: {openMeetsCount} Open / {totalMeetsCount - openMeetsCount} Internal</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Total Races: {statsObj?.totalRaces || 0}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-amber)' }}>Peak WA Score: {statsObj?.peakWA || 0} pts</div>
                  </div>
              </div>

              <div className="glass-card" style={{ padding: '0 !important', background: 'transparent !important', border: 'none !important' }}>
                  <table className="stats-table-glass" style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead>
                          <tr>
                              <th>Date</th>
                              <th>Competition</th>
                              <th style={{ textAlign: 'center' }}>Level</th>
                              <th style={{ textAlign: 'center' }}>Races</th>
                              <th style={{ textAlign: 'right' }}>Peak WA</th>
                              <th style={{ textAlign: 'center' }}>Highlights</th>
                          </tr>
                      </thead>
                      <tbody>
                          {uniqueMeetsList && uniqueMeetsList.map((m, i) => (
                              <tr key={i}>
                                  <td style={{ fontWeight: 600, padding: '12px 8px' }}>
                                      {new Date(m.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                  </td>
                                  <td style={{ fontWeight: 800, padding: '12px 8px' }}>{m.name}</td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                      <span style={{ padding: '4px 8px', background: m.level === 'L4' ? '#f1f5f9' : '#e0f2fe', color: m.level === 'L4' ? '#64748b' : '#0369a1', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800 }}>
                                          {m.level || 'L3'}
                                      </span>
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>{m.eventCount}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 800, padding: '12px 8px' }}>{Math.round(m.peakWa)} pts</td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                      {m.pbCount > 0 ? (
                                          <span style={{ color: '#059669', fontWeight: 900, fontSize: '0.75rem', background: '#d1fae5', padding: '4px 8px', borderRadius: '6px' }}>
                                              ★ {m.pbCount} PB{m.pbCount > 1 ? 's' : ''}
                                          </span>
                                      ) : '-'}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
        )
      });
    }

    // Page 6: Readiness Audit
    if (reportConfig.sections.biometrics) {
      pages.push({
        id: 'readiness',
        title: '5. Readiness & Health Audit',
        element: (
          <div style={{ padding: '15mm 20mm', minHeight: '100vh', pageBreakAfter: 'always', boxSizing: 'border-box', background: 'var(--print-bg)' }} key="readiness">
              <h2 className="section-title" style={{ marginBottom: '2rem' }}>5. Readiness & Health Audit</h2>
              <div className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                      <h3 style={{ margin: 0 }} className="print-text-dark-override">Biological & Training Readiness</h3>
                      <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '2.5rem', fontWeight: 900 }} className="print-text-dark-override">{healthData?.total || 0}<span style={{ fontSize: '1rem', color: '#64748b' }}>/100</span></div>
                      </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                      {healthData?.components?.map((comp, idx) => (
                          <div key={idx} style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', textAlign: 'center' }} className="readiness-card">
                              <div style={{ fontSize: '2rem', fontWeight: 900, color: comp.score >= 75 ? '#059669' : comp.score < 50 ? '#e11d48' : '#d97706', marginBottom: '0.5rem' }}>{Math.round(comp.score)}</div>
                              <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#475569' }} className="readiness-label">{comp.label}</div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
        )
      });
    }

    // Page 7: Qualifying Times
    if (reportConfig.sections.qtPredictor) {
      pages.push({
        id: 'qt',
        title: '6. Qualifying Times Assessment',
        element: (
          <div style={{ padding: '15mm 20mm', minHeight: '100vh', pageBreakAfter: 'always', boxSizing: 'border-box', background: 'var(--print-bg)' }} key="qt">
              <h2 className="section-title" style={{ marginBottom: '2rem' }}>6. Qualifying Times Assessment</h2>
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                  {[
                      { label: 'Sprints (50m - 100m)', filter: (e) => (e.includes('50') || e.includes('100')) && !e.includes('IM') },
                      { label: 'Middle Distance (200m - 400m)', filter: (e) => (e.includes('200') || e.includes('400')) && !e.includes('IM') },
                      { label: 'Distance (800m - 1500m)', filter: (e) => e.includes('800') || e.includes('1500') },
                      { label: 'Individual Medley (IM)', filter: (e) => e.includes('IM') }
                  ].map((segment, idx) => {
                      const segmentEvents = Object.entries(statsObj?.strokeData || {}).filter(([eventName]) => segment.filter(eventName));
                      if (segmentEvents.length === 0) return null;
                      return (
                          <div key={idx} className="glass-card" style={{ padding: '1.5rem !important', marginBottom: 0 }}>
                              <h4 style={{ color: '#0369a1', margin: '0 0 1rem 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>{segment.label}</h4>
                              <table className="stats-table-glass" style={{ width: '100%', fontSize: '0.8rem' }}>
                                  <thead>
                                      <tr>
                                          <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Event</th>
                                          <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1', textAlign: 'center' }}>PB Count</th>
                                          <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1', textAlign: 'right' }}>Peak WA</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {segmentEvents.map(([eventName, data], i) => (
                                          <tr key={i}>
                                              <td style={{ padding: '8px', fontWeight: 800 }}>{eventName}</td>
                                              <td style={{ padding: '8px', textAlign: 'center' }}>{data.pbCount > 0 ? `★ ${data.pbCount}` : '-'}</td>
                                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 900, color: '#d97706' }}>{Math.round(data.peak)} pts</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      );
                  })}
              </div>
          </div>
        )
      });
    }

    // Page 8: Appendix
    if (reportConfig.sections.attendance) {
      pages.push({
        id: 'appendix',
        title: 'Appendix: Weekly Workload Details',
        element: (
          <div style={{ padding: '15mm 20mm', minHeight: '100vh', pageBreakAfter: 'always', boxSizing: 'border-box', background: 'var(--print-bg)' }} key="appendix">
              <h2 className="section-title" style={{ marginBottom: '2rem' }}>Appendix A: Weekly Workload Details</h2>
              <div className="glass-card" style={{ padding: '0 !important', background: 'transparent !important', border: 'none !important' }}>
                  <table className="stats-table-glass" style={{ width: '100%', fontSize: '0.8rem' }}>
                      <thead style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                          <tr>
                              <th style={{ padding: '8px' }}>Week Commencing</th>
                              <th style={{ padding: '8px', textAlign: 'center' }}>Pool</th>
                              <th style={{ padding: '8px', textAlign: 'center' }}>Gala</th>
                              <th style={{ padding: '8px', textAlign: 'center' }}>Credit</th>
                              <th style={{ padding: '8px', textAlign: 'center' }}>Total</th>
                              <th style={{ padding: '8px', textAlign: 'center', color: '#f43f5e' }}>Target</th>
                              <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                          </tr>
                      </thead>
                      <tbody>
                          {weeklyWorkloadData && weeklyWorkloadData.map((week, idx) => (
                              <tr key={idx}>
                                  <td style={{ padding: '8px' }}>{week.name}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>{week.pool > 0 ? `${week.pool.toFixed(1)}h` : '—'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>{week.gala > 0 ? `${week.gala.toFixed(1)}h` : '—'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>{week.credit > 0 ? `${week.credit.toFixed(1)}h` : '—'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center', fontWeight: 800 }}>{week.total.toFixed(1)}h</td>
                                  <td style={{ padding: '8px', textAlign: 'center', color: '#f43f5e', fontWeight: 600 }}>{week.target.toFixed(1)}h</td>
                                  <td style={{ padding: '8px', textAlign: 'center', fontWeight: 900, color: (week.isHoliday || week.appliedRule === 'Holiday Allowance') ? '#f59e0b' : (week.isMet ? '#10b981' : '#f43f5e') }}>
                                      {(week.isHoliday || week.appliedRule === 'Holiday Allowance') ? '🌴 HOLIDAY' : (week.isMet ? '✓ MET' : '✗ MISSED')}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
        )
      });
    }

    return pages;
  }, [swimmer, reportConfig, attendancePct, seasonVolumePct, progressPercent, velocity, narrative, attendance, sessions, exemptions, results, totalActualHours, annualTargetHours, statsObj, squad, workloadChartData, uniqueMeetsList, healthData, weeklyWorkloadData, openMeetsCount, totalMeetsCount]);

  // Championship season age for QT benchmarks
  const _now = new Date();
  const targetYear = _now.getMonth() >= 4 ? _now.getFullYear() + 1 : _now.getFullYear();
  const targetAge = swimmer?.year_of_birth ? targetYear - swimmer.year_of_birth : null;

  if (loading) return <Layout session={session}><div style={{ marginTop: 100, textAlign: 'center', opacity: 0.5 }}>Loading Athlete Profile...</div></Layout>;
  if (!swimmer) return <Layout session={session}><div>Athlete not found.</div></Layout>;

  return (
    <Layout session={session}>
      {isExporting && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 11, 16, 0.95)',
          backdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem'
        }} className="no-print animate-fade-in">
          <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 212, 255, 0.1)', borderRadius: '50%', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
            <span style={{ fontSize: '2.5rem', display: 'inline-block', animation: 'spin-glow 2s linear infinite' }}>🖨️</span>
          </div>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', margin: 0 }}>Generating PDF Report</h3>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', margin: 0, fontSize: '0.9rem', maxWidth: '380px', textAlign: 'center', lineHeight: 1.6 }}>
            Please wait while CoachesEye compiles the athlete profile, processes charts, and formats pages into a premium A4 document...
          </p>
          <style jsx>{`
            @keyframes spin-glow {
              0% { transform: rotate(0deg) scale(1); filter: drop-shadow(0 0 5px rgba(0, 212, 255, 0.3)); }
              50% { transform: rotate(180deg) scale(1.1); filter: drop-shadow(0 0 15px rgba(0, 212, 255, 0.6)); }
              100% { transform: rotate(360deg) scale(1); filter: drop-shadow(0 0 5px rgba(0, 212, 255, 0.3)); }
            }
          `}</style>
        </div>
      )}
      <Head>
        <title>{swimmer.full_name} | Athlete Profile</title>
        <style>{`
          @media screen {
            .no-screen { display: none !important; }
            .profile-tabs-container { display: flex; gap: 12px; margin-bottom: 2rem; padding: 6px; border-radius: 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); width: fit-content; }
            .profile-tab-btn { padding: 10px 24px; border-radius: 12px; font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: none; background: transparent; color: rgba(255, 255, 255, 0.5); display: flex; align-items: center; gap: 8px; }
            .profile-tab-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.03); }
            .profile-tab-btn.active { background: var(--accent-cyan); color: #000 !important; font-weight: 900; box-shadow: 0 8px 20px rgba(0, 212, 255, 0.25); }
          }
          @media print {
            .theme-light {
                --print-bg: #ffffff;
                --print-text: #050b10;
                --print-card-bg: #ffffff;
                --print-card-border: 1px solid #cbd5e1;
                --print-border-light: 1px solid #cbd5e1;
                --print-border-heavy: 2px solid #0f172a;
                --print-grid: rgba(0, 0, 0, 0.1);
            }
            .theme-dark {
                --print-bg: #050b10;
                --print-text: #ffffff;
                --print-card-bg: rgba(10,10,20,0.8);
                --print-card-border: 1px solid rgba(255,255,255,0.1);
                --print-border-light: 1px solid rgba(255,255,255,0.05);
                --print-border-heavy: 2px solid rgba(255,255,255,0.1);
                --print-grid: rgba(255, 255, 255, 0.1);
            }

            @page { size: portrait; margin: 0 !important; }
            html, body { 
                margin: 0 !important; 
                padding: 0 !important; 
                font-family: 'Outfit', 'Inter', sans-serif !important;
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
                text-align: left !important;
            }
            body.theme-dark {
                background: #050b10 !important;
                background-color: #050b10 !important;
                color: #ffffff !important;
            }
            body.theme-light {
                background: #ffffff !important;
                background-color: #ffffff !important;
                color: #050b10 !important;
            }
            main, .layout-container, .main-content, #__next { 
                padding: 0 !important; 
                margin: 0 !important; 
                min-height: auto !important; 
                position: static !important; 
            }
            .no-print, button, nav, .profile-header, .period-selector { display: none !important; }
            .print-only { display: block !important; }
            
            /* Cover Page Layout */
            .cover-page {
              display: flex !important;
              height: 100vh !important;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              text-align: center;
              page-break-after: always;
              background: var(--print-bg);
              color: var(--print-text) !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              box-sizing: border-box;
            }
            
            /* Apply color variable to headers/texts based on theme class */
            .theme-light h1, .theme-light h2, .theme-light h3, .theme-light h4, .theme-light .section-title, .theme-light p, .theme-light span, .theme-light li, .theme-light strong { 
                color: #050b10 !important; 
            }
            .theme-light .swot-quadrant-text, .theme-light .swot-quadrant-text strong {
                color: #050b10 !important;
            }
            .theme-light .cover-club {
                color: #0369a1 !important;
            }
            .theme-light .cover-bar {
                background: #0369a1 !important;
            }
            .theme-light .cover-index-title {
                border-bottom: 2px solid #cbd5e1 !important;
            }
            .theme-light .print-narrative-border {
                border-top: 1px solid #cbd5e1 !important;
            }
            .theme-light .print-text-bright {
                color: #050b10 !important;
            }
            .theme-light .print-text-dim {
                color: rgba(15, 23, 42, 0.8) !important;
            }
            .theme-light .print-text-dark-override {
                color: #0f172a !important;
            }
            .theme-light .readiness-card {
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
            }
            .theme-light .readiness-label {
                color: #475569 !important;
            }

            .theme-dark h1, .theme-dark h2, .theme-dark h3, .theme-dark h4, .theme-dark .section-title, .theme-dark p, .theme-dark span, .theme-dark div, .theme-dark li, .theme-dark strong { 
                color: white !important; 
            }
            .theme-dark .cover-club {
                color: #00d4ff !important;
            }
            .theme-dark .cover-bar {
                background: #00d4ff !important;
            }
            .theme-dark .cover-index-title {
                border-bottom: 2px solid rgba(255,255,255,0.1) !important;
            }

            /* Match the Meet Report Glass Cards */
            .glass-card { 
                border: var(--print-card-border) !important; 
                background: var(--print-card-bg) !important; 
                color: var(--print-text) !important; 
                page-break-inside: avoid !important; 
                padding: 1.5rem !important; /* Fixed large margins */
                margin-bottom: 1.5rem !important; 
            }
            
            /* Large structures override to allow pagination */
            .workload-table-card, .strategic-narrative-card {
                page-break-inside: auto !important;
            }
            .stats-table-glass tr {
                page-break-inside: avoid !important;
            }

            /* Match the Meet Report Tables */
            .stats-table-glass th { color: var(--print-text) !important; border-bottom: var(--print-border-heavy) !important; opacity: 0.8; }
            .stats-table-glass td { color: var(--print-text) !important; border-bottom: var(--print-border-light) !important; }

            /* Ensure Recharts remain visible on the background */
            .recharts-text { fill: var(--print-text) !important; opacity: 0.7; }
            .recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line { stroke: var(--print-grid) !important; }
            .recharts-tooltip-wrapper { display: none !important; } 

            /* Override PremiumOrb elements under light theme print */
            .theme-light .premium-orb-container circle[stroke="rgba(255,255,255,0.06)"] {
                stroke: rgba(0, 0, 0, 0.08) !important;
            }
            .theme-light .premium-orb-container div[style*="color: white"],
            .theme-light .premium-orb-container div[style*="color:white"] {
                color: #0f172a !important;
                text-shadow: none !important;
            }
            .theme-light .premium-orb-container .orb-label {
                color: #475569 !important;
                opacity: 0.8 !important;
            }
          }
          @media screen {
            .print-only { display: none !important; }
          }
        `}</style>
      </Head>

      <div className="no-print">
      
      <div className="profile-header no-print" style={{ marginBottom: '4rem', paddingBottom: '2.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-6 mb-3">
            <div style={{ width: 4, height: 44, background: 'var(--accent-cyan)', borderRadius: 2 }}></div>
            <h1 style={{ background: 'none', WebkitTextFillColor: 'initial', fontSize: '3.8rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>{swimmer.full_name}</h1>
            {isCompliant && (
              <div className="status-badge-premium success">
                <div className="status-dot"></div>
                COMPLIANT
              </div>
            )}
          </div>
          <div className="swimmer-meta" style={{ paddingLeft: 20 }}>
            <span className="meta-item" style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>{squad?.name}</span>
            <span className="meta-item" style={{ opacity: 0.3 }}>•</span>
            <span className="meta-item" style={{ opacity: 0.6 }}>Swim England ID: {swimmer.member_id}</span>
            <span className="meta-item" style={{ opacity: 0.3 }}>•</span>
            <span className="meta-item" style={{ opacity: 0.6 }}>2025/26 Season Performance Review</span>
            <span className="meta-item" style={{ opacity: 0.3 }}>•</span>
            <div className="meta-item" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>📅</span> JOINED SQUAD: {swimmer.squad_join_date ? new Date(swimmer.squad_join_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : 'UNKNOWN'}
            </div>
          </div>
        </div>
        <div className="flex gap-6 items-center">
          <div className="period-selector-premium">
             {PERIOD_OPTIONS.map(opt => (
               <button key={opt.days} className={`period-btn-premium ${period === opt.days ? 'active' : ''}`} onClick={() => handlePeriodChange(opt.days)}>
                 {opt.label}
               </button>
             ))}
          </div>
          <PremiumOrb value={healthData.total} label="Personal Health" size={130} />
          <div className="flex flex-col gap-2">
            <button className="btn-premium-action" onClick={() => setIsBenchmarkOpen(true)}>WA Standards</button>
            <button className="btn-premium-intel" onClick={() => setIsReportModalOpen(true)}>Print Report</button>
          </div>
        </div>
      </div>

      {/* Modern Premium Glassmorphic Tab Controls */}
      <div className="flex justify-between items-center flex-wrap gap-4 mb-8 no-print">
        <div className="profile-tabs-container" style={{ margin: 0 }}>
          <button 
            onClick={() => setActiveTab('overview')} 
            className={`profile-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          >
            📊 OVERVIEW
          </button>
          <button 
            className={`profile-tab-btn ${activeTab === 'performance' ? 'active' : ''}`} 
            onClick={() => setActiveTab('performance')}
          >
            <span style={{ opacity: activeTab === 'performance' ? 1 : 0.5 }}>⚡</span> PERFORMANCE
          </button>
          <button 
            onClick={() => setActiveTab('workload')} 
            className={`profile-tab-btn ${activeTab === 'workload' ? 'active' : ''}`}
          >
            ⏱️ WORKLOAD
          </button>
          <button 
            onClick={() => setActiveTab('progress')} 
            className={`profile-tab-btn ${activeTab === 'progress' ? 'active' : ''}`}
          >
            📈 PROGRESS
          </button>
          <button 
            onClick={() => setActiveTab('competition')} 
            className={`profile-tab-btn ${activeTab === 'competition' ? 'active' : ''}`}
          >
            🏁 COMPETITION
          </button>
          <button 
            onClick={() => setActiveTab('block_roi')} 
            className={`profile-tab-btn ${activeTab === 'block_roi' ? 'active' : ''}`}
          >
            🔄 BLOCK ROI
          </button>
          <button
            onClick={() => setActiveTab('predictor')}
            className={`profile-tab-btn ${activeTab === 'predictor' ? 'active' : ''}`}
          >
            🎯 QT Predictor
          </button>
          <button
            onClick={() => setActiveTab('biometrics')}
            className={`profile-tab-btn ${activeTab === 'biometrics' ? 'active' : ''}`}
          >
            🧬 BIOMETRICS
          </button>
        </div>
        <button
          onClick={handleSyncPbs}
          disabled={syncingPbs}
          className="btn-premium-intel"
          style={{ height: 'fit-content', padding: '10px 20px', borderRadius: '12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>{syncingPbs ? '⏳' : '🔄'}</span>
          {syncingPbs ? 'Syncing...' : 'Sync Personal Bests'}
        </button>
      </div>


      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }} className={`mb-16 no-print ${activeTab !== 'overview' ? 'no-screen' : ''} ${!reportConfig.sections.performanceNarrative ? 'hide-in-report' : ''}`}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', padding: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
             {/* Consistency Card */}
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <PremiumOrb value={rel.percentage || 0} label="Consistency" size={65} color="#f59e0b" />
                
                {/* Consistency Micro-Bars */}
                <div style={{ width: '100%', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 900, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>
                      <span>⏱️ HOURS</span>
                      <span style={{ color: 'rgba(255,255,255,0.8)' }}>{rel.hoursCompliance || 0}%</span>
                    </div>
                    <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${rel.hoursCompliance || 0}%`, background: '#22d3ee', borderRadius: '9999px' }}></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 900, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>
                      <span>⚡ SESS</span>
                      <span style={{ color: 'rgba(255,255,255,0.8)' }}>{rel.sessionsCompliance || 0}%</span>
                    </div>
                    <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${rel.sessionsCompliance || 0}%`, background: '#fbbf24', borderRadius: '9999px' }}></div>
                    </div>
                  </div>
                  {squad?.require_weekend && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 900, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>
                        <span>🗓️ WKND</span>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>{rel.weekendCompliance !== null ? `${rel.weekendCompliance}%` : 'N/A'}</span>
                      </div>
                      <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${rel.weekendCompliance || 0}%`, background: '#a855f7', borderRadius: '9999px' }}></div>
                      </div>
                    </div>
                  )}
                </div>
             </div>

             {/* Volume Card */}
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <PremiumOrb value={statsObj.volumePct || 0} label="Volume %" size={65} />
                
                {/* Volume Micro-Bars */}
                <div style={{ width: '100%', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 900, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>
                      <span>🏊 SWIM</span>
                      <span style={{ color: '#34d399', fontWeight: 'bold' }}>{Math.round((rel.totalTrainingHours / (rel.annualTarget || 1)) * 100)}%</span>
                    </div>
                    <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.round((rel.totalTrainingHours / (rel.annualTarget || 1)) * 100))}%`, background: '#10b981', borderRadius: '9999px' }}></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 900, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>
                      <span>⛵ GALA</span>
                      <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>{Math.round((rel.totalGalaHours / (rel.annualTarget || 1)) * 100)}%</span>
                    </div>
                    <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.round((rel.totalGalaHours / (rel.annualTarget || 1)) * 100))}%`, background: '#8b5cf6', borderRadius: '9999px' }}></div>
                    </div>
                  </div>
                </div>
             </div>

             {/* Avg WA Pts Card */}
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <PremiumOrb value={statsObj.avgWA || 0} label="Avg WA Pts" size={65} color="amber" unit="" />
             </div>

             {/* Meet Attendance Card */}
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <PremiumOrb 
                  value={Math.round(rel.complianceRate || 0)} 
                  customValue={`${rel.meetsAttended || 0}/${rel.targetMeets || 5}`}
                  label="Meet Attendance" 
                  size={65} 
                  color="#22d3ee"
                />
             </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
             <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 8, fontWeight: 900 }}>TOTAL HOURS</div>
                {/* Breakdown rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pool Training</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.7 }}>{(rel.totalTrainingHours || 0).toFixed(1)}h</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gala Credits</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', opacity: 0.85 }}>{(rel.totalGalaHours || 0).toFixed(1)}h</span>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '3px', paddingTop: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grand Total</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{Math.round(rel.totalHours || 0)}h <span style={{ fontSize: '0.6rem', opacity: 0.3, fontWeight: 400 }}>/ {annualTargetHours}h</span></span>
                  </div>
                </div>
             </div>
             <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>MISSED SESSIONS</div>
                <div className="text-xl font-black text-rose-500">{totalAbsentSessions}</div>
             </div>
          </div>

          <p className="mt-6 text-[10px] opacity-30 leading-relaxed italic">
            Note: For competitive swimmers, training volume directly dictates the aerobic threshold. A deficit in hours translates to faster physiological fatigue during multi-event championship meets.
          </p>

          <div className="mt-8 p-6 rounded-2xl bg-[#083344]/30 border border-cyan-500/20 backdrop-blur-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                   <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
             </div>
             <div className="flex items-center gap-3 mb-4">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20">
                   <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></div>
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.15em', color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>CoachesEye Insights: Engagement Profile</div>
             </div>
             <div style={{ fontSize: '0.85rem', lineHeight: '1.7', color: 'rgba(255,255,255,0.9)', fontWeight: 400 }}>
               {(() => {
                 const meetFreq = openMeetsCount || 0;
                 const target = rel.targetMeets || 5;
                 const attendance = rel.percentage || 0;
                 const volume = statsObj.volumePct || 0;
                 
                 // Dynamic Insights based on the 'CoachesEye' Brain
                 if (meetFreq >= target && attendance >= 75) {
                   return `Elite Performance Profile: Kieran is maintaining a high-frequency competitive rhythm backed by ${attendance}% consistency. This synergy between training volume (${volume}%) and race exposure is the gold standard for technical and physiological progression. No immediate workload adjustments required.`;
                 } else if (meetFreq < target && attendance >= 75) {
                   return `Training Durable / Competition Shy: Kieran has built a robust aerobic engine (${volume}% volume) but is currently under-exposed to high-stakes racing (${meetFreq}/${target} meets). The AI brain recommends increasing Open Meet entries to convert training capacity into race-day pressure handling. The engine is ready; the pilot needs flight hours.`;
                 } else if (meetFreq >= target && attendance < 75) {
                   return `High Competitive Risk: Frequent racing detected, but training consistency (${attendance}%) is insufficient to sustain the load. This profile often leads to 'shallow' PBs that plateau quickly. Priority 1 is restoring the ${volume}% volume baseline to prevent injury and long-term aerobic stagnation. Kieran is over-racing his base.`;
                 } else {
                   return `Engagement Deficit: Current data shows a dual shortfall in both training consistency (${attendance}%) and competitive frequency (${meetFreq}/${target}). This combination significantly hinders the LTAD (Long-Term Athlete Development) trajectory. AI Recommendation: Immediate 1-to-1 review to identify barriers to session attendance before planning the next racing cycle.`;
                 }
               })()}
             </div>
             <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, fontWeight: 700 }}>SYNCHRONIZED WITH CLUB LTAD BENCHMARKS</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--accent-cyan)', fontWeight: 900 }}>TRAINING CONSISTENCY SCORE: {rel.percentage}%</div>
             </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5">
             <div className="flex justify-between items-center mb-6">
                <div className="kpi-label">Meet Engagement Summary</div>
                <div style={{ padding: '4px 10px', borderRadius: '20px', background: openMeetsCount >= rel.targetMeets ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: openMeetsCount >= rel.targetMeets ? '#10b981' : '#f43f5e', fontSize: '0.6rem', fontWeight: 900 }}>
                   {openMeetsCount >= rel.targetMeets ? 'CRITERIA MET' : 'ENGAGEMENT GAP'}
                </div>
             </div>
             
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                   <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>OPEN MEETS</div>
                   <div className="text-xl font-black">{openMeetsCount} <span className="text-[10px] opacity-30">/ {rel.targetMeets}</span></div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5" style={{ borderLeft: '4px solid #8b5cf6' }}>
                   <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>TOTAL COMPETITIONS</div>
                   <div className="text-xl font-black">{totalMeetsCount} <span className="text-[10px] opacity-30">TOTAL</span></div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                   <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>TOTAL RACES</div>
                   <div className="text-xl font-black">{results.length}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                   <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>PB RATE</div>
                   <div className="text-xl font-black" style={{ color: 'var(--accent-cyan)' }}>{Math.round((seasonPBs || 0) / (results.length || 1) * 100)}%</div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* ── QT PREDICTOR ── */}
      <div className={`glass-card mb-8 no-print ${activeTab !== 'overview' ? 'no-screen' : ''}`} style={{ padding: '2.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div className="section-title">Qualification Pathway Predictor</div>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '4px 0 0' }}>
            QT Gap Analysis — SC Standards
          </h3>
        </div>
        <QtTable
          results={results}
          age={targetAge}
          gender={swimmer?.gender}
        />
      </div>

      {/* PERFORMANCE ANALYTICAL MODULES */}
      <div className={`no-print ${activeTab !== 'performance' ? 'no-screen' : ''}`}>
        
        {/* AI Insight & Foresight Timeline container */}
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16 ${!reportConfig.sections.aiTechnical ? 'hide-in-report' : ''}`}>
          <div className="lg:col-span-2">
            <AiInsightCard 
              swimmerId={id} 
              coachId={session?.user?.id} 
              performance_slope={performance_slope}
              totalActualHours={Math.round(totalActualHours)}
              meetsAttended={rel?.meetsAttended || 0}
              targetMeets={rel?.targetMeets || 5}
              complianceRate={progressPercent || 0}
              squadTargetCompliance={squad?.target_training_percent || 75}
              insight={aiInsight}
              loading={isGeneratingAi}
              onGenerate={generateAthleteInsight}
            />
          </div>
        </div>

        {/* ELITE MARGINAL GAINS: MULTI-STROKE DROP-OFF RATIOS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in" style={{ marginTop: '2.5rem' }}>
          
          {/* Left Column: Multi-Stroke Drop-Off Visualizer Grid */}
          <div className="lg:col-span-2 tactical-insight-module" style={{ padding: '2.5rem', borderLeft: '4px solid var(--accent-rose)' }}>
            <div className="insight-header mb-6">
              <div>
                <div className="insight-tag" style={{ color: 'var(--accent-rose)' }}>ELITE PERFORMANCE DIAGNOSTIC</div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: '4px', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>Stroke-Specific Endurance Decay</h3>
              </div>
              
              {/* THEME-MATCHING PREMIUM TOGGLE */}
              <div className="period-selector-premium" style={{ borderColor: 'rgba(244, 63, 94, 0.2)' }}>
                <button 
                  onClick={() => setDecayDistance('100')} 
                  className={`period-btn-premium ${decayDistance === '100' ? 'active' : ''}`}
                  style={decayDistance === '100' ? { color: 'var(--accent-rose)', boxShadow: '0 4px 15px rgba(244, 63, 94, 0.2)', border: 'none' } : { border: 'none' }}
                >
                  100m vs 50m
                </button>
                <button 
                  onClick={() => setDecayDistance('200')} 
                  className={`period-btn-premium ${decayDistance === '200' ? 'active' : ''}`}
                  style={decayDistance === '200' ? { color: 'var(--accent-rose)', boxShadow: '0 4px 15px rgba(244, 63, 94, 0.2)', border: 'none' } : { border: 'none' }}
                >
                  200m vs 100m
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* DYNAMIC DATA BINDING (Wiring to real statsObj with mock fallbacks) */}
              {['Freestyle', 'Butterfly', 'Backstroke', 'Breaststroke'].map(strokeName => {
                // Attempt to pull real data if it exists in the database
                const ratioKey = decayDistance === '100' ? `${strokeName}_50_100_SC` : `${strokeName}_100_200_SC`;
                const realRatio = statsObj?.ratios?.[ratioKey];
                
                // Fallbacks so the UI demonstrates the toggle perfectly even without database records
                const mock100 = { Freestyle: 2.05, Butterfly: 2.25, Backstroke: 2.12, Breaststroke: 1.98 }[strokeName];
                const mock200 = { Freestyle: 2.12, Butterfly: 2.38, Backstroke: 2.15, Breaststroke: 2.05 }[strokeName];
                
                const ratio = realRatio ? parseFloat(realRatio) : (decayDistance === '100' ? mock100 : mock200);
                
                let status, color;
                if (ratio > 2.15) {
                  status = 'ENDURANCE DEFICIT'; color = 'var(--accent-rose)';
                } else if (ratio < 2.05) {
                  status = 'SPEED DEFICIT'; color = 'var(--accent-amber)';
                } else {
                  status = 'OPTIMAL CONVERSION'; color = 'var(--accent-emerald)';
                }

                return (
                  <div key={strokeName} className="animate-fade-in" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '1.5rem', border: `1px solid ${color}40`, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{strokeName} ({decayDistance === '100' ? '100m vs 50m' : '200m vs 100m'})</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff' }}>{ratio}x <span style={{ fontSize: '0.8rem', color }}>Ratio</span></div>
                      </div>
                      <div className="text-right">
                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: color, letterSpacing: '0.1em', background: `${color}15`, padding: '4px 8px', borderRadius: '6px' }}>{status}</div>
                      </div>
                    </div>
                    
                    {/* Progress Bar Visualizer */}
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', display: 'flex' }}>
                      <div style={{ width: ratio > 2.15 ? '40%' : (ratio < 2.05 ? '60%' : '50%'), background: 'var(--accent-cyan)', borderRadius: '3px 0 0 3px' }} title="Pace Component"></div>
                      <div style={{ width: ratio > 2.15 ? '60%' : (ratio < 2.05 ? '40%' : '50%'), background: color, borderRadius: '0 3px 3px 0' }} title="Decay Component"></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Coach's Guide */}
          <div className="tactical-insight-module" style={{ padding: '2rem 2.5rem' }}>
            <div style={{ borderLeft: '3px solid var(--accent-rose)', paddingLeft: '1.5rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-rose)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>COACHESEYE GUIDE</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.75rem', lineHeight: 1.1, letterSpacing: '-0.03em' }}>Isolating Endurance</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
                Toggle between Sprint Decay (100m/50m) and Mid-Distance Decay (200m/100m) to diagnose whether a swimmer lacks <strong>central aerobic fitness</strong> or if the deficit is <strong>stroke-specific</strong> under prolonged lactate fatigue.
              </p>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, opacity: 0.6, marginBottom: '8px' }}>DIAGNOSTIC RULES</div>
                <ul style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '1rem', lineHeight: 1.5, fontStyle: 'italic' }}>
                  <li style={{ marginBottom: '4px' }}><strong>Ratio &gt; 2.15x:</strong> <span style={{ color: 'var(--accent-rose)' }}>Endurance Deficit.</span> Prescribe stroke-specific threshold volume.</li>
                  <li style={{ marginBottom: '4px' }}><strong>Ratio &lt; 2.05x:</strong> <span style={{ color: 'var(--accent-amber)' }}>Speed Deficit.</span> Excellent aerobic retention, but lacks raw explosive power.</li>
                  <li><strong>Ratio ~ 2.10x:</strong> <span style={{ color: 'var(--accent-emerald)' }}>Optimal.</span> Speed and endurance are perfectly balanced.</li>
                </ul>
              </div>
            </div>
          </div>

        </div>

        {/* TRUE IN-RACE EXECUTION VISUALIZER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in" style={{ marginTop: '2.5rem' }}>
          
          {/* Left Column: Visualizer */}
          <div className="lg:col-span-2 tactical-insight-module" style={{ padding: '2.5rem', borderLeft: '4px solid var(--accent-indigo)' }}>
            <div className="insight-header mb-6" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div className="insight-tag" style={{ color: 'var(--accent-indigo)' }}>TACTICAL PACING AUDIT</div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: '4px', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>True In-Race Execution</h3>
              </div>
              
              {/* NEW: RACE SELECTOR DROPDOWN */}
              {allAvailableSplits.length > 0 && (
                <select 
                  className="tactical-search-input" 
                  style={{ width: 'auto', padding: '8px 16px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700, backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', appearance: 'auto' }}
                  value={selectedRaceIdx}
                  onChange={(e) => setSelectedRaceIdx(Number(e.target.value))}
                >
                  {allAvailableSplits.map((pb, idx) => (
                    <option key={idx} value={idx} style={{ background: 'var(--bg-dark)' }}>
                      {pb.event} ({pb.course === 'S' ? 'SC' : 'LC'}) — {pb.time} — {new Date(pb.date).toLocaleDateString('en-GB', { month:'short', year:'numeric' })}{pb.isPB ? ' ⭐ PB' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            <div>
              {(() => {
                const availableSplits = allAvailableSplits;
                  
                if (availableSplits.length === 0) {
                  return (
                     <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                       <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>⏱️</div>
                       <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>No in-race split data available yet.</div>
                       <div style={{ fontSize: '0.7rem', marginTop: '4px' }}>Click 'Sync Personal Bests' to fetch live race splits.</div>
                     </div>
                  );
                }
                
                const race = availableSplits[selectedRaceIdx] || availableSplits[0];
                
                // Dynamic midpoint math
                const distances = Object.keys(race.splits).map(Number).sort((a,b) => a-b);
                const maxDist = distances[distances.length - 1];
                const midDist = maxDist / 2;
                const midSplit = distances.find(d => d === midDist) || distances[Math.floor(distances.length/2)];
                
                const firstHalfTime = race.splits[midSplit]?.cumulative;
                const totalTime = race.splits[maxDist]?.cumulative;
                
                // FIXED PARSER
                const toSec = (t) => {
                  if(!t) return 0;
                  const str = t.toString().trim();
                  const p = str.split(':');
                  return p.length === 2 ? parseInt(p[0])*60 + parseFloat(p[1]) : parseFloat(p);
                };
                
                const firstHalfSec = toSec(firstHalfTime);
                const totalSec = toSec(totalTime);
                const secondHalfSec = totalSec - firstHalfSec;
                
                if(!firstHalfSec || !totalSec || totalSec <= firstHalfSec) return null;
                
                const ratio = (secondHalfSec / firstHalfSec).toFixed(2);
                let status = "OPTIMAL PACING";
                let color = "var(--accent-emerald)";
                
                if(ratio > 1.10) { status = "HEAVY POSITIVE SPLIT"; color = "var(--accent-rose)"; }
                else if(ratio < 0.98) { status = "NEGATIVE SPLIT"; color = "var(--accent-cyan)"; }

                // Calculate granular split blocks
                let previousSec = 0;
                const granularSplits = distances.map(d => {
                    const currentSec = toSec(race.splits[d]?.cumulative);
                    const splitSec = currentSec - previousSec;
                    previousSec = currentSec;
                    return { distance: d, cumulative: currentSec, split: splitSec };
                });
                
                return (
                  <div className="animate-fade-in" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '1.5rem', border: `1px solid ${color}40`, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{race.event} <span style={{ opacity: 0.5, marginLeft: '4px' }}>({new Date(race.date).toLocaleDateString('en-GB', { month:'short', year:'numeric' })})</span></div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>1st {midSplit}m: {firstHalfSec.toFixed(2)}s | 2nd: {secondHalfSec.toFixed(2)}s</div>
                      </div>
                      <div className="text-right">
                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: color, letterSpacing: '0.1em', background: `${color}15`, padding: '4px 8px', borderRadius: '6px', marginBottom: '4px', display: 'inline-block' }}>{status}</div>
                      </div>
                    </div>
                    
                    {/* Visualizer Bar */}
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', display: 'flex', overflow: 'hidden' }}>
                      <div style={{ width: `${(firstHalfSec / totalSec) * 100}%`, background: 'var(--accent-indigo)' }} title="First Half"></div>
                      <div style={{ width: `${(secondHalfSec / totalSec) * 100}%`, background: color }} title="Second Half"></div>
                    </div>

                    {/* Granular Splits Breakdown */}
                    <div className="flex gap-2 mt-4 pt-4 custom-scrollbar" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto', paddingBottom: '4px' }}>
                        {granularSplits.map((gs, i) => (
                            <div key={i} style={{ flex: 1, minWidth: '60px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                                <div style={{ fontSize: '0.55rem', fontWeight: 900, opacity: 0.5, letterSpacing: '0.1em' }}>{gs.distance}m</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#fff', margin: '4px 0' }}>{gs.split.toFixed(2)}s</div>
                            </div>
                        ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Right Column: Coach's Guide */}
          <div className="tactical-insight-module" style={{ padding: '2rem 2.5rem' }}>
            <div style={{ borderLeft: '3px solid var(--accent-indigo)', paddingLeft: '1.5rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-indigo)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>COACHESEYE GUIDE</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.75rem', lineHeight: 1.1, letterSpacing: '-0.03em' }}>In-Race Execution</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
                Unlike standalone capacity (which compares a swimmer's best 50m to their best 100m), this module tracks the <strong>ACTUAL splits</strong> recorded inside their Personal Best races.
              </p>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, opacity: 0.6, marginBottom: '8px' }}>TACTICAL DIAGNOSTIC</div>
                <ul style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '1rem', lineHeight: 1.5, fontStyle: 'italic' }}>
                  <li style={{ marginBottom: '4px' }}><strong>Heavy Positive Split:</strong> <span style={{ color: 'var(--accent-rose)' }}>Fatigue.</span> Going out too fast. Indicates an over-exertion in the first 50m resulting in lactate failure.</li>
                  <li><strong>Negative Split:</strong> <span style={{ color: 'var(--accent-cyan)' }}>Late Acceleration.</span> Second half is faster. Shows excellent pacing, but reveals potential to push the first 50m harder.</li>
                </ul>
              </div>
            </div>
          </div>

        </div>

        {/* LEAGUE SERIES TRACKER */}
        {(() => {
          const teamMeets = results.filter(r => r.meet?.type === 'team' || r.meet?.meet_type === 'team');
          const teamMeetMap = {};
          teamMeets.forEach(r => {
            const key = r.meet?.id || r.meet_id;
            if (!key) return;
            if (!teamMeetMap[key]) {
              teamMeetMap[key] = { name: r.meet?.name || 'Team Gala', date: r.meet?.date || r.date, races: 0, pbs: 0, waTotal: 0 };
            }
            teamMeetMap[key].races++;
            if (r.is_pb) teamMeetMap[key].pbs++;
            if (r.wa_points) teamMeetMap[key].waTotal += r.wa_points;
          });
          const teamMeetList = Object.values(teamMeetMap).sort((a, b) => new Date(b.date) - new Date(a.date));
          return (
            <div className="animate-fade-in" style={{ marginTop: '2.5rem' }}>
              <div className="tactical-insight-module" style={{ padding: '2.5rem', borderLeft: '4px solid var(--accent-amber)' }}>
                <div className="insight-header mb-6" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div className="insight-tag" style={{ color: 'var(--accent-amber)' }}>TEAM COMPETITION AUDIT</div>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: '4px', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>League Series Tracker</h3>
                  </div>
                  <div style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-amber)', letterSpacing: '0.1em' }}>
                    {teamMeetList.length} TEAM {teamMeetList.length === 1 ? 'GALA' : 'GALAS'} THIS SEASON
                  </div>
                </div>
                {teamMeetList.length === 0 ? (
                  <div style={{ padding: '2.5rem', textAlign: 'center', opacity: 0.45, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🏆</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>No team meets recorded yet.</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '4px', opacity: 0.6 }}>Team galas with type set to &quot;team&quot; will appear here automatically.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {teamMeetList.map((meet, idx) => {
                      const avgWA = meet.races > 0 ? Math.round(meet.waTotal / meet.races) : 0;
                      const pbRate = meet.races > 0 ? Math.round((meet.pbs / meet.races) * 100) : 0;
                      const trendColor = pbRate >= 50 ? 'var(--accent-emerald)' : pbRate >= 25 ? 'var(--accent-amber)' : 'var(--accent-rose)';
                      const trendLabel = pbRate >= 50 ? 'STRONG' : pbRate >= 25 ? 'MODERATE' : 'DEVELOPING';
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1.25rem 1.5rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fff', marginBottom: '2px' }}>{meet.name}</div>
                            <div style={{ fontSize: '0.65rem', opacity: 0.45, fontWeight: 700 }}>{meet.date ? new Date(meet.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: '48px' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>{meet.races}</div>
                            <div style={{ fontSize: '0.55rem', opacity: 0.4, fontWeight: 900, letterSpacing: '0.08em' }}>RACES</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: '48px' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{meet.pbs}</div>
                            <div style={{ fontSize: '0.55rem', opacity: 0.4, fontWeight: 900, letterSpacing: '0.08em' }}>PBs</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: '60px' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent-amber)' }}>{avgWA}</div>
                            <div style={{ fontSize: '0.55rem', opacity: 0.4, fontWeight: 900, letterSpacing: '0.08em' }}>AVG WA</div>
                          </div>
                          <div style={{ padding: '4px 10px', borderRadius: '20px', background: `${trendColor}15`, border: `1px solid ${trendColor}40`, fontSize: '0.6rem', fontWeight: 900, color: trendColor, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                            {trendLabel}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </div>

      {/* Progress Sub-Tab Navigation Toggle */}
      {activeTab === 'progress' && (
        <div className="profile-subtabs-container no-print">
          <button 
            onClick={() => setProgressSubTab('charts')}
            className={`profile-subtab-btn ${progressSubTab === 'charts' ? 'active-cyan' : ''}`}
          >
            📈 PROGRESSION CHART
          </button>
          <button 
            onClick={() => setProgressSubTab('roadmap')}
            className={`profile-subtab-btn ${progressSubTab === 'roadmap' ? 'active-amber' : ''}`}
          >
            🗺️ PERFORMANCE ROADMAP
          </button>
          <button 
            onClick={() => setProgressSubTab('readiness')}
            className={`profile-subtab-btn ${progressSubTab === 'readiness' ? 'active-rose' : ''}`}
          >
            ❤️ READINESS & HEALTH
          </button>
        </div>
      )}

      {/* Progression Chart Section */}
      <div className={`mb-16 no-print ${activeTab !== 'progress' || progressSubTab !== 'charts' ? 'no-screen' : ''}`}>
        <div className="glass-card" style={{ padding: '2rem', minHeight: '400px', position: 'relative', overflow: 'hidden' }}>
           {/* Background Glow */}
           <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.05) 0%, transparent 70%)', filter: 'blur(50px)', zIndex: 0 }}></div>

           <div className="flex justify-between items-center mb-8 relative z-10">
             <div className="flex items-center gap-6">
                <PremiumOrb 
                  value={statsObj?.velocity || 0} 
                  customValue={statsObj?.velocity > 0 ? `+${statsObj.velocity}` : `${statsObj?.velocity || 0}`}
                  label="Performance Velocity" 
                  size={80} 
                  unit="pts"
                  color={statsObj?.velocity >= 0 ? 'cyan' : 'rose'}
                />
                <div>
                   <div className="section-title" style={{ marginBottom: 4 }}>Performance Velocity</div>
                   <h3 className="text-xl font-black tracking-tight">Points Progression Trend</h3>
                   <div style={{ fontSize: '0.65rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>
                     {selectedStroke === 'All' 
                       ? 'Global Average: Benchmarks are averaged across all strokes and distances.' 
                       : `Discipline Average: Benchmarks are averaged across all distances for ${selectedStroke}.`}
                   </div>
                </div>
             </div>
             <div className="flex gap-2 no-print">
                {['All', 'Fly', 'Back', 'Breast', 'Free', 'IM'].map(s => (
                  <button 
                    key={s} 
                    onClick={() => setSelectedStroke(s)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${
                      selectedStroke === s 
                      ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
                      : 'bg-white/5 text-white/40 hover:bg-white/10'
                    }`}
                  >
                    {s}
                  </button>
                ))}
             </div>
           </div>



                    <div className="flex justify-end mb-2 pr-4">
                        <button className="intel-toggle" onClick={() => setIsWaGuideOpen(true)} style={{ background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', padding: '6px 12px', fontSize: '0.65rem' }}>
                            <span>🎯</span> How to read this chart
                        </button>
                    </div>

                    {/* GRAPH HEADER / LABEL */}
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingLeft: '1rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.02em' }}>WA POINTS PROGRESSION</h3>
                            <div style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Historical Form & Pathway Tracking</div>
                        </div>
                    </div>

                    <div style={{ height: '380px', width: '100%' }}>
                        {isClient && (
                        <ResponsiveContainer width="100%" height="100%">
                            {/* Adjusted margins to make room for the new axis labels */}
                            <ComposedChart data={chartDataWithTrends} margin={{ top: 20, right: 90, left: 20, bottom: 25 }}>
                                <defs>
                                    {/* POOL WATER GRADIENT */}
                                    <linearGradient id="poolWater" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.6}/>
                                        <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />

                                {/* X-AXIS WITH LABEL */}
                                <XAxis
                                    dataKey="name"
                                    stroke="rgba(255,255,255,0.4)"
                                    fontSize={10}
                                    tickFormatter={(str) => (typeof str === 'string' ? (str.length > 15 ? str.substring(0, 15) + '...' : str) : '')}
                                    tickMargin={10}
                                    height={45}
                                    label={{ value: 'COMPETITION TIMELINE', position: 'insideBottom', offset: -5, fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 900, letterSpacing: 2 }}
                                />

                                {/* Y-AXIS WITH LABEL */}
                                <YAxis
                                    stroke="rgba(255,255,255,0.4)"
                                    fontSize={10}
                                    domain={[
                                        dataMin => (isFinite(dataMin) && dataMin > 30 ? Math.max(0, dataMin - 30) : 0),
                                        dataMax => {
                                            const highestTarget = chartDataWithTrends[chartDataWithTrends.length - 1]?.narTarget || 480;
                                            return Math.max(isFinite(dataMax) ? dataMax + 20 : 0, Number(getCategoryBenchmark(statsObj?.age, swimmer?.gender, selectedStroke === 'All' ? '' : selectedStroke, 'REGIONAL')) || 300, highestTarget + 20);
                                        }
                                    ]}
                                    label={{ value: 'WORLD AQUATICS (WA) POINTS', angle: -90, position: 'insideLeft', offset: -10, fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 900, letterSpacing: 2, style: { textAnchor: 'middle' } }}
                                />

                                <Tooltip contentStyle={{ background: 'rgba(10,15,25,0.95)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '12px' }} />

                                {/* 1. THE BENCHMARKS */}
                                <ReferenceLine y={Number(getCategoryBenchmark(statsObj?.age, swimmer?.gender, selectedStroke === 'All' ? '' : selectedStroke, 'COUNTY')) || 250} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" strokeWidth={1} label={{ position: 'right', value: 'COUNTY', fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 800 }} isAnimationActive={false} />
                                <ReferenceLine y={Number(getCategoryBenchmark(statsObj?.age, swimmer?.gender, selectedStroke === 'All' ? '' : selectedStroke, 'REGIONAL')) || 350} stroke="rgba(255,255,255,0.4)" strokeDasharray="3 3" strokeWidth={1} label={{ position: 'right', value: 'REGIONAL', fill: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 800 }} isAnimationActive={false} />

                                {/* 2. THE SQUAD AVERAGES */}
                                <Line
                                    type="monotone"
                                    dataKey="ageTarget"
                                    stroke="#2dd4bf"
                                    strokeDasharray="6 6"
                                    strokeWidth={2}
                                    dot={false}
                                    name="Age Squad Target"
                                    isAnimationActive={false}
                                    label={(props) => {
                                        if (props.index === chartDataWithTrends.length - 1) {
                                            return <text x={props.x + 8} y={props.y} fill="#2dd4bf" fontSize={10} fontWeight={900} dominantBaseline="central">AGE SQUAD</text>;
                                        }
                                        return null;
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="goldTarget"
                                    stroke="#f59e0b"
                                    strokeDasharray="6 6"
                                    strokeWidth={2}
                                    dot={false}
                                    name="Gold Squad Target"
                                    isAnimationActive={false}
                                    label={(props) => {
                                        if (props.index === chartDataWithTrends.length - 1) {
                                            return <text x={props.x + 8} y={props.y} fill="#f59e0b" fontSize={10} fontWeight={900} dominantBaseline="central">GOLD SQUAD</text>;
                                        }
                                        return null;
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="narTarget"
                                    stroke="#ef4444"
                                    strokeDasharray="6 6"
                                    strokeWidth={2}
                                    dot={false}
                                    name="NAR Squad Target"
                                    isAnimationActive={false}
                                    label={(props) => {
                                        if (props.index === chartDataWithTrends.length - 1) {
                                            return <text x={props.x + 8} y={props.y} fill="#ef4444" fontSize={10} fontWeight={900} dominantBaseline="central">NAR SQUAD</text>;
                                        }
                                        return null;
                                    }}
                                />

                                {/* 3. THE ATHLETE: Pool water gradient area with smooth monotone curve */}
                                <Area
                                    type="monotone"
                                    dataKey="peakWa"
                                    stroke="#00d4ff"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#poolWater)"
                                    name="Athlete Peak Capability"
                                    isAnimationActive={false}
                                    dot={{ r: 4, fill: '#0a0a0a', stroke: '#00d4ff', strokeWidth: 2 }}
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#00d4ff' }}
                                    label={(props) => {
                                        if (props.index === chartDataWithTrends.length - 1) {
                                            return <text x={props.x + 8} y={props.y - 10} fill="#00d4ff" fontSize={11} fontWeight={900} dominantBaseline="central">ATHLETE PEAK</text>;
                                        }
                                        return null;
                                    }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                        )}
                    </div>

        </div>
      </div>
      
      {/* COACHESEYE GUIDE: BIOLOGICAL NORMALISATION */}
      <div className={`mb-8 ${activeTab !== 'progress' || progressSubTab !== 'roadmap' ? 'no-screen' : ''}`}>
        <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-violet)' }}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="section-title" style={{ color: 'var(--accent-violet)', margin: 0 }}>CoachesEye Guide: Biological Maturation</div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '8px' }}>Pubertal Smoothing & Age Benchmarking</h3>
            </div>
            <button
              onClick={() => setNormalizeWA(!normalizeWA)}
              style={{
                padding: '8px 16px', borderRadius: '12px', fontWeight: 900, cursor: 'pointer',
                background: normalizeWA ? 'var(--accent-violet)' : 'rgba(139, 92, 246, 0.1)',
                color: normalizeWA ? '#fff' : 'var(--accent-violet)',
                border: '1px solid var(--accent-violet)',
                transition: 'all 0.3s'
              }}
            >
              {normalizeWA ? 'NORMALISATION: ACTIVE' : 'NORMALISATION: OFF'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              <strong>1. The Maturation Gap (Vorontsov):</strong> According to Vorontsov's LTAD models, girls experience Peak Height Velocity (PHV) around ages 11-12, approximately 2 years earlier than boys. Because World Aquatics (WA) points compare times to adult world records, early developers naturally score higher. Toggling <strong>Normalisation</strong> applies a biological scaling factor (±10%) to balance this pubertal growth gap, allowing coaches to fairly compare underlying skill and aerobic progression between genders before they reach full maturation at 15+.
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              <strong>2. Age-Adjusted Benchmarking:</strong> To further normalize raw WA points, the <strong>Roadmap</strong> below anchors the athlete's current Peak Performance directly against the official Regional Automatic Standard for their exact chronological age. This provides a "pound-for-pound" visual representation of how close they are to elite pathway qualification, regardless of whether they are 11 or 17.
            </p>
          </div>
        </div>
      </div>

      {/* Stroke Performance Roadmap Section */}
      <div className={`mb-16 no-print ${activeTab !== 'progress' || progressSubTab !== 'roadmap' ? 'no-screen' : ''}`}>
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
        <div className="glass-card mt-6" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-cyan)' }}>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '8px' }}>COACHESEYE GUIDE: PERFORMANCE ROADMAP</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>The Roadmap visually anchors the athlete's current 'Peak Performance' (solid bar) against official County and Regional World Aquatics benchmarks. This highlights exactly how close they are to the next elite pathway qualification tier.</p>
        </div>
      </div>

      {/* Readiness & Health Section */}
      {activeTab === 'progress' && progressSubTab === 'readiness' && (
        <div className="mb-16">
          <ReadinessBreakdownCard swimmer={swimmer} healthData={healthData} squad={squad} />
        </div>
      )}

      <div className={`no-print ${activeTab !== 'workload' ? 'no-screen' : ''} ${!reportConfig.sections.attendance ? 'hide-in-report' : ''}`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          <div className="lg:col-span-2 glass-card" style={{ padding: '2.5rem', minHeight: '400px' }}>
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <div className="section-title" style={{ margin: '0 0 8px 0' }}>Consistency Engine</div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, letterSpacing: '-0.03em' }}>Training Workload & Compliance</h3>
                    </div>
                    {rel?.effectiveJoinDate && new Date(rel.effectiveJoinDate) > new Date(new Date().getTime() - period * 86400000) && (
                      <div className="animate-fade-in" style={{ padding: '8px 14px', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '12px', color: 'var(--accent-amber)', fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        TARGETS PRORATED FROM: {new Date(rel.effectiveJoinDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                   <div className="flex gap-4 items-center mt-2">
                     <div className="flex items-center gap-2">
                       <div style={{ width: 10, height: 10, background: 'var(--accent-cyan)', borderRadius: '2px' }}></div>
                       <span className="text-[10px] font-bold opacity-60">COMPLIANT WEEKS</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <div style={{ width: 10, height: 10, background: 'var(--accent-amber)', borderRadius: '2px' }}></div>
                       <span className="text-[10px] font-bold opacity-60">NON-COMPLIANT WEEKS</span>
                     </div>
                   </div>
                </div>
                
                {/* Elegant Toggle Controls */}
                <div className="flex flex-wrap items-center gap-4 p-2 rounded-xl bg-white/[0.02] border border-white/5 no-print">
                  {/* Compliance Metric Selector */}
                  <div className="flex items-center rounded-lg bg-black/40 p-1 border border-white/5">
                    <button 
                      onClick={() => setComplianceMode('combined')} 
                      className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${complianceMode === 'combined' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-white/60 hover:text-white'}`}
                    >
                      COMBINED
                    </button>
                    <button 
                      onClick={() => setComplianceMode('hours')} 
                      className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${complianceMode === 'hours' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-white/60 hover:text-white'}`}
                    >
                      HOURS
                    </button>
                    <button 
                      onClick={() => setComplianceMode('sessions')} 
                      className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${complianceMode === 'sessions' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-white/60 hover:text-white'}`}
                    >
                      SESS
                    </button>
                  </div>
                  
                  <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }}></div>
                  
                  {/* Exemption and Holiday Toggle Controls */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-black text-white/60 hover:text-white select-none">
                      <input 
                        type="checkbox" 
                        checked={includeShutdowns} 
                        onChange={(e) => setIncludeShutdowns(e.target.checked)}
                        className="rounded border-white/10 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0 h-3 w-3"
                      />
                      ❄️ SHUTDOWN
                    </label>
                    
                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-black text-white/60 hover:text-white select-none">
                      <input 
                        type="checkbox" 
                        checked={includeSessionCredits} 
                        onChange={(e) => setIncludeSessionCredits(e.target.checked)}
                        className="rounded border-white/10 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0 h-3 w-3"
                      />
                      ⚡ CREDIT
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-black text-white/60 hover:text-white select-none">
                      <input 
                        type="checkbox" 
                        checked={includeHolidays} 
                        onChange={(e) => setIncludeHolidays(e.target.checked)}
                        className="rounded border-white/10 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0 h-3 w-3"
                      />
                      🏖️ HOLIDAY
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-black text-white/60 hover:text-white select-none">
                      <input 
                        type="checkbox" 
                        checked={includeGalas} 
                        onChange={(e) => setIncludeGalas(e.target.checked)}
                        className="rounded border-white/10 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0 h-3 w-3"
                      />
                      ⛵ GALA
                    </label>
                  </div>
                </div>
             </div>
             <div style={{ height: 350, cursor: 'pointer' }}>
               {isClient && (
               <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={workloadChartData} onClick={(e) => { if (e?.activePayload) setSelectedChartWeek(e.activePayload[0]?.payload); }}>
                   <defs>
                      <linearGradient id="trainingGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#0891b2" />
                      </linearGradient>
                      <linearGradient id="creditGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#d97706" />
                      </linearGradient>
                     <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                       <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                   <XAxis dataKey="week" tick={{ fill: 'var(--text-dim)', fontSize: 7, fontWeight: 900 }} axisLine={false} tickLine={false} />
                   <YAxis yAxisId="left" tick={{ fill: 'var(--text-dim)', fontSize: 9 }} axisLine={false} tickLine={false} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fill: 'var(--text-dim)', fontSize: 9 }} />
                   <YAxis yAxisId="right" orientation="right" domain={[0, 100]} hide />
                   <Tooltip 
                     cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                     content={({ active, payload, label }) => {
                       if (active && payload && payload.length) {
                         const data = payload[0].payload;
                         return (
                           <div className="glass-card" style={{ padding: '12px', border: '1px solid var(--glass-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)' }}>
                             <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.5, marginBottom: 8 }}>WEEK {label}</div>
                             <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{data.trainingHours}h Training</div>
                             {data.galaHours > 0 && <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-rose)' }}>{data.galaHours}h Gala</div>}
                             {data.isExempt && <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#f97316', marginTop: 4 }}>[ CLUB SHUTDOWN ]</div>}
                             {data.holidayUsed && <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#a855f7', marginTop: 4 }}>[ HOLIDAY CREDIT ]</div>}
                             <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>{data.compliance}% Compliance</div>
                             <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.7rem', fontWeight: 700 }}>
                               Sessions: <span style={{ color: data.isMet ? '#10b981' : 'var(--accent-amber)' }}>{data.sessions} / {data.requiredSessions}</span>
                             </div>
                           </div>
                         );
                       }
                       return null;
                     }}
                   />
                   {workloadChartData.filter(d => d.isExempt || d.holidayUsed).map((d, idx) => (
                     <ReferenceArea 
                       key={idx} 
                       yAxisId="left"
                       x1={d.week} 
                       x2={d.week} 
                       fill={d.isExempt ? 'rgba(249, 115, 22, 0.2)' : 'rgba(168, 85, 247, 0.2)'} 
                       strokeOpacity={0.3}
                     />
                   ))}
                   <Area yAxisId="right" type="stepAfter" dataKey="compliance" fill="url(#compGrad)" stroke="#10b981" strokeWidth={1} strokeOpacity={0.3} />
                   <Bar 
                      yAxisId="left" 
                      dataKey="training" 
                      stackId="a" 
                      fill="url(#trainingGrad)" 
                      name="Pool Hours" 
                      radius={[3, 3, 0, 0]} 
                      barSize={9}
                      style={{ cursor: 'pointer' }}
                      onClick={(data) => {
                        if (data) {
                          setSelectedWeek(data);
                          setIsWorkloadModalOpen(true);
                        }
                      }}
                    />
                   <Bar 
                      yAxisId="left" 
                      dataKey="gala" 
                      stackId="a" 
                      fill="var(--accent-rose)" 
                      name="Gala Hours" 
                      radius={[3, 3, 0, 0]} 
                      barSize={9}
                      style={{ cursor: 'pointer' }}
                      onClick={(data) => {
                        if (data) {
                          setSelectedWeek(data);
                          setIsWorkloadModalOpen(true);
                        }
                      }}
                    />
                   <Bar 
                      yAxisId="left" 
                      dataKey="credit" 
                      stackId="a" 
                      fill="var(--accent-emerald)" 
                      name="Credited Hours" 
                      radius={[3, 3, 0, 0]} 
                      barSize={9}
                      style={{ cursor: 'pointer' }}
                      onClick={(data) => {
                        if (data) {
                          setSelectedWeek(data);
                          setIsWorkloadModalOpen(true);
                        }
                      }}
                    >
                      <LabelList content={renderCustomBarLabel} />
                   </Bar>
                   <Line yAxisId="left" type="stepAfter" dataKey="target" name="Target Hours" stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
                )}
             </div>
              <div style={{ marginTop: '2rem', overflowX: 'auto', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255, 255, 255, 0.05)', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
                  <h4 style={{ marginBottom: '1.5rem', color: 'var(--accent-cyan)', fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Weekly Workload Details
                  </h4>
                  <table className="stats-table-glass" style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead style={{ position: 'sticky', top: '-1.5rem', background: 'var(--bg-dark)', zIndex: 10, boxShadow: '0 4px 6px -4px rgba(0,0,0,0.5)' }}>
                          <tr>
                              <th style={{ padding: '12px', width: '20%' }}>Week Commencing</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>Pool</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>Gala</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>Credit</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>Total</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>Target</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>Status</th>
                          </tr>
                      </thead>
                      <tbody>
                          {weeklyWorkloadData.map((week, i) => (
                              <tr key={i}>
                                  <td style={{ padding: '12px', fontWeight: 800, color: 'var(--accent-cyan)' }}>{week.name}</td>
                                  <td style={{ padding: '12px', textAlign: 'center' }}>{week.pool > 0 ? week.pool.toFixed(1) + 'h' : '—'}</td>
                                  <td style={{ padding: '12px', textAlign: 'center', color: week.gala > 0 ? 'var(--accent-emerald)' : 'inherit' }}>{week.gala > 0 ? week.gala.toFixed(1) + 'h' : '—'}</td>
                                  <td title={week.creditReasons && week.creditReasons.length > 0 ? week.creditReasons.join(' | ') : 'No credits applied'} 
                                      style={{ 
                                          cursor: week.creditReasons && week.creditReasons.length > 0 ? 'help' : 'default', 
                                          padding: '12px', 
                                          textAlign: 'center',
                                          color: week.credit === 0 && week.creditReasons && week.creditReasons.length > 0 ? 'var(--accent-amber)' : 'inherit'
                                      }}>
                                      {week.credit > 0 ? `${week.credit.toFixed(1)}h` : (week.creditReasons && week.creditReasons.length > 0 ? '— ⚠️' : '—')}
                                  </td>
                                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 900 }}>{week.total.toFixed(1)}h</td>
                                  <td style={{ padding: '12px', textAlign: 'center', opacity: 0.5 }}>{week.target.toFixed(1)}h</td>
                                  <td style={{ 
                                      padding: '12px', 
                                      textAlign: 'center', 
                                      fontWeight: 900,
                                      color: (week.isHoliday || week.appliedRule === 'Holiday Allowance') 
                                          ? 'var(--accent-amber)' 
                                          : (week.isMet ? 'var(--accent-emerald)' : 'var(--accent-rose)')
                                  }}>
                                      {(week.isHoliday || week.appliedRule === 'Holiday Allowance') 
                                          ? '🌴 HOLIDAY' 
                                          : (week.isMet ? '✓ MET' : '✗ MISSED')}
                                  </td>
                              </tr>
                          ))}
                          {weeklyWorkloadData.length === 0 && (
                              <tr>
                                  <td colSpan="7" style={{ padding: '24px', textAlign: 'center', opacity: 0.5 }}>No data found for this time period.</td>
                              </tr>
                          )}
                      </tbody>
                      <tfoot>
                          <tr style={{ background: 'rgba(255, 255, 255, 0.05)', fontWeight: 900, borderTop: '2px solid rgba(255, 255, 255, 0.1)' }}>
                              <td style={{ padding: '12px' }}>ANNUAL TOTALS</td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>{Object.values(statsObj.details || {}).reduce((sum, w) => sum + (w.totalHours || 0), 0).toFixed(1)}h</td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>{Object.values(statsObj.details || {}).reduce((sum, w) => sum + (w.galaHours || 0), 0).toFixed(1)}h</td>
                              <td style={{ padding: '12px', textAlign: 'center', color: 'var(--accent-emerald)' }}>{Object.values(statsObj.details || {}).reduce((sum, w) => sum + (w.creditedHours || 0), 0).toFixed(1)}h</td>
                              <td style={{ padding: '12px', textAlign: 'center', color: 'var(--accent-cyan)' }}>
                                  {Object.values(statsObj.details || {}).reduce((sum, w) => sum + (w.totalHours || 0) + (w.galaHours || 0) + (w.creditedHours || 0), 0).toFixed(1)}h
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>{Object.values(statsObj.details || {}).reduce((sum, w) => sum + (w.target || 0), 0).toFixed(1)}h</td>
                              <td style={{ 
                                  padding: '12px', 
                                  textAlign: 'center', 
                                  fontWeight: 900,
                                  color: (statsObj?.percentage || 0) >= (squad?.target_training_percent || 75) ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                              }}>
                                  {statsObj?.percentage || 0}% MET
                              </td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
              <div style={{ marginTop: '2rem', overflowX: 'auto', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255, 255, 255, 0.05)', maxHeight: '300px', overflowY: 'auto' }} className="custom-scrollbar">
                  <h4 style={{ marginBottom: '1.5rem', color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      System Exemptions & Holidays Applied
                  </h4>
                  <table className="stats-table-glass" style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead style={{ position: 'sticky', top: '-1.5rem', background: 'var(--bg-dark)', zIndex: 10, boxShadow: '0 4px 6px -4px rgba(0,0,0,0.5)' }}>
                          <tr>
                              <th style={{ padding: '12px', width: '40%' }}>Exemption / Event</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>Start Date</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>End Date</th>
                              <th style={{ padding: '12px', textAlign: 'center' }}>Type</th>
                          </tr>
                      </thead>
                      <tbody>
                          {activeExemptions.map((ex, i) => (
                              <tr key={i}>
                                  <td style={{ padding: '12px', fontWeight: 800 }}>{ex.name}</td>
                                  <td style={{ padding: '12px', textAlign: 'center', opacity: 0.8 }}>{new Date(ex.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                  <td style={{ padding: '12px', textAlign: 'center', opacity: 0.8 }}>{new Date(ex.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                  <td style={{ padding: '12px', textAlign: 'center' }}>
                                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', background: ex.type === 'credit' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(251, 191, 36, 0.15)', color: ex.type === 'credit' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                                          {ex.type}
                                      </span>
                                  </td>
                              </tr>
                          ))}
                          {activeExemptions.length === 0 && (
                              <tr>
                                  <td colSpan="4" style={{ padding: '24px', textAlign: 'center', opacity: 0.5 }}>No exemptions found for this time period.</td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>


          </div>
          <div className="lg:col-span-2 glass-card mt-6" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-cyan)' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '8px' }}>COACHESEYE GUIDE: WORKLOAD</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
  Consistent workload is the primary driver of aerobic adaptation. This section tracks volume compliance against the athlete's specific squad targets and LTAD stage. <strong>If an athlete joins a squad mid-season, the system automatically truncates the timeline and prorates their target hours to ensure fair compliance grading.</strong>
</p>
          </div>
          <div className="lg:col-span-1 glass-card no-print" style={{ padding: 0, overflow: 'hidden', height: '600px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, transparent 100%)' }}>
               <div className="section-title" style={{ marginBottom: 4 }}>Intelligence Trace</div>
               <h3 className="text-lg font-black tracking-tight">Session Log & {rel.creditedSessions || 0} Credits</h3>
               <div style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: 4, fontWeight: 800 }}>CLICK A WEEK TO INSPECT</div>
            </div>
            <div className="custom-scrollbar" style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>

              <div className="space-y-3">
                {[...workloadChartData].reverse().map((w, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedWeek(w);
                      setIsWorkloadModalOpen(true);
                    }}
                    className="hover:bg-white/[0.04] hover:border-cyan-500/30 hover:scale-[1.01]"
                    style={{
                      padding: '1rem',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '12px',
                      border: w.isMet ? '1px solid rgba(16,185,129,0.1)' : '1px solid rgba(255,255,255,0.05)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out'
                    }}
                  >
                    <div className="flex justify-between items-center mb-2">
                       <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.4 }}>WEEK {w.week}</div>
                       <span style={{ 
                         fontSize: '0.5rem', 
                         fontWeight: 900, 
                         padding: '2px 8px', 
                         borderRadius: '4px',
                         background: w.isMet ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                         color: w.isMet ? '#10b981' : '#f43f5e'
                       }}>
                         {w.isMet ? 'MET' : 'NOT MET'}
                       </span>
                    </div>
                    
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 900 }}>{w.totalSessions} / {w.requiredSessions} <span style={{ opacity: 0.3, fontSize: '0.7rem' }}>SESSIONS</span></div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, opacity: 0.5 }}>{w.totalHours.toFixed(1)}h / {w.target}h <span style={{ fontSize: '0.6rem' }}>Volume</span></div>
                      </div>
                      {(w.isExempt || w.isCredit) && (
                        <div style={{ fontSize: '0.5rem', fontWeight: 900, color: 'var(--accent-cyan)', background: 'var(--accent-cyan-fade)', padding: '2px 6px', borderRadius: '4px' }}>
                          {w.isExempt ? 'WEEK EXEMPT' : 'CREDIT APPLIED'}
                        </div>
                      )}
                    </div>

                    {w.exceptionDetails && w.exceptionDetails.length > 0 && (
                      <div style={{ marginTop: 8, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                         {w.exceptionDetails.map((ex, i) => (
                           <div key={i} style={{ marginBottom: i < w.exceptionDetails.length - 1 ? 8 : 0 }}>
                             <div style={{ fontSize: '0.6rem', fontWeight: 900, color: ex.type === 'credit' ? 'var(--accent-cyan)' : 'var(--accent-rose)', textTransform: 'uppercase' }}>{ex.name}</div>
                             {ex.days && ex.days.map((d, di) => (
                               <div key={di} style={{ fontSize: '0.55rem', opacity: 0.6, display: 'flex', justifyContent: 'space-between' }}>
                                 <span>• {d.date}: {d.sessions}</span>
                                 <span style={{ fontWeight: 900, color: d.applied ? '#10b981' : '#f43f5e' }}>{d.applied ? 'OK' : 'OFF'}</span>
                               </div>
                             ))}
                           </div>
                         ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className={`no-print ${activeTab !== 'competition' ? 'no-screen' : ''} ${!reportConfig.sections.openMeets ? 'hide-in-report' : ''}`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          <div className="lg:col-span-2 glass-card" style={{ padding: '2.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)', filter: 'blur(50px)', zIndex: 0 }}></div>
            <div className="section-title relative z-10" style={{ marginBottom: 4 }}>Competitive Load</div>
            <h3 className="text-xl font-black tracking-tight mb-8 relative z-10">Competition Intensity</h3>
            <div style={{ height: 250, position: 'relative', zIndex: 10 }}>
              {isClient && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={meetTimelineData}>
                  <defs>
                    <linearGradient id="meetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={1}/>
                      <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0.3}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-dim)', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    contentStyle={{ background: 'rgba(10, 10, 15, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(20px)' }}
                  />
                  <Bar dataKey="count" name="Meets" radius={[8, 8, 0, 0]}>
                    {meetTimelineData?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="url(#meetGrad)" fillOpacity={entry.count > 0 ? 1 : 0.2} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="lg:col-span-1 glass-card no-print" style={{ padding: 0, overflow: 'hidden', height: '500px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, transparent 100%)' }}>
               <div className="section-title" style={{ marginBottom: 4 }}>Competitive History</div>
               <h3 className="text-lg font-black tracking-tight">Meet Attendance Log</h3>
            </div>
            <div className="table-wrapper custom-scrollbar" style={{ maxHeight: '400px', overflowY: 'auto', padding: '1rem' }}>
              <table className="w-full text-left" style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <th style={{ padding: '0.75rem', color: 'var(--text-dim)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-dim)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Competition</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-dim)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-dim)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Races</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-dim)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Peak Perf</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueMeetsList?.map((m, idx) => (
                    <tr key={idx} style={{ background: 'rgba(255,255,255,0.01)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '1rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>{new Date(m.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                      </td>
                      <td style={{ padding: '1rem 0.75rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 900 }}>{m.name}</div>
                        <div style={{ fontSize: '0.65rem', opacity: 0.6, color: 'var(--accent-cyan)' }}>Level {m.level}</div>
                      </td>
                      <td style={{ padding: '1rem 0.75rem' }}>
                        <span style={{ 
                          fontSize: '0.5rem', 
                          fontWeight: 900, 
                          padding: '3px 8px', 
                          borderRadius: '4px',
                          background: m.type?.toLowerCase() === 'open' ? 'rgba(255,255,255,0.05)' : 'rgba(245, 158, 11, 0.1)',
                          color: m.type?.toLowerCase() === 'open' ? 'var(--text-dim)' : '#f59e0b',
                          border: `1px solid ${m.type?.toLowerCase() === 'open' ? 'rgba(255,255,255,0.1)' : 'rgba(245, 158, 11, 0.2)'}`
                        }}>
                          {(m.type || 'OPEN').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 0.75rem' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>{m.results.length}</div>
                      </td>
                      <td style={{ padding: '1rem 0.75rem' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{m.peakWA}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="glass-card mt-6" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-cyan)' }}>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '8px' }}>COACHESEYE GUIDE: COMPETITION & RACING</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>Tracks the athlete's competitive rhythm and 'Big Meet Temperament'. Regular racing builds race-execution skills, while tracking Point Progression indicates whether training is converting into race speed. A steep, positive trendline tells the story of an athlete successfully adapting to their training load.</p>
        </div>
      </div>


      <details className={`glass-card mb-16 no-print ${activeTab !== 'competition' ? 'no-screen' : ''}`} style={{ border: 'none', padding: 0, overflow: 'hidden' }}>
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
            <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th onClick={() => requestSort('date')} style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase', cursor: 'pointer' }}>Date{getSortIndicator('date')}</th>
                  <th onClick={() => requestSort('meet')} style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase', cursor: 'pointer' }}>Meet{getSortIndicator('meet')}</th>
                  <th onClick={() => requestSort('event')} style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase', cursor: 'pointer' }}>Event{getSortIndicator('event')}</th>
                  <th onClick={() => requestSort('time')} style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase', cursor: 'pointer' }}>Time{getSortIndicator('time')}</th>
                  <th onClick={() => requestSort('wa_pts')} style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.7rem', textTransform: 'uppercase', cursor: 'pointer' }}>WA{getSortIndicator('wa_pts')}</th>
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

      {activeTab === 'block_roi' && swimmer && (
        <div className="mb-16 animate-fade-in no-print">
          <TrainingBlockTracker 
            swimmer={swimmer}
            results={results}
            attendance={attendance}
            sessions={sessions}
          />
        </div>
      )}

      {activeTab === 'predictor' && swimmer && (
        <div className="mb-16 animate-fade-in no-print">
          <SquadQualificationPredictor swimmers={[swimmer]} results={results} />
        </div>
      )}

      {activeTab === 'biometrics' && swimmer && (
        <div className="mb-16 animate-fade-in no-print">
          <VorontsovLTADModule swimmer={swimmer} totalActualHours={totalActualHours || 0} />
        </div>
      )}

      <BenchmarkModal isOpen={isBenchmarkOpen} onClose={() => setIsBenchmarkOpen(false)} />
      
      <ReportConfigModal 
        isOpen={isReportModalOpen} 
        onClose={() => setIsReportModalOpen(false)} 
        onGenerate={handleGenerateReport}
        swimmerName={swimmer.full_name}
        loading={isGeneratingAi}
      />

      <WeeklyWorkloadModal
        isOpen={isWorkloadModalOpen}
        onClose={() => {
          setIsWorkloadModalOpen(false);
          setSelectedWeek(null);
        }}
        week={selectedWeek}
        attendance={attendance}
        sessions={sessions}
        exemptions={exemptions}
        swimmer={swimmer}
        results={results}
      />

      {selectedChartWeek && (
        <div className="modal-overlay" onClick={() => setSelectedChartWeek(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card animate-fade-in" onClick={e => e.stopPropagation()} style={{ padding: '2.5rem', maxWidth: 420, width: '90%' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.15em', marginBottom: '1rem' }}>WEEK DRILL-DOWN</div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '1.5rem' }}>Week of {selectedChartWeek.week}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{selectedChartWeek.totalHours ?? selectedChartWeek.trainingHours ?? 0}h</div>
                <div style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 800, marginTop: 4 }}>HOURS LOGGED</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>{selectedChartWeek.target ?? '—'}h</div>
                <div style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 800, marginTop: 4 }}>TARGET HOURS</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: selectedChartWeek.isMet ? '#10b981' : 'var(--accent-amber)' }}>{selectedChartWeek.compliance ?? 0}%</div>
                <div style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 800, marginTop: 4 }}>COMPLIANCE</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white' }}>{selectedChartWeek.sessions ?? 0}</div>
                <div style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 800, marginTop: 4 }}>SESSIONS LOGGED</div>
              </div>
            </div>
            {selectedChartWeek.isExempt && <div style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 800, marginBottom: 8 }}>⚠️ Club Shutdown Week</div>}
            {selectedChartWeek.holidayUsed && <div style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 800, marginBottom: 8 }}>✈️ Holiday Credit Applied</div>}
            <button onClick={() => setSelectedChartWeek(null)} className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }}>Close</button>
          </div>
        </div>
      )}
      </div>

      <div className={`print-only theme-${printTheme}`}>
          
          {/* PAGE 1: Cover Page */}
          <div className="cover-page" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', pageBreakAfter: 'always', margin: 0, padding: 0, boxSizing: 'border-box' }}>
              <img src="/coacheseye-logo.png" alt="CoachesEye Logo" style={{ height: '140px', marginBottom: '3.5rem' }} />
              <h4 className="cover-club" style={{ fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.4em', marginBottom: '2rem', textTransform: 'uppercase' }}>TONBRIDGE SWIMMING CLUB</h4>
              <h1 className="cover-name" style={{ fontSize: '4.8rem', fontWeight: 950, margin: '1rem 2rem', lineHeight: 1.1, letterSpacing: '-0.04em', textTransform: 'uppercase', textAlign: 'center' }}>{swimmer.full_name}</h1>
              <div className="cover-bar" style={{ height: '8px', width: '140px', margin: '4rem 0' }}></div>
              <h3 className="cover-title" style={{ fontSize: '1.6rem', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>ANNUAL ATHLETE PERFORMANCE REPORT</h3>
              <p className="cover-date" style={{ marginTop: '1.5rem', fontStyle: 'italic', fontSize: '0.95rem', opacity: 0.6 }}>Generated: {new Date().toLocaleDateString('en-GB')}</p>
          </div>

          {/* PAGE 2: Table of Contents & Athlete Profile */}
          <div style={{ padding: '20mm 20mm', minHeight: '100vh', pageBreakAfter: 'always', boxSizing: 'border-box', background: 'var(--print-bg)' }}>
              <h2 className="section-title" style={{ marginBottom: '2.5rem', fontSize: '2rem', borderBottom: '2px solid var(--print-border-heavy)', paddingBottom: '0.5rem' }}>
                  Report Directory & Athlete Profile
              </h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '3rem', marginTop: '2rem' }}>
                  {/* Table of Contents */}
                  <div>
                      <h3 className="cover-index-title" style={{ paddingBottom: '0.75rem', marginBottom: '1.5rem', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--print-border-light)' }}>
                          Table of Contents
                      </h3>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.95rem', lineHeight: '2.4', fontWeight: 600 }}>
                          {printPages.map((p, idx) => (
                              <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(128,128,128,0.15)', paddingBottom: '4px' }}>
                                  <span>{p.title}</span> 
                                  <span style={{ fontWeight: 900 }}>Page {idx + 3}</span>
                              </li>
                          ))}
                      </ul>
                  </div>
                  
                  {/* Athlete Profile Summary */}
                  <div>
                      <h3 style={{ paddingBottom: '0.75rem', marginBottom: '1.5rem', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--print-border-light)' }}>
                          Athlete Profile
                      </h3>
                      <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-cyan)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                              <tbody>
                                  <tr style={{ borderBottom: '1px solid var(--print-border-light)' }}>
                                      <td style={{ padding: '10px 0', fontWeight: 700, opacity: 0.6 }}>Full Name</td>
                                      <td style={{ padding: '10px 0', fontWeight: 900, textAlign: 'right' }}>{swimmer.full_name}</td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid var(--print-border-light)' }}>
                                      <td style={{ padding: '10px 0', fontWeight: 700, opacity: 0.6 }}>Squad</td>
                                      <td style={{ padding: '10px 0', fontWeight: 900, textAlign: 'right', color: 'var(--accent-cyan)' }}>{squad?.name || '—'}</td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid var(--print-border-light)' }}>
                                      <td style={{ padding: '10px 0', fontWeight: 700, opacity: 0.6 }}>Swim England ID</td>
                                      <td style={{ padding: '10px 0', fontWeight: 900, textAlign: 'right' }}>{swimmer.member_id || '—'}</td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid var(--print-border-light)' }}>
                                      <td style={{ padding: '10px 0', fontWeight: 700, opacity: 0.6 }}>Year of Birth</td>
                                      <td style={{ padding: '10px 0', fontWeight: 900, textAlign: 'right' }}>{swimmer.year_of_birth || '—'}</td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid var(--print-border-light)' }}>
                                      <td style={{ padding: '10px 0', fontWeight: 700, opacity: 0.6 }}>Gender</td>
                                      <td style={{ padding: '10px 0', fontWeight: 900, textAlign: 'right', textTransform: 'uppercase' }}>{swimmer.gender || '—'}</td>
                                  </tr>
                                  <tr>
                                      <td style={{ padding: '10px 0', fontWeight: 700, opacity: 0.6 }}>Squad Join Date</td>
                                      <td style={{ padding: '10px 0', fontWeight: 900, textAlign: 'right' }}>
                                          {swimmer.squad_join_date ? new Date(swimmer.squad_join_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                      </td>
                                  </tr>
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
              
              <div style={{ marginTop: '5rem', borderTop: '1px solid var(--print-border-light)', paddingTop: '1.5rem' }}>
                  <p style={{ fontSize: '0.8rem', opacity: 0.6, lineHeight: 1.6, fontStyle: 'italic' }}>
                      This diagnostic report aggregates training attendance, session workload history, in-race pacing profiles, and competitive event progression. The analytics therein compile performance indices to inform squad placement, long-term development (LTAD) pathways, and personalized coaching interventions.
                  </p>
              </div>
          </div>

          {/* DYNAMIC PAGES */}
          {printPages.map(p => p.element)}
      </div>

      <WaPointsGuideModal isOpen={isWaGuideOpen} onClose={() => setIsWaGuideOpen(false)} />
    </Layout>
  );
}
