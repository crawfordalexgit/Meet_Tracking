import { requireAuth } from '../../../lib/api-auth';
import { suggestStructures } from '../../../lib/restructure-solver';
import { fetchRestructureBaseline } from '../../../lib/restructure-baseline';

/**
 * Candidate squad structures for the scenario's pool slots.
 *
 * Squad bands are contiguous ranges over swimming age, so the structural search
 * space is the set of contiguous partitions of the club's age spread — a few
 * hundred candidates, enumerable exactly rather than sampled. Each gets a
 * deliberately cheap solve; applying one then runs the full solver.
 *
 * Server-side because it solves the timetable several hundred times, which is
 * not work to hand a browser.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await requireAuth(req, res)) return;

  try {
    const { inputs, options = {} } = req.body || {};
    if (!inputs || typeof inputs !== 'object') {
      return res.status(400).json({ error: 'inputs is required' });
    }

    // The histogram is the club's real roster by swimming age. Taking it from
    // the baseline rather than the request keeps a suggestion grounded in the
    // swimmers who actually exist.
    let histogram = options.ageHistogram;
    let capability = options.capability;
    if (!histogram || !Object.keys(histogram).length || !capability) {
      const baseline = await fetchRestructureBaseline();
      capability = capability || baseline.capability;

      // Build the age spread from exactly the squads being remodelled, by
      // summing their own histograms.
      //
      // The previous approach subtracted each held-out squad's size from the
      // club-wide histogram, spread across its age band. Where those bands
      // overlap — Club 2, Technical Development and NAR all sit in the teens —
      // the subtractions compounded and emptied ages 15 and 16 entirely. Every
      // candidate band then straddled the hole and was pruned as too wide, so
      // locking a squad silently returned nothing at all. Summing what is
      // actually there cannot over-remove.
      const held = new Set(
        (inputs.squads || [])
          .filter(sq => sq.locked === true || sq.competitive === false)
          .map(sq => sq.sourceSquadId)
          .filter(Boolean)
      );

      const remodelled = baseline.squads.filter(sq =>
        !held.has(sq.id)
        && sq.targetSessionsPerWeek > 0
        && (sq.ageHistogram && Object.keys(sq.ageHistogram).length));

      const built = {};
      remodelled.forEach(sq => {
        Object.entries(sq.ageHistogram).forEach(([age, n]) => {
          built[age] = (built[age] || 0) + n;
        });
      });

      histogram = histogram && Object.keys(histogram).length
        ? histogram
        : (Object.keys(built).length ? built : baseline.pathwayAgeHistogram);
    }

    const bandBy = ['age', 'capability', 'hybrid'].includes(options.bandBy) ? options.bandBy : 'age';

    const result = suggestStructures(inputs, histogram, {
      bandBy,
      capability,
      maxAgeSpread: clamp(options.maxAgeSpread, 1, 20, 6),
      minSquads: clamp(options.minSquads, 2, 10, 3),
      maxSquads: clamp(options.maxSquads, 2, 10, 7),
      minBandSize: clamp(options.minBandSize, 1, 60, 6),
      topN: clamp(options.topN, 1, 10, 5),
      maxCandidates: clamp(options.maxCandidates, 10, 800, 400),
      // How many of the enumerated structures get a full timetable drawn. The
      // rest are ranked on structure alone. Raise it to trade wall time for
      // certainty; the response reports both figures either way.
      screenTo: clamp(options.screenTo, 5, 800, 32),
      maxIterations: clamp(options.maxIterations, 0, 200, 25)
    });

    return res.status(200).json({
      success: true,
      ...result,
      bandBy,
      ageHistogram: histogram,
      capabilityCoverage: capability
        ? { withData: capability.withData, withoutData: capability.withoutData }
        : null,
      // Say plainly when the search was cut short, rather than presenting a
      // truncated sweep as if it were exhaustive.
      truncated: result.candidatesConsidered >= clamp(options.maxCandidates, 10, 800, 400)
    });
  } catch (error) {
    console.error('restructure/suggest failed:', error);
    return res.status(500).json({ error: error.message || 'Suggestion failed' });
  }
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
