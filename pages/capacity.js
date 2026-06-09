import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { getSessionDuration, calculateReliability, isShutdownDate, isGalaDate, getWeekKey } from '../lib/analytics-utils';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useRouter } from 'next/router';
import CapacityReportModal from '../components/CapacityReportModal';

export default function CapacityDashboard({ session }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [activeTab, setActiveTab] = useState('heatmap');
  const [heatmapViewMode, setHeatmapViewMode] = useState('chart');
  const [cardFilter, setCardFilter] = useState('all');
  const [swimmers, setSwimmers] = useState([]);
  const [dbSquads, setDbSquads] = useState([]);
  const [graphSession, setGraphSession] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [simAdjustments, setSimAdjustments] = useState({});
  const [globalSquadFilter, setGlobalSquadFilter] = useState('All');
  const [updating, setUpdating] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [printConfig, setPrintConfig] = useState({
    includeYield: true,
    includeTable: true,
    audience: 'Coach',
    printTheme: 'dark'
  });

  const [modellingSquadId, setModellingSquadId] = useState('');
  const [modelerAttendance, setModelerAttendance] = useState([]);
  const [proposedAllocations, setProposedAllocations] = useState(null);
  const [proposedOccupancies, setProposedOccupancies] = useState({});
  const [newSwimmers, setNewSwimmers] = useState([]);
  const [newSwimmersPriority, setNewSwimmersPriority] = useState(true);
  const [newSwimmersCount, setNewSwimmersCount] = useState(1);
  const [clubExemptions, setClubExemptions] = useState([]);
  const [galaResults, setGalaResults] = useState([]);
  const [forceWeekendSession, setForceWeekendSession] = useState(false);
  const [goodAttendanceThreshold, setGoodAttendanceThreshold] = useState(70);

  // Target squad object selected in the modeler
  const targetModellingSquad = useMemo(() => {
    return dbSquads.find(s => s.id === modellingSquadId) || null;
  }, [dbSquads, modellingSquadId]);

  useEffect(() => {
    // If loading from query parameters for pdf rebalance, do not apply default resets
    if (router.isReady && router.query.runRebalance === 'true') return;

    setProposedAllocations(null);
    setProposedOccupancies({});
    setNewSwimmers([]);
    setNewSwimmersCount(1);
    if (targetModellingSquad) {
      setForceWeekendSession(targetModellingSquad.require_weekend || false);
    } else {
      setForceWeekendSession(false);
    }
  }, [modellingSquadId, targetModellingSquad, router.isReady, router.query.runRebalance]);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.tab) {
      setActiveTab(router.query.tab);
    }
    if (router.query.periodDays) {
      setPeriodDays(parseInt(router.query.periodDays, 10));
    }
    if (router.query.squadFilter) {
      setGlobalSquadFilter(router.query.squadFilter);
    }
    if (router.query.modellingSquadId) {
      setModellingSquadId(router.query.modellingSquadId);
    }
    if (router.query.goodAttendanceThreshold) {
      setGoodAttendanceThreshold(parseInt(router.query.goodAttendanceThreshold, 10) || 70);
    }
    if (router.query.forceWeekendSession) {
      setForceWeekendSession(router.query.forceWeekendSession === 'true');
    }
    if (router.query.newSwimmersPriority) {
      setNewSwimmersPriority(router.query.newSwimmersPriority === 'true');
    }
    if (router.query.simSwimmerCount) {
      const count = parseInt(router.query.simSwimmerCount, 10);
      if (!isNaN(count) && count > 0 && newSwimmers.length === 0) {
        const added = [];
        for (let i = 0; i < count; i++) {
          added.push({
            id: `sim-param-${i}`,
            full_name: `New Swimmer ${i + 1}`,
            attendancePct: 100,
            isNew: true
          });
        }
        setNewSwimmers(added);
      }
    }
    setPrintConfig({
      includeYield: router.query.includeYield !== 'false',
      includeTable: router.query.includeTable !== 'false',
      audience: router.query.audience || 'Coach',
      printTheme: router.query.printTheme || 'dark'
    });
  }, [router.isReady, router.query]);

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
    const [sessRes, allMemberships, allAttendance, swimRes, squadsRes, allModelerAttendance, exemptionsRes, resultsRes] = await Promise.all([
      supabase.from('sessions').select('*').order('day_of_week').order('start_time'),
      fetchPaged('session_memberships', 'session_id, swimmer_id'),
      fetchPaged('training_attendance', 'session_id, swimmer_id, date', q => q.eq('status', 'present').gte('date', startDate)),
      supabase.from('swimmers').select('id, full_name, year_of_birth, squads(id, name, target_hours_per_week, target_sessions_per_week, swimmers_per_lane, require_weekend)'),
      supabase.from('squads').select('id, name, swimmers_per_lane, target_sessions_per_week, target_hours_per_week, require_weekend, is_squad'),
      fetchPaged('training_attendance', 'session_id, swimmer_id, date, status', q => q.gte('date', startDate)),
      supabase.from('club_exemptions').select('*'),
      fetchPaged('results', 'swimmer_id, date, meet_id, meets(date, end_date, name, type)', q => q.gte('date', startDate.substring(0, 10)))
    ]);

    if (sessRes.data) setSessions(sessRes.data);
    if (allMemberships) setMemberships(allMemberships);
    if (allAttendance) setAttendance(allAttendance);
    if (swimRes.data) setSwimmers(swimRes.data);
    if (squadsRes.data) {
      setDbSquads(squadsRes.data);
      const devSquad = squadsRes.data.find(s => s.name === 'AGE DEVELOPMENT');
      if (devSquad) {
        setModellingSquadId(devSquad.id);
      } else {
        const firstSquad = squadsRes.data.find(s => s.is_squad);
        if (firstSquad) setModellingSquadId(firstSquad.id);
      }
    }
    if (allModelerAttendance) setModelerAttendance(allModelerAttendance);
    if (exemptionsRes.data) setClubExemptions(exemptionsRes.data);
    if (resultsRes) setGalaResults(resultsRes);
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

  const getSwimmersPerLaneForSession = (sessName) => {
    if (!sessName || !dbSquads || dbSquads.length === 0) return 8;
    const nameLower = sessName.toLowerCase();
    
    // Sort squads by name length descending to match more specific names first
    const sortedSquads = [...dbSquads].sort((a, b) => b.name.length - a.name.length);
    for (const squad of sortedSquads) {
      const squadNameLower = squad.name.toLowerCase();
      const firstWord = squadNameLower.split(' ')[0];
      
      if (nameLower.includes(squadNameLower) || (firstWord.length > 2 && nameLower.includes(firstWord))) {
        return squad.swimmers_per_lane ?? 8;
      }
    }
    return 8;
  };

  const sortedSessions = [...sessions].sort((a, b) => getDayOrder(a.day_of_week) - getDayOrder(b.day_of_week));
  const squadsList = [...new Set(swimmers.map(s => s.squads?.name).filter(Boolean))].sort();

  // Ghost Allocations: memberships with zero 'present' attendance records in the current period
  const ghostAllocations = useMemo(() => {
    return memberships.map(m => {
      const swimmer = swimmers.find(s => s.id === m.swimmer_id);
      if (!swimmer) return null;

      const squadName = swimmer.squads?.name || '';
      if (globalSquadFilter !== 'All') {
        const filters = globalSquadFilter.split(',');
        if (!filters.includes(squadName)) return null;
      }

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

  const handlePrintReport = () => {
    setIsReportModalOpen(true);
  };

  const handleGenerateReport = async (config) => {
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

      const squadFilterStr = config.selectedSquads.join(',');

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: `/capacity?tab=ghosts&periodDays=${periodDays}&squadFilter=${squadFilterStr}&includeYield=${config.includeYield}&includeTable=${config.includeTable}&audience=${config.audience}&printTheme=${config.printTheme}`,
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
      a.download = `ghost-allocations-reclamation-report.pdf`;
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

  const handleCapacityExport = () => {
    setIsExporting(true);
    // Simulation state is ephemeral React state — must use browser print, not Puppeteer
    setTimeout(() => {
      window.print();
      setIsExporting(false);
    }, 300);
  };

  const handleExportModellingPDF = async () => {
    if (!targetModellingSquad) return;
    setIsExporting(true);
    try {
      const clientAuth = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key === 'print-insight-cache' || key === 'print-report-config')) {
          clientAuth[key] = localStorage.getItem(key);
        }
      }

      const simCount = newSwimmers.length;
      const targetPath = `/capacity?tab=squadModelling&periodDays=${periodDays}&modellingSquadId=${modellingSquadId}&goodAttendanceThreshold=${goodAttendanceThreshold}&forceWeekendSession=${forceWeekendSession}&newSwimmersPriority=${newSwimmersPriority}&simSwimmerCount=${simCount}&runRebalance=true&printTheme=${printConfig.printTheme}`;

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath,
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
      const squadCleanName = targetModellingSquad.name.toLowerCase().replace(/\s+/g, '-');
      a.download = `${squadCleanName}-rebalancing-simulation-report.pdf`;
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

  const handleAutoAllocate = () => {
    if (!targetModellingSquad) return;
    const target = targetModellingSquad.target_sessions_per_week || 4;
    const targetHours = targetModellingSquad.target_hours_per_week || 0;
    const requireWeekend = forceWeekendSession;

    // Track proposed occupancy for each session
    const proposedCounts = {};
    squadModellingSessions.forEach(s => {
      proposedCounts[s.id] = 0;
    });

    const getAssignedHours = (sessionsList) => {
      return sessionsList.reduce((tot, s) => tot + getSessionDuration(s), 0);
    };
    const allocations = combinedSwimmersList.map(swimmer => {
      const swMemberships = swimmer.isNew ? [] : memberships.filter(m => m.swimmer_id === swimmer.id);
      const existingSessions = swimmer.isNew ? [] : squadModellingSessions.filter(s => 
        swMemberships.some(m => m.session_id === s.id || m.session_id === s.scm_guid)
      );
      const assigned = [];
      const reasons = [];

      const isWeekend = (session) => session.day_of_week === 'Saturday' || session.day_of_week === 'Sunday';

      const isGhostSession = (sess) => {
        if (swimmer.isNew) return false;
        const presentCount = attendance.filter(a =>
          a.swimmer_id === swimmer.id && 
          (a.session_id === sess.id || a.session_id === sess.scm_guid || a.session_id === sess.id?.toLowerCase() || a.session_id === sess.scm_guid?.toLowerCase())
        ).length;
        return presentCount === 0;
      };

      const canAssign = (session, isExisting = false) => {
        if (assigned.some(s => s.id === session.id)) return false;
        
        // Never assign ghost sessions back to the swimmer
        if (isGhostSession(session)) return false;

        // For new assignments, do not allow originally Hot sessions
        if (!isExisting && session.category === 'Hot') return false;
        
        // Respect the dynamic limit
        if (proposedCounts[session.id] >= session.remainingCapForTargetSquad) return false;

        return true;
      };

      // Split existing sessions into active and ghost
      const activeExisting = existingSessions.filter(s => !isGhostSession(s));
      const ghostExisting = existingSessions.filter(s => isGhostSession(s));

      const originalSessionsCount = existingSessions.length;
      const originalHoursCount = getAssignedHours(existingSessions);
      const originalAtOrAboveTarget = originalSessionsCount >= target || originalHoursCount >= targetHours;

      // Rule 3: Weekend requirement
      if (requireWeekend) {
        let weekendSession = activeExisting.find(s => isWeekend(s) && canAssign(s, true));
        if (!weekendSession) {
          weekendSession = ghostExisting.find(s => isWeekend(s) && canAssign(s, true));
        }
        if (!weekendSession) {
          weekendSession = squadModellingSessions.find(s => isWeekend(s) && canAssign(s, false));
        }
        if (!weekendSession) {
          weekendSession = squadModellingSessions.find(s => {
            return isWeekend(s) && !isGhostSession(s) && proposedCounts[s.id] < s.remainingCapForTargetSquad;
          });
        }

        if (weekendSession) {
          assigned.push(weekendSession);
          proposedCounts[weekendSession.id]++;
          
          const wasGhost = isGhostSession(weekendSession);
          const isNewSess = !existingSessions.some(e => e.id === weekendSession.id);
          if (isNewSess) {
            reasons.push(`Weekend session forced by settings (${weekendSession.day_of_week})`);
          }
        }
      }

      // Rule 4: Existing memberships (keep if they fit within target squad's capacity share)
      // Good attenders (attendance >= goodAttendanceThreshold) are not capped by squad targets for existing sessions
      const isGoodAttender = swimmer.attendancePct >= goodAttendanceThreshold;
      
      // 4A: Active existing sessions
      activeExisting.forEach(s => {
        const currentHours = getAssignedHours(assigned);
        if (!isGoodAttender && assigned.length >= target && currentHours >= targetHours) return;
        if (canAssign(s, true)) {
          assigned.push(s);
          proposedCounts[s.id]++;
        }
      });

      // 4B: Ghost existing sessions (always capped at target sessions/hours) - ghost sessions are never assigned now
      ghostExisting.forEach(s => {
        const currentHours = getAssignedHours(assigned);
        if (assigned.length >= target && currentHours >= targetHours) return;
        if (canAssign(s, true)) {
          assigned.push(s);
          proposedCounts[s.id]++;
        }
      });

      // Rule 5: New Cold sessions (fill up to target using available Cold sessions)
      // Capped by originalAtOrAboveTarget: if swimmer already met/exceeded targets, we do not allocate replacements for ghost sessions
      if (!originalAtOrAboveTarget && (assigned.length < target || getAssignedHours(assigned) < targetHours)) {
        const candidates = squadModellingSessions
          .filter(s => canAssign(s, false))
          .sort((a, b) => proposedCounts[a.id] - proposedCounts[b.id]);

        for (const s of candidates) {
          const currentHours = getAssignedHours(assigned);
          if (assigned.length >= target && currentHours >= targetHours) break;
          assigned.push(s);
          proposedCounts[s.id]++;
        }
      }

      // Generate justifications based on reallocations/removals
      if (swimmer.isNew) {
        reasons.push("Simulated new swimmer allocation");
      } else {
        // 1. Ghost removals
        const removedGhosts = ghostExisting.filter(s => !assigned.some(a => a.id === s.id));
        if (removedGhosts.length > 0) {
          reasons.push(`Removed ghost session(s): ${removedGhosts.map(s => s.day_of_week).join(', ')} (0% attendance)`);
        }

        // 2. Displaced Hot sessions (due to lane capacity limits)
        const displacedSessions = activeExisting.filter(s => !assigned.some(a => a.id === s.id) && s.category === 'Hot');
        if (displacedSessions.length > 0) {
          reasons.push(`Reallocated from overcapacity session(s): ${displacedSessions.map(s => s.day_of_week).join(', ')}`);
        }

        // 3. Trimmed sessions due to low attendance (below threshold)
        const cappedSessions = activeExisting.filter(s => !assigned.some(a => a.id === s.id) && s.category !== 'Hot');
        if (cappedSessions.length > 0 && !isGoodAttender) {
          reasons.push(`Trimmed extra sessions: ${cappedSessions.map(s => s.day_of_week).join(', ')} (capped due to attendance < ${goodAttendanceThreshold}%)`);
        }

        // 4. Added new sessions
        const addedSessions = assigned.filter(s => !existingSessions.some(e => e.id === s.id));
        if (addedSessions.length > 0) {
          const nonForcedAdded = addedSessions.filter(s => !reasons.some(r => r.includes(s.day_of_week)));
          if (nonForcedAdded.length > 0) {
            reasons.push(`Added Cold session(s): ${nonForcedAdded.map(s => s.day_of_week).join(', ')} to meet minimum criteria`);
          }
        }

        // 5. Retained original schedule
        if (reasons.length === 0) {
          reasons.push("Retained original schedule (stable attendance)");
        }
      }

      return {
        swimmerId: swimmer.id,
        swimmerName: swimmer.full_name,
        attendancePct: swimmer.attendancePct,
        isNew: swimmer.isNew || false,
        oldSessions: existingSessions,
        newSessions: assigned,
        reasons: reasons
      };
    });

    setProposedAllocations(allocations);
    setProposedOccupancies(proposedCounts);
  };

  const handleResetModel = () => {
    setProposedAllocations(null);
    setProposedOccupancies({});
    setNewSwimmers([]);
    setNewSwimmersCount(1);
    setGoodAttendanceThreshold(70);
  };

  const handleAddNewSwimmers = (e) => {
    e.preventDefault();
    const count = parseInt(newSwimmersCount, 10);
    if (isNaN(count) || count <= 0) return;
    
    const added = [];
    const startIdx = newSwimmers.length + 1;
    for (let i = 0; i < count; i++) {
      added.push({
        id: `sim-${Date.now()}-${i}`,
        full_name: `New Swimmer ${startIdx + i}`,
        attendancePct: 100,
        isNew: true
      });
    }
    
    setNewSwimmers([...newSwimmers, ...added]);
    setNewSwimmersCount(1);
  };

  const handleRemoveNewSwimmer = (id) => {
    setNewSwimmers(newSwimmers.filter(s => s.id !== id));
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

  const squadGhostCount = useMemo(() => {
    if (!targetModellingSquad) return 0;
    return ghostAllocations.filter(g => g.squadName === targetModellingSquad.name).length;
  }, [ghostAllocations, targetModellingSquad]);

  // Modeler Sessions: filtered by target squad keywords and including shared NAR+ Monday session for AGE DEVELOPMENT
  const squadModellingSessions = useMemo(() => {
    if (!targetModellingSquad) return [];

    const squadNameLower = targetModellingSquad.name.toLowerCase();
    const squadKey = targetModellingSquad.name.split(' ')[0].toLowerCase();

    const devSessionsList = sessions.filter(s => {
      const nameLower = s.name.toLowerCase();
      if (nameLower.includes(squadNameLower)) return true;
      if (squadKey.length > 2 && nameLower.includes(squadKey)) return true;
      
      if (squadNameLower === 'age development' && nameLower.includes('nar+ & invited others')) {
        return true;
      }
      return false;
    });

    const targetSwimmersIds = new Set(
      swimmers.filter(sw => sw.squads?.id === targetModellingSquad.id).map(sw => sw.id)
    );

    // Count current memberships for each session
    const counts = {};
    memberships.forEach(m => {
      counts[m.session_id] = (counts[m.session_id] || 0) + 1;
    });

    const sortedDevSessionsList = [...devSessionsList].sort((a, b) => {
      const diff = getDayOrder(a.day_of_week) - getDayOrder(b.day_of_week);
      if (diff !== 0) return diff;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });

    return sortedDevSessionsList.map(s => {
      const currentCount = (counts[s.id] || 0) + (counts[s.scm_guid] || 0);

      // Count memberships for target squad only
      const targetSquadCurrentMembersInSession = memberships.filter(m => 
        (m.session_id === s.id || m.session_id === s.scm_guid) && 
        targetSwimmersIds.has(m.swimmer_id)
      ).length;

      const otherSquadMembersCount = currentCount - targetSquadCurrentMembersInSession;
      const cap = (s.lanes_allocated || 6) * (targetModellingSquad.swimmers_per_lane || 8);
      
      const remainingCapForTargetSquad = Math.max(0, cap - otherSquadMembersCount);
      const category = currentCount >= cap ? 'Hot' : 'Cold';
      
      return {
        ...s,
        currentCount,
        cap,
        otherSquadMembersCount,
        remainingCapForTargetSquad,
        category
      };
    });
  }, [sessions, memberships, targetModellingSquad, swimmers]);

  const currentAvailablePlaces = useMemo(() => {
    if (!targetModellingSquad || squadModellingSessions.length === 0) return 0;
    const target = targetModellingSquad.target_sessions_per_week || 4;
    const totalFreeSlots = squadModellingSessions.reduce((sum, s) => {
      const targetSquadMembers = s.currentCount - s.otherSquadMembersCount;
      const free = Math.max(0, s.remainingCapForTargetSquad - targetSquadMembers);
      return sum + free;
    }, 0);
    return Math.floor(totalFreeSlots / target);
  }, [targetModellingSquad, squadModellingSessions]);

  const proposedAvailablePlaces = useMemo(() => {
    if (!targetModellingSquad || squadModellingSessions.length === 0) return 0;
    const target = targetModellingSquad.target_sessions_per_week || 4;
    const totalFreeSlots = squadModellingSessions.reduce((sum, s) => {
      const targetSquadMembers = s.currentCount - s.otherSquadMembersCount;
      const proposedCount = proposedOccupancies[s.id] !== undefined ? proposedOccupancies[s.id] : targetSquadMembers;
      const free = Math.max(0, s.remainingCapForTargetSquad - proposedCount);
      return sum + free;
    }, 0);
    return Math.floor(totalFreeSlots / target);
  }, [targetModellingSquad, squadModellingSessions, proposedOccupancies]);

  // Session Peak Attendance: maximum number of swimmers present on any single date in the period for each session
  const sessionPeakAttendance = useMemo(() => {
    const peaks = {};
    const countsByDate = {};
    
    attendance.forEach(a => {
      const key = a.session_id;
      const dateStr = a.date;
      if (!countsByDate[key]) countsByDate[key] = {};
      countsByDate[key][dateStr] = (countsByDate[key][dateStr] || 0) + 1;
    });

    Object.entries(countsByDate).forEach(([key, dates]) => {
      const counts = Object.values(dates);
      peaks[key] = counts.length > 0 ? Math.max(...counts) : 0;
    });

    return peaks;
  }, [attendance]);

  // Swimmers in the target squad with calculated historical attendance percentage (sorted Highest to Lowest)
  const swimmersWithAttendance = useMemo(() => {
    if (!targetModellingSquad) return [];
    
    const targetSwimmers = swimmers.filter(s => s.squads?.id === targetModellingSquad.id);

    return targetSwimmers.map(sw => {
      const swMemberships = memberships.filter(m => m.swimmer_id === sw.id);
      const relResult = calculateReliability(
        sw,
        modelerAttendance,
        sessions,
        galaResults,
        periodDays,
        clubExemptions,
        swMemberships,
        {
          sessionCredits: true,
          galas: true,
          holidays: true,
          shutdowns: true,
          complianceMode: 'combined'
        }
      );

      // Calculate a fair session-by-session attendance percentage
      const swAtt = modelerAttendance.filter(a => a.swimmer_id === sw.id);
      let presentCount = 0;
      let absentCount = 0;

      swAtt.forEach(att => {
        if (att.status !== 'present' && att.status !== 'absent') return;

        const dateStr = att.date;
        const weekKey = getWeekKey(new Date(dateStr));
        const isHolidayWeek = relResult.details?.[weekKey]?.isHoliday === true;

        // Check shutdown exemption
        const shutdown = isShutdownDate(dateStr, clubExemptions, sw.squads?.id || sw.squad_id);
        if (shutdown) {
          if (shutdown.type === 'exempt') {
            return;
          }
          if (shutdown.type === 'credit') {
            presentCount++;
            return;
          }
        }

        // Check gala racing
        const isRacing = isGalaDate(dateStr, sw.id, galaResults);
        if (isRacing) {
          presentCount++;
          return;
        }

        if (att.status === 'present') {
          presentCount++;
        } else if (att.status === 'absent') {
          if (isHolidayWeek) {
            return;
          }
          absentCount++;
        }
      });

      const fairTotal = presentCount + absentCount;
      const fairPct = fairTotal > 0 ? Math.round((presentCount / fairTotal) * 100) : 0;

      return {
        ...sw,
        attendancePct: fairPct
      };
    }).sort((a, b) => b.attendancePct - a.attendancePct);
  }, [swimmers, modelerAttendance, targetModellingSquad, sessions, galaResults, periodDays, clubExemptions, memberships]);

  // Combined Swimmers list (including simulated new swimmers, sorted based on priority toggle)
  const combinedSwimmersList = useMemo(() => {
    const list = [...swimmersWithAttendance];
    newSwimmers.forEach(ns => {
      list.push({
        id: ns.id,
        full_name: ns.full_name,
        attendancePct: ns.attendancePct || 100,
        isNew: true,
        squads: { id: targetModellingSquad?.id, name: targetModellingSquad?.name }
      });
    });

    if (newSwimmersPriority) {
      return [...list].sort((a, b) => b.attendancePct - a.attendancePct);
    } else {
      return [...list].sort((a, b) => {
        if (a.isNew && !b.isNew) return 1;
        if (!a.isNew && b.isNew) return -1;
        return b.attendancePct - a.attendancePct;
      });
    }
  }, [swimmersWithAttendance, newSwimmers, newSwimmersPriority, targetModellingSquad]);

  const currentSwimmerCapacity = useMemo(() => {
    return swimmersWithAttendance.length + currentAvailablePlaces;
  }, [swimmersWithAttendance, currentAvailablePlaces]);

  const proposedSwimmerCapacity = useMemo(() => {
    const proposedEnrolled = swimmersWithAttendance.length + newSwimmers.length;
    return proposedEnrolled + proposedAvailablePlaces;
  }, [swimmersWithAttendance, newSwimmers, proposedAvailablePlaces]);

  const swimmersBroughtToCriteriaCount = useMemo(() => {
    if (!targetModellingSquad || !proposedAllocations) return 0;
    const target = targetModellingSquad.target_sessions_per_week || 4;
    const targetHours = targetModellingSquad.target_hours_per_week || 0;

    return proposedAllocations.reduce((count, proposed) => {
      if (proposed.isNew) return count;

      const swMemberships = memberships.filter(m => m.swimmer_id === proposed.swimmerId);
      const currentSessions = squadModellingSessions.filter(s => 
        swMemberships.some(m => m.session_id === s.id || m.session_id === s.scm_guid)
      );
      const currentHours = currentSessions.reduce((total, s) => total + getSessionDuration(s), 0);

      const previouslyMet = currentSessions.length >= target && currentHours >= targetHours;

      if (!previouslyMet) {
        const proposedHours = proposed.newSessions.reduce((total, s) => total + getSessionDuration(s), 0);
        const nowMeets = proposed.newSessions.length >= target && proposedHours >= targetHours;
        if (nowMeets) {
          return count + 1;
        }
      }
      return count;
    }, 0);
  }, [targetModellingSquad, proposedAllocations, memberships, squadModellingSessions]);

  useEffect(() => {
    if (router.isReady && router.query.runRebalance === 'true' && targetModellingSquad && combinedSwimmersList.length > 0 && squadModellingSessions.length > 0 && !proposedAllocations) {
      const timer = setTimeout(() => {
        handleAutoAllocate();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [router.isReady, router.query.runRebalance, targetModellingSquad, combinedSwimmersList, squadModellingSessions, proposedAllocations]);

  // Unscheduled Attendances: swimmers attending sessions they are not scheduled to attend (no membership)
  const unscheduledAttendances = useMemo(() => {
    const list = swimmers.map(swimmer => {
      const squadName = swimmer.squads?.name || '';
      if (globalSquadFilter !== 'All') {
        const filters = globalSquadFilter.split(',');
        if (!filters.includes(squadName)) return null;
      }

      const myMemberships = memberships.filter(m => m.swimmer_id === swimmer.id);
      const myAttendance = attendance.filter(a => a.swimmer_id === swimmer.id);

      const unscheduledRecords = myAttendance.filter(a => {
        const session = sessions.find(s => s.id === a.session_id || s.scm_guid === a.session_id);
        const isScheduled = myMemberships.some(m => {
          if (m.session_id === a.session_id) return true;
          if (session && (m.session_id === session.id || m.session_id === session.scm_guid)) return true;
          return false;
        });
        return !isScheduled;
      });

      if (unscheduledRecords.length === 0) return null;

      // Group by session
      const unscheduledBySession = {};
      unscheduledRecords.forEach(a => {
        const key = a.session_id;
        if (!unscheduledBySession[key]) {
          const session = sessions.find(s => s.id === a.session_id || s.scm_guid === a.session_id);
          unscheduledBySession[key] = {
            sessionId: key,
            sessionName: session ? session.name : 'Unknown Session',
            sessionDay: session ? session.day_of_week : 'Unknown Day',
            sessionTime: session ? `${session.start_time} - ${session.end_time}` : '',
            dates: []
          };
        }
        unscheduledBySession[key].dates.push(a.date);
      });

      const unscheduledSessions = Object.values(unscheduledBySession).sort((a, b) => b.dates.length - a.dates.length);

      return {
        swimmerId: swimmer.id,
        swimmerName: swimmer.full_name,
        squadName,
        totalUnscheduled: unscheduledRecords.length,
        sessions: unscheduledSessions
      };
    }).filter(Boolean).sort((a, b) => b.totalUnscheduled - a.totalUnscheduled);

    return list;
  }, [memberships, swimmers, sessions, attendance, globalSquadFilter]);

  const heatmapStats = useMemo(() => {
    const filtered = sortedSessions.filter(sess => {
      if (globalSquadFilter === 'All') return true;
      const filters = globalSquadFilter.split(',');
      return filters.some(f => sess.name.toLowerCase().includes(f.trim().toLowerCase()));
    });

    let overCapacityCount = 0;
    let underUtilizedCount = 0;
    let totalDensitySum = 0;
    let sessionsWithDensity = 0;

    const sessionsData = filtered.map(sess => {
      const activeSwimmers = memberships.filter(m => m.session_id === sess.id || m.session_id === sess.scm_guid).length;
      const lanes = sess.lanes_allocated || 6;
      const maxCapacity = lanes * getSwimmersPerLaneForSession(sess.name);

      const rosterDensity = maxCapacity > 0 ? Math.round((activeSwimmers / maxCapacity) * 100) : 0;

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

      let statusColor = '#10b981'; 
      let statusBg = 'rgba(16, 185, 129, 0.08)';
      let statusBorder = 'rgba(16, 185, 129, 0.3)';
      let statusText = 'OPTIMAL (ACTUAL)';
      let shadowGlow = 'rgba(16, 185, 129, 0.15)';

      if (actualDensity > 100 || rosterDensity > 100) { 
        statusColor = '#f43f5e'; 
        statusBg = 'rgba(244, 63, 94, 0.08)';
        statusBorder = 'rgba(244, 63, 94, 0.3)';
        statusText = 'OVER CAPACITY'; 
        overCapacityCount++;
        shadowGlow = 'rgba(244, 63, 94, 0.15)';
      } else if (actualDensity >= 85 || rosterDensity >= 85) { 
        statusColor = '#f59e0b'; 
        statusBg = 'rgba(245, 158, 11, 0.08)';
        statusBorder = 'rgba(245, 158, 11, 0.3)';
        statusText = 'NEAR CAPACITY'; 
        shadowGlow = 'rgba(245, 158, 11, 0.15)';
      } else if (actualDensity < 50) {
        statusColor = '#06b6d4'; 
        statusBg = 'rgba(6, 182, 212, 0.08)';
        statusBorder = 'rgba(6, 182, 212, 0.3)';
        statusText = 'UNDER UTILIZED';
        underUtilizedCount++;
        shadowGlow = 'rgba(6, 182, 212, 0.15)';
      }

      if (maxCapacity > 0) {
        totalDensitySum += actualDensity;
        sessionsWithDensity++;
      }

      return {
        ...sess,
        activeSwimmers,
        maxCapacity,
        rosterDensity,
        avgAtt,
        peakAtt,
        actualDensity,
        sessionAtt,
        statusColor,
        statusBg,
        statusBorder,
        statusText,
        shadowGlow
      };
    });

    const averageClubOccupancy = sessionsWithDensity > 0 ? Math.round(totalDensitySum / sessionsWithDensity) : 0;

    return {
      sessionsData,
      overCapacityCount,
      underUtilizedCount,
      averageClubOccupancy,
      totalSessions: filtered.length
    };
  }, [sortedSessions, memberships, attendance, globalSquadFilter, dbSquads]);

  const weeklyChartData = useMemo(() => {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return dayOrder.map(day => {
      const daySessions = heatmapStats.sessionsData.filter(s => s.day_of_week?.toLowerCase() === day.toLowerCase());
      
      let totalCapacity = 0;
      let totalRoster = 0;
      let totalActual = 0;
      let totalPeak = 0;

      daySessions.forEach(s => {
        totalCapacity += s.maxCapacity;
        totalRoster += s.activeSwimmers;
        totalActual += s.avgAtt;
        totalPeak += s.peakAtt || 0;
      });

      return {
        day: day.substring(0, 3),
        'Physical Capacity': totalCapacity,
        'Enrolled Roster': totalRoster,
        'Actual Attendance': totalActual,
        'Peak Attendance': totalPeak,
        daySessionsCount: daySessions.length
      };
    });
  }, [heatmapStats.sessionsData]);

  const filteredDetailedSessions = useMemo(() => {
    if (cardFilter === 'over') {
      return heatmapStats.sessionsData.filter(s => s.actualDensity > 100 || s.rosterDensity > 100);
    }
    if (cardFilter === 'under') {
      return heatmapStats.sessionsData.filter(s => s.actualDensity < 50);
    }
    return heatmapStats.sessionsData;
  }, [heatmapStats.sessionsData, cardFilter]);

  const simulateYieldInModeler = () => {
    const newAdjustments = {};
    waitlistYields.forEach(y => {
      newAdjustments[y.squadName] = y.yield;
    });
    setSimAdjustments(newAdjustments);
    setActiveTab('modeler');
  };

  const handleCardClick = (filterType) => {
    setCardFilter(prev => prev === filterType ? 'all' : filterType);
    setTimeout(() => {
      document.getElementById('detailed-sessions-breakdown')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <Layout session={session}>
      <Head>
        <title>Pool Space & Capacity | CoachesEye</title>
        <style>{`
          @media print {
            @page { size: portrait; margin: 0 !important; }
            html, body { 
              margin: 0 !important; 
              padding: 0 !important; 
              width: 100% !important; 
              height: auto !important; 
              background: ${printConfig.printTheme === 'light' ? '#ffffff' : '#050b10'} !important; 
              color: ${printConfig.printTheme === 'light' ? '#000000' : '#ffffff'} !important;
              -webkit-print-color-adjust: exact !important; 
              print-color-adjust: exact !important; 
            }
            .no-print, button, nav, footer { display: none !important; }
            .print-only { display: block !important; }
            .roster-cover-page { 
              display: flex !important; 
              height: 100vh !important; 
              flex-direction: column; 
              justify-content: center; 
              align-items: center; 
              text-align: center; 
              page-break-after: always; 
              background: ${printConfig.printTheme === 'light' ? '#ffffff' : '#050b10'} !important; 
              color: ${printConfig.printTheme === 'light' ? '#000000' : '#ffffff'} !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            main, .layout-container { padding: 0 !important; margin: 0 !important; min-height: auto !important; position: static !important; }
            body::after {
              content: "TONBRIDGE SWIMMING CLUB | EST. 1911 | COACHESEYE CAPACITY INTELLIGENCE";
              position: fixed;
              bottom: 10mm;
              left: 0;
              width: 100%;
              text-align: center;
              font-size: 0.5rem;
              font-weight: 950;
              opacity: 0.3;
              letter-spacing: 0.2em;
              color: ${printConfig.printTheme === 'light' ? '#000000' : '#ffffff'} !important;
            }
            .glass-card { 
              border: ${printConfig.printTheme === 'light' ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)'} !important; 
              background: ${printConfig.printTheme === 'light' ? 'rgba(250,250,250,0.95)' : 'rgba(10,10,20,0.8)'} !important; 
              color: ${printConfig.printTheme === 'light' ? '#000000' : '#ffffff'} !important; 
              page-break-inside: avoid; 
              margin-bottom: 0.8rem !important; 
              padding: 2.5rem !important; 
            }
            .print-no-card {
              background: transparent !important;
              border: none !important;
              padding: 0 !important;
              box-shadow: none !important;
              page-break-inside: auto !important;
            }
            .stats-table-glass th { color: ${printConfig.printTheme === 'light' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)'} !important; }
            .stats-table-glass td { 
              color: ${printConfig.printTheme === 'light' ? '#000000' : '#ffffff'} !important; 
              border-bottom: ${printConfig.printTheme === 'light' ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.05)'} !important; 
            }
            .print-hide, .no-print, .print-hide *, .no-print * { display: none !important; }
          }
          .print-only { display: none; }
        `}</style>
      </Head>

      {/* PRINT COVER PAGE */}
      {activeTab === 'ghosts' && (
        <div className="print-only roster-cover-page">
          <img src="/coacheseye-logo.png" alt="CoachesEye" style={{ height: '120px', marginBottom: '3rem' }} />
          <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--accent-rose)', letterSpacing: '0.5em', marginBottom: '2.5rem', textTransform: 'uppercase' }}>CoachesEye Strategic Intelligence</div>
          <h1 style={{ fontSize: '3.8rem', fontWeight: 900, margin: '0 2rem', lineHeight: 1.15, letterSpacing: '-0.04em', textTransform: 'uppercase', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Ghost Allocations &<br/>Capacity Reclamation
          </h1>
          <div style={{ height: '8px', width: '120px', background: 'var(--accent-rose)', margin: '4rem 0' }}></div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Squad Filter: {globalSquadFilter.replace(/,/g, ', ').toUpperCase()}
          </div>
          <div style={{ fontSize: '1rem', opacity: 0.6, marginTop: '1rem', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Analysis Period: {periodDays} Days | Active Ghost Count: {ghostAllocations.length}
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.4, marginTop: '3rem', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Generated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      )}
      {activeTab === 'squadModelling' && (
        <div className="print-only roster-cover-page">
          <img src="/coacheseye-logo.png" alt="CoachesEye" style={{ height: '120px', marginBottom: '3rem' }} />
          <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.5em', marginBottom: '2.5rem', textTransform: 'uppercase' }}>CoachesEye Strategic Intelligence</div>
          <h1 style={{ fontSize: '3.8rem', fontWeight: 900, margin: '0 2rem', lineHeight: 1.15, letterSpacing: '-0.04em', textTransform: 'uppercase', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Squad Rebalancing &<br/>Capacity Modelling
          </h1>
          <div style={{ height: '8px', width: '120px', background: 'var(--accent-cyan)', margin: '4rem 0' }}></div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Squad: {targetModellingSquad?.name?.toUpperCase() || 'ALL'}
          </div>
          <div style={{ fontSize: '1rem', opacity: 0.6, marginTop: '1rem', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Attendance Threshold: {goodAttendanceThreshold}% | Weekend Allocation: {forceWeekendSession ? 'Forced' : 'Default'}
          </div>
          <div style={{ fontSize: '1rem', opacity: 0.6, marginTop: '0.5rem', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Current Available Places: {currentAvailablePlaces} | Proposed Available Places: {proposedAvailablePlaces}
          </div>
          <div style={{ fontSize: '1rem', opacity: 0.6, marginTop: '0.5rem', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Simulated Swimmers: {newSwimmers.length} | Analysis Period: {periodDays} Days
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.4, marginTop: '3rem', color: printConfig.printTheme === 'light' ? '#000' : '#fff' }}>
            Generated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      )}
      <div className="container animate-fade-in">
        <div className="flex justify-between items-end mb-8 no-print">
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
              <button
                onClick={() => setActiveTab('unscheduled')}
                style={activeTab === 'unscheduled'
                  ? { background: 'linear-gradient(180deg, rgba(80,150,255,0.3) 0%, rgba(20,50,255,0.1) 100%)', border: '1px solid rgba(100,200,255,0.6)', borderRadius: '50px', color: '#ffffff', textShadow: '0 0 5px rgba(255,255,255,0.5)', boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,150,255,0.8), 0 0 15px rgba(0,150,255,0.6)', padding: '10px 24px', fontSize: '13px', fontWeight: '700', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }
                  : { background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'rgba(255,255,255,0.8)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)', padding: '10px 24px', fontSize: '13px', fontWeight: '600', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }}
              >
                🚫 Unscheduled Attendance
              </button>
              <button
                onClick={() => setActiveTab('squadModelling')}
                style={activeTab === 'squadModelling'
                  ? { background: 'linear-gradient(180deg, rgba(80,150,255,0.3) 0%, rgba(20,50,255,0.1) 100%)', border: '1px solid rgba(100,200,255,0.6)', borderRadius: '50px', color: '#ffffff', textShadow: '0 0 5px rgba(255,255,255,0.5)', boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,150,255,0.8), 0 0 15px rgba(0,150,255,0.6)', padding: '10px 24px', fontSize: '13px', fontWeight: '700', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }
                  : { background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', color: 'rgba(255,255,255,0.8)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)', padding: '10px 24px', fontSize: '13px', fontWeight: '600', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(12px)', cursor: 'pointer' }}
              >
                ⚖️ Squad Modelling
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
              <div className="flex flex-col gap-8">
                {/* 1. Su                 <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
                  <div
                    onClick={() => handleCardClick('all')}
                    className="glass-card flex flex-col justify-between hover-glow"
                    style={{
                      padding: '1.5rem',
                      borderTop: '4px solid var(--accent-cyan)',
                      cursor: 'pointer',
                      boxShadow: cardFilter === 'all' ? '0 0 15px rgba(0, 212, 255, 0.15)' : 'none',
                      borderColor: cardFilter === 'all' ? 'rgba(0, 212, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                      transform: cardFilter === 'all' ? 'scale(1.02)' : 'none',
                      transition: 'all 0.2s'
                    }}
                    title="Click to show all active sessions"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Active Sessions</span>
                      <h2 className="text-3xl font-black mt-2 text-cyan-400">{heatmapStats.totalSessions}</h2>
                    </div>
                    <p className="text-xs text-white/40 mt-4">Loaded under active filters</p>
                  </div>

                  <div
                    onClick={() => handleCardClick('over')}
                    className="glass-card flex flex-col justify-between hover-glow"
                    style={{
                      padding: '1.5rem',
                      borderTop: '4px solid var(--accent-rose)',
                      cursor: 'pointer',
                      boxShadow: cardFilter === 'over' ? '0 0 15px rgba(244, 63, 94, 0.25)' : 'none',
                      borderColor: cardFilter === 'over' ? 'rgba(244, 63, 94, 0.5)' : 'rgba(255, 255, 255, 0.08)',
                      transform: cardFilter === 'over' ? 'scale(1.02)' : 'none',
                      transition: 'all 0.2s'
                    }}
                    title="Click to filter by over-capacity sessions"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Over-Capacity Bottlenecks</span>
                      <h2 className="text-3xl font-black mt-2 text-rose-500">{heatmapStats.overCapacityCount}</h2>
                    </div>
                    <p className="text-xs text-rose-400/80 mt-4">⚠️ Require lane or roster reallocation</p>
                  </div>

                  <div
                    onClick={() => handleCardClick('under')}
                    className="glass-card flex flex-col justify-between hover-glow"
                    style={{
                      padding: '1.5rem',
                      borderTop: '4px solid #3b82f6',
                      cursor: 'pointer',
                      boxShadow: cardFilter === 'under' ? '0 0 15px rgba(59, 130, 246, 0.25)' : 'none',
                      borderColor: cardFilter === 'under' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255, 255, 255, 0.08)',
                      transform: cardFilter === 'under' ? 'scale(1.02)' : 'none',
                      transition: 'all 0.2s'
                    }}
                    title="Click to filter by under-utilized sessions"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Under-Utilized Opportunities</span>
                      <h2 className="text-3xl font-black mt-2 text-blue-400">{heatmapStats.underUtilizedCount}</h2>
                    </div>
                    <p className="text-xs text-blue-400/80 mt-4">⚡ Available for waitlist admissions</p>
                  </div>

                  <div
                    onClick={() => handleCardClick('all')}
                    className="glass-card flex flex-col justify-between hover-glow"
                    style={{
                      padding: '1.5rem',
                      borderTop: '4px solid var(--accent-emerald)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    title="Click to reset filters"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Average Club Occupancy</span>
                      <h2 className="text-3xl font-black mt-2 text-emerald-400">{heatmapStats.averageClubOccupancy}%</h2>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1.5 mt-4 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${heatmapStats.averageClubOccupancy}%`, backgroundColor: 'var(--accent-emerald)' }} />
                    </div>
                  </div>
                </div>

                {/* 2. Visual Week-at-a-Glance Heatmap Grid */}
                <div className="glass-card" style={{ padding: '2rem' }}>
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                    <div>
                      <h3 className="text-xl font-black uppercase text-white">Week-at-a-Glance Heatmap</h3>
                      <p className="text-xs text-white/50 mt-1">Click any session block to launch the week-by-week historical attendance graph.</p>
                    </div>
                    
                    <div className="flex items-center gap-4 flex-wrap">
                      {/* View Mode Toggle */}
                      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} className="no-print">
                        <button
                          onClick={() => setHeatmapViewMode('grid')}
                          style={{
                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                            background: heatmapViewMode === 'grid' ? 'var(--accent-cyan)' : 'transparent',
                            color: heatmapViewMode === 'grid' ? '#0f172a' : 'rgba(255,255,255,0.6)'
                          }}
                        >
                          📅 Grid View
                        </button>
                        <button
                          onClick={() => setHeatmapViewMode('chart')}
                          style={{
                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                            background: heatmapViewMode === 'chart' ? 'var(--accent-cyan)' : 'transparent',
                            color: heatmapViewMode === 'chart' ? '#0f172a' : 'rgba(255,255,255,0.6)'
                          }}
                        >
                          📊 Chart View
                        </button>
                      </div>

                      {/* Color Legend */}
                      <div className="flex items-center gap-3 text-[9px] font-bold text-white/50 uppercase tracking-wider no-print">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Over (100%+)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Near (85%+)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Opt (50%+)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500" /> Under (&lt;50%)</span>
                      </div>
                    </div>
                  </div>

                  {heatmapViewMode === 'grid' ? (
                    <div style={{ overflowX: 'auto', width: '100%', paddingBottom: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', minWidth: '980px' }}>
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                          const daySessions = heatmapStats.sessionsData.filter(s => s.day_of_week?.toLowerCase() === day.toLowerCase());
                          
                          const dayOccupancies = daySessions.map(s => s.actualDensity);
                          const dayAvg = dayOccupancies.length > 0 ? Math.round(dayOccupancies.reduce((a, b) => a + b, 0) / dayOccupancies.length) : 0;
                          
                          let dayBadgeBg = 'rgba(255,255,255,0.05)';
                          let dayBadgeColor = 'rgba(255,255,255,0.5)';
                          if (dayAvg > 100) { dayBadgeBg = 'rgba(244,63,94,0.15)'; dayBadgeColor = '#f43f5e'; }
                          else if (dayAvg >= 85) { dayBadgeBg = 'rgba(245,158,11,0.15)'; dayBadgeColor = '#f59e0b'; }
                          else if (dayAvg >= 50) { dayBadgeBg = 'rgba(16,185,129,0.15)'; dayBadgeColor = '#10b981'; }
                          else if (dayAvg > 0) { dayBadgeBg = 'rgba(6,182,212,0.15)'; dayBadgeColor = '#06b6d4'; }

                          return (
                            <div key={day} className="flex flex-col gap-3 bg-black/10 p-3 rounded-xl border border-white/5" style={{ minWidth: '0' }}>
                              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-xs font-black uppercase text-white/70">{day.substring(0, 3)}</span>
                                {daySessions.length > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: dayBadgeBg, color: dayBadgeColor }} title={`Average actual density for ${day}: ${dayAvg}%`}>
                                    {dayAvg}%
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-col gap-2.5">
                                {daySessions.length === 0 ? (
                                  <div className="text-[10px] text-white/20 text-center py-6">No Sessions</div>
                                ) : (
                                  daySessions.map(sess => {
                                    let compactName = sess.name;
                                    if (compactName.toLowerCase().includes('development')) compactName = compactName.replace(/development/gi, 'Dev');
                                    if (compactName.toLowerCase().includes('evening')) compactName = compactName.replace(/evening/gi, 'PM');
                                    if (compactName.toLowerCase().includes('morning')) compactName = compactName.replace(/morning/gi, 'AM');
                                    if (compactName.toLowerCase().includes(sess.day_of_week.toLowerCase())) {
                                      const rx = new RegExp(sess.day_of_week, 'gi');
                                      compactName = compactName.replace(rx, '').replace(/\s+/g, ' ').trim();
                                    }

                                    return (
                                      <div
                                        key={sess.id}
                                        onClick={() => setGraphSession({ sess, sessionAtt: sess.sessionAtt, maxCapacity: sess.maxCapacity })}
                                        className="group relative cursor-pointer rounded-lg p-2.5 transition-all duration-200 border text-left flex flex-col justify-between"
                                        style={{
                                          background: 'rgba(255,255,255,0.02)',
                                          borderColor: sess.statusBorder,
                                          borderLeftWidth: '4px',
                                        }}
                                        title={`Click to view graph\n${sess.name}\n${sess.start_time} - ${sess.end_time}\nRoster: ${sess.activeSwimmers}/${sess.maxCapacity} (${sess.rosterDensity}%)\nActual: ${sess.avgAtt}/${sess.maxCapacity} (${sess.actualDensity}%)`}
                                      >
                                        <div className="flex justify-between items-start gap-1">
                                          <span className="text-[10px] font-black text-white/90 leading-tight truncate" style={{ maxWidth: '85px' }}>{compactName}</span>
                                          <span className="text-[9px] font-bold shrink-0" style={{ color: sess.statusColor }}>{sess.actualDensity}%</span>
                                        </div>
                                        <div className="flex justify-between items-center mt-2 text-[9px] text-white/40 font-semibold">
                                          <span>{sess.start_time}</span>
                                          <span>{sess.lanes_allocated || 6} L</span>
                                        </div>
                                        
                                        <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ boxShadow: `0 0 10px ${sess.shadowGlow}` }} />
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ height: '380px', width: '100%', marginTop: '1rem' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={weeklyChartData}
                          margin={{ top: 20, right: 10, left: -10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.02)' }} contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: '12px', color: '#fff', fontSize: '0.8rem' }} />
                          <Legend wrapperStyle={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.8 }} formatter={(value) => <span style={{ color: '#e2e8f0', marginRight: '10px' }}>{value}</span>} />
                          <Bar dataKey="Physical Capacity" fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth={1.5} radius={[4, 4, 0, 0]} name="Swimmers Capacity (Pool Limits)" />
                          <Bar dataKey="Enrolled Roster" fill="rgba(99, 102, 241, 0.5)" stroke="rgba(99, 102, 241, 0.8)" radius={[4, 4, 0, 0]} name="Scheduled Swimmers (Roster)" />
                          <Bar dataKey="Actual Attendance" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} name="Actual Attendance (Average)" />
                          <Line type="monotone" dataKey="Peak Attendance" stroke="#fb7185" strokeWidth={3} dot={{ fill: '#fb7185', r: 4 }} activeDot={{ r: 6 }} name="Peak Attendance (Combined Max)" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* 3. Detailed Session Breakdowns */}
                <div id="detailed-sessions-breakdown">
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <h3 className="text-xl font-black uppercase text-white">Detailed Session Breakdowns</h3>
                      <p className="text-xs text-white/50 mt-1">Review active rosters, average utilization, and adjust pool lane allocations.</p>
                    </div>
                  </div>

                  {cardFilter !== 'all' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <span className="text-xs font-bold text-white/70">
                        Showing: <span style={{ color: cardFilter === 'over' ? 'var(--accent-rose)' : '#3b82f6', fontWeight: 900, textTransform: 'uppercase' }}>{cardFilter === 'over' ? 'Over-Capacity Bottlenecks' : 'Under-Utilized Opportunities'}</span>
                      </span>
                      <button
                        onClick={() => setCardFilter('all')}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.7rem', fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      >
                        Reset Filter [x]
                      </button>
                    </div>
                  )}

                  <div className="grid gap-6">
                    {filteredDetailedSessions.length === 0 ? (
                      <div className="glass-card text-center py-16 animate-fade-in" style={{ border: '1px dashed rgba(255,255,255,0.15)', padding: '2.5rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎉</div>
                        <h4 className="text-lg font-black uppercase text-white mb-2">No bottlenecked/under-utilized sessions detected</h4>
                        <p className="text-xs text-white/50 max-w-md mx-auto mb-6">All active sessions are currently operating within optimal occupancy parameters under this squad filter.</p>
                        <button
                          onClick={() => setCardFilter('all')}
                          style={{
                            background: 'var(--accent-cyan)', color: '#000', border: 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 900, cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase'
                          }}
                        >
                          Show All Sessions
                        </button>
                      </div>
                    ) : (
                      filteredDetailedSessions.map(sess => {
                      const lanes = sess.lanes_allocated || 6;
                      const maxCapacity = sess.maxCapacity;
                      const activeSwimmers = sess.activeSwimmers;
                      const rosterDensity = sess.rosterDensity;
                      const avgAtt = sess.avgAtt;
                      const peakAtt = sess.peakAtt;
                      const actualDensity = sess.actualDensity;
                      const statusColor = sess.statusColor;
                      const statusText = sess.statusText;
                      const sessionAtt = sess.sessionAtt;

                      return (
                        <div key={sess.id} className="glass-card flex items-center justify-between" style={{ borderLeft: `4px solid ${statusColor}`, padding: '1.5rem 2rem' }}>
                          <div style={{ flex: 1 }}>
                            <div className="text-xs font-bold uppercase tracking-widest text-white/50 mb-1">{sess.day_of_week} • {sess.start_time} - {sess.end_time}</div>
                            <h3 className="text-xl font-black uppercase text-white">{sess.name}</h3>
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
                    })
                    )}
                  </div>
                </div>
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
                    const maxCap = (sess.lanes_allocated || 6) * getSwimmersPerLaneForSession(sess.name);
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
                                const spaces = ((s.lanes_allocated || 6) * getSwimmersPerLaneForSession(s.name)) - active;
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
                    Add swimmers to a squad to see exactly which existing sessions they would be routed into to hit their minimum hours. The engine packs simulated swimmers into open lane spaces (up to the squad's configured lane capacity, default 8) without requiring new pool time, showing the precise impact on your session density.
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
                      const physicalCap = (sess.lanes_allocated || 6) * getSwimmersPerLaneForSession(sess.name);

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

                          {squadsList.filter(squadName => globalSquadFilter === 'All' || globalSquadFilter.split(',').includes(squadName)).map(squadName => {
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
                                        {Object.entries(simAdjustments).filter(([sq, val]) => val > 0 && (globalSquadFilter === 'All' || globalSquadFilter.split(',').includes(sq))).map(([squadName, added], idx) => {
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
                                {simulatedPlacements.filter(sim => globalSquadFilter === 'All' || globalSquadFilter.split(',').includes(sim.squad)).map((sim, i) => (
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
                  <div className="flex items-center gap-4 no-print" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>Filter Squads</label>
                      <select
                        value={globalSquadFilter}
                        onChange={(e) => setGlobalSquadFilter(e.target.value)}
                        className="border border-white/10 rounded-lg px-4 py-2 text-white font-bold outline-none focus:border-cyan-400"
                        style={{ background: '#0f172a', color: '#fff', fontSize: '0.75rem', height: '38px', minWidth: '150px' }}
                      >
                        <option value="All">All Squads</option>
                        {squadsList.map(sq => (
                          <option key={sq} value={sq} style={{ background: '#0f172a', color: '#fff' }}>{sq}</option>
                        ))}
                      </select>
                    </div>

                    {ghostAllocations.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', visibility: 'hidden' }}>Export</label>
                        <button
                          onClick={handlePrintReport}
                          disabled={isExporting}
                          className="btn-premium-action mini no-print"
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, opacity: isExporting ? 0.7 : 1, height: '38px' }}
                        >
                          {isExporting ? (
                            <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span> GENERATING PDF...</>
                          ) : (
                            <><span>📄</span> Export PDF Report</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {waitlistYields.length > 0 && printConfig.includeYield && (
                  <div className="yield-matrix mb-8" style={{ background: 'rgba(16,185,129,0.02)', border: '1px solid rgba(16,185,129,0.1)', padding: '24px', borderRadius: '16px' }}>
                    <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                      <div>
                        <div className="kpi-label-mini text-emerald-400" style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#34d399', marginBottom: '0.25rem' }}>
                          💡 Waitlist Admission Yield
                        </div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }} className="no-print">
                          Estimated number of waitlisted swimmers that can be admitted by reclaiming these ghost allocations.
                        </div>
                      </div>
                      <button
                        onClick={simulateYieldInModeler}
                        className="btn-premium-intel no-print"
                        style={{ fontSize: '0.7rem', padding: '6px 12px', background: 'linear-gradient(180deg, rgba(52,211,153,0.2) 0%, rgba(16,185,129,0.05) 100%)', borderColor: 'rgba(52,211,153,0.4)', color: '#34d399' }}
                      >
                        ⚡ Simulate in Modeler
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {waitlistYields.map(y => (
                        <div key={y.squadName} style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.05) 100%)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '2rem', fontWeight: '900', color: '#34d399', lineHeight: '1' }}>+{y.yield}</div>
                          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, marginTop: '4px', color: '#fff' }}>{y.squadName} Swimmers</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {printConfig.includeTable && (
                  ghostAllocations.length === 0 ? (
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
                  )
                )}
              </div>
            ) : activeTab === 'squadModelling' ? (
              <div className="glass-card print-no-card animate-fade-in" style={{ padding: '2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1.5rem' }} className="no-print">
                  <div>
                    <div className="section-title">Squad Optimisation</div>
                    <h3 className="text-3xl font-black uppercase mb-2">Squad Modelling Tool</h3>
                    <p className="text-white/50 text-sm max-w-2xl" style={{ margin: 0 }}>
                      Intelligently reallocate swimmers from oversubscribed sessions to under-utilized sessions. 
                      Prioritises swimmers with higher attendance records and ensures squad requirements (such as weekend session targets) are satisfied.
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-4 no-print" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>Select Squad to Model</label>
                      <select
                        value={modellingSquadId}
                        onChange={(e) => setModellingSquadId(e.target.value)}
                        className="border border-white/10 rounded-lg px-4 py-2 text-white font-bold outline-none focus:border-cyan-400"
                        style={{ background: '#0f172a', color: '#fff', fontSize: '0.75rem', height: '38px', minWidth: '150px' }}
                      >
                        {dbSquads.filter(s => s.is_squad).map(sq => (
                          <option key={sq.id} value={sq.id} style={{ background: '#0f172a', color: '#fff' }}>{sq.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                 {targetModellingSquad && (
                  <div className="mb-6 bg-cyan-950/15 border border-cyan-500/20 p-4 rounded-xl text-sm no-print">
                    {/* Top: Squad Configurations */}
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '16px', borderBottom: '1px solid rgba(6,182,212,0.15)', paddingBottom: '12px' }}>
                      <div>
                        <span className="text-white/40 uppercase font-bold text-[10px] block tracking-wider">Target Sessions</span>
                        <strong className="text-cyan-400">{targetModellingSquad.target_sessions_per_week || 4} sessions/week</strong>
                      </div>
                      <div>
                        <span className="text-white/40 uppercase font-bold text-[10px] block tracking-wider">Swimmers per Lane</span>
                        <strong className="text-cyan-400">{targetModellingSquad.swimmers_per_lane || 8} swimmers</strong>
                      </div>
                      <div>
                        <span className="text-white/40 uppercase font-bold text-[10px] block tracking-wider">Weekend Required</span>
                        <strong className="text-cyan-400">{targetModellingSquad.require_weekend ? 'Yes (Sat/Sun)' : 'No'}</strong>
                      </div>
                      <div>
                        <span className="text-white/40 uppercase font-bold text-[10px] block tracking-wider">Ghost Allocations</span>
                        <strong className="text-rose-400">{squadGhostCount} sessions</strong>
                      </div>
                    </div>

                    {/* Bottom: Squad Swimmer Places Comparison */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                      {/* Left Side: Current Roster capacity */}
                      <div style={{ borderRight: '1px solid rgba(6,182,212,0.15)', paddingRight: '12px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                          Current Roster Capacity
                        </div>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          <div>
                            <span className="text-white/40 text-[9px] uppercase font-bold block">Enrolled</span>
                            <strong style={{ fontSize: '1.1rem', color: '#fff' }}>{swimmersWithAttendance.length}</strong>
                          </div>
                          <div>
                            <span className="text-white/40 text-[9px] uppercase font-bold block">Free Places</span>
                            <strong style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.9)' }}>{currentAvailablePlaces}</strong>
                          </div>
                          <div>
                            <span className="text-white/40 text-[9px] uppercase font-bold block">Total Places</span>
                            <strong style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)' }}>{currentSwimmerCapacity}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Proposed Roster capacity */}
                      <div style={{ paddingLeft: '12px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                          Proposed Roster Capacity {proposedAllocations && '⚡'}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          <div>
                            <span className="text-white/40 text-[9px] uppercase font-bold block">Enrolled</span>
                            <strong style={{ fontSize: '1.1rem', color: '#fff' }}>
                              {swimmersWithAttendance.length + newSwimmers.length}
                            </strong>
                          </div>
                          <div>
                            <span className="text-white/40 text-[9px] uppercase font-bold block">Free Places</span>
                            <strong style={{ fontSize: '1.1rem', color: proposedAllocations && proposedAvailablePlaces > currentAvailablePlaces ? 'var(--accent-emerald)' : 'rgba(255,255,255,0.9)' }}>
                              {proposedAllocations ? proposedAvailablePlaces : currentAvailablePlaces}
                            </strong>
                          </div>
                          <div>
                            <span className="text-white/40 text-[9px] uppercase font-bold block">Total Places</span>
                            <strong style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)' }}>
                              {proposedSwimmerCapacity}
                            </strong>
                          </div>
                          {proposedAllocations && swimmersBroughtToCriteriaCount > 0 && (
                            <div>
                              <span className="text-white/40 text-[9px] uppercase font-bold block">Under-Allocated → Now Meet Criteria</span>
                              <strong style={{ fontSize: '1.1rem', color: 'var(--accent-emerald)', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title={`${swimmersBroughtToCriteriaCount} swimmers were previously rostered below the squad's target sessions/hours. After rebalancing they now meet the full squad criteria.`}>
                                ✨ {swimmersBroughtToCriteriaCount} swimmer{swimmersBroughtToCriteriaCount !== 1 ? 's' : ''}
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Simulated Swimmers Section */}
                {targetModellingSquad && (
                  <div className="glass-card mb-8 no-print" style={{ padding: '1.5rem', background: 'rgba(15,23,42,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-white/70 mb-4">➕ Add Swimmers to Model</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
                      <form onSubmit={handleAddNewSwimmers} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>Number of Swimmers to Add</label>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={newSwimmersCount}
                            onChange={(e) => setNewSwimmersCount(parseInt(e.target.value, 10) || 1)}
                            className="border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-cyan-400"
                            style={{ background: '#0f172a', color: '#fff', fontSize: '0.8rem', height: '38px', width: '150px' }}
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn-premium-action mini"
                          style={{ height: '38px', padding: '0 16px', fontSize: '0.75rem', fontWeight: 800, background: 'var(--accent-cyan)', color: '#0f172a' }}
                        >
                          Add Swimmer(s)
                        </button>
                      </form>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', marginTop: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px' }}>
                          <input
                            type="checkbox"
                            id="newSwimmersPriority"
                            checked={newSwimmersPriority}
                            onChange={(e) => setNewSwimmersPriority(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
                          />
                          <label htmlFor="newSwimmersPriority" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>
                            ⚡ Give New Swimmers Priority over Low-Attendance Swimmers
                          </label>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px' }}>
                          <input
                            type="checkbox"
                            id="forceWeekendSession"
                            checked={forceWeekendSession}
                            onChange={(e) => setForceWeekendSession(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
                          />
                          <label htmlFor="forceWeekendSession" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>
                            📅 Force Weekend Session Allocation
                          </label>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px' }}>
                          <label htmlFor="goodAttendanceThreshold" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
                            🎯 Good Attendance Threshold:
                          </label>
                          <input
                            type="number"
                            id="goodAttendanceThreshold"
                            min="0"
                            max="100"
                            value={goodAttendanceThreshold}
                            onChange={(e) => setGoodAttendanceThreshold(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                            style={{
                              width: '55px',
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              textAlign: 'center',
                              outline: 'none'
                            }}
                          />
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>%</span>
                        </div>
                      </div>
                    </div>

                    {newSwimmers.length > 0 && (
                      <div style={{ marginTop: '1.5rem' }}>
                        <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', marginBottom: '8px' }}>Currently Simulated:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {newSwimmers.map(ns => (
                            <span key={ns.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--accent-cyan)', padding: '4px 10px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 700 }}>
                              {ns.full_name}
                              <button
                                type="button"
                                onClick={() => handleRemoveNewSwimmer(ns.id)}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* CoachesEye Guide: Attendance vs. Weekly Compliance */}
                {targetModellingSquad && (
                  <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 mb-8">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>📘 CoachesEye — Attendance Metrics Guide</div>
                        <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '0.5rem' }}>
                          <span style={{ opacity: 1, fontWeight: 600, color: 'var(--text-primary)' }}>Modelling Attendance %</span>: A granular, session-by-session show-up rate calculated strictly for the selected time horizon. It divides actual present counts by scheduled counts, and is made **fair** by:
                        </p>
                        <ul style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.5, listStyleType: 'disc', paddingLeft: '1.25rem', marginBottom: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                          <li>Crediting sessions coinciding with competition galas or club-wide shutdowns.</li>
                          <li>Excluding sessions entirely during weeks marked as floating holidays or shutdowns.</li>
                          <li>Bypassing squad target caps (minimum hours/sessions) for swimmers with attendance at or above the **Good Attendance Threshold**, allowing reliable attenders to retain their current higher hours instead of being cut to the minimum.</li>
                        </ul>
                        <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, margin: 0 }}>
                          ⚠️ <span style={{ fontWeight: 700, color: 'var(--accent-amber)' }}>Note the distinction</span>: This session-by-session attendance percentage differs from the squad-level **Compliance Rate** displayed on the Swimmer Profile and Squad tabs. The Compliance Rate measures the percentage of weeks in which the athlete met the weekly hours/sessions criteria, which collapses to blocky increments (100%, 50%, 0%) over short periods. The session rate here provides the true granularity needed for capacity modeling.
                        </p>
                      </div>
                      
                      <div style={{ borderLeft: '1px solid rgba(99,102,241,0.15)', paddingLeft: '24px' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>⚖️ CoachesEye — Squad Rebalancing Rules</div>
                        <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '0.5rem' }}>
                          The auto-rebalance algorithm processes allocations sequentially using the following rules:
                        </p>
                        <ul style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.6, listStyleType: 'decimal', paddingLeft: '1.25rem', color: 'rgba(255,255,255,0.7)' }}>
                          <li style={{ marginBottom: '4px' }}><strong style={{ color: '#fff' }}>Priority Queueing</strong>: Swimmers are processed by attendance (highest first). Simulated swimmers are prioritized first if the priority toggle is enabled.</li>
                          <li style={{ marginBottom: '4px' }}><strong style={{ color: '#fff' }}>Weekend Session First</strong>: If forced by settings or default squad config, a weekend session is allocated before weekday slots.</li>
                          <li style={{ marginBottom: '4px' }}><strong style={{ color: '#fff' }}>Roster Preservation</strong>: Swimmers retain existing session assignments if the session is under capacity (<span style={{ color: 'var(--accent-cyan)' }}>Cold</span>).</li>
                          <li style={{ marginBottom: '4px' }}><strong style={{ color: '#fff' }}>Capacity Reallocation</strong>: Swimmers are reallocated from oversubscribed (<span style={{ color: 'var(--accent-rose)' }}>Hot</span>) sessions to the least occupied <span style={{ color: 'var(--accent-cyan)' }}>Cold</span> sessions to distribute load.</li>
                          <li style={{ marginBottom: '4px' }}><strong style={{ color: '#fff' }}>Ghost Session Removal</strong>: Ghost sessions (0% attendance) are removed. Swimmers already at/above squad targets have ghost sessions removed without replacement; those below are allocated alternative cold sessions.</li>
                          <li style={{ marginBottom: '4px' }}><strong style={{ color: '#fff' }}>Good Attender Protection</strong>: Swimmers meeting or exceeding the Good Attendance Threshold bypass caps to keep extra active sessions; others are capped at targets to reclaim lane space.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Top Section: Recharts Bar Chart */}
                {squadModellingSessions.length > 0 && (
                  <div className="glass-card mb-8" style={{ padding: '1.5rem', background: 'rgba(15,23,42,0.3)' }}>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-white/70 mb-4">Session Popularity & Capacity Limits</h4>
                    <div style={{ height: '320px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={squadModellingSessions.map(s => {
                            const proposedCount = proposedOccupancies[s.id] !== undefined ? proposedOccupancies[s.id] : s.currentCount;
                            const compactName = s.name.replace('AGE DEVELOPMENT ', '').replace('GOLD DEVELOPMENT ', '').replace('TECHNICAL DEVELOPMENT ', '').replace(' pm', ' PM').replace(' am', ' AM').replace(' MORNING', ' AM');
                            const peakCount = Math.max(sessionPeakAttendance[s.id] || 0, sessionPeakAttendance[s.scm_guid] || 0);

                            // Calculate predicted turnout
                            const currentMembersInSession = memberships.filter(m => m.session_id === s.id || m.session_id === s.scm_guid);
                            const currentPredictedAttendance = currentMembersInSession.reduce((sum, m) => {
                              const sw = swimmersWithAttendance.find(swimmer => swimmer.id === m.swimmer_id);
                              return sum + (sw ? (sw.attendancePct / 100) : 0);
                            }, 0);

                            const proposedPredictedAttendance = proposedAllocations ? proposedAllocations.reduce((sum, p) => {
                              const isAssigned = p.newSessions.some(sess => sess.id === s.id);
                              return sum + (isAssigned ? (p.attendancePct / 100) : 0);
                            }, 0) : currentPredictedAttendance;

                            return {
                              name: `${compactName} (${s.lanes_allocated || 6}L)`,
                              'Current Capacity': s.currentCount,
                              'Proposed Capacity': proposedCount,
                              'Dynamic Limit': s.cap,
                              'Peak Attendance': peakCount,
                              'Expected Attendance': Math.round(proposedPredictedAttendance * 10) / 10
                            };
                          })}
                          margin={{ top: 20, right: 10, left: -20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: '12px', color: '#fff', fontSize: '0.8rem' }} />
                          <Legend wrapperStyle={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.8 }} />
                          <Bar dataKey="Current Capacity" fill="#6366f1" radius={[4, 4, 0, 0]} name="Current Enrolled" isAnimationActive={!isExporting} />
                          <Bar dataKey="Proposed Capacity" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Proposed (Rebalanced)" isAnimationActive={!isExporting} />
                          <Line type="monotone" dataKey="Dynamic Limit" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} activeDot={{ r: 5 }} name="Dynamic Roster Cap" isAnimationActive={!isExporting} />
                          <Line type="monotone" dataKey="Peak Attendance" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" dot={{ fill: '#f59e0b', r: 3 }} activeDot={{ r: 5 }} name="Peak Attendance (Actual)" isAnimationActive={!isExporting} />
                          <Line type="monotone" dataKey="Expected Attendance" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }} name="Expected Turnout (Predicted)" isAnimationActive={!isExporting} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Squad capacity stats under the chart */}
                    <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                        <span style={{ marginRight: '24px' }}>
                          Current Squad Size Capacity: <strong style={{ color: 'var(--accent-cyan)' }}>{currentSwimmerCapacity} places</strong>
                        </span>
                        <span style={{ marginRight: '24px' }}>
                          Proposed Squad Size Capacity: <strong style={{ color: 'var(--accent-emerald)' }}>{proposedSwimmerCapacity} places</strong>
                        </span>
                        {proposedAllocations && swimmersBroughtToCriteriaCount > 0 && (
                          <span title={`${swimmersBroughtToCriteriaCount} swimmer${swimmersBroughtToCriteriaCount !== 1 ? 's were' : ' was'} previously rostered below the squad's minimum target hours/sessions and now meet${swimmersBroughtToCriteriaCount === 1 ? 's' : ''} full criteria after rebalancing.`}>
                            ✨ Previously under-allocated, now meeting squad criteria: <strong style={{ color: 'var(--accent-emerald)' }}>{swimmersBroughtToCriteriaCount} swimmer{swimmersBroughtToCriteriaCount !== 1 ? 's' : ''}
                            </strong>
                          </span>
                        )}
                      </div>
                      {proposedSwimmerCapacity > currentSwimmerCapacity ? (
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-emerald)', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '6px', padding: '4px 10px' }}>
                          📈 Capacity Increase: +{Math.round(((proposedSwimmerCapacity - currentSwimmerCapacity) / currentSwimmerCapacity) * 100)}% swimmer places unlocked
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
                          ⚖️ Capacity Stable: 0% change in swimmer places
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Session Lanes and Capacity Table */}
                {squadModellingSessions.length > 0 && (
                  <div className="glass-card mb-8" style={{ padding: '1.5rem', background: 'rgba(15,23,42,0.3)' }}>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-white/70 mb-4">Session Lanes & Capacity Details</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="stats-table-glass w-full" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Session Name</th>
                            <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Day</th>
                            <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Time</th>
                            <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Lanes Assigned</th>
                            <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Swimmers / Lane</th>
                            <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Total Roster Cap</th>
                            <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Current Roster</th>
                            <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Proposed Roster</th>
                            <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {squadModellingSessions.map(s => {
                            const proposedCount = proposedOccupancies[s.id] !== undefined ? proposedOccupancies[s.id] : s.currentCount;
                            const compactName = s.name.replace('AGE DEVELOPMENT ', '').replace('GOLD DEVELOPMENT ', '').replace('TECHNICAL DEVELOPMENT ', '').replace(' pm', '').replace(' am', '').replace(' MORNING', '');
                            const swimmersPerLane = targetModellingSquad.swimmers_per_lane || 8;
                            const lanes = s.lanes_allocated || 6;
                            
                            // Calculate predicted turnouts
                            const currentMembersInSession = memberships.filter(m => m.session_id === s.id || m.session_id === s.scm_guid);
                            const currentPredictedAttendance = currentMembersInSession.reduce((sum, m) => {
                              const sw = swimmersWithAttendance.find(swimmer => swimmer.id === m.swimmer_id);
                              return sum + (sw ? (sw.attendancePct / 100) : 0);
                            }, 0);
                            const roundedCurrentPredicted = Math.round(currentPredictedAttendance * 10) / 10;

                            const proposedPredictedAttendance = proposedAllocations ? proposedAllocations.reduce((sum, p) => {
                              const isAssigned = p.newSessions.some(sess => sess.id === s.id);
                              return sum + (isAssigned ? (p.attendancePct / 100) : 0);
                            }, 0) : currentPredictedAttendance;
                            const roundedProposedPredicted = Math.round(proposedPredictedAttendance * 10) / 10;

                            return (
                              <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff', fontSize: '0.8rem' }}>{compactName}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>{s.day_of_week}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>{s.start_time} - {s.end_time}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '0.8rem' }}>{lanes} Lanes</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{swimmersPerLane}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontSize: '0.8rem' }}>{s.cap} swimmers</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', color: '#fff' }}>
                                  <span style={{ fontWeight: 700 }}>{s.currentCount}</span>
                                  <span style={{ fontSize: '0.7rem', display: 'block', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                                    Exp: {roundedCurrentPredicted}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem' }}>
                                  <span style={{ fontWeight: 700, color: proposedCount >= s.cap ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>{proposedCount}</span>
                                  <span style={{ fontSize: '0.7rem', display: 'block', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                                    Exp: {roundedProposedPredicted}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                  <span style={{
                                    background: s.category === 'Hot' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                    border: s.category === 'Hot' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)',
                                    color: s.category === 'Hot' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                                    borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase'
                                  }}>
                                    {s.category}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Middle Section: Action buttons */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '2rem 0' }} className="no-print">
                  <button
                    onClick={handleAutoAllocate}
                    className="btn-premium-action"
                    style={{
                      padding: '12px 36px',
                      fontSize: '0.9rem',
                      fontWeight: '900',
                      borderRadius: '50px',
                      background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-teal))',
                      color: '#0f172a',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 0 20px rgba(6,182,212,0.35)',
                      transition: 'all 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1.0)'}
                  >
                    🔄 Auto-Rebalance Squad
                  </button>

                  <button
                    onClick={handleResetModel}
                    className="btn-premium-action"
                    style={{
                      padding: '12px 36px',
                      fontSize: '0.9rem',
                      fontWeight: '900',
                      borderRadius: '50px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.transform = 'scale(1.03)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.transform = 'scale(1.0)';
                    }}
                  >
                    ❌ Reset Modeler
                  </button>

                  {targetModellingSquad && (
                    <button
                      onClick={handleExportModellingPDF}
                      disabled={isExporting}
                      className="btn-premium-action"
                      style={{
                        padding: '12px 36px',
                        fontSize: '0.9rem',
                        fontWeight: '900',
                        borderRadius: '50px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#fff',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        opacity: isExporting ? 0.7 : 1
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.transform = 'scale(1.03)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.transform = 'scale(1.0)';
                      }}
                    >
                      {isExporting ? (
                        <>
                          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                          Generating PDF...
                        </>
                      ) : (
                        <>
                          <span>📥</span>
                          Export PDF
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Bottom Section: Swimmer Comparison Table */}
                {combinedSwimmersList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)' }}>
                    No swimmers found in the selected squad.
                  </div>
                ) : (
                  <table className="stats-table-glass w-full" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', width: '220px' }}>Swimmer</th>
                        <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', width: '110px' }}>
                          Attendance
                          <span 
                            title="Granular session-by-session attendance rate. See the CoachesEye Guide below for comparison with Weekly Compliance." 
                            style={{ marginLeft: '4px', cursor: 'help', color: 'var(--accent-cyan)', fontSize: '0.7rem' }}
                          >
                            ⓘ
                          </span>
                        </th>
                        <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', width: '140px' }}>Allocated Hours</th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Current Sessions</th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Proposed Rebalanced Sessions</th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', width: '250px' }}>Justification</th>
                      </tr>
                    </thead>
                    <tbody>
                       {combinedSwimmersList.map((sw, idx) => {
                        const proposed = proposedAllocations ? proposedAllocations.find(p => p.swimmerId === sw.id) : null;
                        
                        const swMemberships = sw.isNew ? [] : memberships.filter(m => m.swimmer_id === sw.id);
                        const currentSessions = sw.isNew ? [] : squadModellingSessions.filter(s => 
                          swMemberships.some(m => m.session_id === s.id || m.session_id === s.scm_guid)
                        );
                        const currentHours = currentSessions.reduce((total, s) => total + getSessionDuration(s), 0);
                        const proposedHours = proposed ? proposed.newSessions.reduce((total, s) => total + getSessionDuration(s), 0) : 0;

                        return (
                          <tr key={sw.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '14px 16px', fontWeight: 700, color: '#fff', fontSize: '0.85rem' }}>
                              {sw.full_name}
                              {sw.isNew && (
                                <span style={{
                                  marginLeft: '8px',
                                  background: 'rgba(16,185,129,0.15)',
                                  color: '#34d399',
                                  fontSize: '0.65rem',
                                  fontWeight: 900,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase'
                                }}>
                                  New
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              <span style={{
                                background: sw.attendancePct >= 75 ? 'rgba(16,185,129,0.15)' : sw.attendancePct >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                color: sw.attendancePct >= 75 ? 'var(--accent-emerald)' : sw.attendancePct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)',
                                border: sw.attendancePct >= 75 ? '1px solid rgba(16,185,129,0.3)' : sw.attendancePct >= 50 ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(239,68,68,0.3)',
                                borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 800
                              }}>
                                {sw.attendancePct}%
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '0.8rem', color: '#fff' }}>
                              <span style={{ opacity: 0.6 }}>{currentHours}h</span>
                              {proposed && (
                                <>
                                  <span style={{ margin: '0 6px', color: 'rgba(255,255,255,0.3)' }}>➔</span>
                                  <span style={{ fontWeight: 700, color: proposedHours >= (targetModellingSquad.target_hours_per_week || 0) ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>{proposedHours}h</span>
                                </>
                              )}
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              {(() => {
                                if (currentSessions.length === 0) return <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>None</span>;
                                return (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {currentSessions.map(s => {
                                      const isWeekend = s.day_of_week === 'Saturday' || s.day_of_week === 'Sunday';
                                      const presentCount = attendance.filter(a =>
                                        a.swimmer_id === sw.id && (a.session_id === s.id || a.session_id === s.scm_guid)
                                      ).length;
                                      const isGhost = presentCount === 0;

                                      const compactName = s.name.replace('AGE DEVELOPMENT ', '').replace('GOLD DEVELOPMENT ', '').replace('TECHNICAL DEVELOPMENT ', '').replace(' pm', '').replace(' am', '').replace(' MORNING', '').replace(' Thursday pm', ' Thu').replace(' Wednesday', ' Wed').replace(' Tuesday', ' Tue').replace(' Friday pm', ' Fri').replace(' Sunday', ' Sun').replace(' Saturday', ' Sat');
                                      return (
                                        <span key={s.id} style={isGhost ? {
                                          background: 'rgba(239,68,68,0.08)',
                                          border: '1px solid rgba(239,68,68,0.35)',
                                          color: 'var(--accent-rose)',
                                          borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap'
                                        } : {
                                          background: isWeekend ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.04)',
                                          border: isWeekend ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(255,255,255,0.1)',
                                          color: isWeekend ? '#f59e0b' : 'rgba(255,255,255,0.7)',
                                          borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap'
                                        }} title={isGhost ? `Ghost Session: 0 recorded swims in the last ${periodDays} days` : `${s.name} (${s.day_of_week} ${s.start_time})`}>
                                          {isGhost ? '👻 ' : ''}{s.day_of_week.substring(0,3)}: {compactName}
                                        </span>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              {proposed ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {proposed.newSessions.map(s => {
                                    const isWeekend = s.day_of_week === 'Saturday' || s.day_of_week === 'Sunday';
                                    const wasOriginal = currentSessions.some(orig => orig.id === s.id);
                                    const presentCount = attendance.filter(a =>
                                      a.swimmer_id === sw.id && (a.session_id === s.id || a.session_id === s.scm_guid)
                                    ).length;
                                    const isGhost = wasOriginal && presentCount === 0;

                                    const compactName = s.name.replace('AGE DEVELOPMENT ', '').replace('GOLD DEVELOPMENT ', '').replace('TECHNICAL DEVELOPMENT ', '').replace(' pm', '').replace(' am', '').replace(' MORNING', '').replace(' Thursday pm', ' Thu').replace(' Wednesday', ' Wed').replace(' Tuesday', ' Tue').replace(' Friday pm', ' Fri').replace(' Sunday', ' Sun').replace(' Saturday', ' Sat');
                                    return (
                                      <span key={s.id} style={isGhost ? {
                                        background: 'rgba(239,68,68,0.08)',
                                        border: '1px solid rgba(239,68,68,0.35)',
                                        color: 'var(--accent-rose)',
                                        borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap'
                                      } : {
                                        background: wasOriginal ? (isWeekend ? 'rgba(245,158,11,0.1)' : 'rgba(6,182,212,0.1)') : 'rgba(16,185,129,0.15)',
                                        border: wasOriginal ? (isWeekend ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(6,182,212,0.3)') : '1px solid rgba(16,185,129,0.5)',
                                        color: wasOriginal ? (isWeekend ? 'var(--accent-amber)' : 'var(--accent-cyan)') : '#34d399',
                                        borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap'
                                      }} title={isGhost ? `Ghost Session Retained: 0 recorded swims in the last ${periodDays} days` : `${s.name} (${s.day_of_week} ${s.start_time})${!wasOriginal ? ' [REALLOCATED]' : ''}`}>
                                        {isGhost ? '👻 ' : ''}{s.day_of_week.substring(0,3)}: {compactName} {!wasOriginal && '✨'}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', fontStyle: 'italic' }}>Click Auto-Rebalance to optimize...</span>
                              )}
                            </td>
                            <td style={{ padding: '14px 16px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>
                              {proposed ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {proposed.reasons.map((reason, rIdx) => {
                                    let color = 'rgba(255,255,255,0.7)';
                                    if (reason.toLowerCase().includes('removed ghost')) {
                                      color = 'var(--accent-rose)';
                                    } else if (reason.toLowerCase().includes('reallocated') || reason.toLowerCase().includes('trimmed')) {
                                      color = 'var(--accent-amber)';
                                    } else if (reason.toLowerCase().includes('added') || reason.toLowerCase().includes('simulated')) {
                                      color = 'var(--accent-emerald)';
                                    }
                                    return (
                                      <div key={rIdx} style={{ color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>•</span>
                                        <span>{reason}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', fontStyle: 'italic' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : activeTab === 'unscheduled' ? (
              <div className="glass-card animate-fade-in" style={{ padding: '2.5rem' }}>
                <div className="print-only" style={{ display: 'none', textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '2px solid #000' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '0.1em', margin: '0 0 8px 0' }}>COACHESEYE STRATEGIC INTELLIGENCE</h1>
                  <h2 style={{ fontSize: '16px', fontWeight: '600', opacity: 0.8, margin: 0 }}>Unscheduled Attendance Tracking Report</h2>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div className="section-title">Attendance Verification</div>
                    <h3 className="text-3xl font-black uppercase mb-2">Unscheduled Attendance <span style={{ color: 'var(--accent-rose)' }}>({unscheduledAttendances.length})</span></h3>
                    <p className="text-white/50 text-sm max-w-2xl" style={{ margin: 0 }}>
                      Swimmers who physically recorded attendance for a session they <strong className="text-white">do not have a scheduled membership for</strong> in the selected period ({periodDays} days).
                      This identifies roster leakage, guest swimmers, or irregular attendance.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 no-print" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>Filter Squads</label>
                      <select
                        value={globalSquadFilter}
                        onChange={(e) => setGlobalSquadFilter(e.target.value)}
                        className="border border-white/10 rounded-lg px-4 py-2 text-white font-bold outline-none focus:border-cyan-400"
                        style={{ background: '#0f172a', color: '#fff', fontSize: '0.75rem', height: '38px', minWidth: '150px' }}
                      >
                        <option value="All">All Squads</option>
                        {squadsList.map(sq => (
                          <option key={sq} value={sq} style={{ background: '#0f172a', color: '#fff' }}>{sq}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {unscheduledAttendances.length > 0 && (
                  <div className="yield-matrix mb-8" style={{ background: 'rgba(239,68,68,0.02)', border: '1px solid rgba(239,68,68,0.1)', padding: '24px', borderRadius: '16px' }}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div style={{ background: 'linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(185,28,28,0.03) 100%)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#f87171', lineHeight: '1' }}>{unscheduledAttendances.length}</div>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, marginTop: '4px', color: '#fff' }}>Flagged Swimmers</div>
                      </div>
                      <div style={{ background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(217,119,6,0.03) 100%)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#fbbf24', lineHeight: '1' }}>{unscheduledAttendances.reduce((acc, sw) => acc + sw.totalUnscheduled, 0)}</div>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, marginTop: '4px', color: '#fff' }}>Total Unscheduled Visits</div>
                      </div>
                      <div style={{ background: 'linear-gradient(145deg, rgba(6,182,212,0.08) 0%, rgba(8,145,178,0.03) 100%)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#2dd4bf', lineHeight: '1.2', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(() => {
                          const counts = {};
                          unscheduledAttendances.forEach(sw => sw.sessions.forEach(s => { counts[s.sessionName] = (counts[s.sessionName] || 0) + s.dates.length; }));
                          let pName = 'None'; let pCount = 0;
                          Object.entries(counts).forEach(([name, c]) => { if (c > pCount) { pCount = c; pName = name; } });
                          return pName;
                        })()}>
                          {(() => {
                            const counts = {};
                            unscheduledAttendances.forEach(sw => sw.sessions.forEach(s => { counts[s.sessionName] = (counts[s.sessionName] || 0) + s.dates.length; }));
                            let pName = 'None'; let pCount = 0;
                            Object.entries(counts).forEach(([name, c]) => { if (c > pCount) { pCount = c; pName = name; } });
                            return pName;
                          })()}
                        </div>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, marginTop: '4px', color: '#fff' }}>Peak Unscheduled Session</div>
                      </div>
                    </div>
                  </div>
                )}

                {unscheduledAttendances.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', gap: '1rem', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '16px' }}>
                    <div style={{ fontSize: '3rem' }}>✅</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--accent-emerald)' }}>All Clear — No Unscheduled Attendance</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                      All recorded swims in the last {periodDays} days match the swimmers' scheduled memberships.
                    </div>
                  </div>
                ) : (
                  <table className="stats-table-glass w-full" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', width: '200px' }}>Swimmer</th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', width: '150px' }}>Squad</th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Unscheduled Sessions Attended</th>
                        <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', width: '120px' }}>Total Visits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unscheduledAttendances.map((sw, idx) => (
                        <tr key={`${sw.swimmerId}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '14px 16px', fontWeight: 700, color: '#fff', fontSize: '0.9rem', verticalAlign: 'top' }}>{sw.swimmerName}</td>
                          <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                            <span style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--accent-cyan)', borderRadius: '6px', padding: '3px 10px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {sw.squadName}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {sw.sessions.map((s, sIdx) => (
                                <div key={sIdx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.9)' }}>
                                      <span className="text-cyan-400 mr-2">{s.sessionDay}</span>
                                      <span>{s.sessionName}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                                      <span>🕒 {s.sessionTime}</span>
                                      <span style={{ marginLeft: '12px' }}>📅 {s.dates.map(d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })).join(', ')}</span>
                                    </div>
                                  </div>
                                  <div style={{ padding: '4px 10px', borderRadius: '6px', background: s.dates.length >= 3 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', border: s.dates.length >= 3 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(245,158,11,0.2)', color: s.dates.length >= 3 ? '#fb7185' : '#fbbf24', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', height: 'fit-content', marginTop: '6px' }} className="shrink-0">
                                    {s.dates.length} {s.dates.length === 1 ? 'swim' : 'swims'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'top' }}>
                            <span style={{
                              background: sw.totalUnscheduled >= 3 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                              border: sw.totalUnscheduled >= 3 ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(245,158,11,0.4)',
                              color: sw.totalUnscheduled >= 3 ? '#fb7185' : '#fbbf24',
                              borderRadius: '6px', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: '5px'
                            }}>
                              🚨 {sw.totalUnscheduled} {sw.totalUnscheduled === 1 ? 'swim' : 'swims'}
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
        <CapacityReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          onGenerate={handleGenerateReport}
          squadsList={squadsList}
          loading={isExporting}
        />
    </Layout>
  );
}
