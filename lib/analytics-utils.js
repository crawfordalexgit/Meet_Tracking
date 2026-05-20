import { 
  STANDARDS, 
  getKentBenchmark as getRealBenchmark, 
  getBenchmarkTable as getRealTable,
  getCategoryBenchmark
} from './qualifying-times';

export { getCategoryBenchmark };

export function timeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const cleanTime = timeStr.replace(/[^\d:.]/g, '');
  const parts = cleanTime.split(':');
  if (parts.length === 2) {
    return (parseFloat(parts[0]) * 60) + parseFloat(parts[1]);
  }
  return parseFloat(cleanTime) || 0;
}

export function normalizeName(name) {
  if (!name) return "";
  let n = name.trim();
  
  // Handle parenthetical aliases: "Leong Chiu (James) Wong" -> "Leong Chiu Wong"
  n = n.replace(/\s*\([^)]*\)\s*/g, ' ');

  // Handle "Last, First" format
  if (n.includes(',')) {
    const parts = n.split(',').map(p => p.trim());
    if (parts.length === 2) {
      n = `${parts[1]} ${parts[0]}`;
    }
  }
  
  return n.toLowerCase()
    .replace(/[,\.]/g, ' ') // Remove commas and dots
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .sort()
    .join(' ')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents
}

export function generateNameAliases(swimmer) {
  const aliases = new Set();
  if (!swimmer) return [];
  
  // 1. Base full name
  if (swimmer.full_name) aliases.add(normalizeName(swimmer.full_name));
  
  // Calculate a reliable Last Name
  const nameParts = swimmer.full_name?.split(',') || [];
  const lastName = (nameParts[0] || swimmer.full_name?.split(' ').pop() || '').trim();

  // 2. Known As + Last Name
  if (swimmer.known_as && lastName) {
    aliases.add(normalizeName(`${swimmer.known_as} ${lastName}`));
  }
  
  // 3. Legal First Name + Last Name
  if (swimmer.legal_first_name && lastName) {
    aliases.add(normalizeName(`${swimmer.legal_first_name} ${lastName}`));
  }

  return Array.from(aliases);
}

export function getPreferredName(swimmer) {
  if (!swimmer) return "";
  if (!swimmer.known_as) return swimmer.full_name;
  
  let lastName = "";
  const cleanFull = swimmer.full_name || "";
  if (cleanFull.includes(',')) {
    lastName = cleanFull.split(',')[0].trim();
  } else {
    const parts = cleanFull.trim().split(/\s+/);
    lastName = parts[parts.length - 1];
  }
  
  return `${swimmer.known_as} ${lastName}`;
}

