import { getServiceSupabase } from './supabase';
import { getSessionDuration, extractSessionDay, getPreferredName } from './analytics-utils';

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

/** Rolling windows offered to the assistant, in weeks. */
export const ATTENDANCE_WINDOWS = [4, 9, 13];

/**
 * Attendance totals per swimmer over an arbitrary lookback, for the chat tools.
 *
 * The window is cut on a calendar date rather than a fractional-week timestamp:
 * a time-of-day boundary silently moves a session in or out between two runs,
 * so the same question would give different answers.
 */
export async function fetchAttendanceRange(weeks) {
  const supabase = getServiceSupabase();
  const span = Math.max(1, Math.min(260, Number(weeks) || 1));
  const since = new Date(Date.now() - span * 7 * 86400000).toISOString().split('T')[0];

  const rows = await fetchAll(
    supabase,
    'training_attendance',
    'swimmer_id, date, status',
    q => q.gte('date', since)
  );

  const bySwimmer = {};
  rows.forEach(r => {
    const rec = bySwimmer[r.swimmer_id] || (bySwimmer[r.swimmer_id] = { present: 0, total: 0, lastPresent: null });
    rec.total++;
    if (r.status === 'present') {
      rec.present++;
      if (!rec.lastPresent || r.date > rec.lastPresent) rec.lastPresent = r.date;
    }
  });

  return { weeks: span, since, bySwimmer, rowCount: rows.length };
}

/**
 * Per-swimmer attendance rates over rolling windows.
 *
 * training_attendance only ever carries 'present' or 'absent' in this database,
 * and a row exists for both outcomes whenever a register was taken, so
 * present / (present + absent) is a true rate rather than a count of turnouts
 * against a guessed denominator. Sessions with no register produce no rows and
 * so are excluded from both sides, which is the honest treatment.
 *
 * Note this is a different measure from calculateReliability's `percentage`,
 * which scores how many weeks hit the squad's weekly target.
 */
export async function fetchAttendanceWindows(windows = ATTENDANCE_WINDOWS) {
  const supabase = getServiceSupabase();
  const maxWeeks = Math.max(...windows);
  const since = new Date(Date.now() - maxWeeks * 7 * 86400000).toISOString().split('T')[0];

  const rows = await fetchAll(
    supabase,
    'training_attendance',
    'swimmer_id, date, status',
    q => q.gte('date', since)
  );

  // Cut each window on a calendar date rather than a fractional-week timestamp:
  // a time-of-day boundary silently moves a session in or out of the window
  // between two runs, which makes the same question give different answers.
  const cutoffs = {};
  windows.forEach(w => {
    cutoffs[w] = new Date(Date.now() - w * 7 * 86400000).toISOString().split('T')[0];
  });

  const bySwimmer = {};
  rows.forEach(r => {
    const rec = bySwimmer[r.swimmer_id] || (bySwimmer[r.swimmer_id] = { windows: {}, lastPresent: null });
    windows.forEach(w => {
      if (r.date < cutoffs[w]) return;
      const bucket = rec.windows[w] || (rec.windows[w] = { present: 0, total: 0 });
      bucket.total++;
      if (r.status === 'present') bucket.present++;
    });
    if (r.status === 'present' && (!rec.lastPresent || r.date > rec.lastPresent)) rec.lastPresent = r.date;
  });

  return { windows, since, cutoffs, bySwimmer, rowCount: rows.length };
}

/**
 * Session allocation payload: the flat swimmer x session grid from
 * session_memberships, plus the squad weekly targets needed to score it.
 *
 * Server-only (uses the service client). Shared by the report endpoint, the
 * spreadsheet export and the AI chat context so all three agree.
 */
export async function fetchAllocationData() {
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

  return {
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
      year_of_birth: sw.year_of_birth || null,
      // Swimming age is the age reached by 31 December, which is what squads and
      // championship age groups are built on — not the athlete's age today.
      age_end_of_year: sw.year_of_birth ? new Date().getFullYear() - sw.year_of_birth : null
    })),
    allocations: memberships.map(m => ({ swimmer_id: m.swimmer_id, session_id: m.session_id }))
  };
}
