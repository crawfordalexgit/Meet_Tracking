import { getServiceSupabase } from '../../lib/supabase';
import { calculateReliability } from '../../lib/analytics-utils';
import { requireAuth } from '../../lib/api-auth';
import { fetchAllRows } from '../../lib/paginate';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await requireAuth(req, res)) return;

  // Support both GET (defaults) and POST
  const body = req.method === 'POST' ? req.body : req.query;
  const { squadId, period = 365, startDate, endDate } = body;

  try {
    const supabase = getServiceSupabase();

    // 1. Fetch all static baseline tables in parallel.
    // Uses the shared paginator: the two hand-rolled loops this file used called
    // .range() with NO .order(), so Postgres was free to return rows in a
    // different sequence per page and silently duplicate or drop rows across
    // page boundaries. They also swallowed errors and returned partial arrays.
    const fetchStatic = (table, select = '*', filter = null) =>
      fetchAllRows(supabase, table, { select, filter, maxPages: 20 });

    const [squads, sessions, exemptionsRes, benchmarksRes] = await Promise.all([
      fetchStatic('squads', '*', q => q.eq('is_squad', true).order('name')),
      fetchStatic('sessions', '*'),
      supabase.from('club_exemptions').select('*'),
      supabase.from('benchmarks').select('*').order('category')
    ]);

    const exemptions = exemptionsRes.data || [];
    const benchmarks = benchmarksRes.data || [];

    // 2. Fetch Swimmers (optionally filtered by squad)
    let swimmersQuery = supabase.from('swimmers').select('*, squads(*)');
    if (squadId && squadId !== 'all') {
      swimmersQuery = swimmersQuery.eq('squad_id', squadId);
    }
    const { data: swimmers, error: swimmersError } = await swimmersQuery;
    if (swimmersError) throw swimmersError;

    if (!swimmers || swimmers.length === 0) {
      return res.status(200).json({
        squads,
        swimmersData: [],
        cohorts: { highEfficiency: [], lowEfficiency: [], overTraining: [], underTraining: [] },
        onTheCusp: [],
        benchmarksSummary: { countyCount: 0, regionalCount: 0, nationalCount: 0, total: 0 },
        meetTemperament: { avgL1Points: 0, avgL3Points: 0, temperamentNote: 'No data' }
      });
    }

    const swimmerIds = swimmers.map(s => s.id);

    // 3. Fetch training attendance, results, memberships, and rankings in bulk
    const fetchAll = (table, select = '*', filter = null) =>
      fetchAllRows(supabase, table, { select, filter, maxPages: 50 });

    // Calculate dates based on selectors or period
    const now = new Date();
    // Validated: an unparseable startDate/period produced an Invalid Date whose
    // .toISOString() throws RangeError, surfacing bad input as a 500.
    let startTime;
    if (startDate) {
      startTime = new Date(startDate);
      if (isNaN(startTime.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate' });
      }
    } else {
      const periodDaysParam = parseInt(period, 10);
      if (period != null && !Number.isFinite(periodDaysParam)) {
        return res.status(400).json({ error: 'Invalid period' });
      }
      startTime = new Date(now.getTime() - ((periodDaysParam || 365) * 24 * 60 * 60 * 1000));
    }

    let endTime = endDate ? new Date(endDate) : now;
    if (isNaN(endTime.getTime())) {
      return res.status(400).json({ error: 'Invalid endDate' });
    }
    const periodDays = Math.max(7, Math.round((endTime - startTime) / (24 * 60 * 60 * 1000)));

    const startStr = startTime.toISOString().split('T')[0];
    const endStr = endTime.toISOString().split('T')[0];

    console.log(`API: Fetching report details for ${swimmers.length} athletes. Period days: ${periodDays}. Start: ${startStr}, End: ${endStr}`);

    // Only the most recent rankings snapshot is ever used below, so find that
    // date first instead of pulling every swimmer's entire rankings history —
    // fetching all of it for 300+ swimmer_ids with no date bound is what was
    // causing this endpoint to hit the DB statement timeout.
    const { data: latestSnapshotRow } = await supabase
      .from('rankings')
      .select('snapshot_date')
      .in('swimmer_id', swimmerIds)
      .order('snapshot_date', { ascending: false })
      .limit(1);
    const latestSnapshot = latestSnapshotRow?.[0]?.snapshot_date || null;

    const [attendanceRes, resultsRes, membershipsRes, rankingsRes] = await Promise.all([
      fetchAll('training_attendance', '*', q => q.in('swimmer_id', swimmerIds).gte('date', startStr).lte('date', endStr)),
      fetchAll('results', '*, meets(*)', q => q.in('swimmer_id', swimmerIds).gte('date', startStr).lte('date', endStr)),
      fetchAll('session_memberships', '*', q => q.in('swimmer_id', swimmerIds)),
      latestSnapshot
        ? fetchAll('rankings', '*', q => q.in('swimmer_id', swimmerIds).eq('snapshot_date', latestSnapshot))
        : Promise.resolve([])
    ]);

    const attendance = attendanceRes || [];
    const results = resultsRes || [];
    const memberships = membershipsRes || [];
    const currentRankings = rankingsRes || [];

    // Group attendance and results by swimmer_id for fast lookup
    const attBySwimmer = {};
    attendance.forEach(a => {
      if (!attBySwimmer[a.swimmer_id]) attBySwimmer[a.swimmer_id] = [];
      attBySwimmer[a.swimmer_id].push(a);
    });

    const resBySwimmer = {};
    results.forEach(r => {
      if (!resBySwimmer[r.swimmer_id]) resBySwimmer[r.swimmer_id] = [];
      resBySwimmer[r.swimmer_id].push(r);
    });

    const membershipsBySwimmer = {};
    memberships.forEach(m => {
      if (!membershipsBySwimmer[m.swimmer_id]) membershipsBySwimmer[m.swimmer_id] = [];
      membershipsBySwimmer[m.swimmer_id].push(m);
    });

    const rankingsBySwimmer = {};
    currentRankings.forEach(r => {
      if (!rankingsBySwimmer[r.swimmer_id]) rankingsBySwimmer[r.swimmer_id] = [];
      rankingsBySwimmer[r.swimmer_id].push(r);
    });

    // Helper to map event names to stroke groups
    function getEventGroup(eventStr) {
      const ev = (eventStr || "").toLowerCase();
      if (ev.includes("free") || ev.includes("fr")) return "Freestyle";
      if (ev.includes("breast") || ev.includes("br")) return "Breaststroke";
      if (ev.includes("back") || ev.includes("bk")) return "Backstroke";
      if (ev.includes("fly") || ev.includes("fl") || ev.includes("butterfly")) return "Butterfly";
      if (ev.includes("medley") || ev.includes("im")) return "Medley";
      return "Freestyle";
    }

    // 4. Calculate swimmer metrics
    const swimmersData = swimmers.map(sw => {
      const swAtt = attBySwimmer[sw.id] || [];
      const swRes = resBySwimmer[sw.id] || [];
      const swMem = membershipsBySwimmer[sw.id] || [];
      const swRankings = rankingsBySwimmer[sw.id] || [];

      // Calculate age
      let age = null;
      if (sw.year_of_birth) {
        age = now.getFullYear() - sw.year_of_birth;
      }

      // Calculate attendance parameters
      const rel = calculateReliability(sw, swAtt, sessions, swRes, periodDays, exemptions, swMem);

      // Group results by event group to identify primary discipline in period
      const strokeGroups = { Freestyle: [], Backstroke: [], Breaststroke: [], Butterfly: [], Medley: [] };
      swRes.forEach(r => {
        const stroke = getEventGroup(r.event);
        strokeGroups[stroke].push(r);
      });

      // Primary group is where the highest WA standard was achieved
      let primaryGroup = "Freestyle";
      let maxWaInPeriod = -1;
      Object.keys(strokeGroups).forEach(stroke => {
        const peakInStroke = strokeGroups[stroke].length ? Math.max(...strokeGroups[stroke].map(r => r.wa_pts || 0)) : -1;
        if (peakInStroke > maxWaInPeriod) {
          maxWaInPeriod = peakInStroke;
          primaryGroup = stroke;
        }
      });

      const primaryResults = strokeGroups[primaryGroup] || [];

      // Performance stats within primary event group
      const peakPoints = primaryResults.length ? Math.max(...primaryResults.map(r => r.wa_pts || 0)) : 0;
      const avgPoints = primaryResults.length ? Math.round(primaryResults.reduce((a, b) => a + (b.wa_pts || 0), 0) / primaryResults.length) : 0;
      const pbCount = primaryResults.filter(r => r.is_pb).length;

      // TEI (Performance Efficiency): Peak WA Points in primary group / rolling hours
      const efficiency = rel.totalHours > 0 ? parseFloat((peakPoints / rel.totalHours).toFixed(2)) : 0;

      // TEI-Δ (Improvement Efficiency): delta WA points in primary group / rolling hours
      let startPoints = 0;
      let endPoints = 0;
      let deltaWA = 0;
      let teiDelta = 0;

      if (primaryResults.length > 0) {
        // Sort chronologically
        const sortedRes = [...primaryResults].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Earliest meet weekend (within 3 days for single gala weekend)
        const firstDateStr = sortedRes[0].date;
        const startMeetResults = sortedRes.filter(r => 
          Math.abs((new Date(r.date) - new Date(firstDateStr)) / (1000 * 60 * 60 * 24)) <= 3
        );
        startPoints = Math.max(...startMeetResults.map(r => r.wa_pts || 0));

        // Latest meet weekend (within 3 days for single gala weekend)
        const lastDateStr = sortedRes[sortedRes.length - 1].date;
        const endMeetResults = sortedRes.filter(r => 
          Math.abs((new Date(r.date) - new Date(lastDateStr)) / (1000 * 60 * 60 * 24)) <= 3
        );
        endPoints = Math.max(...endMeetResults.map(r => r.wa_pts || 0));

        deltaWA = endPoints - startPoints;
        teiDelta = rel.totalHours > 0 ? parseFloat((deltaWA / rel.totalHours).toFixed(3)) : 0;
      }

      // Calculate name Normalization & Preferred Name
      let preferredName = sw.full_name;
      if (sw.known_as) {
        let lastName = "";
        if (sw.full_name.includes(',')) {
          lastName = sw.full_name.split(',')[0].trim();
        } else {
          const parts = sw.full_name.trim().split(/\s+/);
          lastName = parts[parts.length - 1];
        }
        preferredName = `${sw.known_as} ${lastName}`;
      }

      // Calculate velocity (difference between first and second half averages)
      let velocity = 0;
      if (swRes.length >= 2) {
        const sorted = [...swRes].sort((a, b) => new Date(a.date) - new Date(b.date));
        const midIdx = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, midIdx);
        const secondHalf = sorted.slice(midIdx);
        const firstAvg = firstHalf.reduce((a, b) => a + (b.wa_pts || 0), 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + (b.wa_pts || 0), 0) / secondHalf.length;
        velocity = Math.round(secondAvg - firstAvg);
      }

      return {
        id: sw.id,
        full_name: sw.full_name,
        preferred_name: preferredName,
        squad_id: sw.squad_id,
        squad_name: sw.squads?.name || 'Unassigned',
        gender: sw.gender,
        age,
        trainingPct: rel.percentage,
        volumePct: rel.volumePct,
        totalHours: rel.totalHours,
        meetCount: rel.meetsAttended,
        targetMeets: rel.targetMeets,
        complianceRate: rel.complianceRate,
        peakPoints,
        avgPoints,
        pbCount,
        // The real number of swims in the period. The reports page used to
        // invent this as `pbCount + round(totalHours / 12)` and present the
        // resulting ratio as a measured "PB Conversion Rate".
        raceCount: swRes.length,
        efficiency, // TEI Performance Efficiency
        teiDelta, // TEI-Δ Improvement Efficiency
        deltaWA,
        startPoints,
        endPoints,
        primaryGroup,
        velocity,
        rankings: swRankings,
        isMet: rel.complianceRate >= 100 && (rel.percentage >= (sw.squads?.target_training_percent || 75) || rel.volumePct >= (sw.squads?.target_training_percent || 75)),
        isExempt: sw.is_exempt,
        year_of_birth: sw.year_of_birth
      };
    });

    // 5. Compute Cohorts dynamically based on sample averages
    const activeSwimmers = swimmersData.filter(sw => !sw.isExempt);
    const avgTrainingHours = activeSwimmers.reduce((a, b) => a + b.totalHours, 0) / activeSwimmers.length || 1;
    const avgWA = activeSwimmers.reduce((a, b) => a + b.peakPoints, 0) / activeSwimmers.length || 1;

    // Squad averages for dual TEI metrics
    const avgTEI = activeSwimmers.reduce((a, b) => a + b.efficiency, 0) / activeSwimmers.length || 2.0;
    const avgTEIDelta = activeSwimmers.reduce((a, b) => a + b.teiDelta, 0) / activeSwimmers.length || 0.0;

    const cohorts = {
      // Legacy Cohorts
      highEfficiency: [],
      lowEfficiency: [],
      overTraining: [],
      underTraining: [],
      // New 4-Quadrant System Cohorts
      eliteResponders: [],
      stableElites: [],
      developingResponders: [],
      lowResponders: []
    };

    swimmersData.forEach(sw => {
      if (sw.isExempt) return;

      const isHighWA = sw.peakPoints >= avgWA;
      const isHighHours = sw.totalHours >= avgTrainingHours;

      if (isHighWA && !isHighHours) {
        cohorts.highEfficiency.push(sw);
      } else if (!isHighWA && isHighHours) {
        cohorts.lowEfficiency.push(sw);
      }

      // Over training risk: High hours, but velocity flat or declining
      if (sw.totalHours > avgTrainingHours * 1.25 && sw.velocity <= 2) {
        cohorts.overTraining.push(sw);
      }

      // Under training: Low hours and low WA points
      if (sw.totalHours < avgTrainingHours * 0.45 && sw.peakPoints < avgWA) {
        cohorts.underTraining.push(sw);
      }

      // Four-Quadrant classification mapping (using avgTEI as performance axis and 0.0 as improvement axis)
      const hasHighTEI = sw.efficiency >= avgTEI;
      const hasHighTEIDelta = sw.teiDelta > 0.0;

      if (hasHighTEI && hasHighTEIDelta) {
        cohorts.eliteResponders.push(sw);
      } else if (hasHighTEI && !hasHighTEIDelta) {
        cohorts.stableElites.push(sw);
      } else if (!hasHighTEI && hasHighTEIDelta) {
        cohorts.developingResponders.push(sw);
      } else {
        cohorts.lowResponders.push(sw);
      }
    });

    // 6. Championship Pathway Gap Analysis ("On the cusp" calculation)
    const onTheCusp = [];
    const benchmarksMap = {};
    benchmarks.forEach(b => {
      const key = `${b.category}_${b.gender}_${b.age_group}_${b.event?.toLowerCase()}_${b.course}`;
      benchmarksMap[key] = b;
    });

    let countyQCount = 0;
    let regionalQCount = 0;
    let nationalQCount = 0;

    swimmersData.forEach(sw => {
      const swRes = resBySwimmer[sw.id] || [];
      if (swRes.length === 0 || !sw.age || !sw.gender) return;

      const genderKey = sw.gender === 'F' ? 'Female' : 'Male';
      
      // Keep track of what they qualified for
      let isCountyQ = false;
      let isRegionalQ = false;
      let isNationalQ = false;

      // Group their results by event to find PBs
      const eventBestTimes = {};
      swRes.forEach(r => {
        const course = r.course || 'SC';
        const key = `${r.event}_${course}`;
        const timeSec = parseTimeToSeconds(r.time);
        if (timeSec === null) return; // unparseable — cannot be compared to a standard
        if (!eventBestTimes[key] || timeSec < eventBestTimes[key].seconds) {
          eventBestTimes[key] = { event: r.event, course, seconds: timeSec, timeStr: r.time, date: r.date };
        }
      });

      // Compare best times against county, regional, national standards
      Object.values(eventBestTimes).forEach(best => {
        ['COUNTY', 'REGIONAL', 'NATIONAL'].forEach(cat => {
          const bKey = `${cat}_${genderKey}_${sw.age}_${best.event?.toLowerCase()}_${best.course}`;
          const benchmark = benchmarksMap[bKey];

          if (benchmark) {
            const gapSeconds = best.seconds - benchmark.time_seconds;
            const diffPct = (best.seconds / benchmark.time_seconds) - 1;

            if (gapSeconds <= 0) {
              if (cat === 'COUNTY') isCountyQ = true;
              if (cat === 'REGIONAL') isRegionalQ = true;
              if (cat === 'NATIONAL') isNationalQ = true;
            } else if (diffPct <= 0.018) {
              // Cusp: within 1.8% of the standard
              onTheCusp.push({
                swimmerId: sw.id,
                swimmerName: sw.preferred_name,
                squadName: sw.squad_name,
                age: sw.age,
                event: best.event,
                course: best.course,
                time: best.timeStr,
                targetStandard: cat,
                targetTime: benchmark.time_standard,
                gapSeconds: parseFloat(gapSeconds.toFixed(2)),
                diffPct: parseFloat((diffPct * 100).toFixed(2))
              });
            }
          }
        });
      });

      if (isCountyQ) countyQCount++;
      if (isRegionalQ) regionalQCount++;
      if (isNationalQ) nationalQCount++;
    });

    const benchmarksSummary = {
      countyCount: countyQCount,
      regionalCount: regionalQCount,
      nationalCount: nationalQCount,
      total: swimmersData.length
    };

    // 7. Meet Temperament (Level 1 vs Level 3 analysis)
    let totalL1Points = 0;
    let l1Count = 0;
    let totalL3Points = 0;
    let l3Count = 0;

    results.forEach(r => {
      const isL1 = r.meets?.license?.startsWith('1') || r.meets?.license?.startsWith('2');
      if (isL1) {
        totalL1Points += r.wa_pts || 0;
        l1Count++;
      } else {
        totalL3Points += r.wa_pts || 0;
        l3Count++;
      }
    });

    const avgL1Points = l1Count > 0 ? Math.round(totalL1Points / l1Count) : 0;
    const avgL3Points = l3Count > 0 ? Math.round(totalL3Points / l3Count) : 0;

    let temperamentNote = 'Insufficient competitive exposure for cross-gala audit.';
    if (l1Count >= 3 && l3Count >= 3) {
      const delta = avgL1Points - avgL3Points;
      if (delta > 30) {
        temperamentNote = `Squad performs exceptionally well under high stakes (Avg L1 is ${delta} points higher than L3 matches). Highlights competitive resilience.`;
      } else if (delta < -30) {
        temperamentNote = `Performance compression observed in Championship level events (Avg L1 is ${Math.abs(delta)} points below L3 baseline). Suggests performance anxiety or technical tapering gaps.`;
      } else {
        temperamentNote = `Highly stable competitive temperament across all meet classifications. Technical stability remains constant.`;
      }
    }

    // Scan Reports directory for saved PDFs
    const reportsDir = path.join(process.cwd(), 'Reports');
    let savedReports = [];
    if (fs.existsSync(reportsDir)) {
      try {
        const files = fs.readdirSync(reportsDir);
        savedReports = files
          .filter(f => f.toLowerCase().endsWith('.pdf'))
          .map(f => {
            const stats = fs.statSync(path.join(reportsDir, f));
            return {
              fileName: f,
              createdAt: stats.mtime.toISOString(),
              sizeBytes: stats.size
            };
          })
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } catch (err) {
        console.error('Error reading Reports directory:', err);
      }
    }

    return res.status(200).json({
      success: true,
      squads,
      swimmersData,
      cohorts,
      avgTEI: parseFloat(avgTEI.toFixed(2)),
      avgTEIDelta: parseFloat(avgTEIDelta.toFixed(3)),
      onTheCusp: onTheCusp.sort((a, b) => a.diffPct - b.diffPct).slice(0, 15), // Top 15 closest gap targets
      benchmarksSummary,
      meetTemperament: {
        avgL1Points,
        avgL3Points,
        temperamentNote
      },
      savedReports
    });
  } catch (error) {
    console.error('API Reports Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// Returns null — NOT 0 — for missing or unparseable times. A 0 here beats every
// benchmark, so every swimmer with a bad time was counted as having achieved
// County, Regional AND National standards.
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  const seconds = parts.length === 2
    ? parseFloat(parts[0]) * 60 + parseFloat(parts[1])
    : parseFloat(parts[0]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