export function normalizeEvent(event) {
  if (!event) return "";
  let e = event.toLowerCase();
  
  // Remove "Event XXX" prefix
  e = e.replace(/event\s*\d+\s*/i, '');
  
  // Remove gender/age markers that might vary
  e = e.replace(/(boys?|girls?|mens?|womens?|open\/male|female)\s*/i, '');
  
  // Remove distance markers like "m", "meters", "metres"
  e = e.replace(/(\d+)\s*(m|meters|metres)\b/i, '$1');
  
  // Remove course/meter markers
  e = e.replace(/(lc|sc|long\s*course|short\s*course|meters?|metres?)\b/gi, '');
  
  // Remove extra "session" markers
  e = e.replace(/session\s*\d+\s*/i, '');

  // Handle common abbreviations
  e = e.replace(/freestyle/i, 'free');
  e = e.replace(/breaststroke/i, 'breast');
  e = e.replace(/backstroke/i, 'back');
  e = e.replace(/butterfly/i, 'fly');
  e = e.replace(/individual\s*medley/i, 'im');

  return e.toLowerCase().replace(/[^a-z0-9]/g, '');
}

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
  return results.some(r => {
    if (r.swimmer_id !== swimmerId) return false;
    const meet = r.meets;
    if (meet && meet.end_date) {
      const startDate = r.date || meet.date;
      const endDate = meet.end_date;
      return date >= startDate && date <= endDate;
    }
    return r.date === date;
  });
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
    const uniqueResultDatesSet = new Set();

    results.filter(r => r.swimmer_id === swimmerId).forEach(r => {
      const meet = r.meets;
      if (meet && meet.end_date) {
        const startDate = r.date || meet.date;
        const endDate = meet.end_date;
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const current = new Date(start);
          while (current <= end) {
            uniqueResultDatesSet.add(toLocalISO(current));
            current.setDate(current.getDate() + 1);
          }
        } else {
          uniqueResultDatesSet.add(r.date);
        }
      } else {
        uniqueResultDatesSet.add(r.date);
      }
    });

    const uniqueResultDates = Array.from(uniqueResultDatesSet);

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
export function calculateReliability(swimmer, attendance, sessions, results, periodDays = 365, exemptions = [], sessionMemberships = [], filterOptions = {}) {
  const includeSessionCredits = filterOptions.sessionCredits ?? true;
  const includeGalas = filterOptions.galas ?? true;
  const includeHolidays = filterOptions.holidays ?? true;
  const includeShutdowns = filterOptions.shutdowns ?? true;
  const complianceMode = filterOptions.complianceMode ?? 'combined';

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
   let totalCreditedSessions = 0;
   let totalCreditedHours = 0;
   
   let weeksMetCount = 0;
   let hoursMetCount = 0;
   let sessionsMetCount = 0;
   let weekendMetCount = 0;
   let totalWeekendRequiredWeeks = 0;
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
       
        const isShutdown = shutdown?.name?.toLowerCase().includes('shutdown');
        const shouldApplyExempt = isShutdown ? includeShutdowns : includeSessionCredits;
        const shouldApplyCredit = isShutdown ? includeShutdowns : includeSessionCredits;
        
        if (shouldApplyExempt && shutdown?.type === 'exempt') isExemptWeek = true;
        if (shouldApplyCredit && shutdown?.type === 'credit') {
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

     if (isExemptWeek) {
       workloadByWeek[weekKey].isExempt = true;
       workloadByWeek[weekKey].target = 0;
       workloadByWeek[weekKey].requiredSessions = 0;
       workloadByWeek[weekKey].isMet = true;
       continue;
     }

     // Deduct shutdown/cancelled session hours from the weekly target volume
     const finalWeekTargetHrs = Math.max(0, targetHrs - (includeSessionCredits ? creditedHoursInWeek : 0));
     cumulativeTargetHours += finalWeekTargetHrs;

     // FLOATING HOLIDAY LOGIC: If 0 activity and have allowance left, exempt the week
     swimmableWeeks++;
     totalCreditedSessions += creditedSessionsInWeek;
     totalCreditedHours += creditedHoursInWeek;

     if (w || creditedSessionsInWeek > 0) {
       const work = w || { trainingSessions: 0, galaSessions: 0, trainingHours: 0, galaHours: 0 };
       const activeGalaSessions = includeGalas ? work.galaSessions : 0;
       const activeGalaHours = includeGalas ? work.galaHours : 0;
       
       // STRICT SWUM-ONLY TRAINING VOLUME (NO CREDITS ADDED FOR TOTAL VOLUME)
       totalTrainingHours += work.trainingHours;
       totalGalaHours += activeGalaHours;
       
       const sessMet = (work.trainingSessions + activeGalaSessions + creditedSessionsInWeek) >= targetSess;
       const hrsMet = (work.trainingHours + activeGalaHours + creditedHoursInWeek) >= targetHrs;
       
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
       
       let activityMet = false;
       if (complianceMode === 'sessions') {
         activityMet = sessMet;
       } else if (complianceMode === 'hours') {
         activityMet = hrsMet;
       } else {
         activityMet = isOr ? (sessMet || hrsMet) : (sessMet && hrsMet);
       }
       
       const isMetActivity = activityMet && (!mustWeekend || work.hasWeekend || creditHasWeekend);
       let isMet = isMetActivity;
       let holidayUsed = false;

       if (includeHolidays && !isMet && (work.trainingSessions + work.galaSessions + creditedSessionsInWeek) === 0 && holidaysUsed < holidayAllowance) {
         isMet = true;
         holidayUsed = true;
         holidaysUsed++;
       }
       
       if (isMet) weeksMetCount++;
       
       let weekHoursMet = hrsMet;
       let weekSessionsMet = sessMet;
       let weekWeekendMet = !mustWeekend || work.hasWeekend || creditHasWeekend;

       if (holidayUsed) {
         weekHoursMet = true;
         weekSessionsMet = true;
         weekWeekendMet = true;
       }

       if (weekHoursMet) hoursMetCount++;
       if (weekSessionsMet) sessionsMetCount++;
       if (mustWeekend) {
         totalWeekendRequiredWeeks++;
         if (weekWeekendMet) weekendMetCount++;
       }
       
       // Enrich for UI
       workloadByWeek[weekKey].isMet = isMet;
       workloadByWeek[weekKey].isHoliday = holidayUsed;
       workloadByWeek[weekKey].target = finalWeekTargetHrs;
       workloadByWeek[weekKey].requiredSessions = targetSess;
       workloadByWeek[weekKey].appliedRule = weekRule;
       workloadByWeek[weekKey].mustWeekend = mustWeekend;
       workloadByWeek[weekKey].isOr = isOr;
     } else if (includeHolidays && holidaysUsed < holidayAllowance) {
       // NO RECORD AT ALL: Use a holiday
       holidaysUsed++;
       weeksMetCount++;
       hoursMetCount++;
       sessionsMetCount++;
       if (mustWeekend) {
         totalWeekendRequiredWeeks++;
         weekendMetCount++;
       } 
       workloadByWeek[weekKey].isMet = true;
       workloadByWeek[weekKey].isHoliday = true;
       workloadByWeek[weekKey].target = finalWeekTargetHrs;
       workloadByWeek[weekKey].requiredSessions = targetSess;
       workloadByWeek[weekKey].appliedRule = weekRule;
       workloadByWeek[weekKey].mustWeekend = mustWeekend;
       workloadByWeek[weekKey].isOr = isOr;
     } else {
       if (mustWeekend) {
         totalWeekendRequiredWeeks++;
       }
       workloadByWeek[weekKey].isMet = false;
       workloadByWeek[weekKey].target = finalWeekTargetHrs;
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
    hoursCompliance: swimmableWeeks > 0 ? Math.min(100, Math.round((hoursMetCount / swimmableWeeks) * 100)) : 100,
    sessionsCompliance: swimmableWeeks > 0 ? Math.min(100, Math.round((sessionsMetCount / swimmableWeeks) * 100)) : 100,
    weekendCompliance: totalWeekendRequiredWeeks > 0 ? Math.min(100, Math.round((weekendMetCount / totalWeekendRequiredWeeks) * 100)) : null,
    totalWeekendRequiredWeeks,
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
    creditedSessions: totalCreditedSessions,
    creditedHours: totalCreditedHours,
    totalMeetsAttended: totalMeetsCount,
    targetMeets,
    complianceRate,
    effectiveJoinDate,
    totalWeeksCount,
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

/**
 * Isolates training hours logged between a target meet and its immediately preceding meet
 * to evaluate the Training Efficiency Index (TEI).
 */
export function calculateTrainingBlock(targetMeet, results, attendance, sessions, targetWaPoints = 0, customStartDate = null) {
  if (!targetMeet || !results || !attendance || !sessions) {
    return { totalHours: 0, tei: 0, startDate: null, endDate: null, waPoints: 0 };
  }

  // targetMeet could be a meet object, a result, or a date string
  const targetDateStr = targetMeet.date || targetMeet.end_date || (typeof targetMeet === 'string' ? targetMeet : null);
  if (!targetDateStr) {
    return { totalHours: 0, tei: 0, startDate: null, endDate: null, waPoints: 0 };
  }
  const targetDate = new Date(targetDateStr);

  let startDate;
  if (customStartDate && !isNaN(new Date(customStartDate).getTime())) {
    startDate = new Date(customStartDate);
  } else {
    // Group swimmer results to find unique meet dates strictly before targetDate
    const uniqueMeetDates = Array.from(new Set(results.map(r => r.date)))
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => d < targetDate)
      .sort((a, b) => b - a); // Descending order: most recent preceding meet is first

    // Start date is the day after the immediately preceding meet.
    // Default to 42 days (6 weeks) prior if no preceding meet is found.
    startDate = uniqueMeetDates.length > 0 
      ? new Date(uniqueMeetDates[0].getTime() + 24 * 60 * 60 * 1000) 
      : new Date(targetDate.getTime() - 42 * 24 * 60 * 60 * 1000);
  }

  let totalHours = 0;
  attendance.forEach(att => {
    if (!att.date) return;
    const attDate = new Date(att.date);
    if (attDate >= startDate && attDate <= targetDate) {
      if (att.status === 'present') {
        const session = sessions.find(s => s.id === att.session_id);
        const duration = Number(getSessionDuration(session)) || 1.5;
        totalHours += duration;
      }
    }
  });

  const tei = totalHours > 0 ? parseFloat((targetWaPoints / totalHours).toFixed(3)) : 0;

  return {
    totalHours: parseFloat(totalHours.toFixed(1)),
    tei,
    startDate: toLocalISO(startDate),
    endDate: toLocalISO(targetDate),
    waPoints: targetWaPoints
  };
}

/**
 * Cascades training efficiency metrics to the squad or club level.
 */
export function calculateAggregateBlock(targetMeet, swimmers, results, attendance, sessions, customStartDate = null) {
  if (!targetMeet || !swimmers || swimmers.length === 0 || !results || !attendance || !sessions) {
    return { averageHours: 0, averageWaPoints: 0, totalPbs: 0, totalRaces: 0, squadTei: 0, chartData: [], startDate: null, endDate: null };
  }

  const targetDateStr = targetMeet.date || targetMeet.end_date || (typeof targetMeet === 'string' ? targetMeet : null);
  if (!targetDateStr) {
    return { averageHours: 0, averageWaPoints: 0, totalPbs: 0, totalRaces: 0, squadTei: 0, chartData: [], startDate: null, endDate: null };
  }
  const targetDate = new Date(targetDateStr);

  let startDate;
  if (customStartDate && !isNaN(new Date(customStartDate).getTime())) {
    startDate = new Date(customStartDate);
  } else {
    // Find the immediately preceding meet date among ALL swimmers' results
    const uniqueMeetDates = Array.from(new Set(results.map(r => r.date)))
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => d < targetDate)
      .sort((a, b) => b - a);

    startDate = uniqueMeetDates.length > 0 
      ? new Date(uniqueMeetDates[0].getTime() + 24 * 60 * 60 * 1000) 
      : new Date(targetDate.getTime() - 42 * 24 * 60 * 60 * 1000);
  }

  // 1. Calculate individual blocks to get individual total hours
  const swimmerBlocks = swimmers.map(sw => {
    const swResults = results.filter(r => r.swimmer_id === sw.id);
    const swAttendance = attendance.filter(a => a.swimmer_id === sw.id);
    return calculateTrainingBlock(targetMeet, swResults, swAttendance, sessions, 0, customStartDate);
  });

  const totalHoursAllSwimmers = swimmerBlocks.reduce((sum, b) => sum + b.totalHours, 0);
  const averageHours = parseFloat((totalHoursAllSwimmers / swimmers.length).toFixed(1));

  // 2. Meet results for cohort
  const cohortSwimmerIds = new Set(swimmers.map(s => s.id));
  const targetDateISO = toLocalISO(targetDate);
  const meetResults = results.filter(r => {
    if (!cohortSwimmerIds.has(r.swimmer_id)) return false;
    const meetIdMatch = targetMeet.id && r.meet_id === targetMeet.id;
    const dateMatch = r.date && toLocalISO(new Date(r.date)) === targetDateISO;
    return meetIdMatch || dateMatch;
  });

  const totalRaces = meetResults.length;
  const totalPbs = meetResults.filter(r => r.is_pb).length;
  const averageWaPoints = totalRaces > 0 
    ? Math.round(meetResults.reduce((sum, r) => sum + (r.wa_pts || 0), 0) / totalRaces)
    : 0;

  const squadTei = averageHours > 0 ? parseFloat((averageWaPoints / averageHours).toFixed(1)) : 0;

  // 3. Generate weekly chart data
  // Pre-calculate workloads for speed
  const swimmersWorkloads = swimmers.map(sw => {
    const swAtt = attendance.filter(a => a.swimmer_id === sw.id);
    const swRes = results.filter(r => r.swimmer_id === sw.id);
    const rel = calculateReliability(sw, swAtt, sessions, swRes, 365);
    return rel.details || {};
  });

  // Build the list of Mondays
  const weekStartDates = [];
  let current = new Date(startDate);
  const day = current.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  current.setDate(current.getDate() + diffToMonday);
  current.setHours(0,0,0,0);

  const targetEndDate = new Date(targetDate);
  while (current <= targetEndDate) {
    weekStartDates.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }

  // For each swimmer, build their week-by-week values and fill them progressively
  const swimmerWeeksList = swimmers.map((sw, swIndex) => {
    const swResults = results.filter(r => r.swimmer_id === sw.id);
    const workloadDetails = swimmersWorkloads[swIndex];

    const swWeeks = weekStartDates.map((weekStart, idx) => {
      const weekKey = getWeekKey(weekStart);
      const wLoad = workloadDetails[weekKey] || { trainingHours: 0, galaHours: 0 };
      const hours = wLoad.trainingHours + wLoad.galaHours;

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23,59,59,999);

      const weekResults = swResults.filter(r => {
        const d = new Date(r.date);
        return d >= weekStart && d <= weekEnd;
      });
      const peakWa = weekResults.length > 0 ? Math.max(...weekResults.map(r => r.wa_pts || 0)) : null;

      return {
        weekLabel: `Wk ${idx + 1}`,
        dateStr: toLocalISO(weekStart),
        hours: parseFloat(hours.toFixed(1)),
        waPoints: peakWa
      };
    });

    // Progressive fill
    let lastPeak = 0;
    const swPreBlockResults = swResults.filter(r => new Date(r.date) < startDate);
    if (swPreBlockResults.length > 0) {
      lastPeak = Math.max(...swPreBlockResults.map(r => r.wa_pts || 0));
    }

    return swWeeks.map(w => {
      if (w.waPoints !== null) {
        lastPeak = w.waPoints;
      }
      return {
        ...w,
        waPoints: lastPeak > 0 ? lastPeak : null
      };
    });
  });

  // Average across swimmers for each week
  const chartData = weekStartDates.map((weekStart, idx) => {
    let sumHours = 0;
    let sumWa = 0;
    let countWa = 0;
    const weekMeets = new Set();

    swimmers.forEach((sw, swIndex) => {
      const swWeeks = swimmerWeeksList[swIndex];
      const w = swWeeks[idx];
      if (w) {
        sumHours += w.hours;
        if (w.waPoints !== null) {
          sumWa += w.waPoints;
          countWa++;
        }
      }

      // Collect meet names for results in this week
      const swResults = results.filter(r => r.swimmer_id === sw.id);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23,59,59,999);

      const swWeekResults = swResults.filter(r => {
        const d = new Date(r.date);
        return d >= weekStart && d <= weekEnd;
      });
      swWeekResults.forEach(r => {
        const mName = r.meets?.name || r.meet_name;
        if (mName) weekMeets.add(mName);
      });
    });

    const meetNames = Array.from(weekMeets);

    return {
      weekLabel: `Wk ${idx + 1}`,
      dateStr: toLocalISO(weekStart),
      hours: swimmers.length > 0 ? parseFloat((sumHours / swimmers.length).toFixed(1)) : 0,
      waPoints: countWa > 0 ? Math.round(sumWa / countWa) : null,
      galaName: meetNames.length > 0 ? meetNames.join(', ') : null
    };
  });

  return {
    averageHours,
    averageWaPoints,
    totalPbs,
    totalRaces,
    squadTei,
    chartData,
    startDate: toLocalISO(startDate),
    endDate: toLocalISO(targetDate)
  };
}


