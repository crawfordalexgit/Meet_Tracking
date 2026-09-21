import { requireAuth, requireAdminAuth } from '../../../lib/api-auth';
import { getServiceSupabase } from '../../../lib/supabase';
import { fetchAllRows } from '../../../lib/paginate';
import { DAY_NAMES_FULL } from '../../../lib/analytics-utils';
import { timeToMinutes } from '../../../lib/restructure-solver';

/**
 * The club's coach roster, promoted out of individual scenarios.
 *
 * profiles holds only id, email and role, so a coach's name, level, lane limit,
 * weekly hours and availability have nowhere to live. Scenarios can carry them,
 * but a roster typed into five scenarios drifts into five different answers.
 * This is the shared copy: load it into a scenario, or save a scenario's roster
 * back as the club record.
 *
 * The shape matches the scenario blob field for field, so moving between the two
 * is a mapping rather than a translation.
 */
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await load(req, res);
    if (req.method === 'POST') return await save(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('restructure/coach-roster failed:', error);
    return res.status(500).json({ error: error.message || 'Coach roster request failed' });
  }
}

async function load(req, res) {
  if (!await requireAuth(req, res)) return;
  const supabase = getServiceSupabase();

  const [rows, profiles, coachSquads] = await Promise.all([
    fetchAllRows(supabase, 'coach_profiles'),
    fetchAllRows(supabase, 'profiles', { select: 'id, email, role' }),
    fetchAllRows(supabase, 'coach_squads', { select: 'coach_id, squad_id' })
  ]);

  const squadIdsByCoach = {};
  coachSquads.forEach(cs => {
    (squadIdsByCoach[cs.coach_id] || (squadIdsByCoach[cs.coach_id] = [])).push(cs.squad_id);
  });
  const emailById = {};
  profiles.forEach(p => { emailById[p.id] = p.email; });

  const coaches = rows.map(r => ({
    id: r.profile_id ? `co_${r.profile_id}` : `co_saved_${r.id}`,
    name: r.display_name,
    profileId: r.profile_id,
    email: r.profile_id ? emailById[r.profile_id] || null : null,
    level: r.level || 'L2',
    maxLanes: r.max_lanes ?? 3,
    maxHoursPerWeek: r.max_hours_per_week ?? null,
    // Squad links are stored as live squad ids; the scenario prefixes them.
    squadIds: (squadIdsByCoach[r.profile_id] || []).map(id => `sq_${id}`),
    availability: Array.isArray(r.availability) ? r.availability : [],
    venues: Array.isArray(r.venues) ? r.venues : [],
    isActive: r.is_active !== false
  })).filter(c => c.isActive)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return res.status(200).json({ success: true, coaches, count: coaches.length });
}

async function save(req, res) {
  if (!await requireAdminAuth(req, res)) return;

  const { coaches } = req.body || {};
  if (!Array.isArray(coaches)) {
    return res.status(400).json({ error: 'coaches must be an array' });
  }

  // Validate before touching anything. A half-written roster is worse than a
  // rejected one, because the gaps look like real availability.
  const errors = [];
  coaches.forEach((c, i) => {
    const where = c.name || c.id || `coach #${i + 1}`;
    if (!c.name || !String(c.name).trim()) errors.push(`${where}: a display name is required.`);
    (c.availability || []).forEach(w => {
      if (!DAY_NAMES_FULL.includes(w.day)) errors.push(`${where}: "${w.day}" is not a weekday name.`);
      const from = timeToMinutes(w.from);
      const to = timeToMinutes(w.to);
      if (from == null || to == null) errors.push(`${where}: availability time is not HH:MM.`);
      else if (to <= from) errors.push(`${where}: an availability window ends at or before it starts.`);
    });
  });
  if (errors.length) return res.status(400).json({ error: 'Roster is not valid', details: errors });

  const supabase = getServiceSupabase();

  // Upsert on profile_id where there is one, so a coach linked to a login keeps
  // a single row. Hypothetical coaches invented for a what-if have no profile
  // and are matched on display name instead.
  const existing = await fetchAllRows(supabase, 'coach_profiles');
  const byProfile = {};
  const byName = {};
  existing.forEach(r => {
    if (r.profile_id) byProfile[r.profile_id] = r;
    byName[String(r.display_name).toLowerCase()] = r;
  });

  const saved = [];
  for (const c of coaches) {
    const profileId = c.profileId || null;
    const match = profileId ? byProfile[profileId] : byName[String(c.name).toLowerCase()];
    const row = {
      profile_id: profileId,
      display_name: String(c.name).trim(),
      level: c.level || 'L2',
      max_lanes: Number(c.maxLanes) || 3,
      max_hours_per_week: c.maxHoursPerWeek == null ? null : Number(c.maxHoursPerWeek),
      availability: c.availability || [],
      venues: c.venues || [],
      is_active: true
    };

    const { data, error } = match
      ? await supabase.from('coach_profiles').update(row).eq('id', match.id).select().single()
      : await supabase.from('coach_profiles').insert(row).select().single();

    if (error) {
      console.error('coach_profiles write failed:', error);
      return res.status(500).json({ error: `Could not save ${row.display_name}: ${error.message}` });
    }
    saved.push(data.id);
  }

  // Anything previously saved and now absent is retired rather than deleted, so
  // a scenario that still references a coach does not lose their details.
  const stale = existing.filter(r => !saved.includes(r.id) && r.is_active !== false);
  if (stale.length) {
    await supabase.from('coach_profiles')
      .update({ is_active: false })
      .in('id', stale.map(r => r.id));
  }

  return res.status(200).json({
    success: true,
    saved: saved.length,
    retired: stale.length
  });
}
