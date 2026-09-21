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
export function assessRegisters({ sessions, marksBySession, rosterBySession = {}, from, to, closures = [], today, squadNames = [] }) {
  const rows = (sessions || []).map(s => ({
    ...assessSession(s, marksBySession[s.id] || [], {
      from, to, closures, today: today || to, rosterCount: rosterBySession[s.id] || 0
    }),
    squad: squadNameFor(s.name, squadNames)
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
    unrecordedClosures: findUnrecordedClosures({ marksBySession, from, to, closures, today: today || to }),
    bySquad: groupBySquad(rows),
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

/**
 * Which squad a session belongs to, by name.
 *
 * Sessions carry no squad id in this database; the squad is in the name, and
 * has to be recovered from it. Longest name first, because "MASTERS JNR" is
 * also a "MASTERS" and matching the short one first would put every Junior
 * Masters session under Masters — the same substring trap that has both squads
 * claiming the same ten sessions on the capacity page.
 *
 * Learn to Swim and land training belong to no squad and are returned as null
 * rather than forced into one.
 */
export function squadNameFor(sessionName, squadNames = []) {
  const n = String(sessionName || '').toLowerCase();
  if (!n) return null;
  if (/\blts\b|learn to swim/.test(n)) return null;
  if (/land training/.test(n)) return null;

  const byLength = [...squadNames].sort((a, b) => String(b).length - String(a).length);
  for (const squad of byLength) {
    const s = String(squad || '').toLowerCase().trim();
    if (!s) continue;
    if (n.includes(s)) return squad;
  }
  // Fall back to the first word — "NAR+ Friday" against a squad called "NAR".
  for (const squad of byLength) {
    const first = String(squad || '').toLowerCase().split(' ')[0];
    if (first.length > 2 && n.includes(first)) return squad;
  }
  return null;
}

/**
 * The findings gathered under the squad they belong to.
 *
 * Fifty-two sessions worst-first is a list to work through; the same fifty-two
 * under eight squad headings is a page somebody can scan and see that Masters
 * is most of the problem. Squads are ordered by how much is wrong with them,
 * and every squad keeps its own count of registers taken against owed, so a
 * heading can be read without the rows beneath it.
 */
export function groupBySquad(rows) {
  const groups = new Map();
  (rows || []).forEach(r => {
    const key = r.squad || 'No squad';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  return Array.from(groups.entries()).map(([squad, sessions]) => {
    const flagged = sessions.filter(s => s.worst !== 'ok');
    return {
      squad,
      sessions,
      flagged,
      errors: sessions.filter(s => s.worst === 'error').length,
      clean: sessions.length - flagged.length,
      taken: sessions.reduce((n, s) => n + s.taken, 0),
      expected: sessions.reduce((n, s) => n + s.expected, 0)
    };
  }).sort((a, b) => {
    if (b.errors !== a.errors) return b.errors - a.errors;
    if (b.flagged.length !== a.flagged.length) return b.flagged.length - a.flagged.length;
    return a.squad.localeCompare(b.squad);
  });
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

/** Consecutive silent days below this are a quiet weekend, not a shutdown. */
const SILENT_RUN_DAYS = 3;

/**
 * Stretches where the whole club went quiet and no closure was recorded.
 *
 * A shutdown the club took but nobody wrote down is indistinguishable, in the
 * data, from every coach in the club forgetting the register on the same day.
 * The difference matters: one is a week off, the other is a crisis, and the
 * report was calling the first the second. Eight days with not a single mark
 * anywhere in the club is not fifty-two independent oversights.
 *
 * Only days the club was open are considered, so a run that sits inside a
 * recorded closure never appears, and a run that overlaps one is reported for
 * the uncovered part only — which is how a shutdown recorded with last year's
 * dates shows up as the few days it has drifted by.
 *
 * Reported rather than acted on. The report cannot know whether the pool was
 * shut or the club simply stopped writing things down, so it says what it sees
 * and leaves the closure for somebody to record in Settings.
 */
export function findUnrecordedClosures({ marksBySession = {}, from, to, closures = [], today }) {
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date((today && today < to ? today : to) + 'T00:00:00Z');
  if (isNaN(start) || isNaN(end) || end < start) return [];

  // Only somebody actually in the water counts as the club being open. Three
  // swimmers marked absent across a fortnight's shutdown is somebody tidying
  // up, and reading those as training days split this club's fourteen-day
  // shutdown into an eight-day one and missed the rest of it.
  const swam = new Set();
  const anyMark = new Set();
  Object.values(marksBySession).forEach(list => (list || []).forEach(m => {
    if (!m || !m.date) return;
    const key = String(m.date).slice(0, 10);
    anyMark.add(key);
    if (String(m.status || '').toLowerCase() !== 'absent') swam.add(key);
  }));
  if (!anyMark.size) return [];

  const shutBy = (key) => (closures || []).find(c =>
    c && c.type === 'exempt' && key >= c.start_date && key <= c.end_date) || null;

  const runs = [];
  let current = null;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = toKey(d);
    const quiet = !swam.has(key) && !shutBy(key);
    if (quiet) {
      if (!current) current = { from: key, to: key, days: 1 };
      else { current.to = key; current.days += 1; }
    } else {
      if (current) runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);

  return runs
    .filter(r => r.days >= SILENT_RUN_DAYS)
    .map(r => {
      // A closure recorded for the same weeks of a different year is the
      // commonest cause, and naming it turns "add a closure" into "correct
      // the dates on one you already have".
      const near = (closures || [])
        .filter(c => c && c.type === 'exempt')
        .map(c => ({
          name: c.name,
          start: c.start_date,
          end: c.end_date,
          monthsApart: Math.abs(
            (Date.parse(r.from) - Date.parse(c.start_date)) / 86400000)
        }))
        .filter(c => c.monthsApart >= 300 && c.monthsApart <= 430)
        .sort((a, b) => Math.abs(a.monthsApart - 365) - Math.abs(b.monthsApart - 365))[0] || null;

      return {
        from: r.from,
        to: r.to,
        days: r.days,
        likelyRepeatOf: near ? { name: near.name, start: near.start, end: near.end } : null,
        detail: near
          ? `Not one mark anywhere in the club for ${r.days} days. "${near.name}" is recorded for ${near.start} to ${near.end}, about a year earlier, so this is most likely the same closure with this year's dates never added.`
          : `Not one mark anywhere in the club for ${r.days} days, and no closure is recorded over them. Either the club was shut and nobody wrote it down, or every register in the club was missed at once.`
      };
    });
}

export const REGISTER_THRESHOLDS = {
  CLUSTER_DAYS, MIN_CLUSTER, SILENT_RUN_DAYS,
  MIN_RUNS_TO_JUDGE, PATCHY_COVERAGE, STOPPED_DAYS,
  MIN_REGISTERS_TO_SPOT_TICKING, THIN_MARKS
};
