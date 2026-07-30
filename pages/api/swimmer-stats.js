import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';
import { calculateReliability, getCategoryBenchmark } from '../../lib/analytics-utils';
import { fetchAllRows } from '../../lib/paginate';

const fetchAll = (client, table, select = '*', filter = null) =>
  fetchAllRows(client, table, { select, filter });

/**
 * Server-side aggregation for the athlete registry (pages/swimmers.js).
 *
 * The F11 consistency fix moved this crunch client-side, which meant every
 * visit to /swimmers downloaded ~21k attendance rows and ~5k result rows to the
 * browser and computed reliability there. tests/HANDOFF-2026-07-08.md records
 * the result: ~40s page loads, and the swimmers-peak-wa regression guard timing
 * out at 120s.
 *
 * This route does exactly the same work with exactly the same shared
 * calculateReliability, so the numbers stay identical to the squad detail page
 * and the dashboard — that shared-implementation invariant is what
 * tests/integrity/squad-consistency.spec.js protects and it must not be
 * duplicated here.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireAuth(req, res)) return;

  const period = parseInt(req.query.period, 10) || 365;
  if (!Number.isFinite(period) || period < 1 || period > 3650) {
    return res.status(400).json({ error: 'Invalid period' });
  }

  try {
    const supabase = getServiceSupabase();

    const now = new Date();
    const periodStart = new Date(now.getTime() - period * 86400000).toISOString();
    // Reliability only looks back 180 days; peak WA is all-time (see below).
    const reliabilityWindow = new Date(now.getTime() - 180 * 86400000).toISOString();

    const [swimmersArr, resultsArr, attendanceArr, sessionsArr, exRes, membershipsArr, peakResults] =
      await Promise.all([
        fetchAll(supabase, 'swimmers', '*, squads(*)', q => q.not('squad_id', 'is', null).order('full_name')),
        fetchAll(supabase, 'results', 'swimmer_id, date, wa_pts', q => q.gte('date', reliabilityWindow)),
        fetchAll(supabase, 'training_attendance', '*', q => q.gte('date', periodStart)),
        fetchAll(supabase, 'sessions', '*'),
        supabase.from('club_exemptions').select('*'),
        fetchAll(supabase, 'session_memberships', '*'),
        // Peak WA comes from results.wa_pts across all time and all events.
        // swimmer_pbs has no wa_pts column, so reading it there returned nothing
        // and every peak fell back to 0.
        fetchAll(supabase, 'results', 'swimmer_id, wa_pts'),
      ]);

    if (exRes.error) throw exRes.error;
    const exemptions = exRes.data || [];

    // Pre-group once so each swimmer's reliability call scans only its own rows
    // rather than the club-wide arrays.
    const resultsBySwimmer = {};
    resultsArr.forEach(r => { (resultsBySwimmer[r.swimmer_id] ||= []).push(r); });
    const attendanceBySwimmer = {};
    attendanceArr.forEach(a => { (attendanceBySwimmer[a.swimmer_id] ||= []).push(a); });
    const membershipsBySwimmer = {};
    membershipsArr.forEach(m => { (membershipsBySwimmer[m.swimmer_id] ||= []).push(m); });

    const peakWABySwimmer = {};
    peakResults.forEach(p => {
      if ((p.wa_pts || 0) > (peakWABySwimmer[p.swimmer_id] || 0)) peakWABySwimmer[p.swimmer_id] = p.wa_pts;
    });

    // Championship year rolls over at the start of May.
    const targetYear = now.getMonth() >= 4 ? now.getFullYear() + 1 : now.getFullYear();

    const swimmers = swimmersArr.map(swimmer => {
      const peakWA = peakWABySwimmer[swimmer.id] || 0;

      const age = swimmer.year_of_birth
        ? targetYear - swimmer.year_of_birth
        : (swimmer.date_of_birth ? targetYear - new Date(swimmer.date_of_birth).getFullYear() : null);

      const districts = [];
      if (age) {
        const countyQT = getCategoryBenchmark(age, swimmer.gender, '', 'COUNTY');
        const regionalQT = getCategoryBenchmark(age, swimmer.gender, '', 'REGIONAL');
        if (peakWA >= regionalQT) {
          districts.push('South East', 'Kent');
        } else if (peakWA >= countyQT) {
          districts.push('Kent');
        }
      }

      const rel = calculateReliability(
        swimmer,
        attendanceBySwimmer[swimmer.id] || [],
        sessionsArr,
        resultsBySwimmer[swimmer.id] || [],
        period,
        exemptions,
        membershipsBySwimmer[swimmer.id] || []
      );

      return {
        ...swimmer,
        peakWA,
        // null (not 0) when there is no swimmable week — the registry renders
        // '—' rather than implying a measured 0%.
        attendancePct: rel.percentage,
        meetCompliance: rel.complianceRate ?? null,
        hasReliabilityData: rel.hasReliabilityData,
        districts,
        age,
      };
    });

    return res.status(200).json({ success: true, period, targetYear, swimmers });
  } catch (error) {
    console.error('swimmer-stats error:', error);
    return res.status(500).json({ error: 'Could not build the athlete registry.' });
  }
}
