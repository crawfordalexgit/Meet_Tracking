import { test, expect } from '@playwright/test';
import {
  runDatesFor, assessSession, assessRegisters, findStoppedClusters,
  squadNameFor, groupBySquad, findUnrecordedClosures
} from '../../lib/register-health.js';

/**
 * A register that was never taken looks exactly like a session nobody attends.
 *
 * That is the whole reason this exists. Attendance figures go quiet rather than
 * missing, quiet reads as empty, and the planner will offer an empty session's
 * lanes to somebody else. Six of this club's sessions had stopped being
 * registered weeks ago and every figure for them read as near-zero.
 */
const session = (over = {}) => ({
  id: 's1', name: 'SILVER Friday', day: 'Friday',
  startTime: '19:00', endTime: '20:00', location: 'Tonbridge Town Pool', ...over
});

const marks = (dates, per = 10, absent = 2) =>
  dates.flatMap(date => [
    ...Array.from({ length: per - absent }, () => ({ date, status: 'present' })),
    ...Array.from({ length: absent }, () => ({ date, status: 'absent' }))
  ]);

const WINDOW = { from: '2026-06-26', to: '2026-09-18', today: '2026-09-21' };

test.describe('counting the nights a session ran', () => {
  test('every matching weekday in the window', () => {
    const d = runDatesFor('Friday', '2026-09-01', '2026-09-30');
    expect(d).toEqual(['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
  });

  test('a closure is not a night the register was owed', () => {
    // Blaming a coach for a bank holiday is how a report loses its reader.
    const d = runDatesFor('Friday', '2026-09-01', '2026-09-30', [
      { type: 'exempt', start_date: '2026-09-11', end_date: '2026-09-11' }
    ]);
    expect(d).toEqual(['2026-09-04', '2026-09-18', '2026-09-25']);
  });

  test('a credit day still owes a register', () => {
    // The club trains through bank holidays; only a closure excuses a register.
    const d = runDatesFor('Friday', '2026-09-01', '2026-09-11', [
      { type: 'credit', start_date: '2026-09-04', end_date: '2026-09-04' }
    ]);
    expect(d).toContain('2026-09-04');
  });

  test('an unknown or missing day yields nothing rather than guessing', () => {
    expect(runDatesFor(null, '2026-09-01', '2026-09-30')).toEqual([]);
    expect(runDatesFor('Someday', '2026-09-01', '2026-09-30')).toEqual([]);
  });
});

test.describe('spotting a register that was not really taken', () => {
  test('never taken, on a session that ran repeatedly', () => {
    const r = assessSession(session(), [], { ...WINDOW, rosterCount: 20 });
    expect(r.taken).toBe(0);
    expect(r.flags.map(f => f.key)).toContain('never');
    expect(r.worst).toBe('error');
  });

  test('a session that has only run once or twice is not accused', () => {
    // Too new to judge. Flagging it teaches the reader to ignore the report.
    const r = assessSession(session(), [], { from: '2026-09-11', to: '2026-09-18', today: '2026-09-21' });
    expect(r.expected).toBe(2);
    expect(r.flags).toEqual([]);
  });

  test('a register that stopped weeks ago, on a live session', () => {
    const r = assessSession(session(),
      marks(['2026-07-03', '2026-07-10', '2026-08-28']),
      { ...WINDOW, rosterCount: 20 });
    const stopped = r.flags.find(f => f.key === 'stopped');
    expect(stopped).toBeTruthy();
    expect(stopped.detail).toContain('2026-08-28');
    expect(r.daysSince).toBe(24);
  });

  test('a register taken last week is not called stopped', () => {
    const r = assessSession(session(),
      marks(['2026-09-04', '2026-09-11', '2026-09-18']),
      { ...WINDOW, rosterCount: 10 });
    expect(r.flags.map(f => f.key)).not.toContain('stopped');
  });

  test('patchy: opened on a third of the nights it ran', () => {
    const r = assessSession(session(),
      marks(['2026-09-04', '2026-09-11', '2026-09-18']),
      { ...WINDOW, rosterCount: 10 });
    const patchy = r.flags.find(f => f.key === 'patchy');
    expect(patchy).toBeTruthy();
    expect(r.coveragePct).toBeLessThan(60);
  });

  test('nobody ever absent, across enough registers to mean it', () => {
    const allIn = ['2026-08-28', '2026-09-04', '2026-09-11', '2026-09-18']
      .flatMap(date => marks([date], 8, 0));
    const r = assessSession(session(), allIn, { ...WINDOW, rosterCount: 8 });
    expect(r.flags.map(f => f.key)).toContain('ticked');
    expect(r.allPresentRegisters).toBe(4);
  });

  test('one perfect night is a good night, not a finding', () => {
    const r = assessSession(session(), marks(['2026-09-18'], 8, 0),
      { ...WINDOW, rosterCount: 8 });
    expect(r.flags.map(f => f.key)).not.toContain('ticked');
  });

  test('most of the squad left unmarked', () => {
    // The register is opened and four of twenty are marked either way.
    const r = assessSession(session(),
      marks(['2026-09-04', '2026-09-11', '2026-09-18'], 4, 1),
      { ...WINDOW, rosterCount: 20 });
    expect(r.flags.map(f => f.key)).toContain('thin');
  });

  test('a small squad fully marked is not thin', () => {
    const r = assessSession(session(),
      marks(['2026-09-04', '2026-09-11', '2026-09-18'], 3, 1),
      { ...WINDOW, rosterCount: 3 });
    expect(r.flags.map(f => f.key)).not.toContain('thin');
  });

  test('a healthy session raises nothing at all', () => {
    const every = runDatesFor('Friday', WINDOW.from, WINDOW.to);
    const r = assessSession(session(), marks(every, 18, 4), { ...WINDOW, rosterCount: 20 });
    expect(r.flags).toEqual([]);
    expect(r.worst).toBe('ok');
    expect(r.coveragePct).toBe(100);
  });
});

test.describe('reading the whole club at once', () => {
  const build = (defs) => {
    const sessions = defs.map((d, i) => session({ id: 's' + i, name: d.name, day: d.day || 'Friday' }));
    const marksBySession = {};
    defs.forEach((d, i) => { marksBySession['s' + i] = marks(d.dates || []); });
    const rosterBySession = {};
    defs.forEach((d, i) => { rosterBySession['s' + i] = d.roster ?? 10; });
    return assessRegisters({ sessions, marksBySession, rosterBySession, ...WINDOW });
  };

  test('worst first, and the clean ones still counted', () => {
    // "23 of 52 are fine" is the context that stops five findings reading as
    // a broken club.
    const every = runDatesFor('Friday', WINDOW.from, WINDOW.to);
    const out = build([
      { name: 'Healthy', dates: every },
      { name: 'Never', dates: [] }
    ]);
    expect(out.rows[0].name).toBe('Never');
    expect(out.summary.clean).toBe(1);
    expect(out.summary.flagged).toBe(1);
    expect(out.summary.errors).toBe(1);
  });

  test('counts each kind of fault separately', () => {
    const out = build([{ name: 'Never', dates: [] }, { name: 'AlsoNever', dates: [] }]);
    expect(out.summary.byFlag.never).toBe(2);
  });
});

test.describe('registers that stopped together', () => {
  const stoppedRow = (name, lastDate) => ({
    name, day: 'Friday', venue: 'Tonbridge Town Pool', lastDate,
    flags: [{ key: 'stopped', severity: 'error', label: 'Register stopped', detail: '' }]
  });

  test('sessions going quiet within days are reported as one event', () => {
    // Six sessions last registered in the same week is one change — a coach, a
    // term, a squad moved elsewhere — not six people forgetting.
    const clusters = findStoppedClusters([
      stoppedRow('SILVER Friday', '2026-08-28'),
      stoppedRow('BRONZE Friday', '2026-08-28'),
      stoppedRow('NAR+ Friday', '2026-08-27'),
      stoppedRow('CLUB 2 Friday', '2026-08-28')
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(4);
    expect(clusters[0].from).toBe('2026-08-27');
    expect(clusters[0].detail).toContain('one change');
  });

  test('two sessions stopping together is coincidence, not a pattern', () => {
    expect(findStoppedClusters([
      stoppedRow('A', '2026-08-28'), stoppedRow('B', '2026-08-28')
    ])).toEqual([]);
  });

  test('sessions stopping months apart are separate', () => {
    const clusters = findStoppedClusters([
      stoppedRow('A', '2026-06-05'), stoppedRow('B', '2026-06-06'), stoppedRow('C', '2026-06-07'),
      stoppedRow('D', '2026-08-28'), stoppedRow('E', '2026-08-28'), stoppedRow('F', '2026-08-27')
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters.map(c => c.count)).toEqual([3, 3]);
  });

  test('rows with no stop are ignored', () => {
    expect(findStoppedClusters([{ name: 'ok', flags: [], lastDate: '2026-09-18' }])).toEqual([]);
    expect(findStoppedClusters([])).toEqual([]);
    expect(findStoppedClusters(null)).toEqual([]);
  });
});

test.describe('which squad a session belongs to', () => {
  const SQUADS = ['AGE DEVELOPMENT', 'BRONZE', 'CLUB 2', 'GOLD DEVELOPMENT',
    'MASTERS', 'MASTERS JNR', 'NAR', 'SILVER', 'TECHNICAL DEVELOPMENT SQUAD'];

  test('the obvious ones', () => {
    expect(squadNameFor('SILVER Friday', SQUADS)).toBe('SILVER');
    expect(squadNameFor('BRONZE Monday pm', SQUADS)).toBe('BRONZE');
    expect(squadNameFor('AGE DEVELOPMENT Tuesday', SQUADS)).toBe('AGE DEVELOPMENT');
  });

  test('the longer squad name wins, so Junior Masters is not Masters', () => {
    // The substring trap: every "MASTERS JNR" session is also a "MASTERS" one,
    // and matching the short name first is why both squads claim the same ten
    // sessions on the capacity page.
    expect(squadNameFor('MASTERS JNR Sunday', SQUADS)).toBe('MASTERS JNR');
    expect(squadNameFor('MASTERS (FASTER) Sunday Morning', SQUADS)).toBe('MASTERS');
  });

  test('a first-word fallback catches a decorated name', () => {
    expect(squadNameFor('NAR+ Friday', SQUADS)).toBe('NAR');
    expect(squadNameFor('TECHNICAL DEVELOPMENT Friday pm', SQUADS)).toBe('TECHNICAL DEVELOPMENT SQUAD');
  });

  test('learn to swim and land training are named, not filed under no squad', () => {
    // They are not squads, but they are groups with coaches and registers of
    // their own. Returning null put five of this club's sessions under a
    // heading that reads like a data fault, and one of them had the second
    // worst coverage on the page.
    expect(squadNameFor('LTS 3/4 Friday', SQUADS)).toBe('Learn to Swim');
    expect(squadNameFor('LTS 5/6 Friday', SQUADS)).toBe('Learn to Swim');
    expect(squadNameFor('LTS 5-6 Sunday pm', SQUADS)).toBe('Learn to Swim');
    expect(squadNameFor('Land training', SQUADS)).toBe('Land training');
  });

  test('their registers stay off a squad record', () => {
    // Naming them must not quietly fold them into a squad's figures.
    const names = ['LTS 3/4 Friday', 'Land training'].map(n => squadNameFor(n, SQUADS));
    names.forEach(n => expect(SQUADS).not.toContain(n));
  });

  test('an unrecognised session is left unattributed rather than guessed', () => {
    expect(squadNameFor('Something else entirely', SQUADS)).toBeNull();
    expect(squadNameFor('', SQUADS)).toBeNull();
    expect(squadNameFor(null, SQUADS)).toBeNull();
    expect(squadNameFor('SILVER Friday', [])).toBeNull();
  });
});

test.describe('gathering the findings under each squad', () => {
  const row = (name, squad, worst, taken, expected) => ({
    name, squad, worst, taken, expected, flags: worst === 'ok' ? [] : [{ key: 'patchy', severity: worst }]
  });

  test('squads with the most wrong come first', () => {
    const groups = groupBySquad([
      row('A', 'SILVER', 'ok', 13, 13),
      row('B', 'MASTERS', 'error', 0, 13),
      row('C', 'MASTERS', 'error', 1, 13),
      row('D', 'BRONZE', 'warning', 8, 13)
    ]);
    expect(groups.map(g => g.squad)).toEqual(['MASTERS', 'BRONZE', 'SILVER']);
    expect(groups[0].errors).toBe(2);
  });

  test('each squad carries its own registers taken against owed', () => {
    // So a heading can be read without the rows beneath it.
    const groups = groupBySquad([
      row('B', 'MASTERS', 'error', 0, 13),
      row('C', 'MASTERS', 'warning', 4, 13)
    ]);
    expect(groups[0].taken).toBe(4);
    expect(groups[0].expected).toBe(26);
    expect(groups[0].clean).toBe(0);
    expect(groups[0].sessions).toHaveLength(2);
  });

  test('sessions belonging to no squad are gathered, not dropped', () => {
    const groups = groupBySquad([row('LTS', null, 'error', 0, 13)]);
    expect(groups[0].squad).toBe('No squad');
  });

  test('a squad with nothing wrong still appears, with its clean count', () => {
    const groups = groupBySquad([row('A', 'SILVER', 'ok', 13, 13)]);
    expect(groups[0].flagged).toEqual([]);
    expect(groups[0].clean).toBe(1);
  });
});

/**
 * A shutdown nobody wrote down.
 *
 * This is the real one. The club's summer shutdown was recorded for 1-14
 * August 2025 and never rolled forward; in 2026 the club shut 1-8 August, so
 * eight days of silence were being counted as fifty-two coaches all missing
 * their register at once. The dates below are the club's own.
 */
const marksOn = (dates) => ({ s1: dates.map(d => ({ date: d, status: 'present' })) });
const everyDayExcept = (from, to, skip) => {
  const out = [];
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    if (!skip.includes(k)) out.push(k);
  }
  return out;
};
const range = (from, to) => everyDayExcept(from, to, []);

test.describe('a closure nobody recorded', () => {
  const WINDOW = { from: '2026-07-20', to: '2026-08-20' };
  const silent = range('2026-08-01', '2026-08-08');
  const marksBySession = marksOn(everyDayExcept(WINDOW.from, WINDOW.to, silent));

  test('eight silent days with no closure are reported as one stretch', () => {
    const found = findUnrecordedClosures({ marksBySession, ...WINDOW, closures: [] });
    expect(found).toHaveLength(1);
    expect(found[0].from).toBe('2026-08-01');
    expect(found[0].to).toBe('2026-08-08');
    expect(found[0].days).toBe(8);
  });

  test('a closure recorded over those days is not reported', () => {
    const found = findUnrecordedClosures({
      marksBySession, ...WINDOW,
      closures: [{ name: 'Summer Shutdown', type: 'exempt', start_date: '2026-08-01', end_date: '2026-08-08' }]
    });
    expect(found).toEqual([]);
  });

  test('the previous year dates are named, because correcting one beats adding one', () => {
    // The club's actual record: the shutdown exists, dated 2025.
    const found = findUnrecordedClosures({
      marksBySession, ...WINDOW,
      closures: [{ name: 'Annual TSC Summer Shutdown', type: 'exempt', start_date: '2025-08-01', end_date: '2025-08-14' }]
    });
    expect(found).toHaveLength(1);
    expect(found[0].likelyRepeatOf.name).toBe('Annual TSC Summer Shutdown');
    expect(found[0].detail).toContain('about a year earlier');
  });

  test('a credit day is not a closure, so it does not excuse silence', () => {
    // Bank holidays the club trains through are credits. Treating one as a
    // closure is how 112 bank-holiday flags were wrongly cleared before.
    const found = findUnrecordedClosures({
      marksBySession, ...WINDOW,
      closures: [{ name: 'Summer Bank Holiday', type: 'credit', start_date: '2026-08-01', end_date: '2026-08-08' }]
    });
    expect(found).toHaveLength(1);
  });

  test('a quiet weekend is not a shutdown', () => {
    const twoDays = range('2026-08-01', '2026-08-02');
    const found = findUnrecordedClosures({
      marksBySession: marksOn(everyDayExcept(WINDOW.from, WINDOW.to, twoDays)),
      ...WINDOW, closures: []
    });
    expect(found).toEqual([]);
  });

  test('only the part outside a recorded closure is reported', () => {
    // A shutdown recorded three days short still shows the drift.
    const found = findUnrecordedClosures({
      marksBySession, ...WINDOW,
      closures: [{ name: 'Summer Shutdown', type: 'exempt', start_date: '2026-08-01', end_date: '2026-08-05' }]
    });
    expect(found).toHaveLength(1);
    expect(found[0].from).toBe('2026-08-06');
    expect(found[0].to).toBe('2026-08-08');
  });

  test('a club with no marks at all reports nothing rather than one long closure', () => {
    // Nothing loaded is not the same as nothing happened.
    expect(findUnrecordedClosures({ marksBySession: {}, ...WINDOW, closures: [] })).toEqual([]);
  });

  test('silence after today is not counted, because it has not happened yet', () => {
    const found = findUnrecordedClosures({
      marksBySession: marksOn(range('2026-07-20', '2026-07-31')),
      ...WINDOW, closures: [], today: '2026-07-31'
    });
    expect(found).toEqual([]);
  });

  test('assessRegisters carries the finding', () => {
    const report = assessRegisters({
      sessions: [{ id: 's1', name: 'SILVER Monday', day: 'Monday' }],
      marksBySession, rosterBySession: { s1: 10 }, ...WINDOW, closures: []
    });
    expect(report.unrecordedClosures).toHaveLength(1);
    expect(report.unrecordedClosures[0].days).toBe(8);
  });
});

test.describe('a shutdown with a few absences marked in it', () => {
  // The club's own: three swimmers marked absent on 9, 11 and 13 August, in
  // the middle of a fortnight when the pool was shut. Read as training days
  // they cut a fourteen-day shutdown down to eight and hid the rest.
  const WINDOW = { from: '2026-07-20', to: '2026-08-20' };
  const inWater = (d) => ({ date: d, status: 'present' });
  const open = [];
  for (let d = new Date('2026-07-20T00:00:00Z'); d <= new Date('2026-08-20T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    if (k < '2026-08-01' || k > '2026-08-14') open.push(inWater(k));
  }
  const marksBySession = {
    s1: open,
    s2: [
      { date: '2026-08-09', status: 'absent' },
      { date: '2026-08-11', status: 'absent' },
      { date: '2026-08-13', status: 'absent' }
    ]
  };

  test('absences alone do not make a day a training day', () => {
    const found = findUnrecordedClosures({ marksBySession, ...WINDOW, closures: [] });
    expect(found).toHaveLength(1);
    expect(found[0].from).toBe('2026-08-01');
    expect(found[0].to).toBe('2026-08-14');
    expect(found[0].days).toBe(14);
  });

  test('one swimmer in the water does end the closure', () => {
    const found = findUnrecordedClosures({
      marksBySession: { ...marksBySession, s3: [inWater('2026-08-09')] },
      ...WINDOW, closures: []
    });
    expect(found.map(c => `${c.from}..${c.to}`)).toEqual(['2026-08-01..2026-08-08', '2026-08-10..2026-08-14']);
  });
});
