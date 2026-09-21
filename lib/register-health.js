/**
 * Sessions whose register does not look like it was really taken.
 *
 * Every attendance figure this club uses rests on a coach opening a register
 * and marking it. When that does not happen the numbers do not go missing —
 * they go quiet, and quiet reads as empty. A session nobody registers looks
 * like a session nobody attends, and the planner will happily offer its lanes
 * to somebody else.
 *
 * There is no single shape to this. A register can be missing entirely, or
 * stop part-way through a term, or be opened on a third of the nights it
 * should be, or be opened and everyone ticked present without looking, or be
 * opened and only the four swimmers standing nearest the coach marked at all.
 * Each of those is a different conversation with a different person, so each is
 * named separately rather than rolled into one "data quality" score.
 *
 * Pure: it takes rows and returns findings. Nothing here queries anything, so
 * the thresholds can be argued with in a test rather than in production.
 */

/** A session that has run this many times with no register is not an oversight. */
const MIN_RUNS_TO_JUDGE = 3;

/** Below this share of the nights it ran, a register is patchy rather than late. */
const PATCHY_COVERAGE = 0.6;

/** Three weeks without a register, on a session still in the timetable. */
const STOPPED_DAYS = 21;

/** Registers where nobody was ever marked absent start to look like a tick-through. */
const MIN_REGISTERS_TO_SPOT_TICKING = 4;

/** Marks below this share of the roster mean most swimmers were never marked. */
const THIN_MARKS = 0.5;

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
};

const toKey = d => d.toISOString().split('T')[0];

/**
 * Every date in the window on which this session's weekday fell.
 *
 * Dates inside a recorded closure are left out: the club was shut, so no
 * register was owed and counting one as missing would blame a coach for a
 * bank holiday.
 */
export function runDatesFor(dayOfWeek, from, to, closures = []) {
  const idx = DAY_INDEX[dayOfWeek];
  if (idx === undefined) return [];
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  if (isNaN(start) || isNaN(end) || end < start) return [];

  const shut = (key) => (closures || []).some(c =>
    c && c.type === 'exempt' && key >= c.start_date && key <= c.end_date);

  const dates = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== idx) continue;
    const key = toKey(d);
    if (!shut(key)) dates.push(key);
  }
  return dates;
}

/**
 * One session's register record over the window.
 *
 * `marks` is every attendance row for this session inside the window, each
 * carrying a date and a status.
 */
export function assessSession(session, marks, options = {}) {
  const { from, to, closures = [], rosterCount = 0, today = to } = options;

  const runs = runDatesFor(session.day, from, to, closures);
  const byDate = {};
  (marks || []).forEach(m => {
    if (!m || !m.date) return;
    const d = byDate[m.date] || (byDate[m.date] = { present: 0, absent: 0, other: 0 });
    const st = String(m.status || '').toLowerCase();
    if (st === 'present') d.present++;
    else if (st === 'absent') d.absent++;
    else d.other++;
  });

  const dates = Object.keys(byDate).sort();
  const taken = dates.length;
  const expected = runs.length;
  const coverage = expected > 0 ? taken / expected : null;

  const totalMarks = dates.reduce((n, k) => n + byDate[k].present + byDate[k].absent + byDate[k].other, 0);
  const avgMarks = taken > 0 ? +(totalMarks / taken).toFixed(1) : 0;

  // A register where nobody was marked absent. One of those is a good night;
  // every one of them is a coach ticking the column.
  const allPresent = dates.filter(k => byDate[k].absent === 0 && byDate[k].present > 0).length;

  const lastDate = dates.length ? dates[dates.length - 1] : null;
  const daysSince = lastDate
    ? Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(lastDate + 'T00:00:00Z')) / 86400000)
    : null;

  const flags = [];

  if (expected >= MIN_RUNS_TO_JUDGE && taken === 0) {
    flags.push({
      key: 'never',
      severity: 'error',
      label: 'No register at all',
      detail: `Ran ${expected} times in this window and no register was taken on any of them. Every figure for this session reads as empty.`
    });
  } else if (taken > 0) {
    if (daysSince !== null && daysSince > STOPPED_DAYS) {
      flags.push({
        key: 'stopped',
        severity: 'error',
        label: 'Register stopped',
        detail: `Last taken ${lastDate}, ${daysSince} days ago, but the session is still in the timetable.`
      });
    }
    if (coverage !== null && coverage < PATCHY_COVERAGE && expected >= MIN_RUNS_TO_JUDGE) {
      flags.push({
        key: 'patchy',
        severity: 'warning',
        label: 'Patchy',
        detail: `Taken on ${taken} of the ${expected} nights it ran — ${Math.round(coverage * 100)}%.`
      });
    }
    if (taken >= MIN_REGISTERS_TO_SPOT_TICKING && allPresent === taken) {
      flags.push({
        key: 'ticked',
        severity: 'warning',
        label: 'Nobody ever absent',
        detail: `All ${taken} registers have every swimmer present. Possible, but worth checking the register is being marked rather than ticked through.`
      });
    }
    if (rosterCount > 0 && avgMarks > 0 && avgMarks < rosterCount * THIN_MARKS) {
      flags.push({
        key: 'thin',
        severity: 'warning',
        label: 'Most swimmers unmarked',
        detail: `An average of ${avgMarks} swimmers marked against a roster of ${rosterCount}. The register is opened but most of the squad is left blank.`
      });
    }
  }

  // The nights themselves, so a finding can be opened rather than believed.
  // "Taken on 3 of 13" is a claim; the three dates and the ten missing ones are
  // the evidence, and the person who has to act on it will want to see which
  // Friday went unmarked before they go and ask anybody about it.
  const nights = runs.map(date => {
    const d = byDate[date];
    return {
      date,
      taken: !!d,
      present: d ? d.present : 0,
      absent: d ? d.absent : 0,
      other: d ? d.other : 0,
      marks: d ? d.present + d.absent + d.other : 0
    };
  });
  // A register on a night the session was not expected to run — a one-off, a
  // rearranged session, or a date recorded against the wrong row.
  const unexpected = dates.filter(d => !runs.includes(d));

  return {
    sessionId: session.id,
    name: session.name,
    day: session.day,
    nights,
    missingDates: nights.filter(n => !n.taken).map(n => n.date),
    unexpectedDates: unexpected,
    time: session.startTime && session.endTime ? `${session.startTime}-${session.endTime}` : null,
    venue: session.location || null,
    rosterCount,
    expected,
    taken,
    coveragePct: coverage === null ? null : Math.round(coverage * 100),
    avgMarks,
    allPresentRegisters: allPresent,
    lastDate,
    daysSince,
    flags,
    worst: flags.some(f => f.severity === 'error') ? 'error' : flags.length ? 'warning' : 'ok'
  };
}

