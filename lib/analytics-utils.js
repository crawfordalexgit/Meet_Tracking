import { 
  STANDARDS, 
  getKentBenchmark as getRealBenchmark, 
  getBenchmarkTable as getRealTable,
  getCategoryBenchmark
} from './qualifying-times';

export { getCategoryBenchmark };

export function getWeekKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMonday);
  return `W-${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}



/**
 * Returns a YYYY-MM-DD string in LOCAL time.
 */
export function toLocalISO(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Checks if a swimmer has a racing result on a specific date.
 */
export function isGalaDate(date, swimmerId, results) {
  if (!results) return false;
  return results.some(r => r.swimmer_id === swimmerId && r.date === date);
}

/**
 * Extracts duration in hours from session data.
 * Priority: 1. start_time/end_time, 2. Name regex (e.g. "2 hours"), 3. Time range regex (e.g. "19:00 - 21:00")
 */
export function getSessionDuration(session) {
  if (!session) return 1.5;

  // 1. Check start_time/end_time
  if (session.start_time && session.end_time) {
    const start = new Date(`1970-01-01T${session.start_time}:00`);
    const end = new Date(`1970-01-01T${session.end_time}:00`);
    let diff = (end - start) / (1000 * 60 * 60);
    if (diff < 0) diff += 24; // Handle overnight if any
    if (diff > 0) return diff;
  }

  // 2. Check for "(X hours)" or "(X.X hours)" in name
  const hourMatch = session.name.match(/\((\d+(\.\d+)?)\s*hours?\)/i);
  if (hourMatch) return parseFloat(hourMatch[1]);

  // 3. Check for "(X mins)" or "(X minutes)"
  const minMatch = session.name.match(/\((\d+)\s*min/i);
  if (minMatch) return parseInt(minMatch[1]) / 60;

  // 4. Check for "(HH:MM - HH:MM)" in name
  const rangeMatch = session.name.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (rangeMatch) {
    const start = new Date(`1970-01-01T${rangeMatch[1]}:00`);
    const end = new Date(`1970-01-01T${rangeMatch[2]}:00`);
    let diff = (end - start) / (1000 * 60 * 60);
    if (diff < 0) diff += 24;
    return diff;
  }

  return 1.5; // Default fallback (standard session length)
}

/**
 * Checks if a specific date is a club-wide shutdown or squad-specific cancellation.
 * squadId can be used to filter exemptions that only apply to certain groups.
 */
export function isShutdownDate(dateStr, exemptions = [], squadId = null) {
  if (!exemptions || exemptions.length === 0) return null;
  const d = new Date(dateStr);
  const dateObj = toLocalISO(d);
  
  // Check Dynamic Exemptions (from DB)
  return (exemptions || []).find(ex => {
    const inRange = dateObj >= ex.start_date && dateObj <= ex.end_date;
    const squadMatch = !ex.squad_id || ex.squad_id === squadId;
    return inRange && squadMatch;
  }) || null;
}

export function isExemptDate(dateStr, exemptions = []) {
  const res = isShutdownDate(dateStr, exemptions);
  return res !== null;
}

/**
 * Groups attendance into weekly blocks with Gala overrides and Holiday exemptions.
 */
export function calculateWorkload(attendance, sessions, results, swimmerId, exemptions = [], squadId = null) {
  const workload = {};

  attendance.forEach(att => {
    const weekKey = getWeekKey(att.date);

    if (!workload[weekKey]) {
      workload[weekKey] = { 
        trainingHours: 0, 
        galaHours: 0, 
        trainingSessions: 0, 
        galaSessions: 0,
        hasWeekend: false,
        isExempt: false,
        isCredit: false
      };
    }

    const shutdown = isShutdownDate(att.date, exemptions, squadId);

    if (shutdown) {
      if (shutdown.type === 'exempt') workload[weekKey].isExempt = true;
      if (shutdown.type === 'credit') workload[weekKey].isCredit = true;
    }

    const session = sessions.find(s => s.id === att.session_id);
    const duration = Number(getSessionDuration(session)) || 1.5;
    const isRacing = isGalaDate(att.date, swimmerId, results);
    const d = new Date(att.date);
    const day = d.getDay();

    if (att.status === 'present') {
      workload[weekKey].trainingHours += duration;
      workload[weekKey].trainingSessions += 1;
      if (day === 0 || day === 6) workload[weekKey].hasWeekend = true;
    } else if (att.status === 'absent' && isRacing) {
      workload[weekKey].galaHours += duration;
      workload[weekKey].galaSessions += 1;
      if (day === 0 || day === 6) workload[weekKey].hasWeekend = true;
    }
  });

  // GALA-ONLY CREDITS: Handle dates with results but NO attendance records
  if (results) {
    const attendanceDates = new Set(attendance.map(a => a.date));
    const uniqueResultDates = [...new Set(results.filter(r => r.swimmer_id === swimmerId).map(r => r.date))];

    uniqueResultDates.forEach(dateStr => {
      if (!attendanceDates.has(dateStr)) {
        const weekKey = getWeekKey(dateStr);

        if (!workload[weekKey]) {
          workload[weekKey] = { trainingHours: 0, galaHours: 0, trainingSessions: 0, galaSessions: 0, hasWeekend: false, isExempt: false, isCredit: false };
        }

        const shutdown = isShutdownDate(dateStr, exemptions, squadId);

        if (shutdown) {
          if (shutdown.type === 'exempt') workload[weekKey].isExempt = true;
          if (shutdown.type === 'credit') workload[weekKey].isCredit = true;
        }

        workload[weekKey].galaHours += 2.0; 
        workload[weekKey].galaSessions += 1;
        const d = new Date(dateStr);
        const day = d.getDay();
        if (day === 0 || day === 6) workload[weekKey].hasWeekend = true;
      }
    });
  }

  return workload;
}

/**
 * Standardized Reliability Calculation
 * Returns { percentage, weeksMet, totalWeeks }
 */
export function calculateReliability(swimmer, attendance, sessions, results, periodDays = 365, exemptions = [], sessionMemberships = []) {
  const now = new Date();
  const PROFILE_YEAR_START = new Date(now.getTime() - (periodDays * 24 * 60 * 60 * 1000));
  const squad = Array.isArray(swimmer.squads) ? swimmer.squads[0] : (swimmer.squads || {});
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // BASE TARGETS (used if no age-based rules match)
  let baseTargetSess = squad.target_sessions_per_week || 0;
  let baseTargetHrs = squad.target_hours_per_week || 0;
  
  // Calculate membership defaults if squad defaults are missing
  if (baseTargetSess === 0 && sessionMemberships?.length > 0) baseTargetSess = sessionMemberships.length;
  if (baseTargetHrs === 0 && sessionMemberships?.length > 0) {
     let totalMembershipDuration = 0;
     sessionMemberships.forEach(m => {
       const sess = sessions.find(s => s.id === m.session_id);
       if (sess) totalMembershipDuration += getSessionDuration(sess);
     });
     baseTargetHrs = Number(totalMembershipDuration) || 0;
  }

  // (Logic handled above in DYNAMIC TARGETS)

  // DYNAMIC ANALYSIS WINDOW: 
  // 1. Start with the requested period (e.g. 365 days ago)
  const periodStart = PROFILE_YEAR_START;
  const joinDate = swimmer.squad_join_date ? new Date(swimmer.squad_join_date) : null;
  const isJoinDateToday = joinDate && toLocalISO(joinDate) === toLocalISO(now);

  let firstAttDate = null;
  if (attendance && attendance.length > 0) {
    const dates = attendance.map(a => new Date(a.date)).filter(d => !isNaN(d)).sort((a, b) => a - b);
    firstAttDate = dates[0];
  }

  // We only truncate if the join date is in the past and NOT today (since today is likely a placeholder)
  let effectiveJoinDate = periodStart;
  if (joinDate && !isJoinDateToday && joinDate < now && joinDate > periodStart) {
    effectiveJoinDate = joinDate;
  }

  // If we have attendance data, and it's MORE RECENT than our current start,
  // it means the swimmer only just started appearing in the records.
  // We should start the reliability check from that point to avoid a huge empty denominator.
  if (firstAttDate && firstAttDate > effectiveJoinDate) {
    effectiveJoinDate = firstAttDate;
  }

  // Ensure we have a reasonable window
  const daysInSquad = Math.max(7, (now - effectiveJoinDate) / (1000 * 60 * 60 * 24));
  const totalWeeksCount = Math.floor(daysInSquad / 7);

   // 52-WEEK SCHEDULE MAPPING
   // 1. Identify which days the SQUAD is scheduled to train (General Squad Schedule)
    const squadScheduleDays = new Set();
    if (sessions && sessions.length > 0) {
      const squadName = squad.name?.toUpperCase() || "";
      sessions.forEach(s => {
        const sName = s.name?.toUpperCase() || "";
        const sDayField = (s.day_of_week || "").toLowerCase();
        const isMatch = sName.includes(squadName) || 
                        squadName.includes(sName) || 
                        squadName.split(' ').some(word => word.length > 2 && sName.includes(word));
        
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
          const d = new Date(a.date);
          if (!isNaN(d.getTime())) {
            const dn = dayNames[d.getDay()];
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

      // PRIORITY 3: SQUAD SCHEDULE (Fallback if no official data or routine)
      return squadScheduleDays.has(day);
    };

   const workloadByWeek = calculateWorkload(attendance, sessions, results, swimmer.id, exemptions, swimmer.squad_id);
   
   let weeksMetCount = 0;
   let swimmableWeeks = 0;
   let totalTrainingHours = 0;
   let totalGalaHours = 0;
   let holidaysUsed = 0;
   let cumulativeTargetHours = 0;
   const holidayAllowance = swimmer.holiday_allowance ?? (squad.holiday_allowance ?? 2);
   
   for (let i = 0; i < totalWeeksCount; i++) {
     const rawStart = new Date(effectiveJoinDate.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
     
     // ALIGN TO MONDAY (matching swimmer/[id].js logic)
     const weekStart = new Date(rawStart);
     const dayIdx = weekStart.getDay();
     const diffToMonday = (dayIdx === 0 ? -6 : 1) - dayIdx;
     weekStart.setDate(weekStart.getDate() + diffToMonday);
     weekStart.setHours(0,0,0,0);

     
     // DYNAMIC TARGETS FOR THIS WEEK
     const weekYear = weekStart.getFullYear();
     const weekAge = swimmer.year_of_birth ? weekYear - swimmer.year_of_birth : null;
     let weekRule = null;
     
     if (squad.age_based_criteria && Array.isArray(squad.age_based_criteria) && weekAge !== null) {
       const sortedCriteria = [...squad.age_based_criteria].sort((a, b) => (a.max_age || 99) - (b.max_age || 99));
       weekRule = sortedCriteria.find(c => weekAge <= (c.max_age || 99) && weekAge >= (c.min_age || 0));
     }

     const targetSess = weekRule?.target_sessions ?? baseTargetSess;
     const targetHrs = weekRule?.target_hours ?? baseTargetHrs;
     cumulativeTargetHours += targetHrs;
     const mustWeekend = weekRule?.require_weekend ?? (squad.require_weekend || false);
     const isOr = weekRule?.use_or_logic ?? (squad.use_or_logic ?? true);
     
     const weekKey = getWeekKey(weekStart);
     
     if (!workloadByWeek[weekKey]) {
        workloadByWeek[weekKey] = { 
          trainingHours: 0, galaHours: 0, trainingSessions: 0, galaSessions: 0, 
          hasWeekend: false, isExempt: false, isCredit: false 
        };
      }
      const w = workloadByWeek[weekKey];
     
     // CHECK DAILY CREDITS IN THIS WEEK
     let creditedSessionsInWeek = 0;
     let creditedHoursInWeek = 0;
     let isExemptWeek = false;

      for (let dIdx = 0; dIdx < 7; dIdx++) {
        const currentDate = new Date(weekStart.getTime() + (dIdx * 24 * 60 * 60 * 1000));
        if (currentDate > now) break;
        
        // Use a timezone-safe date string (YYYY-MM-DD in local time)
        const dateStr = toLocalISO(currentDate);
        const shutdown = isShutdownDate(dateStr, exemptions, swimmer.squad_id);
       
       if (shutdown?.type === 'exempt') isExemptWeek = true;
        if (shutdown?.type === 'credit') {
          const dayName = dayNames[currentDate.getDay()];
          const isScheduled = isDayScheduledForSwimmer(dayName);
          
          if (isScheduled) {
            if (sessionMemberships && sessionMemberships.length > 0) {
              sessionMemberships.forEach(m => {
                const sess = sessions.find(s => s.id === m.session_id);
                if (sess) {
                  const sDayField = (sess.day_of_week || "").toLowerCase();
                  const sName = sess.name?.toLowerCase() || "";
                  if (sDayField === dayName.toLowerCase() || sName.includes(dayName.toLowerCase())) {
                    creditedSessionsInWeek += 1;
                    creditedHoursInWeek += getSessionDuration(sess);
                  }
                }
              });
            } else {
              // Fallback to squad logic if no memberships (legacy)
              const squadName = squad.name?.toUpperCase() || "";
              const relevantSessions = sessions.filter(s => {
                const sName = s.name?.toUpperCase() || "";
                const sDayField = (s.day_of_week || "").toLowerCase();
                const isNameMatch = sName.includes(squadName) || squadName.includes(squadName) || squadName.split(' ').some(word => word.length > 3 && sName.includes(word));
                const isDayMatch = sDayField === dayName.toLowerCase() || sName.toLowerCase().includes(dayName.toLowerCase());
                return isNameMatch && isDayMatch;
              });
              
              creditedSessionsInWeek += relevantSessions.length;
              relevantSessions.forEach(s => {
                creditedHoursInWeek += getSessionDuration(s);
              });
            }
          }
        }
     }

     if (isExemptWeek) continue;

     // FLOATING HOLIDAY LOGIC: If 0 activity and have allowance left, exempt the week
     swimmableWeeks++;

     if (w || creditedSessionsInWeek > 0) {
       const work = w || { trainingSessions: 0, galaSessions: 0, trainingHours: 0, galaHours: 0 };
       totalTrainingHours += (work.trainingHours + creditedHoursInWeek);
       totalGalaHours += work.galaHours;
       
       const sessMet = (work.trainingSessions + work.galaSessions + creditedSessionsInWeek) >= targetSess;
       const hrsMet = (work.trainingHours + work.galaHours + creditedHoursInWeek) >= targetHrs;
       
       // Refined weekendMet: if the credit falls on a weekend day, it counts as "Weekend Met"
       let creditHasWeekend = false;
       if (creditedSessionsInWeek > 0) {
          for (let dIdx = 0; dIdx < 7; dIdx++) {
            const currentDate = new Date(weekStart.getTime() + (dIdx * 24 * 60 * 60 * 1000));
            const day = currentDate.getDay();
            if (day === 0 || day === 6) {
               const dateStr = toLocalISO(currentDate);
               const sd = isShutdownDate(dateStr, exemptions, swimmer.squad_id);
               if (sd?.type === 'credit' && isDayScheduledForSwimmer(dayNames[day])) creditHasWeekend = true;
            }
          }
       }
       
       const isMetActivity = (isOr ? (sessMet || hrsMet) : (sessMet && hrsMet)) && (!mustWeekend || work.hasWeekend || creditHasWeekend);
       let isMet = isMetActivity;
       let holidayUsed = false;

       if (!isMet && (work.trainingSessions + work.galaSessions + creditedSessionsInWeek) === 0 && holidaysUsed < holidayAllowance) {
         isMet = true;
         holidayUsed = true;
         holidaysUsed++;
       }
       
       if (isMet) weeksMetCount++;
       
        // Enrich for UI
        workloadByWeek[weekKey].isMet = isMet;
        workloadByWeek[weekKey].isHoliday = holidayUsed;
        workloadByWeek[weekKey].target = targetHrs;
        workloadByWeek[weekKey].requiredSessions = targetSess;
        workloadByWeek[weekKey].appliedRule = weekRule;
        workloadByWeek[weekKey].mustWeekend = mustWeekend;
        workloadByWeek[weekKey].isOr = isOr;
     } else if (holidaysUsed < holidayAllowance) {
       // NO RECORD AT ALL: Use a holiday
       holidaysUsed++;
       weeksMetCount++; 
       workloadByWeek[weekKey].isMet = true;
       workloadByWeek[weekKey].isHoliday = true;
       workloadByWeek[weekKey].target = targetHrs;
       workloadByWeek[weekKey].requiredSessions = targetSess;
       workloadByWeek[weekKey].appliedRule = weekRule;
       workloadByWeek[weekKey].mustWeekend = mustWeekend;
       workloadByWeek[weekKey].isOr = isOr;
     } else {
       workloadByWeek[weekKey].isMet = false;
       workloadByWeek[weekKey].target = targetHrs;
       workloadByWeek[weekKey].requiredSessions = targetSess;
       workloadByWeek[weekKey].appliedRule = weekRule;
       workloadByWeek[weekKey].mustWeekend = mustWeekend;
       workloadByWeek[weekKey].isOr = isOr;
     }
   }

   const seasonalTargetHours = Math.round(cumulativeTargetHours);
   const totalActualHours = totalTrainingHours + totalGalaHours;

  // Meet Compliance
   // Meet Compliance: Seasonal target (do not scale down by weeks to match settings)
    // Smart Meet Deduplication: Group results by name and proximity (within 3 days)
    const sortedMeets = results
      .filter(r => r.date && new Date(r.date) >= PROFILE_YEAR_START)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const deduplicatedMeets = [];
    sortedMeets.forEach(r => {
      const mName = r.meets?.name || r.meet_name || `Meet @ ${r.date}`;
      const mType = r.meets?.type || r.meet_type || 'Open';
      const rDate = new Date(r.date);
      
      const existing = deduplicatedMeets.find(m => 
        m.name === mName && 
        Math.abs((new Date(m.date) - rDate) / (1000 * 60 * 60 * 24)) <= 3
      );
      
      if (!existing) {
        deduplicatedMeets.push({
          name: mName,
          date: r.date,
          type: mType,
          id: r.meet_id
        });
      }
    });

    const openMeets = deduplicatedMeets.filter(m => m.type?.toLowerCase() === 'open');
    const targetMeets = squad.target_meets || 5; 
    const meetsCount = openMeets.length;
    const totalMeetsCount = deduplicatedMeets.length;
    const complianceRate = targetMeets > 0 ? Math.min(100, Math.round((meetsCount / targetMeets) * 100)) : 100;

  return {
    percentage: swimmableWeeks > 0 ? Math.min(100, Math.round((weeksMetCount / swimmableWeeks) * 100)) : 100,
    weeksMet: weeksMetCount,
    totalWeeks: swimmableWeeks,
    totalTrainingHours: Math.round(totalTrainingHours * 10) / 10,
    totalGalaHours: Math.round(totalGalaHours * 10) / 10,
    totalHours: Math.round(totalActualHours * 10) / 10,
    annualTarget: seasonalTargetHours,
    volumePct: seasonalTargetHours > 0 ? Math.round((totalActualHours / seasonalTargetHours) * 100) : 0,
    holidaysUsed,
    holidayAllowance,
    meetsAttended: meetsCount,
    totalMeetsAttended: totalMeetsCount,
    targetMeets,
    complianceRate,
    effectiveJoinDate,
    details: workloadByWeek,
    // Note: targetSess and targetHrs returned here are from the MOST RECENT week for display purposes
    targetSess: workloadByWeek[toLocalISO(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))]?.requiredSessions || baseTargetSess,
    targetHrs: workloadByWeek[toLocalISO(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))]?.target || baseTargetHrs,
    appliedRule: workloadByWeek[toLocalISO(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))]?.appliedRule || null
  };
}
/**
 * Generates a human-readable narrative of squad performance.
 */
export function generateSquadNarrative(stats) {
  const parts = [];
  
  // 1. PERFORMANCE MOMENTUM (VELOCITY)
  let momentumType = 'info';
  if (stats.avgVelocity > 5) momentumType = 'success';
  else if (stats.avgVelocity < -5) momentumType = 'danger';

  let momentumText = `Squad Velocity: ${stats.avgVelocity > 0 ? '+' : ''}${stats.avgVelocity}. `;
  if (stats.avgVelocity > 15) {
    momentumText += "The squad is in a phase of aggressive performance acceleration, racing significantly higher than the seasonal baseline.";
  } else if (stats.avgVelocity > 5) {
    momentumText += "The squad is showing steady, consistent progress across all racing disciplines.";
  } else if (stats.avgVelocity > -5 && stats.avgVelocity <= 5) {
    momentumText += "Performance levels are currently stable (Neutral Velocity), indicating a consolidation phase.";
  } else {
    momentumText += "Recent racing outputs show a downward trend relative to baseline; monitor for technical drift or fatigue.";
  }
  parts.push({ category: 'momentum', type: momentumType, text: momentumText });

  // 2. TRAINING ECOSYSTEM (WORKLOAD)
  const gap = stats.avgTraining - stats.avgVolume;
  let workloadType = 'info';
  if (stats.avgTraining >= 75) workloadType = 'success';
  else if (stats.avgTraining < 60) workloadType = 'danger';
  else workloadType = 'warning';

  let workloadText = `Squad Consistency: ${stats.avgTraining}% Attendance vs ${stats.avgVolume}% Volume. `;
  if (Math.abs(gap) < 10) {
    workloadText += "Attendance and Volume are well-aligned, indicating a sustainable and reliable training ecosystem.";
  } else if (gap >= 10) {
    workloadText += `Note the ${gap}% 'Consistency-Volume Gap'; attendance frequency is high, but total hours per week are lagging behind squad targets.`;
  } else {
    workloadText += `Significant Volume Bias (${Math.abs(gap)}%); athletes are completing full sessions but frequency of attendance requires intervention.`;
  }
  parts.push({ category: 'workload', type: workloadType, text: workloadText });

  // 3. COMPETITION ENGAGEMENT (MEETS)
  let meetType = 'info';
  if (stats.complianceRate >= 75) meetType = 'success';
  else if (stats.complianceRate < 50) meetType = 'warning';

  const racesPerSwimmer = Math.round(stats.totalRaces / (stats.athletes || 1));
  let meetText = `Meet Compliance: ${stats.complianceRate}% of athletes are meeting seasonal racing targets. `;
  if (racesPerSwimmer < 5) {
    meetText += `Racing exposure is low (Avg ${racesPerSwimmer} races/athlete). Increasing meet attendance is essential for testing technical changes.`;
  } else {
    meetText += `The squad maintains a healthy competitive rhythm with ${racesPerSwimmer} races per athlete on average.`;
  }
  parts.push({ category: 'Meet Attendance', type: meetType, text: meetText });

  // 4. STRATEGIC OPPORTUNITY (STROKES)
  if (stats.strokeData && Object.keys(stats.strokeData).length > 0) {
    const sortedStrokes = Object.entries(stats.strokeData)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].avg - a[1].avg);
    
    if (sortedStrokes.length > 1) {
      const strongest = sortedStrokes[0];
      const weakest = sortedStrokes[sortedStrokes.length - 1];
      const gap = strongest[1].avg - weakest[1].avg;
      
      parts.push({
        category: 'benchmarks',
        type: 'info',
        text: `Strategy: The squad excels in ${strongest[0]} (${Math.round(strongest[1].avg)} pts). ${gap > 40 ? `There is a significant development gap in ${weakest[0]} (${Math.round(weakest[1].avg)} pts); targeted clinics could yield high aggregate gains.` : `Overall stroke balance is healthy across the team.`}`
      });
    }
  }

  // 5. RECOMMENDATION
  let recText = "";
  if (stats.avgVelocity > 10 && stats.avgTraining > 80) {
    recText = "The squad is in a 'Golden Window'. Introduce advanced race-pace work to capitalize on high physiological readiness.";
  } else if (stats.avgVelocity < 0 && stats.avgVolume > 85) {
    recText = "Possible Over-Training. Focus on lower-intensity technical skills to allow for CNS recovery.";
  } else if (stats.avgTraining < 60) {
    recText = "Priority: Training Consistency. Without consistent stimulus, technical changes will not stabilize.";
  } else {
    recText = "Continue focusing on individual progression while maintaining the current squad performance baseline.";
  }
  parts.push({ category: 'strategy', type: 'info', text: `Recommendation: ${recText}` });

  return parts;
}


/**
 * Generates a human-readable narrative of individual swimmer performance.
 */
export function generateSwimmerNarrative(stats, swimmer) {
  const parts = [];
  
  // 1. MOMENTUM
  let momentumType = 'info';
  if (stats.velocity > 5) momentumType = 'success';
  else if (stats.velocity < -5) momentumType = 'danger';

  let momentumText = "";
  const pbText = stats.seasonPBs > 0 ? ` You have converted training into ${stats.seasonPBs} lifetime Personal Bests this season.` : "";
  
  if (stats.velocity > 15) {
    momentumText = `Velocity: +${stats.velocity}.${pbText} Aggressive performance acceleration—racing significantly higher than seasonal baseline.`;
  } else if (stats.velocity > 5) {
    momentumText = `Velocity: +${stats.velocity}.${pbText} Steady progress—consistently outperforming your seasonal baseline.`;
  } else if (stats.velocity > -5 && stats.velocity <= 5) {
    momentumText = `Velocity: Neutral (+${stats.velocity}).${pbText} Matching established baseline without major acceleration.`;
  } else {
    momentumText = `Velocity: Decelerating (${stats.velocity}).${pbText} Recent racing outputs are below baseline; technical reset required.`;
  }
  parts.push({ category: 'momentum', type: momentumType, text: momentumText });

  // 2. WORKLOAD & VOLUME (Factual Deep Dive)
  const hourGap = Math.max(0, stats.annualTargetHours - stats.totalActualHours);
  const missedSessions = Math.round(hourGap / 1.5);
  const weeksMetPct = stats.totalWeeks > 0 ? Math.round((stats.weeksMet / stats.totalWeeks) * 100) : 100;
  const workloadStatus = stats.totalWeeks > 0 ? (weeksMetPct >= 75 ? 'success' : (weeksMetPct >= 50 ? 'warning' : 'danger')) : 'info';
  
  let workloadText = "";
  const avgWeeklyHours = stats.totalWeeks > 0 ? Math.round((stats.totalActualHours / stats.totalWeeks) * 10) / 10 : 0;
  if (stats.totalWeeks > 0) {
    workloadText = `Consistency: You have met the squad criteria in ${stats.weeksMet} out of ${stats.totalWeeks} swimmable weeks (${weeksMetPct}%). Your average volume is ${avgWeeklyHours}h per week. In total, you have completed ${Math.round(stats.totalActualHours)}h out of a target ${Math.round(stats.annualTargetHours)}h. This ${Math.round(hourGap)}h deficit directly impacts your aerobic ceiling.`;
  } else {
    workloadText = `Consistency: All weeks in this period (${stats.totalWeeks} weeks) are currently marked as exempt or club shutdowns. Consistency scoring is paused. Volume: ${Math.round(stats.totalActualHours)}h recorded.`;
  }

  parts.push({
    category: 'workload',
    type: workloadStatus,
    text: workloadText
  });

  // 3. MEETS (Factual Engagement)
  const meetGap = Math.max(0, stats.targetMeets - stats.meetsAttended);
  const meetStatus = stats.meetsMet ? 'success' : 'warning';
  
  parts.push({ 
    category: 'Meet Attendance', 
    type: meetStatus, 
    text: `Meet Attendance: You have attended ${stats.meetsAttended} Open Meets out of a seasonal target of ${stats.targetMeets}. ${stats.meetsMet ? 'Excellent competitive engagement.' : `There is a gap of ${meetGap} meets relative to squad targets; increasing racing frequency is essential for technical progression.`}`
  });

  // 4. BENCHMARKS (County)
  const globalCounty = getCategoryBenchmark(stats.age, swimmer?.gender, '', 'COUNTY');
  const countyDiff = stats.peakWA - globalCounty;
  parts.push({
    category: 'benchmarks',
    type: countyDiff >= 0 ? 'success' : (countyDiff > -30 ? 'warning' : 'info'),
    text: `County Standard: Your Peak (${stats.peakWA} pts) is ${countyDiff >= 0 ? 'above' : 'tracking towards'} the Kent AQT baseline of ${globalCounty} pts.`
  });

  // 4b. BENCHMARKS (Regional)
  const globalRegional = getCategoryBenchmark(stats.age, swimmer?.gender, '', 'REGIONAL');
  const regDiff = stats.peakWA - globalRegional;
  if (regDiff >= -50) {
    parts.push({
      category: 'benchmarks',
      type: regDiff >= 0 ? 'success' : 'warning',
      text: `Regional Standard: You are within ${Math.abs(regDiff)}pts of the South East Regional Automatic standard (${globalRegional} pts).`
    });
  }

  // 5. CURRENT FORM (90 Days)
  const formDiff = stats.recentAvg - stats.avgWA;
  parts.push({
    category: 'form',
    type: formDiff >= 5 ? 'success' : (formDiff < -10 ? 'danger' : 'info'),
    text: `Current Form: Your recent 90-day average (${stats.recentAvg} pts) is ${formDiff > 0 ? 'heating up' : 'stable'} relative to your seasonal baseline (+${formDiff} pts).`
  });

  // 6. STROKE ANALYSIS
  if (stats.strokeData && Object.keys(stats.strokeData).length > 0) {
    Object.entries(stats.strokeData)
      .filter(([_, data]) => data.count > 0)
      .forEach(([stroke, data]) => {
        const cTarget = getCategoryBenchmark(stats.age, swimmer?.gender, stroke, 'COUNTY');
        const rTarget = getCategoryBenchmark(stats.age, swimmer?.gender, stroke, 'REGIONAL');
        const peak = Math.round(data.peak);
        
        parts.push({
          category: 'strokes',
          type: peak >= cTarget ? 'success' : (peak > cTarget - 30 ? 'warning' : 'danger'),
          text: `${stroke}: Peak ${peak} pts. Target: County (${cTarget}) | Regional (${rTarget}).`
        });
      });
  }

  // 7. COACHING INSIGHTS
  let coachType = 'info';
  let coachText = "Consistency is the foundation for your next performance breakthrough.";
  
  const isHardWorker = stats.trainingPct > 85;
  const isStagnant = stats.velocity <= 5;
  const isRising = stats.velocity > 10;
  const isOverworked = stats.volumePct > 90 && stats.velocity < -5;

  // Identify stroke strengths/weaknesses for coaching
  const validStrokes = Object.entries(stats.strokeData).filter(([_, d]) => d.count > 0).sort((a,b) => b[1].peak - a[1].peak);
  const strongest = validStrokes[0];
  const weakest = validStrokes[validStrokes.length - 1];

  if (isOverworked) {
    coachType = 'warning';
    coachText = "Performance-Volume Decoupling: High volume is yielding diminishing returns. Focus on high-quality recovery and lower-intensity technical reset.";
  } else if (isHardWorker && isRising) {
    coachType = 'success';
    coachText = "Elite Rhythm: High compliance is converting into aggressive velocity gains. Maintain intensity as we approach the championship window.";
  } else if (isHardWorker && isStagnant) {
    coachType = 'info';
    coachText = "The 'Efficiency Plateau': Training attendance is exceptional, but points are stable. Focus on race-pace technical precision to trigger the next growth phase.";
  } else if (stats.trainingPct < 60) {
    coachType = 'danger';
    coachText = "Consistency Constraint: Performance volatility is linked to inconsistent training stimulus. Increasing attendance to 75%+ is the priority.";
  }

  // Add stroke-specific coaching
  if (strongest) {
    coachText += ` ${strongest[0]} is your dominant discipline; use this momentum to set the pace in training.`;
    if (weakest && strongest[1].peak - weakest[1].peak > 60) {
      coachText += ` Strategic Focus: Targeted technical clinics in ${weakest[0]} could significantly elevate your aggregate health score.`;
    }
  }

  parts.push({ category: 'coaching', type: coachType, text: `Coach's Eye: ${coachText}` });

  return parts;
}

