import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';
import { computeSquadStats, calculateSquadHealth } from '../../lib/analytics-utils';
import { fetchAllRows } from '../../lib/paginate';

// Thin adapter over the shared paginator. This used to be a local copy that
// applied .order('id') BEFORE the caller's filter, so a caller-supplied sort
// was demoted to a tiebreaker.
const fetchAll = (client, table, select = '*', filter = null) =>
  fetchAllRows(client, table, { select, filter });

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

    const [squadsRes, swimmersArr, resultsArr, attendanceArr, sessionsArr, membershipsArr, exRes, rankingsRes] = await Promise.all([
      supabase.from('squads').select('*').eq('is_squad', true).order('name'),
      fetchAll(supabase, 'swimmers', '*'),
      fetchAll(supabase, 'results', '*, meets(id,name,type)'),
      fetchAll(supabase, 'training_attendance', '*'),
      fetchAll(supabase, 'sessions', '*'),
      fetchAll(supabase, 'session_memberships', '*'),
      supabase.from('club_exemptions').select('*'),
      // Paginated: an unbounded rankings select is capped at 1000 rows, which
      // silently truncated the latest snapshot and under-reported every
      // National/Regional/County achievement count.
      fetchAll(supabase, 'rankings', '*', q => q.order('snapshot_date', { ascending: false }))
    ]);

    if (squadsRes.error) throw squadsRes.error;
    const squadsArr = squadsRes.data || [];
    const exemptionsArr = exRes.data || [];
    const rankings = rankingsRes || [];

    const uniqueSnapshots = [...new Set(rankings.map(r => r.snapshot_date))].sort((a, b) => new Date(b) - new Date(a));
    const latestSnapshot = uniqueSnapshots[0] || null;
    const currentRankings = rankings.filter(r => r.snapshot_date === latestSnapshot);

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
