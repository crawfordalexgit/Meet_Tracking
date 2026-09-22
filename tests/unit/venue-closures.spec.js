import { test, expect } from '@playwright/test';
import {
  normaliseVenue, closureCoversVenue, closureOn, isVenueClosed,
  excuseMarks, describeClosure, closedVenues
} from '../../lib/venue-closures.js';
import { runDatesFor, assessSession } from '../../lib/register-health.js';

/**
 * The club lost the town pool from 14 to 24 September 2026.
 *
 * Training carried on everywhere else, so the closure has to be narrow. Record
 * it club-wide and a fortnight of genuinely missed registers at Wally Hall,
 * Radnor House and the school pool is written off with it; leave it unrecorded
 * and nine coaches are asked why they stopped taking a register for water they
 * did not have.
 */
const TOWN = {
  name: 'Town Pool unavailable', type: 'exempt', venue: 'Tonbridge Town Pool',
  start_date: '2026-09-14', end_date: '2026-09-24'
};
const TOWN_SP = { ...TOWN, venue: 'Tonbridge Town Pool - SP' };
const CLUB_WIDE = {
  name: 'Annual TSC Summer Shutdown', type: 'exempt', venue: null,
  start_date: '2026-08-01', end_date: '2026-08-14'
};

test.describe('a closure that took one pool', () => {
  test('it shuts the venue it names', () => {
    expect(isVenueClosed('2026-09-15', 'Tonbridge Town Pool', [TOWN])).toBe(true);
    expect(isVenueClosed('2026-09-24', 'Tonbridge Town Pool', [TOWN])).toBe(true);
  });

  test('it leaves every other pool open', () => {
    expect(isVenueClosed('2026-09-15', 'Wally Hall', [TOWN])).toBe(false);
    expect(isVenueClosed('2026-09-15', 'Tonbridge School Pool', [TOWN])).toBe(false);
  });

  test('the small pool is a different pool, not a spelling of the main one', () => {
    // Folding "- SP" into "Tonbridge Town Pool" would excuse two Learn to Swim
    // sessions on the strength of a closure that never mentioned them.
    expect(isVenueClosed('2026-09-15', 'Tonbridge Town Pool - SP', [TOWN])).toBe(false);
    expect(isVenueClosed('2026-09-15', 'Tonbridge Town Pool - SP', [TOWN_SP])).toBe(true);
  });

  test('case and stray spacing are the same pool', () => {
    expect(normaliseVenue('  Tonbridge  Town Pool ')).toBe('tonbridge town pool');
    expect(isVenueClosed('2026-09-15', 'tonbridge town pool', [TOWN])).toBe(true);
  });

  test('outside the dates it shuts nothing', () => {
    expect(isVenueClosed('2026-09-13', 'Tonbridge Town Pool', [TOWN])).toBe(false);
    expect(isVenueClosed('2026-09-25', 'Tonbridge Town Pool', [TOWN])).toBe(false);
  });

  test('a closure with no venue still means the whole club', () => {
    // Every closure recorded before venues existed meant this, and must keep
    // meaning it.
    expect(closureCoversVenue(CLUB_WIDE, 'Wally Hall')).toBe(true);
    expect(isVenueClosed('2026-08-05', 'Wally Hall', [CLUB_WIDE])).toBe(true);
  });

  test('a credit is not a closure', () => {
    const credit = { ...TOWN, type: 'credit' };
    expect(isVenueClosed('2026-09-15', 'Tonbridge Town Pool', [credit])).toBe(false);
  });

  test('it says which pool and which dates', () => {
    expect(describeClosure(TOWN)).toContain('Tonbridge Town Pool');
    expect(describeClosure(TOWN)).toContain('2026-09-14 to 2026-09-24');
    expect(describeClosure(CLUB_WIDE)).toContain('the whole club');
  });

  test('the venues a set of closures names can be listed', () => {
    expect(closedVenues([TOWN, TOWN_SP, CLUB_WIDE]))
      .toEqual(['Tonbridge Town Pool', 'Tonbridge Town Pool - SP']);
  });

  test('the closure itself is handed back, so a page can name it', () => {
    expect(closureOn('2026-09-15', 'Tonbridge Town Pool', [TOWN]).name)
      .toBe('Town Pool unavailable');
    expect(closureOn('2026-09-15', 'Wally Hall', [TOWN])).toBeNull();
  });
});

