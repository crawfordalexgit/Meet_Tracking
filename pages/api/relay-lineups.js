/**
 * Persist relay lineups for the team picker.
 *
 * GET    /api/relay-lineups?meet_code=KT26              → all saved teams
 * PUT    /api/relay-lineups   { meet_code, event_key, team_letter, legs, entry_time_seconds, is_locked }
 * DELETE /api/relay-lineups?meet_code=..&event_key=..&team_letter=..
 *
 * The optimiser runs client-side; this route only stores the chosen teams.
 * If the relay_lineups table hasn't been migrated yet the route degrades
 * gracefully so the picker still works read-only.
 */

import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';

const TABLE = 'relay_lineups';

function tableMissing(error) {
  // PostgREST/Postgres "relation does not exist" or unknown table.
  return error && (error.code === '42P01' || /does not exist|find the table|schema cache/i.test(error.message || ''));
}

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = getServiceSupabase();

  if (req.method === 'GET') {
    const meetCode = req.query.meet_code || 'KT26';
    const { data, error } = await supabase.from(TABLE).select('*').eq('meet_code', meetCode);
    if (error) {
      if (tableMissing(error)) return res.status(200).json({ lineups: [], persisted: false });
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ lineups: data || [], persisted: true });
  }

  if (req.method === 'PUT') {
    const { meet_code = 'KT26', event_key, team_letter, legs, entry_time_seconds, is_locked } = req.body || {};
    if (!event_key || !team_letter || !Array.isArray(legs)) {
      return res.status(400).json({ error: 'event_key, team_letter and legs are required' });
    }
    const row = {
      meet_code, event_key, team_letter, legs,
      entry_time_seconds: entry_time_seconds ?? null,
      is_locked: !!is_locked,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: 'meet_code,event_key,team_letter' })
      .select()
      .single();
    if (error) {
      if (tableMissing(error)) return res.status(200).json({ ok: false, persisted: false });
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true, persisted: true, lineup: data });
  }

  if (req.method === 'DELETE') {
    const { meet_code = 'KT26', event_key, team_letter } = req.query;
    if (!event_key) return res.status(400).json({ error: 'event_key is required' });
    let q = supabase.from(TABLE).delete().eq('meet_code', meet_code).eq('event_key', event_key);
    if (team_letter) q = q.eq('team_letter', team_letter);
    const { error } = await q;
    if (error) {
      if (tableMissing(error)) return res.status(200).json({ ok: false, persisted: false });
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true, persisted: true });
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
