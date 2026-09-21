import { test, expect } from '@playwright/test';
import {
  solveRestructure, validateInputs, enumerateStructures, suggestStructures,
  diffScenarios, coachesRequiredFor, coachAvailableFor, timeToMinutes
} from '../../lib/restructure-solver.js';

const S = (id, day, startTime, endTime, over = {}) => ({
  id, day, startTime, endTime, lanes: 6, venue: 'Main', enabled: true,
  label: `${day} ${startTime}-${endTime}`, source: 'candidate', ...over
});

const Q = (id, minAge, maxAge, over = {}) => ({
  id, name: id, minAge, maxAge, targetSize: 16, swimmersPerLane: 8,
  targetSessionsPerWeek: 1, targetHoursPerWeek: 4, competitive: true,
  priority: 1, ...over
});

const C = (id, over = {}) => ({
  id, name: id, level: 'L2', maxLanes: 3, maxHoursPerWeek: null,
  squadIds: [], availability: [], venues: [], ...over
});

const inputs = (poolSlots, squads, over = {}) => ({
  version: 1, poolSlots, squads, coaches: [], ...over
});

const N = (day, start, end, venue = 'Main') => ({
  day, venue, startMin: timeToMinutes(start), endMin: timeToMinutes(end),
  startTime: start, endTime: end
});

test.describe('coach requirement maths', () => {
  const policy = { maxLanesPerCoach: 3, minCoachesPerSquadSession: 1, minCoachesPerSquadSessionUnder14: 2 };

  test('one coach per three lanes, rounded up', () => {
    expect(coachesRequiredFor({ lanes: 3, squad: { minAge: 15 } }, policy)).toBe(1);
    expect(coachesRequiredFor({ lanes: 4, squad: { minAge: 15 } }, policy)).toBe(2);
    expect(coachesRequiredFor({ lanes: 7, squad: { minAge: 15 } }, policy)).toBe(3);
  });

  test('under-14 squads carry a floor of two coaches', () => {
    expect(coachesRequiredFor({ lanes: 1, squad: { minAge: 11 } }, policy)).toBe(2);
    expect(coachesRequiredFor({ lanes: 1, squad: { minAge: 14 } }, policy)).toBe(1);
  });

  test('the youngest member decides, as with the curfew', () => {
    expect(coachesRequiredFor({ lanes: 2, squad: { minAge: 13 } }, policy)).toBe(2);
  });
});

test.describe('coach availability', () => {
  test('a blank availability list means available, not unavailable', () => {
    // A freshly seeded roster has no windows typed against it. Reading blank as
    // unavailable would report the whole timetable uncovered on first load.
    expect(coachAvailableFor(C('c'), N('Monday', '18:00', '19:30'))).toBe(true);
  });

  test('a window must cover the whole slot', () => {
    const coach = C('c', { availability: [{ day: 'Monday', from: '18:00', to: '19:00' }] });
    expect(coachAvailableFor(coach, N('Monday', '18:00', '19:00'))).toBe(true);
    expect(coachAvailableFor(coach, N('Monday', '18:00', '19:30'))).toBe(false);
    expect(coachAvailableFor(coach, N('Tuesday', '18:00', '19:00'))).toBe(false);
  });

  test('a venue list restricts where a coach can be used', () => {
    const coach = C('c', { venues: ['Annex'] });
    expect(coachAvailableFor(coach, N('Monday', '18:00', '19:30', 'Main'))).toBe(false);
    expect(coachAvailableFor(coach, N('Monday', '18:00', '19:30', 'Annex'))).toBe(true);
  });
});

