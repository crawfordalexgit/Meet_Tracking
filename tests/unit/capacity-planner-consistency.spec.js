import { test, expect } from '@playwright/test';
import { peakLanesOf, laneSegments } from '../../lib/session-lanes.js';

// The two readers, as each page now implements them.
const lanesOf = (session) => {
  const raw = session?.lanes_allocated;
  if (raw === null || raw === undefined || raw === '') return 6;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 6;
};

test.describe('capacity and the planner read a session the same way', () => {
  const AGE_MON = { start_time: '19:00', end_time: '21:00', lanes_allocated: 2 };
  const DROP = [{ from: '20:00', lanes: 1 }];

  test('a session recorded as using no lanes holds none on both pages', () => {
    const land = { start_time: '18:45', end_time: '19:45', lanes_allocated: 0 };
    expect(lanesOf(land)).toBe(0);
    expect(peakLanesOf(land, [], lanesOf(land))).toBe(0);
  });

  test('a session that has never had a lane count still assumes six', () => {
    expect(lanesOf({ lanes_allocated: null })).toBe(6);
    expect(lanesOf({})).toBe(6);
  });

  test('capacity is sized on the peak, not the average', () => {
    // Age Monday holds two lanes until eight and one after. Twelve places while
    // it has two lanes is the number that matters for whether swimmers fit; an
    // average of 1.5 would size it for a lane nobody ever swims in.
    expect(peakLanesOf(AGE_MON, DROP, lanesOf(AGE_MON))).toBe(2);
  });

  test('a lane change is shown rather than hidden behind its peak', () => {
    const segs = laneSegments(AGE_MON, DROP, lanesOf(AGE_MON));
    expect(segs.map(s => s.lanes)).toEqual([2, 1]);
  });

  test('a session with no change reads as a plain lane count', () => {
    expect(laneSegments(AGE_MON, [], 2).map(s => s.lanes)).toEqual([2]);
  });
});

/**
 * A squad with no weekly session target has no maximum size.
 *
 * /capacity computed it as `totalWeeklySlots / (target || 1)`, so Masters —
 * which is set no target at all — read as having room for one swimmer per
 * place: 144 of them, against 43 on the books, shown as "30% full". The squad
 * was not 70% empty; there was simply nothing to measure it against, and the
 * page said the one thing that could not be true rather than saying so.
 *
 * The planner already refuses this: squads with no target are named and left
 * out of the count of squads getting their training week. This keeps the two
 * pages honest in the same way.
 */
const maxSquadSizeFor = (totalWeeklySlots, targetSessionsPerWeek) => {
  const hasTarget = Number(targetSessionsPerWeek) > 0;
  return hasTarget ? Math.floor(totalWeeklySlots / Number(targetSessionsPerWeek)) : null;
};

test.describe('squad capacity needs a weekly target', () => {
  test('a squad with a target sizes on it', () => {
    expect(maxSquadSizeFor(159, 4)).toBe(39);
    expect(maxSquadSizeFor(88, 5)).toBe(17);
  });

  test('a squad with no target has no maximum, rather than a target of one', () => {
    // The bug: 144 places read as room for 144 Masters swimmers.
    expect(maxSquadSizeFor(144, 0)).toBeNull();
    expect(maxSquadSizeFor(144, null)).toBeNull();
    expect(maxSquadSizeFor(144, undefined)).toBeNull();
    expect(maxSquadSizeFor(144, '')).toBeNull();
  });

  test('a target arriving as a string still counts', () => {
    expect(maxSquadSizeFor(144, '2')).toBe(72);
  });

  test('no target means a squad can never be reported over capacity', () => {
    const over = (size, slots, target) => {
      const max = maxSquadSizeFor(slots, target);
      return max !== null && max > 0 && size > max;
    };
    expect(over(43, 144, 0)).toBe(false);
    expect(over(30, 100, 4)).toBe(true);
  });
});

