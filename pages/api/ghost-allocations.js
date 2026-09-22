import { getServiceSupabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/paginate';
import { requireAuth } from '../../lib/api-auth';
import { extractSessionDay } from '../../lib/analytics-utils';
import { assessRegisters } from '../../lib/register-health';
import { findGhosts, groupGhostsBySquad, wholeRosterGhosts, summariseGhosts } from '../../lib/ghost-allocations';
import { resolveAttendanceDays } from '../../lib/restructure-glossary';

/**
 * Swimmers booked onto a session with no recorded swim, and whether the
 * register is in any position to say so.
 *
 * Read-only. The judgement lives in lib/ghost-allocations.js, which is pure;
 * this route gathers the rows and states the window.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireAuth(req, res)) return;

  try {
    const days = resolveAttendanceDays(req.query.days);
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    const supabase = getServiceSupabase();
    const [rawSessions, attendance, memberships, swimmers, closures, squads] = await Promise.all([
      fetchAllRows(supabase, 'sessions'),
      fetchAllRows(supabase, 'training_attendance', {
        select: 'session_id, swimmer_id, date, status',
        filter: q => q.gte('date', from).lte('date', to)
      }),
      fetchAllRows(supabase, 'session_memberships', { select: 'swimmer_id, session_id' }),
      fetchAllRows(supabase, 'swimmers', { select: 'id, full_name, squad_id, squads(name)' }),
      fetchAllRows(supabase, 'club_exemptions'),
      fetchAllRows(supabase, 'squads', { select: 'name, is_squad' })
    ]);

    // The same register health the register report uses, so the two pages can
    // never disagree about whether a session's register was taken.
    const activeSessions = rawSessions
      .filter(s => s.is_active !== false)
      .map(s => ({
        id: s.id,
        name: s.name,
        day: s.day_of_week || extractSessionDay(s),
        location: s.location || null
      }));

    const marksBySession = {};
    attendance.forEach(r => {
      (marksBySession[r.session_id] = marksBySession[r.session_id] || []).push(r);
    });
    const rosterBySession = {};
    memberships.forEach(m => {
      rosterBySession[m.session_id] = (rosterBySession[m.session_id] || 0) + 1;
    });

    const health = assessRegisters({
      sessions: activeSessions, marksBySession, rosterBySession, from, to, closures,
      squadNames: squads.filter(q => q.is_squad).map(q => q.name)
    });
    const healthBySession = {};
    health.rows.forEach(r => { healthBySession[r.sessionId] = r; });

    // A recorded swim, not a recorded absence. Being marked absent is not
    // evidence a swimmer uses their place.
    const presentKeys = new Set(
      attendance
        .filter(a => String(a.status || '').toLowerCase() === 'present')
        .map(a => a.swimmer_id + '|' + a.session_id));

    const sessionsForGhosts = rawSessions.map(s => ({
      id: s.id,
      name: s.name,
      day: s.day_of_week || extractSessionDay(s),
      start_time: s.start_time || null,
      location: s.location || null,
      is_active: s.is_active
    }));

    const { rows, orphans } = findGhosts({
      memberships, swimmers, sessions: sessionsForGhosts, presentKeys, healthBySession
    });

    return res.status(200).json({
      success: true,
      days,
      report: {
        window: { from, to },
        rows,
        bySquad: groupGhostsBySquad(rows),
        wholeRoster: wholeRosterGhosts(rows, rosterBySession),
        summary: summariseGhosts(rows, orphans)
      }
    });
  } catch (error) {
    console.error('ghost-allocations failed:', error);
    return res.status(500).json({ error: error.message || 'Could not read the allocations' });
  }
}
