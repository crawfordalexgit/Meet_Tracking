/**
 * School holidays, and why attendance has to know about them.
 *
 * The club trains through the holidays, so registers keep being taken and every
 * attendance figure keeps being computed. But turn-up collapses: across the last
 * year this club runs at 63-80% in term and 44-57% in the holidays, week after
 * week, with the dips landing exactly on the Kent school calendar — February
 * half-term at 54%, Easter at 47%, both summers in the forties.
 *
 * A ninety-day window read in late September is therefore about five-thirteenths
 * school holiday, and the "about half of those booked turn up" headline it
 * produces is not what the club looks like in term. Present that to a committee
 * and the first person to notice which weeks it covers is right to throw the
 * whole paper out.
 *
 * So holiday weeks can be excluded. The dates are not guessed here and not
 * derived from the dips either — deriving them from low attendance and then
 * reporting that attendance outside them is higher would be circular. They are
 * recorded by the club, in Settings, against the school calendar, and every
 * report says which ones it removed so the reader can check.
 *
 * Pure and dependency-free: the Settings editor, the server-side baseline and
 * the tests all measure a date the same way.
 */

/**
 * Kent's 2025-26 school calendar, as a starting point for the club to correct.
 *
 * Offered because an empty list means the feature does nothing on the day it
 * ships, and a committee paper is wanted this term. It is a suggestion in the
 * strict sense: nothing reads it unless the club has saved it, and Settings
 * shows every range for confirmation before it can affect a figure.
 */
export const SUGGESTED_TERM_EXCLUSIONS = [
  { from: '2025-07-21', to: '2025-08-31', label: 'Summer holidays 2025' },
  { from: '2025-10-20', to: '2025-10-31', label: 'October half-term 2025' },
  { from: '2025-12-19', to: '2026-01-04', label: 'Christmas holidays 2025' },
  { from: '2026-02-16', to: '2026-02-20', label: 'February half-term 2026' },
  { from: '2026-03-30', to: '2026-04-17', label: 'Easter holidays 2026' },
  { from: '2026-05-25', to: '2026-05-29', label: 'May half-term 2026' },
  { from: '2026-07-20', to: '2026-08-30', label: 'Summer holidays 2026' }
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A date-only string, or null for anything that is not one. */
export function toDateKey(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return ISO.test(s) ? s : null;
}

/** Days between two date keys, inclusive of both ends. Null if either is bad. */
export function daysInclusive(from, to) {
  const a = toDateKey(from);
  const b = toDateKey(to);
  if (!a || !b) return null;
  const ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
  return Math.floor(ms / 86400000) + 1;
}

/** N days before today, as a date key. */
export function dateKeyDaysAgo(days, now = Date.now()) {
  return new Date(now - days * 86400000).toISOString().split('T')[0];
}

/**
 * Valid ranges only, in date order.
 *
 * A range whose end precedes its start is dropped rather than swapped: it means
 * somebody mistyped, and silently reinterpreting it would hide a mistake that
 * changes every attendance figure downstream.
 */
export function normaliseExclusions(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(r => ({
      from: toDateKey(r && r.from),
      to: toDateKey(r && r.to),
      label: r && r.label ? String(r.label) : 'School holiday'
    }))
    .filter(r => r.from && r.to && r.to >= r.from)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** Whether a date falls inside any excluded range. */
export function isExcluded(date, exclusions) {
  const d = toDateKey(date);
  if (!d) return false;
  return (exclusions || []).some(r => d >= r.from && d <= r.to);
}

/**
 * Split rows into the ones that count and the ones that do not.
 *
 * Both sides come back, because the holiday figure is worth reporting too —
 * "the club runs at 66% in term and 51% in the holidays" is a finding, and
 * throwing half the registers away would leave no way to say it.
 */
export function partitionByTerm(rows, exclusions, dateOf = r => r && r.date) {
  const ex = normaliseExclusions(exclusions);
  const term = [];
  const holiday = [];
  (rows || []).forEach(row => {
    (isExcluded(dateOf(row), ex) ? holiday : term).push(row);
  });
  return { term, holiday };
}

/**
 * The excluded ranges that actually bite inside a window, with the days each
 * one removes from it.
 *
 * A report that says "term weeks only" and nothing else is asking to be taken
 * on trust. This is what lets it name the weeks instead.
 */
export function exclusionsInWindow(exclusions, from, to) {
  const start = toDateKey(from);
  const end = toDateKey(to);
  if (!start || !end) return [];
  return normaliseExclusions(exclusions)
    .map(r => {
      const overlapFrom = r.from > start ? r.from : start;
      const overlapTo = r.to < end ? r.to : end;
      if (overlapTo < overlapFrom) return null;
      return {
        label: r.label,
        from: overlapFrom,
        to: overlapTo,
        days: daysInclusive(overlapFrom, overlapTo)
      };
    })
    .filter(Boolean);
}

/**
 * How much of a window survives exclusion, in days and whole weeks.
 *
 * Overlapping ranges are counted once — two holidays recorded over the same
 * fortnight must not remove it twice and leave a negative term.
 */
export function termSpanOf(exclusions, from, to) {
  const total = daysInclusive(from, to);
  if (total === null) return { totalDays: null, termDays: null, holidayDays: null, termWeeks: null };

  const bites = exclusionsInWindow(exclusions, from, to)
    .sort((a, b) => (a.from < b.from ? -1 : 1));

  let holidayDays = 0;
  let coveredTo = null;
  bites.forEach(b => {
    const startAt = coveredTo && b.from <= coveredTo
      ? new Date(Date.parse(coveredTo + 'T00:00:00Z') + 86400000).toISOString().split('T')[0]
      : b.from;
    if (startAt > b.to) return;
    holidayDays += daysInclusive(startAt, b.to);
    if (!coveredTo || b.to > coveredTo) coveredTo = b.to;
  });

  const termDays = Math.max(0, total - holidayDays);
  return {
    totalDays: total,
    termDays,
    holidayDays,
    termWeeks: Math.round(termDays / 7)
  };
}

/**
 * One sentence saying what the figures rest on.
 *
 * Written to be quoted verbatim under a table, because the defence against
 * "these numbers are wrong" is the reader being able to see what was measured
 * without asking anybody.
 */
export function describeBasis({ days, termOnly, exclusions, from, to }) {
  const span = termSpanOf(termOnly ? exclusions : [], from, to);
  if (span.totalDays === null) return 'Attendance basis not recorded.';

  const range = `${from} to ${to}`;
  if (!termOnly) {
    return `Attendance measured across the ${days} days to ${to} (${range}), including school holidays.`;
  }

  const bites = exclusionsInWindow(exclusions, from, to);
  if (!bites.length) {
    return `Attendance measured across the ${days} days to ${to} (${range}). No school holidays fall in this window, so every week in it is a term week.`;
  }
  const named = bites.map(b => `${b.label} (${b.from} to ${b.to})`).join(', ');
  return `Attendance measured across term weeks only in the ${days} days to ${to}: ${span.termWeeks} term weeks, after removing ${named}.`;
}
