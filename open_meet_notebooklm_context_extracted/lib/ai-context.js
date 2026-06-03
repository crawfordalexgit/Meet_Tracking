import { calculateReliability, calculateWorkload, getPreferredName } from './analytics-utils';
import { getServiceSupabase } from './supabase';

import { getLTADStage } from './ltad-benchmarks';
import { getUnifiedLTADStage } from './ai-training-data';

/**
 * Generates a "Swimmer DNA" packet for AI analysis.
 * Now includes advanced technical metrics like drop-off ratios and meet temperament.
 * AND Pathway Benchmarks (County/Regional gap analysis).
 */
export async function getSwimmerDNA(swimmer, results, attendance, sessions, feedback = [], performance_slope = 0, period = 365) {
  const now = new Date();
  const startTime = now.getTime() - (period * 24 * 60 * 60 * 1000);
  const periodResults = results.filter(r => new Date(r.date).getTime() >= startTime);


  // 0. Calculate Age and Fetch Benchmarks
  const compAge = swimmer.year_of_birth ? (new Date().getFullYear() - swimmer.year_of_birth) : null;
  const serviceSupabase = getServiceSupabase();
  
  const [benchmarksRes, membershipsRes, exemptionsRes, rankingsRes] = await Promise.all([
    compAge ? serviceSupabase.from('benchmarks').select('*').eq('gender', swimmer.gender).eq('age_group', compAge).eq('year', new Date().getFullYear()) : { data: [] },
    serviceSupabase.from('session_memberships').select('*').eq('swimmer_id', swimmer.id),
    serviceSupabase.from('club_exemptions').select('*'),
    serviceSupabase.from('rankings').select('*').eq('swimmer_id', swimmer.id).order('snapshot_date', { ascending: false })
  ]);


  const benchmarks = benchmarksRes.data || [];
  const memberships = membershipsRes.data || [];
  const exemptions = exemptionsRes.data || [];
  const allRankings = rankingsRes.data || [];
  
  // Get latest snapshot for current rankings
  const latestSnapshot = allRankings.length ? allRankings[0].snapshot_date : null;
  const currentRankings = allRankings.filter(r => r.snapshot_date === latestSnapshot);

  // 1. Process Training Data
  const reliability = calculateReliability(swimmer, attendance, sessions, results, period, exemptions, memberships);

  const workload = calculateWorkload(attendance, sessions, results, swimmer.id, exemptions, swimmer.squad_id);

  // 2. Process Performance Data
  const sortedResults = [...periodResults]
    .filter(r => r.swimmer_id === swimmer.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));


  // Calculate Versatility (Strokes & Distances)
  const uniqueStrokes = new Set();
  const uniqueDistances = new Set();
  sortedResults.forEach(r => {
    const evt = r.event?.toLowerCase() || '';
    if (evt.includes('free')) uniqueStrokes.add('Freestyle');
    else if (evt.includes('back')) uniqueStrokes.add('Backstroke');
    else if (evt.includes('breast')) uniqueStrokes.add('Breaststroke');
    else if (evt.includes('fly')) uniqueStrokes.add('Butterfly');
    else if (evt.includes('medley') || evt.includes('im')) uniqueStrokes.add('IM');
    
    const distMatch = evt.match(/(\d+)m/);
    if (distMatch) uniqueDistances.add(distMatch[1]);
  });

  const ltadStage = getLTADStage(compAge);

  const peakWA = periodResults.length ? Math.max(...periodResults.map(r => r.wa_pts || 0)) : 0;


  // 3. Current PBs Summary (To prevent outdated targets)
  const currentPBs = {};
  sortedResults.forEach(r => {
    const course = r.course || (isLongCourse(r) ? 'LC' : 'SC');
    const key = `${r.event}_${course}`;
    const timeSec = parseTimeToSeconds(r.time);
    
    if (!currentPBs[key] || timeSec < parseTimeToSeconds(currentPBs[key].time)) {
      // Find relevant benchmark
      const b = (benchmarks || []).find(bt => bt.event === r.event && bt.course === course);
      const gap = b ? (timeSec - b.time_seconds).toFixed(2) : null;
      const gap_pct = b ? ((timeSec / b.time_seconds - 1) * 100).toFixed(1) : null;

      currentPBs[key] = { 
        time: r.time, 
        date: r.date, 
        wa: r.wa_pts, 
        splits: r.splits,
        pathway_gap: b ? {
          category: b.category,
          target: b.time_standard,
          diff_seconds: gap,
          diff_pct: gap_pct,
          status: parseFloat(gap) <= 0 ? 'QUALIFIED' : 'CHASING'
        } : null
      };
    }
  });

  // 4. Technical Metrics: Meet Temperament (L1 vs L3)
  const l1Meets = sortedResults.filter(r => isLevel1(r));
  const l3Meets = sortedResults.filter(r => !isLevel1(r));
  
  const meetTemperament = {
    l1_avg_wa: l1Meets.length ? Math.round(l1Meets.reduce((a, b) => a + b.wa_pts, 0) / l1Meets.length) : null,
    l3_avg_wa: l3Meets.length ? Math.round(l3Meets.reduce((a, b) => a + b.wa_pts, 0) / l3Meets.length) : null,
  };

  // 5. Technical Metrics: Drop-off Ratios
  const primaryStrokes = ['Freestyle', 'Breaststroke', 'Backstroke', 'Butterfly'];
  const ratios = {};

  primaryStrokes.forEach(stroke => {
    ['LC', 'SC'].forEach(course => {
      const fifty = sortedResults.find(r => r.event === `50m ${stroke}` && (isLongCourse(r) ? 'LC' : 'SC') === course);
      const hundred = sortedResults.find(r => r.event === `100m ${stroke}` && (isLongCourse(r) ? 'LC' : 'SC') === course);
      if (fifty && hundred) {
        const fiftySec = parseTimeToSeconds(fifty.time);
        const hundredSec = parseTimeToSeconds(hundred.time);
        ratios[`${stroke}_50_100_${course}`] = (hundredSec / (fiftySec * 2)).toFixed(3);
      }
    });
  });

  // 6. Construct DNA
  return {
    bio: {
      name: getPreferredName(swimmer),
      squad: swimmer.squads?.name,
      age: swimmer.year_of_birth ? (new Date().getFullYear() - swimmer.year_of_birth) : 'Unknown',
      current_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      pathway_level: peakWA > 400 ? 'Regional' : (peakWA > 280 ? 'County' : 'Development'),
      performance_momentum: performance_slope > 1.0 ? 'Strong Acceleration' : (performance_slope < -0.5 ? 'Deceleration' : 'Stable'),
      momentum_slope: performance_slope
    },
    pathway_gap_analysis: compAge ? (() => {
      const unifiedStage = getUnifiedLTADStage(compAge);
      const squadTarget = swimmer.squads?.target_hours_per_week || 0;
      const recommendedMin = unifiedStage.poolHours.min;
      const discrepancy = squadTarget - recommendedMin;

      return {
        scientific_stage: unifiedStage.name,
        scientific_recommendation: `${unifiedStage.poolHours.min}-${unifiedStage.poolHours.max} pool hours`,
        scientific_focus: unifiedStage.focus,
        current_squad_target: `${squadTarget} hours`,
        gap_magnitude: discrepancy.toFixed(1),
        is_under_recommended: discrepancy < -1, // More than 1 hour under
        is_over_recommended: discrepancy > 2,   // More than 2 hours over
        status: discrepancy < -1 ? 'UNDER_VOLUME' : (discrepancy > 2 ? 'OVER_VOLUME' : 'ALIGNED')
      };
    })() : null,
    development: {
      stage: ltadStage.name,
      stage_focus: ltadStage.focus,
      stage_description: ltadStage.description,
      technical_priorities: ltadStage.technicalPriorities,
      target_hours: `${ltadStage.minHours}-${ltadStage.maxHours}`,
      versatility: {
        strokes_raced: Array.from(uniqueStrokes),
        unique_stroke_count: uniqueStrokes.size,
        distance_count: uniqueDistances.size,
        score: Math.min(100, Math.round((uniqueStrokes.size / 5) * 60 + (uniqueDistances.size / 6) * 40))
      }
    },
    current_pbs: currentPBs,
    training: {
      analysis_period: period,
      consistency_pct: reliability.percentage,
      volume_pct: reliability.volumePct,

      recent_workload_last_4_weeks: Object.entries(workload)
        .sort((a, b) => new Date(b[0]) - new Date(a[0])) // Newest first
        .slice(0, 4)
        .map(([date, data]) => ({ date, hours: data.trainingHours }))
    },
    rankings: currentRankings.map(r => ({
      district: r.district,
      event: r.stroke,
      pool: r.pool,
      age: r.age,
      rank: r.rank,
      time: r.time,
      fina: r.fina_points
    })),
    technical: {
      peak_wa: peakWA,
      meet_temperament: meetTemperament,
      drop_off_ratios: ratios
    },
    historical_context: feedback.map(f => ({
      date: f.created_at,
      type: f.is_correction ? 'COACH_CORRECTION' : 'HISTORICAL_INSIGHT',
      content: f.is_correction ? f.correction_text : (f.full_report?.headline + ": " + f.full_report?.foresight)
    })),
    history: sortedResults.slice(-15).map(r => {
      const distance = parseInt(r.event);
      const seconds = parseTimeToSeconds(r.time);
      const meetCourse = r.course || r.meets?.course || (isLongCourse(r) ? 'LC' : 'SC');
      const meetLevel = r.meets?.level || (isLevel1(r) ? 'L1' : 'L3');
      
      return {
        date: r.date,
        event: r.event,
        course: meetCourse,
        level: meetLevel,
        wa: r.wa_pts,
        velocity_ms: seconds > 0 ? (distance / seconds).toFixed(3) : 0,
        meet: r.meets?.name,
        is_pb: r.is_pb
      };
    })
  };
}