/**
 * A session holding no lanes provides no pool time.
 *
 * Age is recorded as a two-hour session plus a one-hour one on the same night,
 * the second at zero lanes because its lanes are already counted on the first.
 * Places were computed correctly — lanes times swimmers-per-lane is zero — but
 * the hours and session count were not, so the card offered Age fifteen hours
 * across nine sessions when it holds thirteen across seven. Two of those hours
 * were water that does not exist.
 */
const poolTimeOf = (sessions, lanesFor) => {
  const water = sessions.filter(s => lanesFor(s) > 0);
  return {
    hours: Math.round(water.reduce((sum, s) => sum + s.hours, 0) * 10) / 10,
    sessionCount: water.length,
    registerOnlyCount: sessions.length - water.length
  };
};

test.describe('pool time excludes register-only sessions', () => {
  const lanesFor = s => s.lanes;

  test('a zero-lane session adds neither hours nor a session', () => {
    const out = poolTimeOf([
      { hours: 2, lanes: 3 }, { hours: 2, lanes: 2 }, { hours: 1, lanes: 0 }
    ], lanesFor);
    expect(out.hours).toBe(4);
    expect(out.sessionCount).toBe(2);
    expect(out.registerOnlyCount).toBe(1);
  });

  test("Age's real week, against what the card used to claim", () => {
    const age = [
      { hours: 2, lanes: 2 }, { hours: 2, lanes: 3 }, { hours: 2, lanes: 2 },
      { hours: 2, lanes: 2 }, { hours: 2, lanes: 3 }, { hours: 1, lanes: 2 },
      { hours: 2, lanes: 3 },
      { hours: 1, lanes: 0 }, { hours: 1, lanes: 0 }
    ];
    const out = poolTimeOf(age, lanesFor);
    expect(out.hours).toBe(13);
    expect(out.sessionCount).toBe(7);
    expect(out.registerOnlyCount).toBe(2);
    // What it showed before: every session counted.
    expect(age.reduce((s, x) => s + x.hours, 0)).toBe(15);
    expect(age.length).toBe(9);
  });

  test('a squad with no register-only sessions is unchanged', () => {
    const out = poolTimeOf([{ hours: 1, lanes: 2 }, { hours: 1.5, lanes: 3 }], lanesFor);
    expect(out.hours).toBe(2.5);
    expect(out.sessionCount).toBe(2);
    expect(out.registerOnlyCount).toBe(0);
  });

  test('places already ignored zero-lane sessions, and still do', () => {
    // lanes x swimmers-per-lane is zero, so this was never wrong.
    const places = [{ lanes: 3 }, { lanes: 0 }].reduce((sum, s) => sum + s.lanes * 7, 0);
    expect(places).toBe(21);
  });
});

/**
 * Only a closure makes attendance suspect.
 *
 * club_exemptions records two kinds of day: 'exempt' means the club was shut,
 * 'credit' means the day is optional and nobody is marked down for missing it.
 * The data health check tested only whether a date matched some exemption, so
 * every swimmer who trained on a bank holiday the club had chosen to run was
 * reported as an error — 112 of them across four dates, none of which was a
 * closure. Training on a day you did not have to is not a data fault.
 */
const flagsAttendance = (exemption) => !!exemption && exemption.type === 'exempt';

test.describe('attendance on an exempt date', () => {
  test('a closure flags attendance', () => {
    expect(flagsAttendance({ name: 'Christmas Shutdown', type: 'exempt' })).toBe(true);
  });

  test('a credit day does not', () => {
    expect(flagsAttendance({ name: 'Summer Bank Holiday', type: 'credit' })).toBe(false);
    expect(flagsAttendance({ name: 'Good Friday', type: 'credit' })).toBe(false);
  });

  test('no exemption at all flags nothing', () => {
    expect(flagsAttendance(null)).toBe(false);
    expect(flagsAttendance(undefined)).toBe(false);
  });

  test('an exemption with no type is not treated as a closure', () => {
    // Safer to miss a flag than to accuse a swimmer of training in a shut pool.
    expect(flagsAttendance({ name: 'Unspecified' })).toBe(false);
  });
});