test.describe('coach cover — roster in, gaps out', () => {
  const slots = [S('mon', 'Monday', '18:00', '19:30'), S('wed', 'Wednesday', '18:00', '19:30')];
  const squads = [Q('Seniors', 15, 18, { targetSize: 16, targetSessionsPerWeek: 2 })];

  test('an empty roster is unanswered, not failed', () => {
    // Scoring nobody-rostered as 0% cover would bury every other signal, and
    // flagging every session red would be noise rather than information.
    const r = solveRestructure(inputs(slots, squads, { coaches: [] }));
    expect(r.ok).toBe(true);
    expect(r.metrics.coach.coveragePct).toBeNull();
    expect(r.metrics.subScores.coachCover).toBeUndefined();
    expect(r.gaps.coach).toEqual([]);
    expect(r.plan.assignments.flatMap(a => a.flags.map(f => f.type))).not.toContain('NO_COACH');
    expect(r.warnings.join(' ')).toContain('No coaches on the roster');
  });

  test('a rostered coach covers the sessions and is named on them', () => {
    const r = solveRestructure(inputs(slots, squads, { coaches: [C('c1')] }));
    expect(r.metrics.coach.coveragePct).toBe(100);
    expect(r.gaps.coach).toEqual([]);
    expect(r.plan.assignments[0].coachNames).toEqual(['c1']);
    expect(r.metrics.coach.headcountUsed).toBe(1);
    expect(r.metrics.subScores.coachCover).toBe(100);
  });

  test('under-14 squads demand two coaches, and the shortfall is reported', () => {
    const young = [Q('Minnows', 9, 11, { targetSessionsPerWeek: 1 })];
    const r = solveRestructure(inputs(slots, young, { coaches: [C('c1')] }));
    expect(r.plan.assignments[0].coachesRequired).toBe(2);
    expect(r.plan.assignments[0].coachesAssigned).toBe(1);
    expect(r.plan.assignments[0].flags.map(f => f.type)).toContain('NO_COACH');
    expect(r.metrics.coach.coveragePct).toBe(50);
  });

  test('a gap names the session, the squad and the hours needed', () => {
    const young = [Q('Minnows', 9, 11, { targetSessionsPerWeek: 1 })];
    const r = solveRestructure(inputs(slots, young, { coaches: [C('c1')] }));
    expect(r.gaps.coach[0]).toMatchObject({
      squadName: 'Minnows', shortfall: 1, required: 2, assigned: 1
    });
    expect(r.gaps.coach[0].hoursPerWeek).toBeCloseTo(1.5, 5);
    expect(r.gaps.coach[0].message).toContain('Minnows');
  });

  test('availability is respected per day', () => {
    const busy = C('c1', { availability: [{ day: 'Monday', from: '17:00', to: '20:00' }] });
    const r = solveRestructure(inputs(slots, squads, { coaches: [busy] }));
    expect(r.plan.assignments.find(a => a.day === 'Monday').coachesAssigned).toBe(1);
    expect(r.plan.assignments.find(a => a.day === 'Wednesday').coachesAssigned).toBe(0);
  });

  test('a coach tied to other squads is not borrowed', () => {
    const r = solveRestructure(inputs(slots, squads, { coaches: [C('c1', { squadIds: ['Elsewhere'] })] }));
    expect(r.metrics.coach.coveredCoachHours).toBe(0);
    expect(r.metrics.coach.byCoach[0].unused).toBe(true);
  });

  test('a coach is never double-booked across overlapping sessions', () => {
    const clashing = [S('a', 'Monday', '18:00', '19:30'), S('b', 'Monday', '18:30', '20:00')];
    const two = [Q('A', 15, 18, { targetSessionsPerWeek: 1 }), Q('B', 15, 18, { targetSessionsPerWeek: 1 })];
    const r = solveRestructure(inputs(clashing, two, { coaches: [C('c1')] }));
    expect(r.plan.assignments.filter(a => a.coachesAssigned > 0)).toHaveLength(1);
  });

  test('a coach cannot cross venues inside the travel window', () => {
    const twoVenues = [
      S('main', 'Monday', '17:00', '18:00', { venue: 'Main' }),
      S('annex', 'Monday', '18:15', '19:15', { venue: 'Annex' })
    ];
    const two = [Q('A', 15, 18, { targetSessionsPerWeek: 1 }), Q('B', 15, 18, { targetSessionsPerWeek: 1 })];
    const r = solveRestructure(inputs(twoVenues, two, {
      coaches: [C('c1')], policy: { venueTransitMinutes: 30 }
    }));
    expect(r.plan.assignments.filter(a => a.coachesAssigned > 0)).toHaveLength(1);
  });

  test('a weekly hours cap stops a coach being over-committed', () => {
    const r = solveRestructure(inputs(slots, squads, { coaches: [C('c1', { maxHoursPerWeek: 1.5 })] }));
    expect(r.metrics.coach.coveredCoachHours).toBeCloseTo(1.5, 5);
    expect(r.metrics.coach.byCoach[0].overCommitted).toBe(false);
  });

  test('peak concurrent demand is reported per day', () => {
    const concurrent = [S('a', 'Monday', '18:00', '19:30'), S('b', 'Monday', '18:00', '19:30')];
    const two = [Q('A', 15, 18, { targetSessionsPerWeek: 1 }), Q('B', 15, 18, { targetSessionsPerWeek: 1 })];
    const r = solveRestructure(inputs(concurrent, two, { coaches: [C('c1')] }));
    expect(r.metrics.coach.peakByDay.Monday).toBe(2);
    expect(r.metrics.coach.peakConcurrent).toBe(2);
  });

  test('requireCoachCover turns gaps into a refusal', () => {
    const young = [Q('Minnows', 9, 11, { targetSessionsPerWeek: 1 })];
    const r = solveRestructure(inputs(slots, young, {
      coaches: [C('c1')], policy: { requireCoachCover: true }
    }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('coach cover is set to required');
  });

  test('requireCoachCover with nobody rostered says exactly that', () => {
    const r = solveRestructure(inputs(slots, squads, {
      coaches: [], policy: { requireCoachCover: true }
    }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('nobody on the roster');
  });

  test('a coach roster does not change the timetable, only its cover', () => {
    // Coach matching runs after the plan is built, so adding staff must never
    // silently move a squad to a different night.
    const without = solveRestructure(inputs(slots, squads, { coaches: [] }));
    const with_ = solveRestructure(inputs(slots, squads, { coaches: [C('c1')] }));
    expect(with_.plan.assignments.map(a => `${a.day} ${a.squadId}`))
      .toEqual(without.plan.assignments.map(a => `${a.day} ${a.squadId}`));
  });

  test('validation rejects a malformed availability window', () => {
    const v = validateInputs(inputs(slots, squads, {
      coaches: [C('c1', { availability: [{ day: 'Someday', from: '18:00', to: '19:00' }] })]
    }));
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toContain('is not a weekday name');

    const v2 = validateInputs(inputs(slots, squads, {
      coaches: [C('c1', { availability: [{ day: 'Monday', from: '20:00', to: '19:00' }] })]
    }));
    expect(v2.errors.join(' ')).toContain('ends at or before it starts');
  });

  test('a coach pointing at a deleted squad is a warning, not an error', () => {
    const v = validateInputs(inputs(slots, squads, { coaches: [C('c1', { squadIds: ['Gone'] })] }));
    expect(v.ok).toBe(true);
    expect(v.warnings.join(' ')).toContain('no longer exist');
  });
});

test.describe('structure search', () => {
  const histogram = { 9: 8, 10: 10, 11: 12, 12: 11, 13: 9, 14: 8, 15: 7, 16: 6 };

  test('produces only contiguous, gapless, non-overlapping bands', () => {
    const structures = enumerateStructures(histogram, { minSquads: 3, maxSquads: 4, minBandSize: 6 });
    expect(structures.length).toBeGreaterThan(0);
    structures.forEach(squads => {
      const sorted = squads.slice().sort((a, b) => a.minAge - b.minAge);
      expect(sorted[0].minAge).toBe(9);
      expect(sorted[sorted.length - 1].maxAge).toBe(16);
      sorted.forEach((s, i) => {
        expect(s.minAge).toBeLessThanOrEqual(s.maxAge);
        if (i > 0) expect(s.minAge).toBe(sorted[i - 1].maxAge + 1);
      });
    });
  });

  test('respects the squad-count bounds', () => {
    const structures = enumerateStructures(histogram, { minSquads: 3, maxSquads: 4, minBandSize: 1 });
    const counts = structures.map(s => s.length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts)).toBeLessThanOrEqual(4);
  });

  test('prunes bands too small to run as a squad', () => {
    const structures = enumerateStructures(histogram, { minSquads: 3, maxSquads: 5, minBandSize: 15 });
    structures.forEach(squads => squads.forEach(s => {
      const n = Object.keys(histogram).map(Number)
        .filter(a => a >= s.minAge && a <= s.maxAge)
        .reduce((sum, a) => sum + histogram[a], 0);
      expect(n).toBeGreaterThanOrEqual(15);
    }));
  });

  test('every band inherits sane targets and the roster is fully covered', () => {
    const structures = enumerateStructures(histogram, { minSquads: 3, maxSquads: 3, minBandSize: 6 });
    const total = Object.values(histogram).reduce((a, b) => a + b, 0);
    structures.forEach(squads => {
      expect(squads.reduce((s, x) => s + x.targetSize, 0)).toBe(total);
      squads.forEach(s => {
        expect(s.targetSessionsPerWeek).toBeGreaterThan(0);
        expect(s.swimmersPerLane).toBeGreaterThan(0);
      });
    });
  });

  test('a histogram too thin to partition yields nothing rather than nonsense', () => {
    expect(enumerateStructures({ 11: 20 }, { minSquads: 3, maxSquads: 5 })).toEqual([]);
    expect(enumerateStructures({}, {})).toEqual([]);
  });

  test('suggestStructures ranks candidates and returns squad sets the solver accepts', () => {
    const slots = [
      S('mon', 'Monday', '18:00', '19:30'), S('tue', 'Tuesday', '18:00', '19:30'),
      S('wed', 'Wednesday', '18:00', '19:30'), S('sat', 'Saturday', '08:00', '10:00')
    ];
    const seed = inputs(slots, [Q('Existing', 9, 16, { targetSize: 71, targetSessionsPerWeek: 3 })]);
    const { suggestions, candidatesConsidered } = suggestStructures(seed, histogram, {
      minSquads: 3, maxSquads: 4, minBandSize: 8, topN: 3
    });

    expect(candidatesConsidered).toBeGreaterThan(0);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].total).toBeGreaterThanOrEqual(suggestions[i].total);
    }
    suggestions.forEach(s => {
      expect(validateInputs({ ...seed, squads: s.squads }).errors).toEqual([]);
    });
  });

  test('suggestStructures is deterministic', () => {
    const slots = [S('mon', 'Monday', '18:00', '19:30'), S('wed', 'Wednesday', '18:00', '19:30')];
    const seed = inputs(slots, [Q('Existing', 9, 16, { targetSize: 71 })]);
    const a = suggestStructures(seed, histogram, { minSquads: 3, maxSquads: 3, topN: 3 });
    const b = suggestStructures(seed, histogram, { minSquads: 3, maxSquads: 3, topN: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('a club with no roster data gets no suggestions rather than a crash', () => {
    const seed = inputs([S('mon', 'Monday', '18:00', '19:30')], [Q('X', 11, 13)]);
    expect(suggestStructures(seed, {}, {}).suggestions).toEqual([]);
  });
});

test.describe('diffScenarios', () => {
  const slots = [S('mon', 'Monday', '18:00', '19:30'), S('wed', 'Wednesday', '18:00', '19:30')];
  const squads = [Q('Gold', 11, 13, { targetSize: 16, targetSessionsPerWeek: 2 })];
  const lean = solveRestructure(inputs([slots[0]], squads));
  const rich = solveRestructure(inputs(slots, squads));

  test('lines scenarios up row by row and marks the better one', () => {
    const diff = diffScenarios([
      { name: 'Today', metrics: lean.metrics },
      { name: 'With new water', metrics: rich.metrics }
    ]);
    expect(diff.names).toEqual(['Today', 'With new water']);
    expect(diff.rows.find(r => r.key === 'swimmersServed').values).toHaveLength(2);
    expect(diff.rows.find(r => r.key === 'availableLaneHours').bestIndex).toBe(1);
  });

  test('knows which direction is better for each measure', () => {
    const diff = diffScenarios([
      { name: 'A', metrics: lean.metrics }, { name: 'B', metrics: rich.metrics }
    ]);
    expect(diff.rows.find(r => r.key === 'unservedDemand').higherIsBetter).toBe(false);
    expect(diff.rows.find(r => r.key === 'squadCount').higherIsBetter).toBeNull();
  });

  test('reports per-squad deltas between the first two scenarios', () => {
    const diff = diffScenarios([
      { name: 'A', metrics: lean.metrics }, { name: 'B', metrics: rich.metrics }
    ]);
    const gold = diff.squadDeltas.find(d => d.name === 'Gold');
    expect(gold.inA).toBe(true);
    expect(gold.inB).toBe(true);
    expect(gold.sessionsB).toBeGreaterThanOrEqual(gold.sessionsA);
  });

  test('an empty or single-entry list does not throw', () => {
    expect(diffScenarios([]).rows).toEqual([]);
    expect(diffScenarios([{ name: 'only', metrics: rich.metrics }]).squadDeltas).toEqual([]);
    expect(diffScenarios(null).names).toEqual([]);
  });
});

test.describe('squad requirement — "30 swimmers, 4 sessions a week: is it achieved?"', () => {
  // 30 swimmers owing 4 sessions each is 120 swimmer-sessions of water.
  // At 8 per lane that is 4 lanes a session, 4 sessions a week.
  const bigWeek = ['Monday', 'Tuesday', 'Thursday', 'Saturday']
    .map((d, i) => S(`s${i}`, d, '18:00', '19:30', { lanes: 6 }));
  const squad30 = [Q('Age Dev', 12, 14, {
    targetSize: 30, swimmersPerLane: 8, targetSessionsPerWeek: 4, targetHoursPerWeek: 6
  })];

  test('confirms the requirement is met, in the club\'s own terms', () => {
    const r = solveRestructure(inputs(bigWeek, squad30));
    const s = r.metrics.bySquad[0];

    expect(s.swimmerSessionsRequired).toBe(120);
    expect(s.weeklyPlaces).toBeGreaterThanOrEqual(120);
    expect(s.requirementMet).toBe(true);
    expect(s.requirementReason).toContain('30 swimmers x 4 sessions');
    expect(r.metrics.squadsMeetingRequirement).toBe(1);
    expect(r.gaps.capacity).toEqual([]);
  });

  test('maxSquadSize is total weekly places over sessions owed', () => {
    // The same formula as pages/capacity.js, so the two screens cannot disagree
    // about how many swimmers a squad's water supports.
    const r = solveRestructure(inputs(bigWeek, squad30));
    const s = r.metrics.bySquad[0];
    expect(s.maxSquadSize).toBe(Math.floor(s.weeklyPlaces / 4));
    expect(s.served).toBe(30);
  });

  test('catches too few sessions even when the places add up', () => {
    // Two big sessions hold plenty of bodies but cannot deliver four a week.
    const twoBig = [
      S('a', 'Monday', '18:00', '19:30', { lanes: 10 }),
      S('b', 'Thursday', '18:00', '19:30', { lanes: 10 })
    ];
    const r = solveRestructure(inputs(twoBig, squad30));
    const s = r.metrics.bySquad[0];
    expect(s.sessionsAssigned).toBe(2);
    expect(s.requirementMet).toBe(false);
    expect(s.requirementReason).toContain('Only 2 of the 4 weekly sessions');
    expect(r.gaps.capacity[0].sessionsShort).toBe(2);
  });

  test('catches too few places even when the sessions are there', () => {
    const narrow = ['Monday', 'Tuesday', 'Thursday', 'Saturday']
      .map((d, i) => S(`n${i}`, d, '18:00', '19:30', { lanes: 2 }));
    const r = solveRestructure(inputs(narrow, squad30));
    const s = r.metrics.bySquad[0];
    expect(s.sessionsAssigned).toBe(4);
    expect(s.weeklyPlaces).toBe(64);          // 4 sessions x 2 lanes x 8
    expect(s.requirementMet).toBe(false);
    expect(s.placesShortfall).toBe(56);       // 120 needed, 64 delivered
    expect(s.requirementReason).toContain('short by 56');
  });

  test('club totals roll the requirement up across squads', () => {
    const r = solveRestructure(inputs(bigWeek, squad30.concat([
      Q('Juniors', 9, 11, { targetSize: 16, targetSessionsPerWeek: 2, targetHoursPerWeek: 3 })
    ])));
    expect(r.metrics.swimmerSessionsRequired).toBe(120 + 32);
    expect(r.metrics.swimmerSessionsDelivered).toBeLessThanOrEqual(r.metrics.swimmerSessionsRequired);
    expect(r.metrics.squadsMeetingRequirement).toBeLessThanOrEqual(2);
  });
});

test.describe('structure search proposes volume, not just age lines', () => {
  const histogram = { 9: 10, 10: 12, 11: 14, 12: 13, 13: 11, 14: 10, 15: 9, 16: 8 };

  test('older bands are given more training than younger ones', () => {
    // Inheriting the nearest existing squad's targets re-draws the age lines but
    // never proposes a different amount of training, which is most of what makes
    // a restructure a restructure.
    const structures = enumerateStructures(histogram, {
      minSquads: 3, maxSquads: 3, minBandSize: 6, varyVolume: true
    });
    expect(structures.length).toBeGreaterThan(0);
    structures.forEach(squads => {
      const sorted = squads.slice().sort((a, b) => a.minAge - b.minAge);
      const youngest = sorted[0];
      const oldest = sorted[sorted.length - 1];
      expect(oldest.targetSessionsPerWeek).toBeGreaterThanOrEqual(youngest.targetSessionsPerWeek);
      squads.forEach(s => expect(s.targetHoursPerWeek).toBeGreaterThan(0));
    });
  });

  test('varyVolume off falls back to inheriting the template', () => {
    const template = [{
      id: 'sq_old', name: 'Old', minAge: 9, maxAge: 16, targetSize: 87,
      swimmersPerLane: 8, targetSessionsPerWeek: 3, targetHoursPerWeek: 4.5,
      medianSessionHours: 1.5, competitive: true
    }];
    const structures = enumerateStructures(histogram, {
      minSquads: 3, maxSquads: 3, minBandSize: 6, varyVolume: false, templateSquads: template
    });
    structures.forEach(squads => squads.forEach(s => {
      expect(s.targetSessionsPerWeek).toBe(3);
      expect(s.targetHoursPerWeek).toBe(4.5);
    }));
  });

  test('non-competitive off-ramps ride through untouched', () => {
    // Technical Development and Club 2 are off-ramps, not rungs on the pathway.
    const reserved = [{
      id: 'sq_club2', name: 'Club 2', minAge: 15, maxAge: 18, targetSize: 12,
      swimmersPerLane: 8, targetSessionsPerWeek: 1, targetHoursPerWeek: 1,
      medianSessionHours: 1, competitive: false
    }];
    const structures = enumerateStructures(histogram, {
      minSquads: 3, maxSquads: 3, minBandSize: 6, reservedSquads: reserved
    });
    structures.forEach(squads => {
      const club2 = squads.find(s => s.name === 'Club 2');
      expect(club2).toBeTruthy();
      expect(club2.competitive).toBe(false);
      expect(club2.targetSize).toBe(12);
    });
  });

  test('suggestions report whether each structure meets the squad requirements', () => {
    const slots = ['Monday', 'Tuesday', 'Thursday', 'Saturday']
      .map((d, i) => S(`s${i}`, d, '18:00', '20:00', { lanes: 8 }));
    const seed = inputs(slots, [Q('Existing', 9, 16, { targetSize: 87, targetSessionsPerWeek: 3 })]);
    const { suggestions } = suggestStructures(seed, histogram, {
      minSquads: 3, maxSquads: 4, minBandSize: 8, topN: 3
    });

    expect(suggestions.length).toBeGreaterThan(0);
    suggestions.forEach(s => {
      expect(typeof s.squadsMeetingRequirement).toBe('number');
      expect(s.swimmerSessionsRequired).toBeGreaterThan(0);
      expect(Array.isArray(s.bands)).toBe(true);
      s.bands.forEach(b => {
        expect(b.sessions).toBeGreaterThan(0);
        expect(b.targetSize).toBeGreaterThan(0);
      });
    });
  });
});

test.describe('capability banding', () => {
  // Buckets as the baseline produces them: peak World Aquatics points in
  // 50-point steps, each carrying the age range of the swimmers in it.
  const capability = {
    bucketSize: 50,
    withData: 100,
    withoutData: 4,
    buckets: {
      50:  { count: 12, minAge: 9,  maxAge: 12 },
      100: { count: 18, minAge: 9,  maxAge: 13 },
      150: { count: 20, minAge: 10, maxAge: 14 },
      200: { count: 16, minAge: 11, maxAge: 15 },
      250: { count: 14, minAge: 12, maxAge: 16 },
      300: { count: 12, minAge: 13, maxAge: 17 },
      350: { count: 8,  minAge: 14, maxAge: 18 }
    }
  };

  const capOpts = (over = {}) => ({
    bandBy: 'capability', capability, minSquads: 3, maxSquads: 4,
    minBandSize: 6, maxAgeSpread: 8, ...over
  });

  test('bands on points, and each band carries a capability gate', () => {
    const structures = enumerateStructures({}, capOpts());
    expect(structures.length).toBeGreaterThan(0);
    structures.forEach(squads => {
      squads.filter(s => s.competitive).forEach(s => {
        expect(s.bandBy).toBe('capability');
        expect(s.minWaPoints).toBeLessThanOrEqual(s.maxWaPoints);
        expect(s.name).toContain('WA pts');
      });
    });
  });

  test('bands are contiguous and gapless across the points scale', () => {
    const structures = enumerateStructures({}, capOpts());
    structures.forEach(squads => {
      const sorted = squads.filter(s => s.competitive).sort((a, b) => a.minWaPoints - b.minWaPoints);
      expect(sorted[0].minWaPoints).toBe(50);
      expect(sorted[sorted.length - 1].maxWaPoints).toBe(399);
      sorted.forEach((s, i) => {
        if (i > 0) expect(s.minWaPoints).toBe(sorted[i - 1].maxWaPoints + 1);
      });
    });
  });

  test('every band still carries an age range, so the curfew and LTAD keep working', () => {
    // The capability gate defines the squad; the age range describes who is in
    // it, and is what the youth time guides and LTAD volume are judged against.
    const structures = enumerateStructures({}, capOpts());
    structures.forEach(squads => squads.filter(s => s.competitive).forEach(s => {
      expect(Number.isFinite(s.minAge)).toBe(true);
      expect(Number.isFinite(s.maxAge)).toBe(true);
      expect(s.minAge).toBeLessThanOrEqual(s.maxAge);
      expect(s.targetHoursPerWeek).toBeGreaterThan(0);
    }));
  });

  test('the age guard rejects a band spanning too many birth years', () => {
    // A capability band matching swimmers well but spanning half the club's
    // birth years is a safeguarding and training-volume problem, not a squad.
    const loose = enumerateStructures({}, capOpts({ maxAgeSpread: 20 }));
    const tight = enumerateStructures({}, capOpts({ maxAgeSpread: 3 }));
    expect(tight.length).toBeLessThan(loose.length);
    tight.forEach(squads => squads.filter(s => s.competitive).forEach(s => {
      expect(s.maxAge - s.minAge).toBeLessThanOrEqual(3);
    }));
  });

  test('non-competitive off-ramps ride through a capability restructure too', () => {
    const reserved = [{
      id: 'sq_club2', name: 'Club 2', minAge: 15, maxAge: 18, targetSize: 12,
      swimmersPerLane: 8, targetSessionsPerWeek: 1, targetHoursPerWeek: 1,
      medianSessionHours: 1, competitive: false
    }];
    const structures = enumerateStructures({}, capOpts({ reservedSquads: reserved }));
    structures.forEach(squads => {
      const club2 = squads.find(s => s.name === 'Club 2');
      expect(club2).toBeTruthy();
      expect(club2.competitive).toBe(false);
    });
  });

  test('too little capability data yields nothing rather than nonsense', () => {
    expect(enumerateStructures({}, capOpts({
      capability: { bucketSize: 50, buckets: { 100: { count: 30, minAge: 10, maxAge: 12 } } }
    }))).toEqual([]);
    expect(enumerateStructures({}, { bandBy: 'capability' })).toEqual([]);
  });

  test('hybrid considers both axes and ranks them together', () => {
    const slots = ['Monday', 'Tuesday', 'Thursday', 'Saturday']
      .map((d, i) => S(`s${i}`, d, '18:00', '20:00', { lanes: 8 }));
    const seed = inputs(slots, [Q('Existing', 9, 18, { targetSize: 100, targetSessionsPerWeek: 3 })]);
    const ages = { 9: 10, 10: 14, 11: 16, 12: 16, 13: 14, 14: 12, 15: 10, 16: 8 };

    const ageOnly = suggestStructures(seed, ages, { bandBy: 'age', minSquads: 3, maxSquads: 4, topN: 5 });
    const capOnly = suggestStructures(seed, ages, { bandBy: 'capability', capability, minSquads: 3, maxSquads: 4, topN: 5 });
    const both = suggestStructures(seed, ages, { bandBy: 'hybrid', capability, minSquads: 3, maxSquads: 4, topN: 5 });

    expect(both.candidatesConsidered).toBe(ageOnly.candidatesConsidered + capOnly.candidatesConsidered);
    // The winner is whichever axis actually scores better, not a preset.
    expect(both.suggestions[0].total).toBeGreaterThanOrEqual(
      Math.max(ageOnly.suggestions[0].total, capOnly.suggestions[0].total) - 1e-9);
    both.suggestions.forEach(s => expect(['age', 'capability']).toContain(s.bandBy));
  });

  test('a capability suggestion is something the solver accepts', () => {
    const slots = ['Monday', 'Wednesday', 'Friday']
      .map((d, i) => S(`s${i}`, d, '18:00', '20:00', { lanes: 8 }));
    const seed = inputs(slots, [Q('Existing', 9, 18, { targetSize: 100, targetSessionsPerWeek: 3 })]);
    const { suggestions } = suggestStructures(seed, { 10: 20, 12: 20, 14: 20 },
      { bandBy: 'capability', capability, minSquads: 3, maxSquads: 3, topN: 2 });

    expect(suggestions.length).toBeGreaterThan(0);
    suggestions.forEach(s => {
      expect(validateInputs({ ...seed, squads: s.squads }).errors).toEqual([]);
      const solved = solveRestructure({ ...seed, squads: s.squads });
      expect(solved.ok).toBe(true);
      expect(solved.metrics.bySquad.length).toBe(s.squads.length);
    });
  });

  test('capability banding is deterministic', () => {
    const a = enumerateStructures({}, capOpts());
    const b = enumerateStructures({}, capOpts());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

test.describe('requirement and capacity are measured on the same basis', () => {
  // A squad of 36 owing 4 sessions needs 144 swimmer-sessions of water. If lanes
  // are sized for a typical turnout while the requirement is stated for the whole
  // roster, the two can never agree and every plan reports a phantom shortfall.
  const slots = ['Monday', 'Tuesday', 'Thursday', 'Sunday']
    .map((d, i) => S(`s${i}`, d, '18:00', '20:00', { lanes: 6 }));
  const gold = [Q('Gold', 11, 13, {
    targetSize: 36, swimmersPerLane: 8, targetSessionsPerWeek: 4, targetHoursPerWeek: 8
  })];

  test('a low show rate does not invent a shortfall', () => {
    const full = solveRestructure(inputs(slots, gold, { policy: { showRate: 1.0 } }));
    const typical = solveRestructure(inputs(slots, gold, { policy: { showRate: 0.55 } }));

    // Same water planned either way — the show rate is a lens, not a sizing input.
    expect(typical.metrics.bySquad[0].weeklyPlaces).toBe(full.metrics.bySquad[0].weeklyPlaces);
    expect(typical.metrics.bySquad[0].requirementMet).toBe(full.metrics.bySquad[0].requirementMet);
  });

  test('36 swimmers x 4 sessions is met by 4 sessions of 5 lanes at 8 a lane', () => {
    const r = solveRestructure(inputs(slots, gold, { policy: { showRate: 0.55 } }));
    const s = r.metrics.bySquad[0];
    expect(s.swimmerSessionsRequired).toBe(144);
    // ceil(36/8) = 5 lanes a session, 4 sessions, 8 a lane = 160 places.
    expect(s.weeklyPlaces).toBeGreaterThanOrEqual(144);
    expect(s.requirementMet).toBe(true);
    expect(s.placesShortfall).toBe(0);
  });

  test('the show rate still drives occupancy', () => {
    const full = solveRestructure(inputs(slots, gold, { policy: { showRate: 1.0 } }));
    const typical = solveRestructure(inputs(slots, gold, { policy: { showRate: 0.55 } }));
    // Fewer bodies in the same water means it reads as less full.
    expect(typical.metrics.occupancyPct).toBeLessThan(full.metrics.occupancyPct);
  });

  test('a genuine shortfall is still reported', () => {
    const narrow = ['Monday', 'Tuesday', 'Thursday', 'Sunday']
      .map((d, i) => S(`n${i}`, d, '18:00', '20:00', { lanes: 1 }));
    const r = solveRestructure(inputs(narrow, gold));
    const s = r.metrics.bySquad[0];
    expect(s.weeklyPlaces).toBe(32);        // 4 sessions x 1 lane x 8
    expect(s.requirementMet).toBe(false);
    expect(s.placesShortfall).toBe(112);    // 144 needed, 32 delivered
  });
});

test.describe('sessions offered versus sessions owed', () => {
  // NAR owes 5 sessions a week but is offered 8. The club books and coaches all
  // 8; a swimmer attends 5. Planning only the 5 understates the water and the
  // coaching; sizing all 8 for the whole squad at once overstates the lanes.
  const slots = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday']
    .map((d, i) => S(`s${i}`, d, i === 7 ? '06:00' : '18:00', i === 7 ? '08:00' : '20:00', { lanes: 6 }));

  const nar = over => [Q('NAR', 14, 18, {
    targetSize: 24, swimmersPerLane: 6, targetSessionsPerWeek: 5, targetHoursPerWeek: 8, ...over
  })];

  test('every session offered is placed, not just those owed', () => {
    const r = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 8 })));
    const s = r.metrics.bySquad[0];
    expect(s.sessionsAssigned).toBe(8);
    expect(s.sessionsOffered).toBe(8);
    expect(s.sessionsTarget).toBe(5);
  });

  test('offering more sessions books more water, not more lanes per session', () => {
    const five = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 5 })));
    const eight = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 8 })));

    // Spread across more sessions, each needs fewer lanes...
    const lanesFive = five.plan.assignments.find(a => a.squadId === 'NAR').lanes;
    const lanesEight = eight.plan.assignments.find(a => a.squadId === 'NAR').lanes;
    expect(lanesEight).toBeLessThanOrEqual(lanesFive);

    // ...but the club is committed to more pool time overall.
    expect(eight.metrics.assignedLaneHours).toBeGreaterThan(five.metrics.assignedLaneHours);
  });

  test('the requirement is still measured on what each swimmer owes', () => {
    const r = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 8 })));
    const s = r.metrics.bySquad[0];
    expect(s.swimmerSessionsRequired).toBe(120);   // 24 swimmers x 5 owed
    expect(s.requirementMet).toBe(true);
    expect(s.requirementReason).toContain('24 swimmers x 5 sessions');
    expect(s.requirementReason).toContain('offered');
  });

  test('demand against supply counts the hours offered, not the hours owed', () => {
    const five = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 5 })));
    const eight = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 8 })));
    expect(eight.diagnostics.demandVsSupply.requiredLaneHours)
      .toBeGreaterThan(five.diagnostics.demandVsSupply.requiredLaneHours);
  });

  test('offered defaults to owed when it is not set', () => {
    const r = solveRestructure(inputs(slots, nar({})));
    expect(r.metrics.bySquad[0].sessionsOffered).toBe(5);
    expect(r.metrics.bySquad[0].sessionsAssigned).toBe(5);
  });

  test('offered can never be fewer than owed', () => {
    const r = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 2 })));
    expect(r.metrics.bySquad[0].sessionsOffered).toBe(5);
  });

  test('more sessions offered means more sessions to staff', () => {
    // Note the direction of travel: spreading a squad across more sessions makes
    // each one smaller, so it can need FEWER coaches per session and fewer coach
    // hours in total, while still committing the club to turning up on more
    // nights. Occasions to staff is the figure that always rises.
    const coach = { id: 'c1', name: 'c1', level: 'L2', maxLanes: 3, maxHoursPerWeek: null,
      squadIds: [], availability: [], venues: [] };
    const five = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 5 }), { coaches: [coach] }));
    const eight = solveRestructure(inputs(slots, nar({ sessionsOfferedPerWeek: 8 }), { coaches: [coach] }));

    expect(eight.plan.assignments.length).toBeGreaterThan(five.plan.assignments.length);
    expect(eight.plan.assignments.every(a => a.coachesRequired >= 1)).toBe(true);
    // And the pool commitment rises regardless.
    expect(eight.metrics.assignedLaneHours).toBeGreaterThan(five.metrics.assignedLaneHours);
  });
});