/**
 * Every session, worst first.
 *
 * Sessions with nothing wrong are kept, because "47 of 52 are fine" is the
 * context that stops five findings reading as a broken club.
 */
export function assessRegisters({ sessions, marksBySession, rosterBySession = {}, from, to, closures = [], today }) {
  const rows = (sessions || []).map(s => assessSession(s, marksBySession[s.id] || [], {
    from, to, closures, today: today || to, rosterCount: rosterBySession[s.id] || 0
  }));

  const order = { error: 0, warning: 1, ok: 2 };
  rows.sort((a, b) => {
    const d = order[a.worst] - order[b.worst];
    if (d !== 0) return d;
    if (a.coveragePct === null) return 1;
    if (b.coveragePct === null) return -1;
    return a.coveragePct - b.coveragePct;
  });

  const flagged = rows.filter(r => r.worst !== 'ok');
  const counts = {};
  flagged.forEach(r => r.flags.forEach(f => { counts[f.key] = (counts[f.key] || 0) + 1; }));

  return {
    window: { from, to },
    rows,
    flagged,
    clusters: findStoppedClusters(rows),
    summary: {
      sessions: rows.length,
      clean: rows.length - flagged.length,
      flagged: flagged.length,
      errors: rows.filter(r => r.worst === 'error').length,
      byFlag: counts,
      registersTaken: rows.reduce((n, r) => n + r.taken, 0),
      registersExpected: rows.reduce((n, r) => n + r.expected, 0)
    }
  };
}

/** Registers stopping within this many days of each other look like one event. */
const CLUSTER_DAYS = 3;

/** Below this, sessions stopping near each other is coincidence. */
const MIN_CLUSTER = 3;

/**
 * Sessions whose registers stopped at about the same time.
 *
 * Six sessions that each went quiet in the last week of August is not six
 * coaches forgetting; it is one thing that happened — a coach leaving, a term
 * starting, a squad moving to a session recorded elsewhere. Listed one by one
 * it reads as a club-wide collapse in record keeping, and whoever reads it goes
 * looking for six conversations instead of one.
 *
 * The cluster is reported as a finding in its own right so the reader sees the
 * shape before the list.
 */
export function findStoppedClusters(rows) {
  const stopped = (rows || [])
    .filter(r => r.flags.some(f => f.key === 'stopped') && r.lastDate)
    .sort((a, b) => a.lastDate.localeCompare(b.lastDate));

  const clusters = [];
  let current = [];
  stopped.forEach(r => {
    if (!current.length) { current = [r]; return; }
    const gap = Math.abs(
      (Date.parse(r.lastDate) - Date.parse(current[current.length - 1].lastDate)) / 86400000);
    if (gap <= CLUSTER_DAYS) current.push(r);
    else { clusters.push(current); current = [r]; }
  });
  if (current.length) clusters.push(current);

  return clusters
    .filter(c => c.length >= MIN_CLUSTER)
    .map(c => ({
      from: c[0].lastDate,
      to: c[c.length - 1].lastDate,
      count: c.length,
      sessions: c.map(r => r.name),
      days: Array.from(new Set(c.map(r => r.day))),
      venues: Array.from(new Set(c.map(r => r.venue).filter(Boolean))),
      detail: `${c.length} sessions last registered between ${c[0].lastDate} and ${c[c.length - 1].lastDate}. That is more likely to be one change — a coach, a term, a squad moved onto another session — than ${c.length} separate oversights.`
    }));
}

export const REGISTER_THRESHOLDS = {
  CLUSTER_DAYS, MIN_CLUSTER,
  MIN_RUNS_TO_JUDGE, PATCHY_COVERAGE, STOPPED_DAYS,
  MIN_REGISTERS_TO_SPOT_TICKING, THIN_MARKS
};
