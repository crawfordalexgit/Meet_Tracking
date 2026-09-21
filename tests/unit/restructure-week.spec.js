import { test, expect } from '@playwright/test';
import { itemsFromSessions, itemsFromPlan, itemsFromSlots, venuesOf } from '../../lib/restructure-week.js';

const session = (over = {}) => ({
  id: 's1', name: 'GOLD Monday', day: 'Monday', isActive: true,
  startTime: '18:00', endTime: '19:30', location: 'Radnor House',
  lanes: 6, places: 48, rosterCount: 30, occupancyPct: 62.5,
  squadCounts: { sq1: 30 },
  attendance: { registers: 8, avgPresent: 17, ofCapacityPct: 35.4, ofBookedPct: 56.7 },
  ...over
});

const baseline = (sessions) => ({ sessions });

const result = (over = {}) => ({
  plan: {
    assignments: [{
      slotId: 'slot1', squadId: 'sq1', squadName: 'GOLD DEVELOPMENT',
      day: 'Monday', startTime: '18:00', endTime: '19:30',
      venue: 'Radnor House', label: 'Mon 18:00-19:30', lanes: 3,
      capacity: 24, expected: 18, coachNames: ['A. Coach'],
      flags: [], source: 'existing'
    }]
  },
  ...over
});

const slot = (over = {}) => ({
  id: 'slot2', label: 'Tue 19:00-20:30 Tonbridge', day: 'Tuesday',
  startTime: '19:00', endTime: '20:30', venue: 'Tonbridge Town Pool',
  lanes: 4, enabled: true, source: 'candidate', ...over
});

/** The field set a renderer is entitled to rely on. */
const FIELDS = [
  'key', 'day', 'startMin', 'endMin', 'startTime', 'endTime', 'title', 'subtitle',
  'venue', 'lanes', 'colourKey', 'places', 'booked', 'attending', 'placesFilledPct',
  'turnUpPct', 'registers', 'use', 'squadCounts', 'coaches', 'flags', 'isUnused'
];

test.describe('one week, one shape', () => {
  test('all three sources produce the same fields', () => {
    // The whole point: one renderer has to be able to take any of them. If the
    // shapes diverge, the five-renderings problem grows straight back.
    const a = itemsFromSessions(baseline([session()]))[0];
    const b = itemsFromPlan(result())[0];
    const c = itemsFromSlots([slot()], result())[0];

    FIELDS.forEach(f => {
      expect(Object.prototype.hasOwnProperty.call(a, f), `sessions missing ${f}`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(b, f), `plan missing ${f}`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(c, f), `slots missing ${f}`).toBe(true);
    });
  });

  test('percentages are the baseline\'s, never recomputed', () => {
    // Five components used to divide attendance by roster themselves, and two of
    // them rounded differently, so one session read 46% on one tab and 45% on
    // another. These must be passed through untouched.
    const s = session();
    const item = itemsFromSessions(baseline([s]))[0];
    expect(item.placesFilledPct).toBe(s.attendance.ofCapacityPct);
    expect(item.turnUpPct).toBe(s.attendance.ofBookedPct);
    expect(item.booked).toBe(s.rosterCount);
    expect(item.use.bookedPctOfPlaces).toBe(s.occupancyPct);
  });

  test('a session with no register reads unknown, not empty', () => {
    // Zero would sort it alongside water that genuinely stands empty. Different
    // problem, different answer.
    const item = itemsFromSessions(baseline([
      session({ attendance: { registers: 0, avgPresent: null, ofCapacityPct: null, ofBookedPct: null } })
    ]))[0];
    expect(item.attending).toBeNull();
    expect(item.placesFilledPct).toBeNull();
    expect(item.turnUpPct).toBeNull();
    expect(item.attending).not.toBe(0);
  });

  test('a session missing its attendance block does not throw', () => {
    const item = itemsFromSessions(baseline([session({ attendance: undefined })]))[0];
    expect(item.placesFilledPct).toBeNull();
    expect(item.registers).toBe(0);
  });

  test('inactive sessions are left out', () => {
    expect(itemsFromSessions(baseline([session({ isActive: false })]))).toHaveLength(0);
  });

  test('a session with no weekday cannot be placed on a grid', () => {
    // day_of_week is null club-wide, so the day is parsed from the name. When
    // that fails there is nowhere to draw it.
    expect(itemsFromSessions(baseline([session({ day: 'Unknown' })]))).toHaveLength(0);
    expect(itemsFromSessions(baseline([session({ day: null })]))).toHaveLength(0);
  });

  test('a session ending before it starts is dropped rather than drawn backwards', () => {
    expect(itemsFromSessions(baseline([session({ startTime: '20:00', endTime: '19:00' })]))).toHaveLength(0);
  });

  test('narrowing to a venue is what the Venues tab used to be', () => {
    const sessions = [session(), session({ id: 's2', location: 'Tonbridge Town Pool' })];
    expect(itemsFromSessions(baseline(sessions), { venue: 'Radnor House' })).toHaveLength(1);
    expect(itemsFromSessions(baseline(sessions))).toHaveLength(2);
  });

  test('a proposed session has places but no attendance', () => {
    // It has never been run. Inventing a turn-up figure for it would be fiction.
    const item = itemsFromPlan(result())[0];
    expect(item.places).toBe(24);
    expect(item.booked).toBe(18);
    expect(item.attending).toBeNull();
    expect(item.turnUpPct).toBeNull();
    expect(item.title).toBe('GOLD DEVELOPMENT');
    expect(item.coaches).toEqual(['A. Coach']);
  });

  test('slots the plan used are not reported as unused', () => {
    const slots = [slot({ id: 'slot1' }), slot()];
    const unused = itemsFromSlots(slots, result());
    expect(unused.map(u => u.key)).toEqual(['unused-slot2']);
    expect(unused[0].isUnused).toBe(true);
  });

  test('a disabled slot is not offered as unused water', () => {
    expect(itemsFromSlots([slot({ enabled: false })], result())).toHaveLength(0);
  });

  test('reserved water says who holds it', () => {
    const item = itemsFromSlots([slot({ reservedFor: 'LEARN TO SWIM' })], result())[0];
    expect(item.subtitle).toContain('LEARN TO SWIM');
  });

  test('venuesOf lists each site once, sorted', () => {
    const items = itemsFromSessions(baseline([
      session({ id: 'a', location: 'Tonbridge Town Pool' }),
      session({ id: 'b', location: 'Radnor House' }),
      session({ id: 'c', location: 'Radnor House' })
    ]));
    expect(venuesOf(items)).toEqual(['Radnor House', 'Tonbridge Town Pool']);
  });

  test('missing input gives an empty week rather than throwing', () => {
    expect(itemsFromSessions(null)).toEqual([]);
    expect(itemsFromSessions({})).toEqual([]);
    expect(itemsFromPlan(null)).toEqual([]);
    expect(itemsFromPlan({})).toEqual([]);
    expect(itemsFromSlots(null, null)).toEqual([]);
  });
});
