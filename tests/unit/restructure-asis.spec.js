import { test, expect } from '@playwright/test';
import { buildAsIsReport } from '../../lib/restructure-asis.js';

const session = (over = {}) => ({
  id: 's1', name: 'GOLD DEVELOPMENT Friday', day: 'Friday',
  startTime: '19:00', endTime: '21:00', location: 'Main', lanes: 3,
  isActive: true, places: 24, rosterCount: 20, squadIdFromName: 'g',
  attendance: { registers: 12, avgPresent: 9.4, ofCapacityPct: 39.2, ofBookedPct: 47 },
  ...over
});

const squad = (over = {}) => ({
  id: 'g', name: 'GOLD DEVELOPMENT',
  activeNonExemptCount: 36, memberCount: 37,
  targetSessionsPerWeek: 4, targetHoursPerWeek: 4,
  swimmersPerLane: 8, ownSessionCount: 6,
  weeklyPlaces: 167, swimmerSessionsRequired: 144,
  placesShortfall: 0, roomForMore: 5, requirementMet: true,
  currentWeeklyHours: 7.5, currentLaneHours: 27.1,
  p10Age: 10, p90Age: 13,
  ...over
});

const baseline = (over = {}) => ({
  windows: { attendanceDays: 91, capabilityDays: 365 },
  squads: [squad()],
  sessions: [session()],
  venues: ['Main'],
  venueLoad: [{ venue: 'Main', day: 'Friday', capacity: 6, peakLanes: 6, over: [] }],
  warnings: ['something worth knowing'],
  utilisation: {
    totalLaneHours: 121, squadLaneHours: 118, reservedLaneHours: 3,
    activeSessionCount: 50, sessionsWithRegisters: 48, emptySessionCount: 1,
    rosterPlaces: 605, totalPlaces: 721, occupancyPct: 83.9,
    actualAttending: 328.8, actualOccupancyPct: 48.3, measuredShowRate: 0.549,
    squadsMeetingRequirement: 6, squadsWithTargetCount: 7, roomForMore: 39
  },
  ...over
});

test.describe('the as-is report', () => {
  test('states the period every measured figure rests on', () => {
    // "Attendance is 48%" is unreadable without knowing 48% of what, over how
    // long. A committee will ask, and the report should not need a person to
    // answer it.
    const r = buildAsIsReport(baseline());
    expect(r.window.attendanceDays).toBe(91);
    expect(r.window.attendanceWeeks).toBe(13);
    expect(r.window.capabilityDays).toBe(365);
    expect(r.window.sessionsWithoutRegister).toBe(2);
  });

  test('shows the working behind room for more swimmers', () => {
    // The whole point: the figure has to be checkable on the back of an
    // envelope, so every input to it appears in the sentence.
    const r = buildAsIsReport(baseline());
    const w = r.squads[0].working;
    expect(w).toContain('36 swimmers');
    expect(w).toContain('4 sessions a week');
    expect(w).toContain('144 places are needed');
    expect(w).toContain('167 places');
    expect(w).toContain('8 to a lane');
    expect(w).toContain('room for 5 more swimmers');
  });

  test('a short squad has its shortfall worked through in swimmers', () => {
    const r = buildAsIsReport(baseline({
      squads: [squad({
        name: 'NAR', activeNonExemptCount: 23, targetSessionsPerWeek: 5,
        weeklyPlaces: 88, swimmerSessionsRequired: 115,
        placesShortfall: 27, roomForMore: 0, requirementMet: false
      })]
    }));
    const w = r.squads[0].working;
    expect(w).toContain('115 places are needed');
    expect(w).toContain('27 places short');
    expect(w).toContain('6 swimmers could not train the full week');
  });

  test('a paper shortfall is named as one', () => {
    // A squad can read short while its busiest session is half empty. Saying so
    // is the difference between "buy more water" and "look at attendance".
    const r = buildAsIsReport(baseline({
      squads: [squad({ requirementMet: false, placesShortfall: 27, roomForMore: 0 })]
    }));
    expect(r.squads[0].attendanceNote).toContain('shortfall on paper');
    expect(r.squads[0].attendanceNote).toContain('9.4 swimmers into 24 places');
  });

  test('a squad that is genuinely full is told so, not left silent', () => {
    // Silence here reads as "no comment"; the committee needs the opposite of
    // the paper-shortfall line said out loud, because it is the case where more
    // water is actually the answer.
    const r = buildAsIsReport(baseline({
      squads: [squad({ requirementMet: false, placesShortfall: 27 })],
      sessions: [session({ places: 8, attendance: { registers: 9, avgPresent: 8, ofCapacityPct: 100, ofBookedPct: 100 } })]
    }));
    expect(r.squads[0].attendanceNote).toContain('not only on paper');
    expect(r.squads[0].attendanceNote).toContain('9 registers');
  });

  test('attendance off a handful of registers is refused, not quoted', () => {
    // A percentage off two registers reads exactly like one off twenty. This is
    // how a briefing came to call a squad full on a session showing 104% from
    // two registers that sat at 77% over a longer window.
    const r = buildAsIsReport(baseline({
      squads: [squad({ requirementMet: false, placesShortfall: 27 })],
      sessions: [session({ attendance: { registers: 2, avgPresent: 19, ofCapacityPct: 104, ofBookedPct: 95 } })]
    }));
    expect(r.squads[0].busiestSession).toBeNull();
    expect(r.squads[0].attendanceNote).toContain('cannot be read yet');
    expect(r.attendance.quietest).toEqual([]);
  });

  test('every quoted attendance carries the registers behind it', () => {
    const r = buildAsIsReport(baseline());
    expect(r.squads[0].busiestSession.registers).toBe(12);
    expect(r.attendance.quietest[0].registers).toBe(12);
  });

  test('a met squad is not told its shortfall is on paper', () => {
    const r = buildAsIsReport(baseline());
    expect(r.squads[0].attendanceNote).toBeNull();
  });

  test('squads with no weekly target are named, not silently dropped', () => {
    const r = buildAsIsReport(baseline({
      squads: [squad(), squad({ id: 'm', name: 'MASTERS', targetSessionsPerWeek: 0, activeNonExemptCount: 43 })]
    }));
    expect(r.squads).toHaveLength(1);
    expect(r.headline.squadsWithoutTarget).toEqual([{ name: 'MASTERS', swimmers: 43 }]);
  });

  test('the quietest water is listed, emptiest first', () => {
    const r = buildAsIsReport(baseline({
      sessions: [
        session({ id: 'a', name: 'Busy', attendance: { registers: 5, avgPresent: 7, ofCapacityPct: 80, ofBookedPct: 90 } }),
        session({ id: 'b', name: 'Quiet', attendance: { registers: 5, avgPresent: 1, ofCapacityPct: 12.5, ofBookedPct: 20 } })
      ]
    }));
    expect(r.attendance.quietest.map(q => q.name)).toEqual(['Quiet', 'Busy']);
  });

  test('a session with no register is left out of the quietest list', () => {
    // No register is missing information, not an empty session, and ranking it
    // as empty would put "we never took a register" top of a list about waste.
    const r = buildAsIsReport(baseline({
      sessions: [session({ attendance: { registers: 0, avgPresent: null, ofCapacityPct: null, ofBookedPct: null } })]
    }));
    expect(r.attendance.quietest).toEqual([]);
  });

  test('carries the water and attendance headlines', () => {
    const r = buildAsIsReport(baseline());
    expect(r.water.laneHoursPerWeek).toBe(121);
    expect(r.water.usableBySquads).toBe(118);
    expect(r.water.reserved).toBe(3);
    expect(r.attendance.bookedPct).toBe(83.9);
    expect(r.attendance.filledPct).toBe(48.3);
    expect(r.attendance.turnUpRate).toBe(0.549);
    expect(r.headline.squadsWithFullWeek).toBe(6);
    expect(r.headline.squadsJudged).toBe(7);
    expect(r.headline.roomForMore).toBe(39);
  });

  test('passes the caveats through rather than burying them', () => {
    const r = buildAsIsReport(baseline());
    expect(r.caveats).toEqual(['something worth knowing']);
  });

  test('returns nothing rather than throwing on missing input', () => {
    expect(buildAsIsReport(null)).toBeNull();
    expect(buildAsIsReport({})).toBeNull();
  });
});

