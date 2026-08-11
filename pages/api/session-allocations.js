import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';
import { getSessionDuration, extractSessionDay, getPreferredName } from '../../lib/analytics-utils';

const PAGE_SIZE = 1000;

async function fetchAll(supabase, table, select = '*', filter = null) {
  let all = [];
  let page = 0;
  while (page < 50) {
    let q = supabase.from(table).select(select).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

/**
 * Session allocation report payload.
 *
 * Returns the flat swimmer x session allocation grid (from session_memberships)
 * plus the squad weekly targets needed to score it. All filtering and grouping is
 * done client-side so the report can be re-cut without a refetch — the grid is
 * roughly (swimmers x ~4 sessions) rows, which is small enough to ship whole.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireAuth(req, res)) return;

  try {
    const supabase = getServiceSupabase();

    const [squads, rawSessions, swimmers, memberships] = await Promise.all([
      fetchAll(supabase, 'squads', '*', q => q.eq('is_squad', true)),
      fetchAll(supabase, 'sessions', '*'),
      fetchAll(supabase, 'swimmers', '*, squads(id, name)'),
      fetchAll(supabase, 'session_memberships', 'swimmer_id, session_id')
    ]);

    const sessions = rawSessions.map(s => ({
      id: s.id,
      name: s.name,
      day: extractSessionDay(s),
      start_time: s.start_time || null,
      end_time: s.end_time || null,
      location: s.location || 'Unspecified',
      is_active: s.is_active !== false,
      durationHours: parseFloat(getSessionDuration(s).toFixed(2))
    }));

    const squadById = {};
    squads.forEach(sq => { squadById[sq.id] = sq; });

    return res.status(200).json({
      success: true,
      squads: squads
        .map(sq => ({
          id: sq.id,
          name: sq.name,
          target_sessions_per_week: sq.target_sessions_per_week || 0,
          target_hours_per_week: sq.target_hours_per_week || 0
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      sessions,
      swimmers: swimmers.map(sw => ({
        id: sw.id,
        full_name: sw.full_name,
        preferred_name: getPreferredName(sw),
        squad_id: sw.squad_id,
        squad_name: sw.squads?.name || 'Unassigned',
        is_squad_member: !!squadById[sw.squad_id],
        is_exempt: !!sw.is_exempt,
        gender: sw.gender || null,
        year_of_birth: sw.year_of_birth || null
      })),
      allocations: memberships.map(m => ({ swimmer_id: m.swimmer_id, session_id: m.session_id }))
    });
  } catch (error) {
    console.error('Session allocations API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