test.describe('locking squads out of the search', () => {
  const histogram = { 9: 10, 10: 12, 11: 14, 12: 13, 13: 11, 14: 10, 15: 9, 16: 8 };
  const slots = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    .map((d, i) => S(`s${i}`, d, '18:00', '20:00', { lanes: 8 }));

  const nar = {
    id: 'sq_nar', name: 'NAR', minAge: 14, maxAge: 18, targetSize: 24,
    swimmersPerLane: 6, targetSessionsPerWeek: 5, targetHoursPerWeek: 8,
    medianSessionHours: 2, competitive: true, locked: true, priority: 1
  };
  const rest = Q('Rest', 9, 13, { targetSize: 63, targetSessionsPerWeek: 3, targetHoursPerWeek: 4 });

  test('a locked squad is carried through exactly as it was', () => {
    const { suggestions } = suggestStructures(
      inputs(slots, [nar, rest]), histogram,
      { bandBy: 'age', minSquads: 3, maxSquads: 4, minBandSize: 6, topN: 3 });

    expect(suggestions.length).toBeGreaterThan(0);
    suggestions.forEach(s => {
      const kept = s.squads.find(q => q.name === 'NAR');
      expect(kept).toBeTruthy();
      expect(kept.minAge).toBe(14);
      expect(kept.maxAge).toBe(18);
      expect(kept.targetSize).toBe(24);
      expect(kept.targetSessionsPerWeek).toBe(5);
      expect(kept.competitive).toBe(true);
    });
  });

  test('the search re-bands exactly the histogram it is given', () => {
    // The caller decides who is in scope by supplying a histogram covering only
    // the squads being remodelled. Subtracting held-out squads from a club-wide
    // histogram is the legacy path, kept behind a flag: where reserved age bands
    // overlap, those subtractions compound and can empty an age entirely, which
    // punched a hole in the age axis and made every candidate band fail the
    // too-wide check.
    const { suggestions } = suggestStructures(
      inputs(slots, [nar, rest]), histogram,
      { bandBy: 'age', minSquads: 3, maxSquads: 3, minBandSize: 6, topN: 1 });

    const generated = suggestions[0].squads.filter(q => q.name !== 'NAR');
    const total = Object.values(histogram).reduce((a, b) => a + b, 0);
    expect(generated.reduce((a, q) => a + q.targetSize, 0)).toBe(total);
  });

  test('the legacy subtraction path still removes a held-out squad', () => {
    const withSubtraction = suggestStructures(
      inputs(slots, [nar, rest]), histogram,
      { bandBy: 'age', minSquads: 3, maxSquads: 3, minBandSize: 4,
        topN: 1, histogramExcludesReserved: false });
    const total = Object.values(histogram).reduce((a, b) => a + b, 0);
    const generated = withSubtraction.suggestions[0].squads
      .filter(q => q.name !== 'NAR')
      .reduce((a, q) => a + q.targetSize, 0);
    expect(generated).toBeLessThan(total);
  });

  test('an unlocked competitive squad is genuinely re-banded', () => {
    const { suggestions } = suggestStructures(
      inputs(slots, [{ ...nar, locked: false }, rest]), histogram,
      { bandBy: 'age', minSquads: 3, maxSquads: 4, minBandSize: 6, topN: 1 });
    // Nothing is carried through untouched, so the old squad names are gone.
    expect(suggestions[0].squads.some(q => q.name === 'NAR')).toBe(false);
  });

  test('non-competitive squads are held whether locked or not', () => {
    const club2 = {
      id: 'sq_club2', name: 'Club 2', minAge: 15, maxAge: 18, targetSize: 7,
      swimmersPerLane: 8, targetSessionsPerWeek: 2, targetHoursPerWeek: 2,
      medianSessionHours: 1, competitive: false, locked: false
    };
    const { suggestions } = suggestStructures(
      inputs(slots, [club2, rest]), histogram,
      { bandBy: 'age', minSquads: 3, maxSquads: 3, minBandSize: 6, topN: 1 });
    const kept = suggestions[0].squads.find(q => q.name === 'Club 2');
    expect(kept).toBeTruthy();
    expect(kept.competitive).toBe(false);
  });
});