/**
 * Calculates the drop-off ratio for a specified stroke based on the swimmer's
 * best 50m and 100m times.
 */
export function calculateDropOffRatio(results, stroke) {
  if (!results || !stroke) return null;
  const s = stroke.toLowerCase();
  
  // Find all results matching the stroke
  const strokeResults = results.filter(r => {
    const evt = (r.event || '').toLowerCase();
    const isStroke = 
      (s === 'free' || s === 'freestyle') ? (evt.includes('free') || evt.includes('freestyle')) :
      (s === 'back' || s === 'backstroke') ? (evt.includes('back') || evt.includes('backstroke')) :
      (s === 'breast' || s === 'breaststroke') ? (evt.includes('breast') || evt.includes('breaststroke')) :
      (s === 'fly' || s === 'butterfly') ? (evt.includes('fly') || evt.includes('butterfly')) :
      evt.includes(s);
    return isStroke;
  });

  // Filter 50m and 100m results
  const fiftyTimes = strokeResults
    .filter(r => {
      const evt = (r.event || '').toLowerCase();
      return evt.includes('50') && !evt.includes('250') && !evt.includes('150');
    })
    .map(r => timeToSeconds(r.time))
    .filter(t => t > 0);

  const hundredTimes = strokeResults
    .filter(r => {
      const evt = (r.event || '').toLowerCase();
      return evt.includes('100');
    })
    .map(r => timeToSeconds(r.time))
    .filter(t => t > 0);

  if (fiftyTimes.length === 0 || hundredTimes.length === 0) return null;

  const bestFifty = Math.min(...fiftyTimes);
  const bestHundred = Math.min(...hundredTimes);

  return parseFloat((bestHundred / (bestFifty * 2)).toFixed(3));
}