/**
 * Computes a weighted 'Squad Health Score' and its components.
 * Weights are configurable per squad.
 */
export function calculateSquadHealth(input, attendance = [], sessions = [], results = [], period = 365, config = {}) {
  // Handle both pre-calculated stats or raw data arrays
  let stats = input;
  let finalConfig = config;

  if (Array.isArray(input)) {
    // RAW DATA MODE: Calculate stats first (matching index.js logic)
    const swimmers = input.filter(s => s.is_active !== false);
    const now = new Date();
    const START = new Date(now - period * 86400000);
    
    let totalTraining = 0, totalVolume = 0, totalVelocity = 0, totalMeets = 0;
    swimmers.forEach(s => {
      const swimmerMemberships = (input.memberships || []).filter(m => m.swimmer_id === s.id);
      const rel = calculateReliability(s, attendance, sessions, results, period, (config.exemptions || []), swimmerMemberships);
      totalTraining += rel.percentage;
      totalVolume += rel.volumePct;
      totalMeets += rel.complianceRate;
      
      const sResults = results.filter(r => r.swimmer_id === s.id && new Date(r.date) >= START);
      if (sResults.length >= 2) {
        const sorted = [...sResults].sort((a,b) => new Date(a.date) - new Date(b.date));
        totalVelocity += (sorted[sorted.length-1].wa_pts - sorted[0].wa_pts) / (sorted.length || 1);
      }
    });

    stats = {
      avgTraining: Math.round(totalTraining / (swimmers.length || 1)),
      avgVolume: Math.round(totalVolume / (swimmers.length || 1)),
      complianceRate: Math.round(totalMeets / (swimmers.length || 1)),
      avgVelocity: totalVelocity / (swimmers.length || 1)
    };
    finalConfig = results; // Shift config if we used raw mode (not ideal but common in this codebase)
  }

  const wReliability = finalConfig.health_weight_reliability ?? 20;
  const wProgress = finalConfig.health_weight_progress ?? 30;
  const wCompetition = finalConfig.health_weight_competition ?? 40;
  const wVolume = finalConfig.health_weight_volume ?? 10;

  const complianceScore = stats.complianceRate || 0;
  const velocityScore = Math.min(100, Math.max(0, 50 + (stats.avgVelocity * 2)));
  const trainingScore = stats.avgTraining || 0;
  const volumeScore = stats.avgVolume || 0;

  const total = Math.round(
    (complianceScore * (wCompetition / 100)) + 
    (velocityScore * (wProgress / 100)) + 
    (trainingScore * (wReliability / 100)) + 
    (volumeScore * (wVolume / 100))
  );

  return {
    total,
    components: [
      { label: 'Consistency', score: trainingScore, weight: `${wReliability}%`, desc: 'Frequency vs targets' },
      { label: 'Progress', score: velocityScore, weight: `${wProgress}%`, desc: 'Points momentum' },
      { label: 'Meet Attendance', score: complianceScore, weight: `${wCompetition}%`, desc: 'Attendance & status' },
      { label: 'Volume', score: volumeScore, weight: `${wVolume}%`, desc: 'Total hours banked' }
    ]
  };
}

/**
 * Returns the dynamic benchmark (WA Points) for a given age, gender, event, and level.
 */
export function getKentBenchmark(age, gender, event = '', level = 'COUNTY') {
  if (!event) return getCategoryBenchmark(age, gender, '', level);
  return getRealBenchmark(age, gender, event, level);
}

/**
 * Provides the full conversion table for the UI reference.
 */
export function getBenchmarkTable(gender, level = 'COUNTY') {
  return getRealTable(gender, level);
}