test.describe('absences recorded in water the club did not have', () => {
  // The club's own: a coach opened the Saturday register on 19 September and
  // marked four present and twelve absent, for a pool that was shut.
  const marks = [
    { date: '2026-09-19', session_id: 'town', status: 'absent' },
    { date: '2026-09-19', session_id: 'town', status: 'present' },
    { date: '2026-09-26', session_id: 'town', status: 'absent' },
    { date: '2026-09-19', session_id: 'wally', status: 'absent' }
  ];
  const venueOf = m => m.session_id === 'town' ? 'Tonbridge Town Pool' : 'Wally Hall';

  test('marks inside the closure come out, at that venue only', () => {
    const { kept, excused } = excuseMarks(marks, venueOf, [TOWN]);
    expect(excused).toHaveLength(2);
    expect(kept).toHaveLength(2);
    expect(kept.map(m => m.date + '/' + m.session_id))
      .toEqual(['2026-09-26/town', '2026-09-19/wally']);
  });

  test('the closure that did it is handed back with each mark', () => {
    const { excused } = excuseMarks(marks, venueOf, [TOWN]);
    excused.forEach(e => expect(e.closure.name).toBe('Town Pool unavailable'));
  });

  test('a mark whose venue is unknown is kept, not guessed away', () => {
    const { kept, excused } = excuseMarks(marks, () => null, [TOWN]);
    expect(excused).toEqual([]);
    expect(kept).toHaveLength(4);
  });
});

test.describe('the register check under a venue closure', () => {
  const WINDOW = { from: '2026-09-01', to: '2026-09-30' };

  test('a session in the closed pool owes no register for those nights', () => {
    // Saturdays in September 2026: 5, 12, 19, 26. The 19th is inside the closure.
    const open = runDatesFor('Saturday', WINDOW.from, WINDOW.to, [TOWN], 'Tonbridge Town Pool');
    expect(open).toEqual(['2026-09-05', '2026-09-12', '2026-09-26']);
  });

  test('a session in another pool still owes every one', () => {
    const open = runDatesFor('Saturday', WINDOW.from, WINDOW.to, [TOWN], 'Wally Hall');
    expect(open).toEqual(['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
  });

  test('a coach is not flagged for the nights the pool was gone', () => {
    const session = {
      id: 'x', name: 'AGE DEVELOPMENT Saturday am', day: 'Saturday',
      location: 'Tonbridge Town Pool'
    };
    const marks = [
      { date: '2026-09-05', status: 'present' },
      { date: '2026-09-12', status: 'present' },
      { date: '2026-09-26', status: 'present' }
    ];
    const row = assessSession(session, marks, {
      ...WINDOW, closures: [TOWN], rosterCount: 16, today: '2026-09-30'
    });
    expect(row.expected).toBe(3);
    expect(row.coveragePct).toBe(100);
    expect(row.flags.filter(f => f.key === 'patchy')).toEqual([]);
  });

  test('the row says which closure did it, so the count can be checked', () => {
    const session = {
      id: 'x', name: 'SILVER Tuesday', day: 'Tuesday', location: 'Tonbridge Town Pool'
    };
    const row = assessSession(session, [{ date: '2026-09-01', status: 'present' }], {
      ...WINDOW, closures: [TOWN], rosterCount: 10, today: '2026-09-30'
    });
    expect(row.excusedByVenue).toHaveLength(1);
    expect(row.excusedByVenue[0].venue).toBe('Tonbridge Town Pool');
    expect(row.excusedByVenue[0].detail).toContain('nobody is counted absent');
  });

  test('a session elsewhere carries no excuse it did not earn', () => {
    const session = { id: 'y', name: 'MASTERS Sunday', day: 'Sunday', location: 'Wally Hall' };
    const row = assessSession(session, [], {
      ...WINDOW, closures: [TOWN], rosterCount: 20, today: '2026-09-30'
    });
    expect(row.excusedByVenue).toEqual([]);
    expect(row.expected).toBe(4);
  });
});

test.describe('a register taken while the pool was shut', () => {
  // The trap this walked into once. LTS 5/6 Friday opened its register on 18
  // September, inside the closure. Discounting that mark along with the
  // absences pushed the session's last register back to 24 July and the report
  // accused the one coach who did turn up of having stopped eight weeks
  // earlier.
  //
  // A closure shortens the list of nights owed. It does not unmake a register
  // somebody took, and "was a register taken" is not the question that
  // "was the swimmer there" answers.
  const WINDOW = { from: '2026-07-01', to: '2026-09-30' };

  test('it still counts as taken, and the coach is not called stopped', () => {
    const session = {
      id: 'lts', name: 'LTS 5/6 Friday', day: 'Friday', location: 'Tonbridge Town Pool'
    };
    const marks = [
      { date: '2026-07-24', status: 'present' },
      { date: '2026-09-18', status: 'present' }
    ];
    const row = assessSession(session, marks, {
      ...WINDOW, closures: [TOWN], rosterCount: 13, today: '2026-09-22'
    });
    expect(row.lastDate).toBe('2026-09-18');
    expect(row.flags.map(f => f.key)).not.toContain('stopped');
  });

  test('the same marks are still discounted for the swimmer', () => {
    // Both things are true at once: the register was taken, and nobody in it
    // was in the water. excuseMarks answers the second and nothing else.
    const marks = [
      { date: '2026-09-18', session_id: 'lts', status: 'absent' },
      { date: '2026-07-24', session_id: 'lts', status: 'absent' }
    ];
    const { kept, excused } = excuseMarks(marks, () => 'Tonbridge Town Pool', [TOWN]);
    expect(excused).toHaveLength(1);
    expect(kept).toHaveLength(1);
    expect(kept[0].date).toBe('2026-07-24');
  });
});