test.describe('the basis every figure rests on', () => {
  const withWindows = over => baseline({
    windows: {
      attendanceDays: 180, capabilityDays: 365,
      from: '2026-03-25', to: '2026-09-21',
      termOnly: true, termWeeks: 16, termDays: 112, holidayDaysExcluded: 69,
      exclusions: [{ label: 'Summer holidays 2026', from: '2026-07-20', to: '2026-08-30', days: 42 }],
      registersUsed: 900, registersSetAside: 400,
      termRatePct: 66.4, holidayRatePct: 50.1,
      basis: 'Attendance measured across term weeks only in the 180 days to 2026-09-21: 16 term weeks, after removing Summer holidays 2026 (2026-07-20 to 2026-08-30).',
      ...over
    }
  });

  test('carries the basis sentence through verbatim for the write-up to quote', () => {
    // The briefing is told to quote this rather than describe the window in its
    // own words, so it has to survive the report unaltered.
    const r = buildAsIsReport(withWindows());
    expect(r.window.basis).toContain('16 term weeks');
    expect(r.window.basis).toContain('Summer holidays 2026');
  });

  test('names the holidays it removed, so a reader can check them', () => {
    const r = buildAsIsReport(withWindows());
    expect(r.window.termOnly).toBe(true);
    expect(r.window.termWeeks).toBe(16);
    expect(r.window.holidaysExcluded).toHaveLength(1);
    expect(r.window.holidaysExcluded[0].label).toBe('Summer holidays 2026');
  });

  test('keeps both rates, because the gap between them is the finding', () => {
    const r = buildAsIsReport(withWindows());
    expect(r.window.termRatePct).toBe(66.4);
    expect(r.window.holidayRatePct).toBe(50.1);
  });

  test('says plainly when holidays were not excluded', () => {
    const r = buildAsIsReport(withWindows({ termOnly: false, termWeeks: null }));
    expect(r.window.termOnly).toBe(false);
  });

  test('an older baseline with no term fields still builds', () => {
    // The baseline and the page deploy separately; a report that throws on a
    // missing field takes the whole tab down rather than losing one sentence.
    const r = buildAsIsReport(baseline());
    expect(r.window.termOnly).toBe(false);
    expect(r.window.basis).toBeNull();
    expect(r.window.holidaysExcluded).toEqual([]);
  });
});
