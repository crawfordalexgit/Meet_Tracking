import { getServiceSupabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/paginate';
import { requireAuth } from '../../lib/api-auth';
import { extractSessionDay } from '../../lib/analytics-utils';
import { assessRegisters } from '../../lib/register-health';
import { excuseMarks, normaliseVenue } from '../../lib/venue-closures';
import { resolveAttendanceDays } from '../../lib/restructure-glossary';

/**
 * Which sessions do not look like their register was really taken.
 *
 * Read-only. Every judgement is made in lib/register-health.js, which is pure,
 * so the thresholds can be argued with in a test rather than in production;
 * this route only gathers the rows and states the window.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireAuth(req, res)) return;

  try {
    const days = resolveAttendanceDays(req.query.days);
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    const supabase = getServiceSupabase();
    const [rawSessions, attendance, memberships, closures, squads] = await Promise.all([
      fetchAllRows(supabase, 'sessions'),
      fetchAllRows(supabase, 'training_attendance', {
        select: 'session_id, date, status',
        filter: q => q.gte('date', from).lte('date', to)
      }),
      fetchAllRows(supabase, 'session_memberships', { select: 'session_id' }),
      fetchAllRows(supabase, 'club_exemptions'),
      fetchAllRows(supabase, 'squads', { select: 'name, is_squad' })
    ]);

    // A retired session owes no register, so it is not judged for missing one.
    const sessions = rawSessions
      .filter(s => s.is_active !== false)
      .map(s => ({
        id: s.id,
        name: s.name,
        day: s.day_of_week || extractSessionDay(s),
        startTime: s.start_time || null,
        endTime: s.end_time || null,
        location: s.location || null
      }));

    // Marks recorded in water the club did not have.
    //
    // When a pool goes some coaches cancel and some open the register anyway
    // and mark the squad absent. Those absences are not attendance, and left
    // in they land on a swimmer's record instead of the pool's, so they come
    // out here rather than at each of the places that reads them.
    const venueById = {};
    sessions.forEach(s => { venueById[s.id] = s.location; });
    const { kept, excused } = excuseMarks(
      attendance, m => (m.session_id in venueById ? venueById[m.session_id] : null), closures);

    const marksBySession = {};
    kept.forEach(r => {
      (marksBySession[r.session_id] = marksBySession[r.session_id] || []).push(r);
    });
    const rosterBySession = {};
    memberships.forEach(m => {
      rosterBySession[m.session_id] = (rosterBySession[m.session_id] || 0) + 1;
    });

    const report = assessRegisters({
      sessions, marksBySession, rosterBySession, from, to, closures,
      squadNames: squads.filter(q => q.is_squad).map(q => q.name)
    });

    // Every venue closure touching the window, with how much water it took.
    const sessionsAtVenue = venue => sessions
      .filter(s => normaliseVenue(s.location) === normaliseVenue(venue)).length;
    const venueClosures = closures
      .filter(c => c.type === 'exempt' && c.venue && c.start_date <= to && c.end_date >= from)
      .map(c => ({
        name: c.name || 'Venue closed',
        venue: c.venue,
        from: c.start_date,
        to: c.end_date,
        sessions: sessionsAtVenue(c.venue)
      }))
      .sort((a, b) => a.from.localeCompare(b.from));

    return res.status(200).json({
      success: true, days,
      report: { ...report, venueClosures, marksExcused: excused.length }
    });
  } catch (error) {
    console.error('register-health failed:', error);
    return res.status(500).json({ error: error.message || 'Could not read the registers' });
  }
}
