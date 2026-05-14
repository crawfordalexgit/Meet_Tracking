import { 
  STANDARDS, 
  getKentBenchmark as getRealBenchmark, 
  getBenchmarkTable as getRealTable,
  getCategoryBenchmark
} from './qualifying-times';

export { getCategoryBenchmark };

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
  if (!session) return 0;

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
 * Checks if a date is a Bank Holiday or part of the August shutdown.
 */
export function isExemptDate(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth(); // 0-11
  const day = d.getDate();
  const year = d.getFullYear();

  // August Shutdown: Approx 3 weeks (Aug 10 - Aug 31)
  if (month === 7 && day >= 10) return true;

  // Christmas Shutdown: Dec 20 - Jan 2
  if (month === 11 && day >= 20) return true;
  if (month === 0 && day <= 2) return true;

  // Easter / Bank Holidays 2025/2026
  const holidays = [
    '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
    '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
    // Approximate Easter weeks for 2025/2026 if not caught by bank holidays
    '2025-04-14', '2025-04-15', '2025-04-16', '2025-04-17',
    '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02'
  ];
  
  return holidays.includes(dateStr);
}

/**
 * Groups attendance into weekly blocks with Gala overrides and Holiday exemptions.
 */
export function calculateWorkload(attendance, sessions, results, swimmerId) {
  const workload = {};

  attendance.forEach(att => {
    const d = new Date(att.date);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const pastDaysOfYear = (d - startOfYear) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    const weekKey = `${d.getFullYear()}-W${weekNum}`;

    if (!workload[weekKey]) {
      workload[weekKey] = { 
        trainingHours: 0, 
        galaHours: 0, 
        trainingSessions: 0, 
        galaSessions: 0,
        hasWeekend: false,
        isExempt: false
      };
    }

    if (isExemptDate(att.date)) workload[weekKey].isExempt = true;

    const session = sessions.find(s => s.id === att.session_id);
    const duration = getSessionDuration(session);
    const isRacing = isGalaDate(att.date, swimmerId, results);
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
    const resultDates = [...new Set(results.filter(r => r.swimmer_id === swimmerId).map(r => r.date))];

    resultDates.forEach(dateStr => {
      if (!attendanceDates.has(dateStr)) {
        const d = new Date(dateStr);
        const startOfYear = new Date(d.getFullYear(), 0, 1);
        const pastDaysOfYear = (d - startOfYear) / 86400000;
        const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
        const weekKey = `${d.getFullYear()}-W${weekNum}`;

        if (!workload[weekKey]) {
          workload[weekKey] = { trainingHours: 0, galaHours: 0, trainingSessions: 0, galaSessions: 0, hasWeekend: false, isExempt: false };
        }

        workload[weekKey].galaHours += 2.0; // Standard 2h credit
        workload[weekKey].galaSessions += 1;
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
export function calculateReliability(swimmer, attendance, sessions, results, periodDays = 365) {
  const now = new Date();
  const PROFILE_YEAR_START = new Date(now.getTime() - (periodDays * 24 * 60 * 60 * 1000));
  
  const squad = swimmer.squads || {};
  const targetSess = squad.target_sessions_per_week || 0;
  const targetHrs = squad.target_hours_per_week || 0;
  const mustWeekend = squad.require_weekend || false;
  const isOr = squad.use_or_logic ?? true;

  const joinDate = swimmer.squad_join_date ? new Date(swimmer.squad_join_date) : PROFILE_YEAR_START;
  const effectiveJoinDate = joinDate < PROFILE_YEAR_START ? PROFILE_YEAR_START : joinDate;
  
  const daysInSquad = (now - effectiveJoinDate) / (1000 * 60 * 60 * 24);
  const totalWeeksCount = Math.max(1, Math.floor(daysInSquad / 7));

  const workloadByWeek = calculateWorkload(attendance, sessions, results, swimmer.id);
  
  let weeksMetCount = 0;
  let swimmableWeeks = 0;
  let totalTrainingHours = 0;
  let totalGalaHours = 0;
  
  for (let i = 0; i < totalWeeksCount; i++) {
    const weekStart = new Date(effectiveJoinDate.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
    const dateStr = weekStart.toISOString().split('T')[0];
    const isExempt = isExemptDate(dateStr);
    
    const startOfYear = new Date(weekStart.getFullYear(), 0, 1);
    const pastDays = (weekStart - startOfYear) / 86400000;
    const wNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
    const weekKey = `${weekStart.getFullYear()}-W${wNum}`;
    
    const w = workloadByWeek[weekKey];
    if (w) {
      totalTrainingHours += w.trainingHours;
      totalGalaHours += w.galaHours;
    }

    // If it's a holiday week, we don't count it for reliability (the 75% target denominator)
    if (isExempt) continue;
    
    swimmableWeeks++;

    if (w) {
      const sessMet = (w.trainingSessions + w.galaSessions) >= targetSess;
      const hrsMet = (w.trainingHours + w.galaHours) >= targetHrs;
      const weekendMet = !mustWeekend || w.hasWeekend;
      const isMet = (isOr ? (sessMet || hrsMet) : (sessMet && hrsMet)) && weekendMet;
      
      if (isMet) weeksMetCount++;
    }
  }

  const annualTargetHours = Math.round(targetHrs * swimmableWeeks);
  const totalActualHours = totalTrainingHours + totalGalaHours;

  return {
    percentage: swimmableWeeks > 0 ? Math.min(100, Math.round((weeksMetCount / swimmableWeeks) * 100)) : 100,
    weeksMet: weeksMetCount,
    totalWeeks: swimmableWeeks,
    totalTrainingHours: Math.round(totalTrainingHours * 10) / 10,
    totalGalaHours: Math.round(totalGalaHours * 10) / 10,
    totalHours: Math.round(totalActualHours * 10) / 10,
    annualTarget: annualTargetHours,
    volumePct: annualTargetHours > 0 ? Math.min(100, Math.round((totalActualHours / annualTargetHours) * 100)) : 0
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
    workloadText += `Note the ${gap}% 'Reliability-Volume Gap'; attendance frequency is high, but total hours per week are lagging behind squad targets.`;
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
  parts.push({ category: 'meets', type: meetType, text: meetText });

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
    recText = "Priority: Attendance Consistency. Without consistent stimulus, technical changes will not stabilize.";
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
  const weeksMetPct = Math.round((stats.weeksMet / (stats.totalWeeks || 1)) * 100);
  const workloadStatus = weeksMetPct >= 75 ? 'success' : (weeksMetPct >= 50 ? 'warning' : 'danger');
  
  parts.push({
    category: 'workload',
    type: workloadStatus,
    text: `Training Consistency: You have met the squad criteria in ${stats.weeksMet} out of ${stats.totalWeeks} swimmable weeks (${weeksMetPct}%). The club expectation is 75%+. In terms of pure volume, you have completed ${Math.round(stats.totalActualHours)}h out of a target ${stats.annualTargetHours}h. This ${Math.round(hourGap)}h deficit (approx. ${missedSessions} missed sessions) directly impacts your aerobic ceiling.`
  });

  // 3. MEETS (Factual Engagement)
  const meetGap = Math.max(0, stats.targetMeets - stats.meetsAttended);
  const meetStatus = stats.meetsMet ? 'success' : 'warning';
  
  parts.push({ 
    category: 'meets', 
    type: meetStatus, 
    text: `Meet Engagement: You have attended ${stats.meetsAttended} Open Meets out of a seasonal target of ${stats.targetMeets}. ${stats.meetsMet ? 'Excellent competitive engagement.' : `There is a gap of ${meetGap} meets relative to squad targets; increasing racing frequency is essential for technical progression.`}`
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
    coachText = "Reliability Constraint: Performance volatility is linked to inconsistent training stimulus. Increasing attendance to 75%+ is the priority.";
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
export function calculateSquadHealth(stats, config = {}) {
  const wReliability = config.health_weight_reliability ?? 20;
  const wProgress = config.health_weight_progress ?? 30;
  const wCompetition = config.health_weight_competition ?? 40;
  const wVolume = config.health_weight_volume ?? 10;

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
      { label: 'Reliability', score: trainingScore, weight: `${wReliability}%`, desc: 'Consistency vs targets' },
      { label: 'Progress', score: velocityScore, weight: `${wProgress}%`, desc: 'Points momentum' },
      { label: 'Competition', score: complianceScore, weight: `${wCompetition}%`, desc: 'Meets & status' },
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
