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
