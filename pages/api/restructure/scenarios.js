import { requireAuth, requireAdminAuth } from '../../../lib/api-auth';
import { getServiceSupabase } from '../../../lib/supabase';
import { validateInputs } from '../../../lib/restructure-solver';

/**
 * CRUD for saved restructuring scenarios.
 *
 * Reads are open to any signed-in coach so a proposal can be circulated; writes
 * are admin/headcoach only. A scenario must be saved before it can be exported
 * to PDF, because the print route re-renders the page in a headless browser and
 * unsaved editor state does not survive that.
 */
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await list(req, res);
    if (req.method === 'POST') return await upsert(req, res);
    if (req.method === 'DELETE') return await remove(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('restructure/scenarios failed:', error);
    return res.status(500).json({ error: error.message || 'Scenario request failed' });
  }
}

async function list(req, res) {
  if (!await requireAuth(req, res)) return;
  const supabase = getServiceSupabase();

  if (req.query.id) {
    const { data, error } = await supabase
      .from('planning_scenarios').select('*').eq('id', req.query.id).single();
    if (error) return res.status(404).json({ error: 'Scenario not found' });
    return res.status(200).json({ success: true, scenario: data });
  }

  let q = supabase
    .from('planning_scenarios')
    .select('id, name, description, is_baseline, is_archived, baseline_captured_at, created_at, updated_at, last_result')
    .order('updated_at', { ascending: false });
  if (req.query.includeArchived !== '1') q = q.eq('is_archived', false);

  const { data, error } = await q;
  if (error) throw error;

  // Only the headline metrics travel in the list; the full plan is fetched when
  // a scenario is opened.
  const scenarios = (data || []).map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isBaseline: row.is_baseline,
    isArchived: row.is_archived,
    baselineCapturedAt: row.baseline_captured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    summary: row.last_result?.metrics ? {
      total: row.last_result.metrics.total,
      utilisationPct: row.last_result.metrics.utilisationPct,
      occupancyPct: row.last_result.metrics.occupancyPct,
      swimmersServed: row.last_result.metrics.swimmersServed,
      unservedDemand: row.last_result.metrics.unservedDemand,
      availableLaneHours: row.last_result.metrics.availableLaneHours,
      newLaneHoursGained: row.last_result.metrics.newLaneHoursGained,
      ltadCompliancePct: row.last_result.metrics.ltadCompliancePct,
      squadCount: row.last_result.metrics.squadCount,
      // The headline a coach actually cares about: how many squads get the
      // training they are supposed to get.
      squadsMeetingRequirement: row.last_result.metrics.squadsMeetingRequirement,
      swimmerSessionsRequired: row.last_result.metrics.swimmerSessionsRequired,
      swimmerSessionsDelivered: row.last_result.metrics.swimmerSessionsDelivered,
      coachGapHours: row.last_result.metrics.coach?.gapHours ?? null,
      coachCoveragePct: row.last_result.metrics.coach?.coveragePct ?? null,
      bands: (row.last_result.metrics.bySquad || []).map(s => ({
        name: s.name, minAge: s.minAge, maxAge: s.maxAge,
        targetSize: s.targetSize, sessions: s.sessionsTarget,
        hours: s.effectiveTargetHours, requirementMet: s.requirementMet
      }))
    } : null
  }));

  return res.status(200).json({ success: true, scenarios });
}

async function upsert(req, res) {
  const admin = await requireAdminAuth(req, res);
  if (!admin) return;

  const { id, name, description, inputs, isArchived, isBaseline, baselineCapturedAt } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!inputs || typeof inputs !== 'object') {
    return res.status(400).json({ error: 'inputs is required' });
  }

  // A scenario with structurally broken inputs is worse than no scenario: it
  // fails later, in an export or a print view, where the cause is far less
  // obvious than it is here.
  const validation = validateInputs(inputs);
  if (!validation.ok) {
    return res.status(400).json({ error: 'Scenario inputs are not valid', details: validation.errors });
  }

  const supabase = getServiceSupabase();
  const row = {
    name: String(name).trim(),
    description: description || null,
    inputs,
    is_archived: !!isArchived,
    is_baseline: !!isBaseline,
    baseline_captured_at: baselineCapturedAt || null,
    updated_at: new Date().toISOString()
  };

  if (id) {
    const { data, error } = await supabase
      .from('planning_scenarios').update(row).eq('id', id).select().single();
    if (error) throw error;
    return res.status(200).json({ success: true, scenario: data, warnings: validation.warnings });
  }

  const { data, error } = await supabase
    .from('planning_scenarios')
    .insert({ ...row, created_by: admin.user.id })
    .select().single();
  if (error) throw error;
  return res.status(200).json({ success: true, scenario: data, warnings: validation.warnings });
}

async function remove(req, res) {
  if (!await requireAdminAuth(req, res)) return;
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id is required' });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from('planning_scenarios').delete().eq('id', id);
  if (error) throw error;
  return res.status(200).json({ success: true });
}
