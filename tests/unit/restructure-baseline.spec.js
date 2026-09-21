import { test, expect } from '@playwright/test';
import {
  lanesOf, bandsOnAbility, squadHoldReason,
  getSessionLanesForSquad, swimmersPerLaneFor, swimmingAge,
  percentileFromHistogram, buildScenarioInputsFromBaseline, squadForSessionName
} from '../../lib/restructure-baseline.js';
import { extractSessionDay, getSessionDuration } from '../../lib/analytics-utils.js';
import { validateInputs } from '../../lib/restructure-solver.js';

test.describe('session day and duration are inferred, not stored', () => {
  test('day_of_week is NULL club-wide, so the day comes from the session name', () => {
    // The regression guard for the assumption the whole planner rests on. The
    // overlap test in pages/capacity.js compares day_of_week directly and so
    // never fires; anything ported into the planner must go through this.
    expect(extractSessionDay({ day_of_week: null, name: 'Monday Squad (2 hours)' })).toBe('Monday');
    expect(extractSessionDay({ day_of_week: null, name: 'SATURDAY AM Development' })).toBe('Saturday');
    expect(extractSessionDay({ day_of_week: 'Thursday', name: 'Whatever' })).toBe('Thursday');
  });

  test('a session with no weekday anywhere is Unknown rather than a wrong guess', () => {
    expect(extractSessionDay({ day_of_week: null, name: 'Extra Squad Session' })).toBe('Unknown');
  });

  test('duration falls back through the name before defaulting to 1.5h', () => {
    expect(getSessionDuration({ start_time: '18:00', end_time: '20:00', name: 'x' })).toBeCloseTo(2, 5);
    expect(getSessionDuration({ name: 'Monday Squad (2 hours)' })).toBeCloseTo(2, 5);
    expect(getSessionDuration({ name: 'Tech (45 mins)' })).toBeCloseTo(0.75, 5);
    expect(getSessionDuration({ name: 'Squad (19:00 - 21:00)' })).toBeCloseTo(2, 5);
    expect(getSessionDuration({ name: 'Unlabelled session' })).toBeCloseTo(1.5, 5);
  });
});

test.describe('lane allocation helpers', () => {
  const session = { id: 'sess-1', scm_guid: 'guid-1', name: 'Monday Squad', lanes_allocated: 6 };

  test('falls back to the session lane count when nothing is shared', () => {
    expect(getSessionLanesForSquad(session, 'squad-a', {})).toBe(6);
  });

  test('reads a shared split keyed by session id', () => {
    expect(getSessionLanesForSquad(session, 'squad-a', { 'sess-1': { 'squad-a': 4, 'squad-b': 2 } })).toBe(4);
  });

  test('also reads a split keyed by SCM guid or by name', () => {
    // shared_sessions_config has been written under all three keys over time.
    expect(getSessionLanesForSquad(session, 'squad-b', { 'guid-1': { 'squad-b': 3 } })).toBe(3);
    expect(getSessionLanesForSquad(session, 'squad-b', { 'Monday Squad': { 'squad-b': 1 } })).toBe(1);
  });

  test('a squad absent from a shared split gets zero lanes, not the default', () => {
    // Present-but-excluded is a real decision and must not silently become 6.
    expect(getSessionLanesForSquad(session, 'squad-z', { 'sess-1': { 'squad-a': 6 } })).toBe(0);
  });

  test('defaults to 6 when the session carries no lane count', () => {
    expect(getSessionLanesForSquad({ id: 's', name: 'n' }, 'squad-a', {})).toBe(6);
  });

  test('swimmers per lane prefers the field the club actually configures', () => {
    // swimmers_per_lane is set in Settings -> Squad Management and varies by
    // squad. max_swimmers_per_lane is never written by the app and sits at an
    // untouched 5 everywhere, so reading it first made every squad identical
    // and threw away the configured density.
    expect(swimmersPerLaneFor({ swimmers_per_lane: 7, max_swimmers_per_lane: 5 })).toBe(7);
    expect(swimmersPerLaneFor({ swimmers_per_lane: 8, max_swimmers_per_lane: 5 })).toBe(8);
    // Falls back only when the configured field is genuinely absent.
    expect(swimmersPerLaneFor({ max_swimmers_per_lane: 6 })).toBe(6);
    expect(swimmersPerLaneFor({})).toBe(8);
    expect(swimmersPerLaneFor(null)).toBe(8);
  });
});

