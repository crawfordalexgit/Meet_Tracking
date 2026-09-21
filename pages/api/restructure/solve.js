import { requireAuth } from '../../../lib/api-auth';
import { getServiceSupabase } from '../../../lib/supabase';
import { solveRestructure } from '../../../lib/restructure-solver';

/**
 * Run the solver over a scenario's inputs.
 *
 * Stateless by default. When a scenarioId is supplied and the caller can write,
 * the result is also cached onto the row so list views, the comparison tab and
 * the Puppeteer print view do not each re-solve.
 *
 * The solve runs here rather than in the browser because heavy aggregation on
 * the client is a known trap in this app (see the comment in pages/squads.js).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { inputs, options = {}, scenarioId } = req.body || {};
    if (!inputs || typeof inputs !== 'object') {
      return res.status(400).json({ error: 'inputs is required' });
    }

    const baselineLaneHours = options.baselineLaneHours === undefined
      ? inputs.baselineLaneHours
      : options.baselineLaneHours;

    const result = solveRestructure(inputs, {
      maxIterations: options.maxIterations,
      baselineLaneHours
    });

    // Caching the result is a write, so it needs write rights. requireAdminAuth
    // cannot be used here: it sends its own 403, which would collide with the
    // solve response a reader is still entitled to. Check the role quietly and
    // simply skip the cache when the caller cannot write.
    if (scenarioId && result.ok) {
      const supabase = getServiceSupabase();
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();
      if (['admin', 'headcoach'].includes(profile?.role)) {
        const { error } = await supabase
          .from('planning_scenarios')
          .update({ last_result: stripForStorage(result), updated_at: new Date().toISOString() })
          .eq('id', scenarioId);
        if (error) console.error('restructure/solve could not cache result:', error);
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('restructure/solve failed:', error);
    return res.status(500).json({ error: error.message || 'Solve failed' });
  }
}

/**
 * Trim the cached copy to what list and comparison views read. The per-decision
 * rejection log is large and only useful while looking at one scenario, where it
 * is re-derived by solving again.
 */
function stripForStorage(result) {
  return {
    metrics: result.metrics,
    plan: result.plan,
    gaps: result.gaps,
    warnings: result.warnings,
    diagnostics: {
      demandVsSupply: result.diagnostics.demandVsSupply,
      unusableSlotCount: result.diagnostics.unusableSlots.length
    }
  };
}