export async function getSquadDNA(squadName, stats, strokeData, recentTrend, swimmers = []) {
  return {
    metadata: {
      squad_name: squadName,
      athlete_count: stats.athletes,
      avg_age: stats.avgAge,
      timestamp: new Date().toISOString()
    },
    squad_metrics: {
      avg_consistency_pct: stats.avgTraining,
      avg_volume_pct: stats.avgVolume,
      compliance_rate: stats.complianceRate,
      avg_velocity: stats.avgVelocity
    },
    performance_benchmarks: {
      peak_standard_wa: stats.peakStandard,
      stroke_distribution: strokeData,
      achievement_summary: {
        national_qualifiers: (swimmers || []).filter(s => s.rankings?.some(r => r.district === 'England')).length,
        regional_qualifiers: (swimmers || []).filter(s => s.rankings?.some(r => r.district === 'South East')).length,
        county_qualifiers: (swimmers || []).filter(s => s.rankings?.some(r => r.district === 'Kent')).length
      }
    },
    performance_trend: recentTrend.slice(-12), // Last 12 months/periods
    swimmer_summary: (swimmers || []).map(s => ({
      name: getPreferredName(s),
      gender: s.gender,
      age: s.year_of_birth ? (new Date().getFullYear() - s.year_of_birth) : '?',
      consistency: s.trainingPct,
      peak_wa: s.peakWA,
      velocity: s.velocity,
      is_met: s.isMet,
      top_rank: (s.rankings || []).sort((a,b) => a.rank - b.rank)[0] || null
    })),
    analysis_context: {
      focus: "Macro-level technical progression and squad health constraints. Identify individuals with high potential."
    }
  };
}

function isLongCourse(r) {
  const meetName = r.meets?.name?.toLowerCase() || '';
  const license = r.meets?.license || '';
  return meetName.includes('lc') || meetName.includes('long course') || license.startsWith('1');
}

function isLevel1(r) {
  const license = r.meets?.license || '';
  return license.startsWith('1') || license.startsWith('2');
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(parts[0]);
}