test.describe('swimming age', () => {
  test('is the age reached by 31 December, not the age today', () => {
    expect(swimmingAge(2014, 2026)).toBe(12);
    expect(swimmingAge(null, 2026)).toBeNull();
  });
});

test.describe('percentileFromHistogram', () => {
  const hist = { 9: 2, 10: 5, 11: 8, 12: 6, 17: 1 };

  test('ignores a lone outlier at the top', () => {
    // The reason bands are seeded from p10/p90 rather than min/max: one
    // 17-year-old must not widen a junior squad's band and drag its LTAD
    // volume target up with it.
    expect(percentileFromHistogram(hist, 0.90)).toBe(12);
    expect(percentileFromHistogram(hist, 0.10)).toBe(10);
  });

  test('returns null for an empty histogram', () => {
    expect(percentileFromHistogram({}, 0.5)).toBeNull();
  });

  test('a single-age squad gives that age at both ends', () => {
    expect(percentileFromHistogram({ 11: 4 }, 0.10)).toBe(11);
    expect(percentileFromHistogram({ 11: 4 }, 0.90)).toBe(11);
  });
});

test.describe('buildScenarioInputsFromBaseline', () => {
  const baseline = {
    capturedAt: '2026-08-28T00:00:00.000Z',
    currentYear: 2026,
    venues: ['Main Pool'],
    defaults: { venueTransitMinutes: 25, ltadTable: 'unified', maxLanesPerCoach: 3 },
    clubAgeHistogram: { 10: 4, 11: 6, 12: 5 },
    utilisation: { totalLaneHours: 42, activeSessionCount: 2, totalSessionCount: 3, rosterPlaces: 40 },
    warnings: [],
    sessions: [
      {
        id: 'sess-1', scmGuid: null, name: 'Monday Squad', day: 'Monday',
        startTime: '18:00', endTime: '19:30', durationHours: 1.5, durationInferred: false,
        location: 'Main Pool', lanes: 6, isActive: true, laneHours: 9, rosterCount: 20
      },
      {
        id: 'sess-2', scmGuid: null, name: 'Wednesday Squad', day: 'Wednesday',
        startTime: '18:00', endTime: null, durationHours: 2, durationInferred: true,
        location: 'Main Pool', lanes: 6, isActive: true, laneHours: 12, rosterCount: 18
      },
      {
        id: 'sess-3', scmGuid: null, name: 'Retired Session', day: 'Friday',
        startTime: '18:00', endTime: '19:00', durationHours: 1, durationInferred: false,
        location: 'Main Pool', lanes: 6, isActive: false, laneHours: 6, rosterCount: 0
      },
      {
        id: 'sess-4', scmGuid: null, name: 'Mystery Session', day: 'Unknown',
        startTime: '18:00', endTime: '19:00', durationHours: 1, durationInferred: false,
        location: 'Main Pool', lanes: 6, isActive: true, laneHours: 6, rosterCount: 3
      }
    ],
    squads: [
      {
        id: 'squad-1', name: 'Age Development', targetSessionsPerWeek: 4, targetHoursPerWeek: 8,
        requireWeekend: true, swimmersPerLane: 8, activeNonExemptCount: 24, memberCount: 26,
        ageHistogram: { 11: 6, 12: 10, 13: 7, 17: 1 }, minAge: 11, maxAge: 17,
        p10Age: 11, p90Age: 13, medianSessionHours: 1.5, currentSessionIds: ['sess-1']
      },
      {
        id: 'squad-2', name: 'Bronze', targetSessionsPerWeek: 2, targetHoursPerWeek: 0,
        requireWeekend: false, swimmersPerLane: 8, activeNonExemptCount: 12, memberCount: 12,
        ageHistogram: { 9: 5, 10: 7 }, minAge: 9, maxAge: 10,
        p10Age: 9, p90Age: 10, medianSessionHours: 1, currentSessionIds: ['sess-2']
      },
      {
        id: 'squad-3', name: 'Dormant', targetSessionsPerWeek: 0, targetHoursPerWeek: 0,
        requireWeekend: false, swimmersPerLane: 8, activeNonExemptCount: 0, memberCount: 0,
        ageHistogram: {}, minAge: null, maxAge: null,
        p10Age: null, p90Age: null, medianSessionHours: 0, currentSessionIds: []
      }
    ],
    coaches: [
      { profileId: 'p1', email: 'head@club.uk', role: 'headcoach', squadIds: ['squad-1'], name: null },
      { profileId: 'p2', email: 'coach@club.uk', role: 'coach', squadIds: [], name: null }
    ]
  };

  const seeded = buildScenarioInputsFromBaseline(baseline);

  test('produces inputs the solver accepts', () => {
    const v = validateInputs(seeded);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  test('seeds a slot from every active session with a real weekday', () => {
    // The inactive session and the one whose weekday could not be recovered are
    // both excluded: an unplaceable slot on the grid is worse than none.
    const ids = seeded.poolSlots.map(s => s.existingSessionId);
    expect(ids).toContain('sess-1');
    expect(ids).toContain('sess-2');
    expect(ids).not.toContain('sess-3');
    expect(ids).not.toContain('sess-4');
  });

  test('marks seeded slots as existing so continuity can be measured', () => {
    expect(seeded.poolSlots.every(s => s.source === 'existing')).toBe(true);
  });

  test('derives an end time when a session records only a start and a length', () => {
    const wed = seeded.poolSlots.find(s => s.existingSessionId === 'sess-2');
    expect(wed.endTime).toBe('20:00'); // 18:00 plus the 2h duration
  });

  test('bands squads on the 10th/90th percentile, not the outright range', () => {
    const ageDev = seeded.squads.find(s => s.sourceSquadId === 'squad-1');
    expect(ageDev.minAge).toBe(11);
    expect(ageDev.maxAge).toBe(13); // not 17, despite one 17-year-old on the roster
  });

  test('carries the median session length so zero-hour squads can be derived', () => {
    const bronze = seeded.squads.find(s => s.sourceSquadId === 'squad-2');
    expect(bronze.targetHoursPerWeek).toBe(0);
    expect(bronze.medianSessionHours).toBe(1);
  });

  test('drops squads with nobody in them', () => {
    expect(seeded.squads.some(s => s.sourceSquadId === 'squad-3')).toBe(false);
  });

  test('seeds the coach roster from profiles, naming them by email', () => {
    // profiles holds only id, email and role — there is no name in the database,
    // so the email stands in until someone types a real one.
    expect(seeded.coaches).toHaveLength(2);
    expect(seeded.coaches[0].name).toBe('head@club.uk');
    expect(seeded.coaches[0].level).toBe('head');
    expect(seeded.coaches[0].squadIds).toEqual(['sq_squad-1']);
    expect(seeded.coaches[0].availability).toEqual([]);
  });

  test('carries club defaults into the scenario policy', () => {
    expect(seeded.policy.venueTransitMinutes).toBe(25);
    expect(seeded.policy.ltadTable).toBe('unified');
  });

  test('records the baseline lane-hours so gains can be measured against it', () => {
    expect(seeded.baselineLaneHours).toBe(42);
  });

  test('squad and slot ids are unique', () => {
    const slotIds = seeded.poolSlots.map(s => s.id);
    const squadIds = seeded.squads.map(s => s.id);
    expect(new Set(slotIds).size).toBe(slotIds.length);
    expect(new Set(squadIds).size).toBe(squadIds.length);
  });
});

test.describe('which squad a session belongs to', () => {
  const squads = [
    { id: 'age', name: 'AGE DEVELOPMENT' },
    { id: 'gold', name: 'GOLD DEVELOPMENT' },
    { id: 'silver', name: 'SILVER' },
    { id: 'nar', name: 'NAR' },
    { id: 'club2', name: 'CLUB 2' },
    { id: 'masters', name: 'MASTERS' },
    { id: 'mastersjnr', name: 'MASTERS JNR' },
    { id: 'tech', name: 'TECHNICAL DEVELOPMENT SQUAD' }
  ];
  const who = name => squadForSessionName(name, squads);

  test('reads the squad straight off the session name', () => {
    expect(who('GOLD DEVELOPMENT Friday')).toBe('gold');
    expect(who('SILVER Monday pm')).toBe('silver');
    expect(who('CLUB 2 Sunday pm')).toBe('club2');
    expect(who('TECHNICAL DEVELOPMENT Tuesday pm')).toBe('tech');
  });

  test('matches the shortened names the timetable actually uses', () => {
    // "Age Monday pm" is an Age Development session; "NAR+" is still NAR.
    expect(who('Age Monday pm')).toBe('age');
    expect(who('Age Thursday 1h')).toBe('age');
    expect(who('NAR+ Saturday')).toBe('nar');
    expect(who('Club 2 Thursday pm')).toBe('club2');
  });

  test('a name mentioning two squads goes to the one named first', () => {
    // These sessions are chiefly Masters, with juniors joining — and Masters
    // has 43 swimmers against one in Masters Jnr.
    expect(who('MASTERS/Junior MASTERS Monday pm')).toBe('masters');
    expect(who('Masters/Junior Masters Thursday (1st session)')).toBe('masters');
  });

  test('a longer squad name beats its own leading word at the same position', () => {
    expect(who('AGE DEVELOPMENT Sunday MORNING (2 hours)')).toBe('age');
    expect(who('GOLD DEVELOPMENT Saturday am')).toBe('gold');
  });

  test('sessions belonging to no squad are left unclaimed', () => {
    // Bronze sits outside the squad list, and Learn to Swim is not a squad.
    expect(who('BRONZE Monday pm')).toBeNull();
    expect(who('LTS 3/4 Tuesday')).toBeNull();
    expect(who('Land training')).toBeNull();
    expect(who('')).toBeNull();
    expect(who(null)).toBeNull();
  });

  test('matching ignores case and punctuation', () => {
    expect(who('gold development friday')).toBe('gold');
    expect(who('AGE DEVELOPMENT (& INVITATIONAL) Thursday pm')).toBe('age');
  });
});

test.describe('lanes: none against not recorded', () => {
  // A session set to zero lanes came back as six, because `lanes_allocated || 6`
  // cannot tell "none" from "not recorded". The club's land-training session
  // sits in the pool timetable, and zeroing its lanes is the correct fix — it
  // uses no water — but it kept contributing six lane-hours to every total.

  test('an explicit zero is honoured', () => {
    expect(lanesOf({ lanes_allocated: 0 })).toBe(0);
  });

  test('a real lane count is returned unchanged', () => {
    expect(lanesOf({ lanes_allocated: 6 })).toBe(6);
    expect(lanesOf({ lanes_allocated: 1 })).toBe(1);
  });

  test('not recorded still assumes the club default', () => {
    // Most sessions have never had this set, and six is the UI default they are
    // created with. Reading those as zero would wipe out the club's water.
    expect(lanesOf({ lanes_allocated: null })).toBe(6);
    expect(lanesOf({ lanes_allocated: undefined })).toBe(6);
    expect(lanesOf({})).toBe(6);
    expect(lanesOf(null)).toBe(6);
    expect(lanesOf({ lanes_allocated: '' })).toBe(6);
  });

  test('a stored string is read as a number', () => {
    expect(lanesOf({ lanes_allocated: '4' })).toBe(4);
    expect(lanesOf({ lanes_allocated: '0' })).toBe(0);
  });

  test('nonsense falls back rather than poisoning the arithmetic', () => {
    expect(lanesOf({ lanes_allocated: 'six' })).toBe(6);
    expect(lanesOf({ lanes_allocated: -2 })).toBe(6);
  });

  test('a zero-lane session contributes no water', () => {
    // The point of the whole change: lane-hours are lanes x duration, so zero
    // lanes must be zero lane-hours rather than six hours of phantom pool time.
    expect(lanesOf({ lanes_allocated: 0 }) * 1.5).toBe(0);
  });
});

test.describe('seeding leaves out water that is not water', () => {
  const base = (sessions) => ({
    sessions,
    squads: [],
    defaults: {},
    utilisation: { totalLaneHours: 10, measuredShowRate: 0.5 },
    coaches: [],
    clubAgeHistogram: {}
  });

  const S = (over = {}) => ({
    id: 's1', name: 'GOLD Monday', day: 'Monday', startTime: '18:00', endTime: '19:30',
    durationHours: 1.5, location: 'Main', lanes: 6, isActive: true,
    laneHours: 9, squadIdFromName: 'sq1', squadCounts: {}, rosterCount: 0,
    attendance: { registers: 0, avgPresent: null }, ...over
  });

  test('a session using no lanes never becomes a pool slot', () => {
    // The solver refuses a slot with no lanes, so seeding one made the entire
    // scenario unsolvable — "Land training: lanes must be at least 1" — over a
    // session that was correctly recorded as using no water at all.
    const inputs = buildScenarioInputsFromBaseline(base([
      S(),
      S({ id: 's2', name: 'Land training', lanes: 0, laneHours: 0, squadIdFromName: null })
    ]));
    expect(inputs.poolSlots.map(s => s.label)).toEqual(['GOLD Monday']);
  });

  test('the scenario it seeds is one the solver accepts', () => {
    const inputs = buildScenarioInputsFromBaseline(base([
      S({ id: 's2', name: 'Land training', lanes: 0, laneHours: 0, squadIdFromName: null }),
      S()
    ]));
    const check = validateInputs({ ...inputs, squads: inputs.squads });
    expect(check.errors.filter(e => /lanes must be at least 1/.test(e))).toEqual([]);
  });

  test('a normal session is still seeded', () => {
    const inputs = buildScenarioInputsFromBaseline(base([S()]));
    expect(inputs.poolSlots).toHaveLength(1);
    expect(inputs.poolSlots[0].lanes).toBe(6);
  });
});

test.describe('which squads can be banded on ability', () => {
  // Bronze's median racer has two swims across two days, and half of those who
  // raced did so at a single meet. A ranking score off that describes a morning,
  // not a swimmer — and it would be carrying the most weight where the evidence
  // is thinnest.

  test('the foundation squads are always banded on age', () => {
    expect(bandsOnAbility('BRONZE')).toBe(false);
    expect(bandsOnAbility('SILVER')).toBe(false);
    expect(bandsOnAbility('Bronze Monday pm')).toBe(false);
  });

  test('the racing squads can be banded on ability', () => {
    expect(bandsOnAbility('GOLD DEVELOPMENT')).toBe(true);
    expect(bandsOnAbility('AGE DEVELOPMENT')).toBe(true);
    expect(bandsOnAbility('NAR')).toBe(true);
  });

  test('Silver is excluded by name, not by a coverage threshold', () => {
    // Seven in ten Silver swimmers hold some score, so any reasonable coverage
    // threshold would let it through on a number that does not mean what it
    // appears to. The rule has to be about the squad.
    expect(bandsOnAbility('SILVER')).toBe(false);
  });

  test('an unknown squad is assumed bandable rather than silently dropped', () => {
    expect(bandsOnAbility('SOMETHING NEW')).toBe(true);
    expect(bandsOnAbility('')).toBe(true);
    expect(bandsOnAbility(null)).toBe(true);
  });
});

test.describe('why a squad is carried through untouched', () => {
  test('Technical Development is grouped by technique, not by being non-competitive', () => {
    // It holds swimmers who have aged out of Silver but are not yet technically
    // ready for Gold. Its swimmers do race — calling it an off-ramp was wrong,
    // and that wording would have reached a committee paper.
    expect(squadHoldReason('TECHNICAL DEVELOPMENT SQUAD'))
      .toBe('grouped by technique, not age or ranking points');
  });

  test('Club 2 is the squad that trains without competing', () => {
    expect(squadHoldReason('CLUB 2')).toBe('trains without competing');
  });

  test('anything else is held out for having no weekly target', () => {
    expect(squadHoldReason('MASTERS')).toBe('no weekly session target');
  });
});
