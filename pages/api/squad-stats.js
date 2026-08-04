import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';
import { computeSquadStats, calculateSquadHealth } from '../../lib/analytics-utils';

async function fetchAll(client, table, select = '*', filter = null) {
  const pageSize = 1000;
  let all = [];
  let page = 0;
  while (page < 100) {
    // .order('id') keeps .range() page boundaries stable — without it Postgres
    // can duplicate/drop rows across pages under concurrent load.
    let q = client.from(table).select(select).order('id').range(page * pageSize, (page + 1) * pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}

/**
 * Server-side squad KPI aggregation for the squad registry (pages/squads.js).
 * Computes the same numbers as computing client-side (shared computeSquadStats),
 * but does the 21K-attendance / 5K-results fetch + crunch on the server instead
 * of shipping every row to the browser. Pre-groups attendance/results by
 * swimmer_id so each squad's computeSquadStats call only scans that squad's
 * own rows, not the whole club's.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireAuth(req, res)) return;

  const period = parseInt(req.query.period) || 365;

  try {
    const supabase = getServiceSupabase();

    // Only the newest rankings snapshot is used below. Resolve it first so the
    // fetch can be scoped and paginated: an unpaginated club-wide select hits
    // PostgREST's 1000-row cap, and rows are inserted Kent -> South East ->
    // England, so the regional and national counts silently read as zero.
    const { data: latestSnap } = await supabase
      .from('rankings')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestSnapshot = latestSnap?.snapshot_date || null;

    const [squadsRes, swimmersArr, resultsArr, attendanceArr, sessionsArr, membershipsArr, exRes, currentRankings] = await Promise.all([
      supabase.from('squads').select('*').eq('is_squad', true).order('name'),
      fetchAll(supabase, 'swimmers', '*'),
      fetchAll(supabase, 'results', '*, meets(id,name,type)'),
      fetchAll(supabase, 'training_attendance', '*'),
      fetchAll(supabase, 'sessions', '*'),
      fetchAll(supabase, 'session_memberships', '*'),
      supabase.from('club_exemptions').select('*'),
      latestSnapshot
        ? fetchAll(supabase, 'rankings', '*', q => q.eq('snapshot_date', latestSnapshot))
        : Promise.resolve([])
    ]);

    if (squadsRes.error) throw squadsRes.error;
    const squadsArr = squadsRes.data || [];
    const exemptionsArr = exRes.data || [];

    // Pre-group once so per-squad computeSquadStats calls only filter within
    // their own swimmers' rows instead of scanning the full club-wide arrays.
    const attendanceBySwimmer = {};
    attendanceArr.forEach(a => { (attendanceBySwimmer[a.swimmer_id] ||= []).push(a); });
    const resultsBySwimmer = {};
    resultsArr.forEach(r => { (resultsBySwimmer[r.swimmer_id] ||= []).push(r); });
    const membershipsBySwimmer = {};
    membershipsArr.forEach(m => { (membershipsBySwimmer[m.swimmer_id] ||= []).push(m); });

    const kpis = squadsArr.map(s => {
      const squadSwimmers = swimmersArr.filter(sw => sw.squad_id === s.id);
      const squadSwimmerIds = new Set(squadSwimmers.map(sw => sw.id));

      const stats = computeSquadStats(s, squadSwimmers, {
        attendance: squadSwimmers.flatMap(sw => attendanceBySwimmer[sw.id] || []),
        sessions: sessionsArr,
        results: squadSwimmers.flatMap(sw => resultsBySwimmer[sw.id] || []),
        memberships: squadSwimmers.flatMap(sw => membershipsBySwimmer[sw.id] || []),
        exemptions: exemptionsArr,
        period
      });

      const squadRanks = currentRankings.filter(r => squadSwimmerIds.has(r.swimmer_id));
      const achievements = {
        nationals: new Set(squadRanks.filter(r => r.district === 'England' && r.rank <= 40).map(r => r.swimmer_id)).size,
        regionals: new Set(squadRanks.filter(r => r.district === 'South East' && r.rank <= 30).map(r => r.swimmer_id)).size,
        counties: new Set(squadRanks.filter(r => r.district === 'Kent' && r.rank <= 10).map(r => r.swimmer_id)).size
      };

      const overall = calculateSquadHealth(
        { avgTraining: stats.training, avgVolume: stats.volume, avgVelocity: stats.avgVelocity, complianceRate: stats.compliance },
        s
      ).total;

      const count = squadSwimmers.filter(sw => sw.is_active !== false && !sw.is_exempt).length;

      return {
        ...s,
        training: stats.training,
        volume: stats.volume,
        meets: stats.meets,
        avgPts: stats.avgPts,
        achievements,
        overall,
        count
      };
    });

    return res.status(200).json(kpis);
  } catch (error) {
    console.error('Error computing squad stats:', error);
    return res.status(500).json({ error: error.message });
  }
}
