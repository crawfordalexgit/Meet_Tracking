import { requireAuth } from '../../../lib/api-auth';
import { fetchRestructureBaseline, buildScenarioInputsFromBaseline, resolveAttendanceDays } from '../../../lib/restructure-baseline';

/**
 * Current-state baseline for the scenario planner.
 *
 * Cached in module memory for five minutes. The baseline reads most of the club
 * record, and the planner asks for it on every page load and every re-seed;
 * without this a coach flicking between tabs re-runs six full-table scans.
 */
// Keyed by attendance window and term basis: each combination is a different
// picture, and a single slot would hand one of them back under another's name.
let cache = new Map();
// Short enough that an edit in Config shows up on the next visit, long enough
// that flicking between tabs does not re-scan most of the club record.
const CACHE_MS = 45 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await requireAuth(req, res)) return;

  try {
    const fresh = req.query.refresh === '1';
    const attendanceDays = resolveAttendanceDays(req.query.attendanceDays);
    const termOnly = req.query.termOnly !== '0';
    // Term-only and blended are two different pictures, exactly as two windows
    // are, so they cannot share a cache slot.
    const cacheKey = attendanceDays + (termOnly ? ':term' : ':all');
    const hit = cache.get(cacheKey);
    if (!fresh && hit && Date.now() - hit.at < CACHE_MS) {
      return res.status(200).json({ ...hit.payload, cached: true });
    }

    const baseline = await fetchRestructureBaseline({ attendanceDays, termOnly });
    const payload = {
      success: true,
      baseline,
      seedInputs: buildScenarioInputsFromBaseline(baseline)
    };
    cache.set(cacheKey, { at: Date.now(), payload });
    return res.status(200).json({ ...payload, cached: false });
  } catch (error) {
    console.error('restructure/baseline failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to build baseline' });
  }
}
