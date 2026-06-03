import { getServiceSupabase } from '../../lib/supabase';
import { calculateReliability } from '../../lib/analytics-utils';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Support both GET (defaults) and POST
  const body = req.method === 'POST' ? req.body : req.query;
  const { squadId, period = 365, startDate, endDate } = body;

  try {
    const supabase = getServiceSupabase();

    // 1. Fetch all static baseline tables in parallel
    const [squadsRes, sessionsRes, exemptionsRes, benchmarksRes] = await Promise.all([
      supabase.from('squads').select('*').eq('is_squad', true).order('name'),
      supabase.from('sessions').select('*').limit(1000),
      supabase.from('club_exemptions').select('*'),
      supabase.from('benchmarks').select('*').order('category')
    ]);

    const squads = squadsRes.data || [];
    const sessions = sessionsRes.data || [];
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
    const fetchAll = async (table, select = '*', filter = null) => {
      let allData = [];
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
        if (filter) q = filter(q);
        const { data, error } = await q;
        if (error) throw error;
        allData = [...allData, ...data];
        if (data.length < 1000) hasMore = false;
        else page++;
        if (page > 50) break;
      }
      return allData;
    };

    // Calculate dates based on selectors or period
    const now = new Date();
    let startTime;
    if (startDate) {
      startTime = new Date(startDate);
    } else {
      startTime = new Date(now.getTime() - (parseInt(period) * 24 * 60 * 60 * 1000));
    }
    
    let endTime = endDate ? new Date(endDate) : now;
    const periodDays = Math.max(7, Math.round((endTime - startTime) / (24 * 60 * 60 * 1000)));

    const startStr = startTime.toISOString().split('T')[0];
    const endStr = endTime.toISOString().split('T')[0];

    console.log(`API: Fetching report details for ${swimmers.length} athletes. Period days: ${periodDays}. Start: ${startStr}, End: ${endStr}`);

    const [attendanceRes, resultsRes, membershipsRes, rankingsRes] = await Promise.all([
      fetchAll('training_attendance', '*', q => q.in('swimmer_id', swimmerIds).gte('date', startStr).lte('date', endStr)),
      fetchAll('results', '*, meets(*)', q => q.in('swimmer_id', swimmerIds).gte('date', startStr).lte('date', endStr)),
      supabase.from('session_memberships').select('*').in('swimmer_id', swimmerIds),
      fetchAll('rankings', '*', q => q.in('swimmer_id', swimmerIds).order('snapshot_date', { ascending: false }))
    ]);

    const attendance = attendanceRes || [];
    const results = resultsRes || [];
    const memberships = membershipsRes.data || [];
    const rankings = rankingsRes || [];

    // Get latest snapshot for Swim England rankings
    const uniqueSnapshots = [...new Set(rankings.map(r => r.snapshot_date))].sort((a, b) => new Date(b) - new Date(a));
    const latestSnapshot = uniqueSnapshots[0] || null;
    const currentRankings = rankings.filter(r => r.snapshot_date === latestSnapshot);

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
        efficiency, // TEI Performance Efficiency
        teiDelta, // TEI-Δ Improvement Efficiency
        deltaWA,
        startPoints,
        endPoints,
        primaryGroup,
        velocity,
        rankings: swRankings,
        isMet: rel.complianceRate >= 100 && (rel.percentage >= (sw.squads?.target_training_percent || 75) || rel.volumePct >= (sw.squads?.target_training_percent || 75)),
        isExempt: sw.is_exempt
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

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(parts[0]);
}
