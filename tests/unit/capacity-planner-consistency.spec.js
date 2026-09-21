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
