import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import PremiumOrb from '../../components/PremiumOrb';
import Layout from '../../components/Layout';
import BenchmarkModal from '../../components/BenchmarkModal';
import { supabase } from '../../lib/supabase';
import { calculateWorkload, isGalaDate, getSessionDuration, isExemptDate, isShutdownDate, calculateReliability, generateSwimmerNarrative, calculateSquadHealth, getKentBenchmark, getCategoryBenchmark, getWeekKey, toLocalISO } from '../../lib/analytics-utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell, ComposedChart, Area, LabelList, ReferenceLine, ReferenceArea } from 'recharts';
import Link from 'next/link';
import AiInsightCard from '../../components/AiInsightCard';
import ForesightTimeline from '../../components/ForesightTimeline';
import ReportConfigModal from '../../components/ReportConfigModal';
import CoachesEyeDeepDive from '../../components/CoachesEyeDeepDive';


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
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [narrative, setNarrative] = useState([]);
  const [healthData, setHealthData] = useState({ total: 0, components: [] });
  const [personalStats, setPersonalStats] = useState({});
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [insights, setInsights] = useState([]);
  const [exemptions, setExemptions] = useState([]);
  const [sessionMemberships, setSessionMemberships] = useState([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportConfig, setReportConfig] = useState({
    sections: {
      attendance: true,
      openMeets: true,
      internalGalas: true,
      aiTechnical: true,
      aiDeepDive: true,
      performanceNarrative: true,
      strokeRoadmap: true,
      progression: true
    },
    audience: 'Coach'
  });

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.push('/login');
      return;
    }
    if (id && router.isReady) { fetchSwimmerData(); }
  }, [session, router, id, router.isReady]);

  const fetchSwimmerData = async () => {
    setLoading(true);
    try {
      const { data: swData } = await supabase.from('swimmers').select('*, squads(*)').eq('id', id).single();
      if (!swData) return;

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
      
      setSwimmer(swData);
      setSquad(swData.squads);
      setResults((resData || []).sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0)));
      setAttendance(attData || []);
      setSessions(sessData || []);
      setInsights(insData.data || []);
      setExemptions(exemptData.data || []);
      setSessionMemberships(memRes || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const period = parseInt(router.query.period) || 365;
  const periodWeeks = Math.floor(period / 7);

  const { rollingMeets, rollingTarget, progressPercent, rollingPeak, rollingAvg, workloadChartData, attendancePct, seasonVolumePct, totalActualHours, annualTargetHours, seasonPBs, isCompliant, velocity, filteredMeets, statsObj, progressionData, performance_slope, periodCompliance, rel, uniqueMeetsList, meetTimelineData, openMeetsCount, totalMeetsCount, totalAbsentSessions, rawAbsentCount, periodMeets } = useMemo(() => {
    if (!swimmer) return { attendancePct: 0, seasonVolumePct: 0, workloadChartData: [], filteredMeets: [], rel: {}, uniqueMeetsList: [], meetTimelineData: [], openMeetsCount: 0, totalMeetsCount: 0, seasonPBs: 0 };
    const now = new Date();
    const START = new Date(now - period * 86400000);
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // COMPREHENSIVE MEET ANALYTICS: Smart Deduplication (Match engine logic)
    const sortedRawMeets = results
      .filter(r => new Date(r.date) >= START)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const uniqueMeetsList = [];
    sortedRawMeets.forEach(r => {
      const mName = r.meets?.name || r.meet_name || `Meet @ ${r.date}`;
      const mType = r.meets?.type || r.meet_type || 'Open';
      const rDate = new Date(r.date);
      const existing = uniqueMeetsList.find(m => 
        m.name === mName && 
        Math.abs((new Date(m.date) - rDate) / (1000 * 60 * 60 * 24)) <= 3
      );
      
      if (!existing) {
        uniqueMeetsList.push({
          id: r.meet_id,
          name: mName,
          date: r.date,
          type: mType,
          level: r.meets?.level || '3',
          results: [r],
          peakWA: Number(r.wa_pts || 0)
        });
      } else {
        existing.results.push(r);
        if (Number(r.wa_pts || 0) > existing.peakWA) {
          existing.peakWA = Number(r.wa_pts || 0);
        }
      }
    });

    const openMeetsCount = uniqueMeetsList.filter(m => m.type?.toLowerCase() === 'open').length;
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

    const rel = calculateReliability(swimmer, attendance, sessions, results, period, exemptions, sessionMemberships);
    const yearResults = results.filter(r => new Date(r.meets?.date || 0) >= START);
    
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
      const wLabel = new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

      
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

      chartData.push({
        week: wLabel,
        weekKey,
        training: w.trainingHours, // Keep for chart
        gala: w.galaHours, // Keep for chart
        trainingHours: w.trainingHours,
        trainingSessions: w.trainingSessions,
        galaHours: w.galaHours,
        galaSessions: w.galaSessions,
        creditedHours: creditedHoursInWeek,
        creditedSessions: creditedSessionsInWeek,
        totalHours: w.trainingHours + w.galaHours + creditedHoursInWeek,
        totalSessions: w.trainingSessions + w.galaSessions + creditedSessionsInWeek,
        sessions: w.trainingSessions + w.galaSessions + creditedSessionsInWeek, // Keep for chart/logic
        isMet,
        isExempt: w.isExempt,
        isCredit: w.isCredit || creditedSessionsInWeek > 0,
        isPreJoin,
        holidayUsed,
        target: targetHrs,
        requiredSessions: targetSess,
        appliedRule,
        displayTraining: ((w.isExempt || holidayUsed) && w.trainingHours === 0) ? 0.5 : w.trainingHours,
        exceptionDetails
      });
    }

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
      holidayAllowance: rel.holidayAllowance
    };

    const finalFiltered = results.filter(r => {
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
  }, [results, swimmer, squad, attendance, sessions, exemptions, sessionMemberships, period, periodWeeks, selectedMonth, selectedStroke, router.query.period, sortConfig]);

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

  const handleGenerateReport = (sections, audience) => {
    setReportConfig({ sections, audience });
    setIsReportModalOpen(false);
    setTimeout(() => {
      window.print();
    }, 500);
  };

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
            .hide-in-report { display: none !important; }
            @page { margin: 2cm; }
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
          </div>
        </div>
        <div className="flex gap-6 items-center">
          <PremiumOrb value={healthData.total} label="Personal Health" size={130} />
          <div className="flex flex-col gap-2">
            <button className="btn-premium-action" onClick={() => setIsBenchmarkOpen(true)}>WA Standards</button>
            <button className="btn-premium-intel" onClick={() => setIsReportModalOpen(true)}>Print Report</button>
          </div>
        </div>
      </div>

      <div className="print-only" style={{ display: 'none', textAlign: 'center', marginBottom: 40 }}>
         <h1 style={{ fontSize: '2.5rem', marginBottom: 8, fontWeight: 900 }}>{reportConfig.audience.toUpperCase()}'S PERFORMANCE REVIEW</h1>
         <h2 style={{ fontSize: '1.5rem', color: '#666' }}>{swimmer.full_name} - {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
         <p style={{ fontSize: '0.9rem', color: '#999' }}>Report Focus: {reportConfig.audience} Perspective | {Object.entries(reportConfig.sections).filter(([_,v])=>v).map(([k])=>k).join(', ')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }} className={`mb-16 ${!reportConfig.sections.performanceNarrative ? 'hide-in-report' : ''}`}>
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

          <div className="flex justify-between items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
             <PremiumOrb value={rel.percentage || 0} label="Training Consistency" size={70} color="#f59e0b" />
             <PremiumOrb value={statsObj.volumePct || 0} label="Volume %" size={70} />
             <PremiumOrb 
               value={((statsObj.holidaysUsed || 0) / (statsObj.holidayAllowance || 1)) * 100} 
               customValue={`${statsObj.holidaysUsed || 0}/${statsObj.holidayAllowance || 0}`} 
               label="Holidays" 
               size={70} 
             />
             <PremiumOrb value={statsObj.peakStandard || 0} label="Avg WA Pts" size={70} color="amber" unit="" />
             <PremiumOrb 
               value={Math.round(rel.complianceRate || 0)} 
               customValue={`${rel.meetsAttended || 0}/${rel.targetMeets || 5}`}
               label="Meet Attendance" 
               size={70} 
               color="#22d3ee"
             />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
             <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>TOTAL HOURS</div>
                <div className="text-xl font-black">{Math.round(totalActualHours)} <span className="text-[10px] opacity-30">/ {annualTargetHours}</span></div>
             </div>
             <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: 4, fontWeight: 900 }}>MISSED SESSIONS</div>
                <div className="text-xl font-black text-rose-500">{totalAbsentSessions} <span className="text-[10px] opacity-30">({rawAbsentCount} ABSENT)</span></div>
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
                   <div className="text-xl font-black" style={{ color: 'var(--accent-cyan)' }}>{Math.round((seasonPBs?.length || 0) / (results.length || 1) * 100)}%</div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16 ${!reportConfig.sections.aiTechnical ? 'hide-in-report' : ''}`}>
        <div className="lg:col-span-2">
          <AiInsightCard 
            swimmerId={id} 
            coachId={session?.user?.id} 
            performance_slope={performance_slope}
          />
        </div>
        <div className="no-print">
          <ForesightTimeline insights={insights} />
        </div>
      </div>

      <div className={!reportConfig.sections.aiDeepDive ? 'hide-in-report' : ''}>
        <CoachesEyeDeepDive 
          results={results} 
          attendance={attendance} 
          sessions={sessions} 
          swimmer={swimmer} 
          squad={squad} 
          rel={rel}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }} className="mb-16">
        <div className="glass-card" style={{ padding: '2rem', minHeight: '400px', position: 'relative', overflow: 'hidden' }}>
           {/* Background Glow */}
           <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.05) 0%, transparent 70%)', filter: 'blur(50px)', zIndex: 0 }}></div>

           <div className="flex justify-between items-center mb-8 relative z-10">
             <div>
                <div className="section-title" style={{ marginBottom: 4 }}>Performance Velocity</div>
                <h3 className="text-xl font-black tracking-tight">Points Progression Trend</h3>
                <div style={{ fontSize: '0.65rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>
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

           <div style={{ height: 350, position: 'relative', zIndex: 10 }}>
              <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={progressionData}>
                   <defs>
                     <linearGradient id="progGrad" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.3}/>
                       <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                   <XAxis dataKey="date" tick={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                   <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                   <Tooltip 
                     contentStyle={{ background: 'rgba(10, 10, 15, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(20px)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }} 
                   />
                   
                   <ReferenceLine y={getCategoryBenchmark(statsObj.age, swimmer?.gender, selectedStroke === 'All' ? '' : selectedStroke, 'COUNTY')} stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" label={{ value: 'COUNTY', fill: 'rgba(255,255,255,0.3)', fontSize: 8, position: 'insideBottomLeft', fontWeight: 900 }} />
                   <ReferenceLine y={getCategoryBenchmark(statsObj.age, swimmer?.gender, selectedStroke === 'All' ? '' : selectedStroke, 'REGIONAL')} stroke="var(--accent-cyan)" strokeOpacity={0.4} strokeDasharray="3 3" label={{ value: 'REGIONAL', fill: 'var(--accent-cyan)', fontSize: 8, position: 'insideTopLeft', opacity: 0.5, fontWeight: 900 }} />
                   
                   <Area type="monotone" dataKey="wa_pts" fill="url(#progGrad)" stroke="none" />
                   <Line type="monotone" dataKey="wa_pts" name="WA Points" stroke="var(--accent-cyan)" strokeWidth={4} dot={{ fill: '#fff', stroke: 'var(--accent-cyan)', strokeWidth: 2, r: 4 }} activeDot={{ r: 8, strokeWidth: 0, fill: 'var(--accent-cyan)' }} />
                   <Line type="monotone" dataKey="trend" name="Trend" stroke="var(--accent-amber)" strokeWidth={2} dot={false} strokeDasharray="8 4" opacity={0.6} />
                 </ComposedChart>
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

      <div className={!reportConfig.sections.attendance ? 'hide-in-report' : ''}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          <div className="lg:col-span-2 glass-card" style={{ padding: '2.5rem', minHeight: '400px' }}>
             <div className="flex justify-between items-center mb-6">
               <div>
                  <div className="section-title">Consistency Engine</div>
                  <h3 className="text-xl font-black tracking-tight">Training Workload & Compliance</h3>
                  <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <div style={{ width: 10, height: 10, background: 'var(--accent-cyan)', borderRadius: '2px' }}></div>
                      <span className="text-[10px] font-bold opacity-60">TRAINING</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div style={{ width: 10, height: 10, background: 'var(--accent-rose)', borderRadius: '2px' }}></div>
                      <span className="text-[10px] font-bold opacity-60">GALA</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div style={{ width: 10, height: 10, background: '#475569', borderRadius: '2px' }}></div>
                      <span className="text-[10px] font-bold opacity-60">SHUTDOWN</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div style={{ width: 10, height: 10, background: '#8b5cf6', borderRadius: '2px' }}></div>
                      <span className="text-[10px] font-bold opacity-60">HOLIDAY</span>
                    </div>
                  </div>
               </div>
             </div>
             <div style={{ height: 350 }}>
               <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={workloadChartData}>
                   <defs>
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
                             <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{data.training}h Training</div>
                             {data.gala > 0 && <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-rose)' }}>{data.gala}h Gala</div>}
                             {data.isExempt && <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', marginTop: 4 }}>[ CLUB SHUTDOWN ]</div>}
                             {data.holidayUsed && <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#8b5cf6', marginTop: 4 }}>[ HOLIDAY CREDIT ]</div>}
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
                       fill={d.isExempt ? 'rgba(71, 85, 105, 0.2)' : 'rgba(139, 92, 246, 0.2)'} 
                       strokeOpacity={0.3}
                     />
                   ))}
                   <Area yAxisId="right" type="stepAfter" dataKey="compliance" fill="url(#compGrad)" stroke="#10b981" strokeWidth={1} strokeOpacity={0.3} />
                   <Bar yAxisId="left" dataKey="displayTraining" name="Training" radius={[3, 3, 0, 0]} stackId="a">
                      {workloadChartData.map((entry, index) => {
                        let color = 'rgba(255,255,255,0.1)';
                        if (entry.isExempt) color = '#475569';
                        else if (entry.holidayUsed) color = '#8b5cf6';
                        else if (entry.isMet) color = 'var(--accent-cyan)';
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Bar>
                   <Bar yAxisId="left" dataKey="gala" name="Gala" fill="var(--accent-rose)" radius={[3, 3, 0, 0]} stackId="a" />
                   <Line yAxisId="left" type="stepAfter" dataKey="target" name="Target Hours" stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                 </ComposedChart>
               </ResponsiveContainer>
             </div>
          </div>
          <div className="lg:col-span-1 glass-card" style={{ padding: 0, overflow: 'hidden', height: '600px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, transparent 100%)' }}>
               <div className="section-title" style={{ marginBottom: 4 }}>Intelligence Trace</div>
               <h3 className="text-lg font-black tracking-tight">Audit Trail & {rel.creditedSessions || 0} Credits</h3>
               <div style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: 4, fontWeight: 800 }}>LIVE RELIABILITY CALCULATION FEED</div>
            </div>
            <div className="custom-scrollbar" style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>

              <div className="space-y-3">
                {[...workloadChartData].reverse().map((w, idx) => (
                  <div key={idx} style={{ 
                    padding: '1rem', 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '12px', 
                    border: w.isMet ? '1px solid rgba(16,185,129,0.1)' : '1px solid rgba(255,255,255,0.05)',
                    position: 'relative'
                  }}>
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

      <div className={!reportConfig.sections.openMeets ? 'hide-in-report' : ''}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          <div className="lg:col-span-2 glass-card" style={{ padding: '2.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)', filter: 'blur(50px)', zIndex: 0 }}></div>
            <div className="section-title relative z-10" style={{ marginBottom: 4 }}>Competitive Load</div>
            <h3 className="text-xl font-black tracking-tight mb-8 relative z-10">Competition Intensity</h3>
            <div style={{ height: 250, position: 'relative', zIndex: 10 }}>
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
            </div>
          </div>
          <div className="lg:col-span-1 glass-card" style={{ padding: 0, overflow: 'hidden', height: '500px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, transparent 100%)' }}>
               <div className="section-title" style={{ marginBottom: 4 }}>Competitive History</div>
               <h3 className="text-lg font-black tracking-tight">Meet Attendance Log</h3>
            </div>
            <div className="overflow-y-auto flex-1" style={{ padding: '1rem' }}>
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
      </div>

      <div className={!reportConfig.sections.aiDeepDive ? 'hide-in-report' : ''}>
        <CoachesEyeDeepDive 
          results={results} 
          attendance={attendance} 
          sessions={sessions} 
          swimmer={swimmer} 
          squad={squad} 
          rel={rel}
          insights={insights}
        />
      </div>

      <div className="no-print mb-16">
        <ForesightTimeline insights={insights} />
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

      <BenchmarkModal isOpen={isBenchmarkOpen} onClose={() => setIsBenchmarkOpen(false)} />
      
      <ReportConfigModal 
        isOpen={isReportModalOpen} 
        onClose={() => setIsReportModalOpen(false)} 
        onGenerate={handleGenerateReport}
        swimmerName={swimmer.full_name}
      />
    </Layout>
  );
}
