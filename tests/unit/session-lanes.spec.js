import { test, expect } from '@playwright/test';
import {
  toMinutes, toTime, normalisePhases, laneSegments, laneHoursOf,
  lanesAt, peakLanesOf, validatePhases, describeLanes
} from '../../lib/session-lanes.js';

// The club's real case: Age Development at Radnor House on a Monday holds two
// lanes from seven and one from eight, when Masters take the other.
const AGE = { start_time: '19:00', end_time: '21:00' };
const DROP = [{ from: '20:00', lanes: 1 }];

test.describe('lanes that change within a session', () => {
  test('a session with no changes behaves exactly as before', () => {
    expect(laneSegments(AGE, [], 2)).toEqual([{ startMin: 1140, endMin: 1260, lanes: 2 }]);
    expect(laneHoursOf(AGE, [], 2)).toBe(4);
    expect(laneHoursOf(AGE, null, 2)).toBe(4);
    expect(laneHoursOf(AGE, undefined, 2)).toBe(4);
  });

  test('the club case: two lanes then one is three lane-hours, not four', () => {
    expect(laneHoursOf(AGE, DROP, 2)).toBe(3);
    expect(laneSegments(AGE, DROP, 2)).toEqual([
      { startMin: 1140, endMin: 1200, lanes: 2 },
      { startMin: 1200, endMin: 1260, lanes: 1 }
    ]);
  });

  test('several changes in one session', () => {
    const s = { start_time: '18:00', end_time: '21:00' };
    const phases = [{ from: '19:00', lanes: 3 }, { from: '20:00', lanes: 1 }];
    expect(laneHoursOf(s, phases, 2)).toBe(2 + 3 + 1);
  });

  test('changes are read in time order however they were entered', () => {
    const s = { start_time: '18:00', end_time: '21:00' };
    const jumbled = [{ from: '20:00', lanes: 1 }, { from: '19:00', lanes: 3 }];
    expect(laneHoursOf(s, jumbled, 2)).toBe(6);
  });

  test('a change to zero lanes is honoured, not treated as unset', () => {
    // The same distinction the session-level lane count needed: "none" is a
    // real answer, and a squad losing its water at nine has none from nine.
    expect(laneHoursOf(AGE, [{ from: '20:00', lanes: 0 }], 2)).toBe(2);
  });

  test('a change outside the session is dropped, not clamped', () => {
    // Clamping would quietly turn a typo into a plausible-looking figure.
    expect(laneHoursOf(AGE, [{ from: '22:00', lanes: 1 }], 2)).toBe(4);
    expect(laneHoursOf(AGE, [{ from: '18:00', lanes: 1 }], 2)).toBe(4);
    expect(normalisePhases(AGE, [{ from: '19:00', lanes: 1 }])).toEqual([]);
  });

  test('two changes at the same time keep only the first', () => {
    const phases = [{ from: '20:00', lanes: 1 }, { from: '20:00', lanes: 5 }];
    expect(normalisePhases(AGE, phases)).toEqual([{ at: 1200, lanes: 1 }]);
  });

  test('lanes at a moment, for working out what a pool is holding', () => {
    expect(lanesAt(AGE, DROP, 2, toMinutes('19:30'))).toBe(2);
    expect(lanesAt(AGE, DROP, 2, toMinutes('20:30'))).toBe(1);
    expect(lanesAt(AGE, DROP, 2, toMinutes('21:00'))).toBe(0);
    expect(lanesAt(AGE, DROP, 2, toMinutes('18:00'))).toBe(0);
  });

  test('peak lanes is what the squad needs at its busiest', () => {
    // Averaging would say 1.5 lanes, and no squad ever swims in half a lane.
    expect(peakLanesOf(AGE, DROP, 2)).toBe(2);
    expect(peakLanesOf(AGE, [{ from: '20:00', lanes: 4 }], 2)).toBe(4);
  });

  test('a session with no usable times measures nothing rather than throwing', () => {
    expect(laneSegments({ start_time: null, end_time: null }, DROP, 2)).toEqual([]);
    expect(laneHoursOf({ start_time: '20:00', end_time: '19:00' }, [], 2)).toBe(0);
    expect(laneSegments(null, null, null)).toEqual([]);
  });

  test('validation says what is wrong in words', () => {
    expect(validatePhases(AGE, [])).toEqual([]);
    expect(validatePhases(AGE, DROP)).toEqual([]);

    expect(validatePhases(AGE, [{ from: '22:00', lanes: 1 }]).join(' '))
      .toContain('outside this session');
    expect(validatePhases(AGE, [{ from: '', lanes: 1 }]).join(' '))
      .toContain('enter the time');
    expect(validatePhases(AGE, [{ from: '20:00', lanes: -1 }]).join(' '))
      .toContain('zero or more');
    expect(validatePhases(AGE, [{ from: '20:00', lanes: 1 }, { from: '20:00', lanes: 2 }]).join(' '))
      .toContain('already a change at 20:00');
    expect(validatePhases({ start_time: null, end_time: null }, DROP).join(' '))
      .toContain('Set a start and end time');
  });

  test('it describes itself in a line a coach would say', () => {
    expect(describeLanes(AGE, [], 2)).toBe('2 lanes throughout');
    expect(describeLanes(AGE, [], 1)).toBe('1 lane throughout');
    expect(describeLanes(AGE, DROP, 2)).toBe('2 to 20:00, then 1');
  });

  test('times round-trip', () => {
    expect(toMinutes('19:00')).toBe(1140);
    expect(toTime(1140)).toBe('19:00');
    expect(toTime(toMinutes('07:05'))).toBe('07:05');
    expect(toMinutes('nonsense')).toBeNull();
    expect(toMinutes(null)).toBeNull();
  });
});
