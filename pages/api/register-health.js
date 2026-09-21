import { getServiceSupabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/paginate';
import { requireAuth } from '../../lib/api-auth';
import { extractSessionDay } from '../../lib/analytics-utils';
import { assessRegisters } from '../../lib/register-health';
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
    const [rawSessions, attendance, memberships, closures] = await Promise.all([
      fetchAllRows(supabase, 'sessions'),
      fetchAllRows(supabase, 'training_attendance', {
        select: 'session_id, date, status',
        filter: q => q.gte('date', from).lte('date', to)
      }),
      fetchAllRows(supabase, 'session_memberships', { select: 'session_id' }),
      fetchAllRows(supabase, 'club_exemptions')
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

    const marksBySession = {};
    attendance.forEach(r => {
      (marksBySession[r.session_id] = marksBySession[r.session_id] || []).push(r);
    });
    const rosterBySession = {};
    memberships.forEach(m => {
      rosterBySession[m.session_id] = (rosterBySession[m.session_id] || 0) + 1;
    });

    const report = assessRegisters({
      sessions, marksBySession, rosterBySession, from, to, closures
    });

    return res.status(200).json({ success: true, days, report });
  } catch (error) {
    console.error('register-health failed:', error);
    return res.status(500).json({ error: error.message || 'Could not read the registers' });
  }
}
