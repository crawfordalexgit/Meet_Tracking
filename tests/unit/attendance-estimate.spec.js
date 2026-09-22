import { test, expect } from '@playwright/test';
import {
  mean, stdDev, estimateSession, estimateTotal, ESTIMATE_THRESHOLDS
} from '../../lib/attendance-estimate.js';

/**
 * Filling a missing register with the session's own average.
 *
 * Two thirds of this club's registers are taken, so a squad whose coach marks
 * the sheet looks worse than one whose coach does not. The estimate removes
 * that penalty — but it is an estimate, and the tests here are mostly about
 * the places it must refuse to produce one.
 */
test.describe('one session, measured and estimated', () => {
  test('a complete register is not estimated at all', () => {
    const r = estimateSession({ headcounts: [10, 12, 11, 9], expected: 4 });
    expect(r.basis).toBe('measured');
    expect(r.estimated).toBe(42);
    expect(r.uncertainty).toBe(0);
  });

  test('missing nights are filled with the session average', () => {
    // Four registers averaging 10, four nights nobody wrote down.
    const r = estimateSession({ headcounts: [10, 10, 10, 10], expected: 8 });
    expect(r.basis).toBe('estimated');
    expect(r.mean).toBe(10);
    expect(r.estimated).toBe(80);
  });

  test('a session with no register at all is unknown, never zero', () => {
    // MASTERS Wednesday OUTDOOR: 22 nights, not one register. Calling that
    // zero attendance is exactly the fault this whole exercise exists to fix,
    // and calling it the squad average would invent swimmers.
    const r = estimateSession({ headcounts: [], expected: 22, name: 'MASTERS Wednesday OUTDOOR' });
    expect(r.basis).toBe('unknown');
    expect(r.estimated).toBeNull();
    expect(r.note).toContain('unknown, not zero');
  });

  test('three registers are not enough to stand in for nineteen nights', () => {
    // Age Tuesday 1h, as it actually stands.
    const r = estimateSession({ headcounts: [1, 2, 3], expected: 22 });
    expect(r.basis).toBe('too-few');
    expect(r.estimated).toBeNull();
    expect(ESTIMATE_THRESHOLDS.MIN_REGISTERS_TO_ESTIMATE).toBe(4);
  });

  test('the estimate cannot exceed the number of swimmers booked on', () => {
    // However the average falls, a session cannot have held more swimmers than
    // are on its roster.
    const r = estimateSession({ headcounts: [9, 10, 11, 10], expected: 8, rosterCount: 6 });
    expect(r.estimated).toBe(40 + 6 * 4);
  });

  test('a wildly varying session is flagged, not silently averaged', () => {
    // Age Thursday 1h swings between 1 and 7 on a mean of 2.6.
    const r = estimateSession({ headcounts: [1, 1, 2, 7], expected: 24 });
    expect(r.flags).toContain('varies');
    expect(r.note).toContain('describes it loosely');
  });

  test('filling in more nights than were recorded is called out', () => {
    const r = estimateSession({ headcounts: [5, 5, 5, 5], expected: 20 });
    expect(r.flags).toContain('thin');
    expect(r.note).toContain('most of this figure is inferred');
  });

  test('an evenly attended session is not flagged for variance', () => {
    // LTS 5-6 Sunday pm runs 6 to 10 on a mean of 8.2.
    const r = estimateSession({ headcounts: [8, 8, 9, 7, 8, 9], expected: 8 });
    expect(r.flags).toEqual([]);
  });

  test('uncertainty grows with the root of the nights filled, not the count', () => {
    // Errors on independent nights partly cancel. Adding them would overstate
    // the doubt badly enough to make the method look useless.
    const four = estimateSession({ headcounts: [8, 10, 12, 10], expected: 8 });
    const sixteen = estimateSession({ headcounts: [8, 10, 12, 10], expected: 20 });
    expect(sixteen.uncertainty / four.uncertainty).toBeCloseTo(2, 1);
  });
});

test.describe('the club figure', () => {
  const complete = estimateSession({ headcounts: [10, 10, 10, 10], expected: 4, name: 'A' });
  const partial = estimateSession({ headcounts: [10, 10, 10, 10], expected: 8, name: 'B' });
  const none = estimateSession({ headcounts: [], expected: 20, name: 'C' });
  const thin = estimateSession({ headcounts: [2, 3], expected: 20, name: 'D' });

  test('measured and estimated are both reported, never just the estimate', () => {
    const t = estimateTotal([complete, partial]);
    expect(t.measured).toBe(80);
    expect(t.estimated).toBe(120);
    expect(t.filledIn).toBe(40);
  });

  test('sessions nothing can be said about are named, not absorbed', () => {
    const t = estimateTotal([complete, partial, none, thin]);
    expect(t.unknownSessions).toBe(1);
    expect(t.tooFewSessions).toBe(1);
    expect(t.unreachable.map(u => u.name).sort()).toEqual(['C', 'D']);
  });

  test('an unreachable session contributes nothing to the estimate', () => {
    // It must not be quietly counted as zero, which would drag the club total
    // down by exactly the amount the estimate is trying to recover.
    const withOut = estimateTotal([complete, partial]);
    const withIn = estimateTotal([complete, partial, none]);
    expect(withIn.estimated).toBe(withOut.estimated);
  });

  test('its measured attendance still counts, even when it cannot be estimated', () => {
    // Two registers is too few to extrapolate from. It is not too few to have
    // happened.
    const t = estimateTotal([thin]);
    expect(t.measured).toBe(5);
    expect(t.estimated).toBe(0);
  });

  test('uncertainty is combined in quadrature, so many sessions firm up the total', () => {
    // A session that actually varies, or there is no uncertainty to combine.
    const varied = estimateSession({ headcounts: [8, 10, 12, 10], expected: 8, name: 'E' });
    const one = estimateTotal([varied]);
    const four = estimateTotal([varied, varied, varied, varied]);
    expect(four.uncertainty).toBeCloseTo(one.uncertainty * 2, 1);
    // Four times the value, twice the doubt: the total is proportionally firmer
    // than any session in it.
    expect(four.uncertainty / four.estimated).toBeLessThan(one.uncertainty / one.estimated);
  });
});

test.describe('the arithmetic underneath', () => {
  test('mean and spread of nothing are null, not zero', () => {
    expect(mean([])).toBeNull();
    expect(stdDev([])).toBeNull();
  });

  test('a single observation has no spread to report', () => {
    expect(stdDev([7])).toBe(0);
  });
});