test.describe('room for more swimmers', () => {
  // The question when the squads are being held as they are: not "what should
  // change", but "how many more could we take into what we already run".

  test('spare places become headroom, at the volume the squad is set', () => {
    // Two 6-lane sessions. The squad of 16 owing one session a week needs only
    // one lane in each, so 5 lanes stand empty in each of the two sessions: 80
    // spare places on top of its own 16, all of it usable one session a week.
    const r = solveRestructure(inputs(
      [S('a', 'Monday', '18:00', '19:30'), S('b', 'Wednesday', '18:00', '19:30')],
      [Q('sq', 11, 13, { targetSize: 16, targetSessionsPerWeek: 1, sessionsOfferedPerWeek: 2 })]
    ));
    const squad = r.metrics.bySquad[0];
    expect(squad.sparePlaces).toBe(80);
    expect(squad.roomForMore).toBe(80);
    expect(r.metrics.roomForMore).toBe(80);
  });

  test('a squad owing more sessions has proportionally less room', () => {
    // The same water, but each swimmer now needs four places a week rather than
    // one, so the identical spare lanes carry a quarter as many extra swimmers.
    const one = solveRestructure(inputs(
      [S('a', 'Monday', '18:00', '19:30'), S('b', 'Wednesday', '18:00', '19:30')],
      [Q('sq', 11, 13, { targetSize: 16, targetSessionsPerWeek: 1, sessionsOfferedPerWeek: 2 })]
    ));
    const four = solveRestructure(inputs(
      [S('a', 'Monday', '18:00', '19:30'), S('b', 'Wednesday', '18:00', '19:30')],
      [Q('sq', 11, 13, { targetSize: 16, targetSessionsPerWeek: 4, sessionsOfferedPerWeek: 2 })]
    ));
    expect(four.metrics.roomForMore).toBeLessThan(one.metrics.roomForMore);
  });

  test('a squad short of water has no room, never negative room', () => {
    // Headroom and shortfall are two sides of one figure. A squad that cannot
    // cover its own swimmers must read zero, not a negative number that would
    // then be summed into a club total.
    const r = solveRestructure(inputs(
      [S('a', 'Monday', '18:00', '19:30', { lanes: 1 })],
      [Q('sq', 11, 13, { targetSize: 40, targetSessionsPerWeek: 4, sessionsOfferedPerWeek: 1 })]
    ));
    const squad = r.metrics.bySquad[0];
    expect(squad.roomForMore).toBe(0);
    expect(squad.placesShortfall).toBeGreaterThan(0);
    expect(r.metrics.roomForMore).toBe(0);
  });

  test('a squad with no session target is left out of the club total', () => {
    // With no volume to divide its water by there is nothing to divide, so it
    // has no meaningful headroom to contribute.
    const r = solveRestructure(inputs(
      [S('a', 'Monday', '18:00', '19:30'), S('b', 'Wednesday', '18:00', '19:30')],
      [
        Q('open', 11, 13, { targetSize: 16, targetSessionsPerWeek: 1, sessionsOfferedPerWeek: 1 }),
        Q('none', 14, 16, { targetSize: 10, targetSessionsPerWeek: 0, sessionsOfferedPerWeek: 1 })
      ]
    ));
    const total = r.metrics.bySquad
      .filter(s => s.sessionsTarget > 0)
      .reduce((a, s) => a + s.roomForMore, 0);
    expect(r.metrics.roomForMore).toBe(total);
  });

  test('holding every squad keeps the structure and still reports the room', () => {
    // "Keep every squad as it is" locks them all. The bands must come through
    // untouched, and the headroom must still be measured against the water.
    const squads = [
      Q('a', 9, 11, { targetSize: 12, targetSessionsPerWeek: 1, sessionsOfferedPerWeek: 1, locked: true }),
      Q('b', 12, 14, { targetSize: 12, targetSessionsPerWeek: 1, sessionsOfferedPerWeek: 1, locked: true })
    ];
    const r = solveRestructure(inputs(
      [S('a', 'Monday', '18:00', '19:30'), S('b', 'Wednesday', '18:00', '19:30')], squads));

    expect(r.metrics.bySquad.map(s => s.name).sort()).toEqual(['a', 'b']);
    expect(r.metrics.bySquad.map(s => `${s.minAge}-${s.maxAge}`).sort())
      .toEqual(['12-14', '9-11']);
    expect(r.metrics.roomForMore).toBeGreaterThan(0);
  });

  test('room for more is a comparison row, so two plans can be read against each other', () => {
    const one = solveRestructure(inputs(
      [S('a', 'Monday', '18:00', '19:30')],
      [Q('sq', 11, 13, { targetSize: 16, targetSessionsPerWeek: 1, sessionsOfferedPerWeek: 1 })]
    ));
    const two = solveRestructure(inputs(
      [S('a', 'Monday', '18:00', '19:30'), S('b', 'Wednesday', '18:00', '19:30')],
      [Q('sq', 11, 13, { targetSize: 16, targetSessionsPerWeek: 1, sessionsOfferedPerWeek: 2 })]
    ));
    const diff = diffScenarios([
      { name: 'One night', metrics: one.metrics },
      { name: 'Two nights', metrics: two.metrics }
    ]);
    const row = diff.rows.find(r => r.key === 'roomForMore');
    expect(row).toBeTruthy();
    expect(row.values[1]).toBeGreaterThan(row.values[0]);
    expect(row.bestIndex).toBe(1);
  });
});
