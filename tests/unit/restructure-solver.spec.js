import { test, expect } from '@playwright/test';
import {
  timeToMinutes, minutesToTime, slotsOverlap, gapMinutes, slotDurationHours,
  ltadBandForAgeRange, ltadScore, isBandTooWide, resolveEffectiveTargetHours,
  timeWindowForSquad, curfewPenalty, validateInputs, solveRestructure,
  DEFAULT_POLICY
} from '../../lib/restructure-solver.js';

/** Slot factory. Times are HH:MM; lanes default to a full 6-lane pool. */
const S = (id, day, startTime, endTime, over = {}) => ({
  id, day, startTime, endTime, lanes: 6, venue: 'Main', enabled: true,
  label: `${day} ${startTime}-${endTime}`, source: 'candidate', ...over
});

/** Squad factory. */
const Q = (id, minAge, maxAge, over = {}) => ({
  id, name: id, minAge, maxAge, targetSize: 16, swimmersPerLane: 8,
  targetSessionsPerWeek: 1, targetHoursPerWeek: 4, competitive: true,
  priority: 1, ...over
});

const inputs = (poolSlots, squads, over = {}) => ({
  version: 1, poolSlots, squads, coaches: [], ...over
});

/** Normalised-slot factory for the pure geometry helpers. */
const N = (day, start, end, venue = 'Main') => ({
  day, venue, startMin: timeToMinutes(start), endMin: timeToMinutes(end),
  startTime: start, endTime: end, label: `${day} ${start}`
});

test.describe('time helpers', () => {
  test('parses HH:MM and rejects nonsense', () => {
    expect(timeToMinutes('18:30')).toBe(1110);
    expect(timeToMinutes('06:00')).toBe(360);
    expect(timeToMinutes('24:00')).toBeNull();
    expect(timeToMinutes('18:60')).toBeNull();
    expect(timeToMinutes('half six')).toBeNull();
    expect(timeToMinutes(null)).toBeNull();
  });

  test('round-trips through minutesToTime', () => {
    expect(minutesToTime(1110)).toBe('18:30');
    expect(minutesToTime(0)).toBe('00:00');
  });

  test('slot duration comes from start/end times', () => {
    expect(slotDurationHours({ startTime: '18:00', endTime: '19:30' })).toBeCloseTo(1.5, 5);
    expect(slotDurationHours({ startTime: '06:00', endTime: '08:00' })).toBeCloseTo(2, 5);
  });

  test('overlap needs the same day and intersecting ranges', () => {
    expect(slotsOverlap(N('Monday', '18:00', '19:30'), N('Monday', '19:00', '20:00'))).toBe(true);
    expect(slotsOverlap(N('Monday', '18:00', '19:00'), N('Monday', '19:00', '20:00'))).toBe(false);
    expect(slotsOverlap(N('Monday', '18:00', '19:30'), N('Tuesday', '18:00', '19:30'))).toBe(false);
  });

  test('gapMinutes is null across days and negative on overlap', () => {
    expect(gapMinutes(N('Monday', '18:00', '19:00'), N('Monday', '19:30', '20:30'))).toBe(30);
    expect(gapMinutes(N('Monday', '18:00', '19:00'), N('Tuesday', '19:30', '20:30'))).toBeNull();
    expect(gapMinutes(N('Monday', '18:00', '19:30'), N('Monday', '19:00', '20:00'))).toBe(-1);
  });
});

test.describe('LTAD banding', () => {
  test('unions every stage an age touches rather than taking the highest', () => {
    // The exact bug getUnifiedLTADStage would introduce: 14 sits in both
    // Train to Train (Late) 12-16h and Train to Compete 14-20h. Highest-wins
    // would report 14-20 and read a 14-year-old on 13h as underloaded.
    const band = ltadBandForAgeRange(14, 14);
    expect(band.min).toBe(12);
    expect(band.max).toBe(20);
    expect(band.stageCount).toBe(2);
  });

  test('a wide band unions wide', () => {
    const band = ltadBandForAgeRange(9, 15);
    expect(band.min).toBe(4);
    expect(band.max).toBe(20);
    expect(band.stageCount).toBeGreaterThanOrEqual(4);
  });

  test('an 11-13 band unions three stages, because it genuinely spans them', () => {
    // An 11-year-old is still in Learn to Train (4-6h) and a 13-year-old is
    // already in Train to Train (Late) (12-16h). The wide union is the honest
    // answer, and the reason a 11-13 squad is hard to set one volume for.
    const band = ltadBandForAgeRange(11, 13);
    expect(band.min).toBe(4);
    expect(band.max).toBe(16);
    expect(band.stageCount).toBe(3);
  });

  test('scores inside the band as optimal and outside by proportional gap', () => {
    // A synthetic band keeps this test about the scoring maths rather than
    // about where the LTAD table happens to draw its boundaries.
    const band = { min: 8, max: 12, stageCount: 1, stageNames: ['Test'] };
    expect(ltadScore(10, band)).toMatchObject({ verdict: 'OPTIMAL', score: 100, gapHours: 0 });

    const under = ltadScore(4, band);
    expect(under.verdict).toBe('UNDERLOAD');
    expect(under.gapHours).toBeCloseTo(-4, 5);
    expect(under.score).toBeCloseTo(50, 5); // 4h against a floor of 8h

    const over = ltadScore(18, band);
    expect(over.verdict).toBe('OVERLOAD');
    expect(over.gapHours).toBeCloseTo(6, 5);
    expect(over.score).toBeCloseTo(50, 5); // 6h over a ceiling of 12h
  });

  test('zero or unknown hours score UNKNOWN rather than crashing', () => {
    expect(ltadScore(0, ltadBandForAgeRange(11, 13)).verdict).toBe('UNKNOWN');
    expect(ltadScore(5, { stageCount: 0 }).verdict).toBe('UNKNOWN');
  });

  test('band-width warning needs a wide age span, not merely overlapping stages', () => {
    // 13-14 touches three stages purely because the LTAD bands overlap. If that
    // alone tripped the warning it would fire on almost every squad.
    expect(isBandTooWide(13, 14, ltadBandForAgeRange(13, 14))).toBe(false);
    expect(isBandTooWide(9, 15, ltadBandForAgeRange(9, 15))).toBe(true);
  });

  test('the benchmarks table can be selected instead of the unified one', () => {
    expect(ltadBandForAgeRange(13, 13, 'unified').max).toBe(16);
    expect(ltadBandForAgeRange(13, 13, 'benchmarks').max).toBe(14);
  });
});

test.describe('derived target hours (the Bronze/Silver zero-hour case)', () => {
  test('uses configured hours when they are set', () => {
    expect(resolveEffectiveTargetHours({ targetHoursPerWeek: 8 }))
      .toEqual({ hours: 8, derived: false });
  });

  test('derives from sessions x median session length when hours are zero', () => {
    expect(resolveEffectiveTargetHours({
      targetHoursPerWeek: 0, targetSessionsPerWeek: 3, medianSessionHours: 1.5
    })).toEqual({ hours: 4.5, derived: true });
  });

  test('falls back to one hour per session when no median is known', () => {
    expect(resolveEffectiveTargetHours({ targetHoursPerWeek: 0, targetSessionsPerWeek: 2 }))
      .toEqual({ hours: 2, derived: true });
  });

  test('a squad with neither hours nor sessions yields zero, not NaN', () => {
    const r = resolveEffectiveTargetHours({});
    expect(r.hours).toBe(0);
    expect(Number.isNaN(r.hours)).toBe(false);
  });
});

test.describe('youth time windows', () => {
  test('the YOUNGEST member selects the band', () => {
    // A 10-14 squad is judged by the 10-year-old, not the 14-year-old.
    expect(timeWindowForSquad({ minAge: 10, maxAge: 14 }, DEFAULT_POLICY).maxAge).toBe(10);
    expect(timeWindowForSquad({ minAge: 15, maxAge: 18 }, DEFAULT_POLICY).maxAge).toBe(99);
  });

  test('penalises a school-night overrun in proportion to the minutes', () => {
    const squad = { minAge: 9, maxAge: 11 };
    const late = curfewPenalty(squad, N('Tuesday', '19:30', '21:00'), DEFAULT_POLICY);
    expect(late.overrunMins).toBe(120);            // 21:00 against a 19:00 cap
    expect(late.penalty).toBeCloseTo(60, 5);       // 120 min x 0.5
    expect(late.reason).toContain('past the 19:00 school-night guide');
  });

  test('the same slot on a Saturday is judged against the looser cap', () => {
    const squad = { minAge: 9, maxAge: 11 };
    const weekend = curfewPenalty(squad, N('Saturday', '19:30', '21:00'), DEFAULT_POLICY);
    expect(weekend.overrunMins).toBe(60);          // 21:00 against a 20:00 cap
    expect(weekend.penalty).toBeLessThan(
      curfewPenalty(squad, N('Tuesday', '19:30', '21:00'), DEFAULT_POLICY).penalty
    );
  });

  test('an in-window slot carries no penalty and no reason', () => {
    const clean = curfewPenalty({ minAge: 9, maxAge: 11 }, N('Tuesday', '17:30', '19:00'), DEFAULT_POLICY);
    expect(clean.penalty).toBe(0);
    expect(clean.reason).toBeNull();
  });

  test('an early start for a mornings-discouraged band is penalised double', () => {
    const early = curfewPenalty({ minAge: 9, maxAge: 11 }, N('Tuesday', '06:30', '07:30'), DEFAULT_POLICY);
    expect(early.earlyMins).toBe(60);              // 06:30 against an 07:30 floor
    expect(early.penalty).toBeCloseTo(60, 5);      // 60 min x 0.5 x 2 for a discouraged morning
  });
});

test.describe('validateInputs', () => {
  test('accepts a well-formed scenario', () => {
    const v = validateInputs(inputs([S('a', 'Monday', '18:00', '19:30')], [Q('Gold', 11, 13)]));
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('rejects a slot that ends at or before it starts', () => {
    const v = validateInputs(inputs([S('a', 'Monday', '19:30', '18:00')], [Q('Gold', 11, 13)]));
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toContain('ends at or before it starts');
  });

  test('rejects zero lanes, a bad day, an inverted age band and duplicate ids', () => {
    expect(validateInputs(inputs([S('a', 'Monday', '18:00', '19:30', { lanes: 0 })], [Q('G', 11, 13)]))
      .errors.join(' ')).toContain('lanes must be at least 1');
    expect(validateInputs(inputs([S('a', 'Someday', '18:00', '19:30')], [Q('G', 11, 13)]))
      .errors.join(' ')).toContain('is not a weekday name');
    expect(validateInputs(inputs([S('a', 'Monday', '18:00', '19:30')], [Q('G', 15, 11)]))
      .errors.join(' ')).toContain('is above maxAge');
    expect(validateInputs(inputs(
      [S('a', 'Monday', '18:00', '19:30'), S('a', 'Tuesday', '18:00', '19:30')], [Q('G', 11, 13)]
    )).errors.join(' ')).toContain('duplicate slot id');
  });

  test('an empty scenario is an error, not a crash', () => {
    const v = validateInputs({});
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('No pool slots defined.');
    expect(v.errors).toContain('No squads defined.');
  });

  test('zero target hours is a warning, not an error', () => {
    const v = validateInputs(inputs([S('a', 'Monday', '18:00', '19:30')],
      [Q('Bronze', 9, 10, { targetHoursPerWeek: 0 })]));
    expect(v.ok).toBe(true);
    expect(v.warnings.join(' ')).toContain('target hours are zero');
  });
});

test.describe('solveRestructure — hard constraints', () => {
  test('never allocates more lanes than a slot has', () => {
    // Three squads of 24 each want 3 lanes; the slot only has 6.
    const slots = [S('mon', 'Monday', '18:00', '19:30', { lanes: 6 })];
    const squads = ['A', 'B', 'C'].map(n => Q(n, 12, 14, { targetSize: 24, swimmersPerLane: 8 }));
    const r = solveRestructure(inputs(slots, squads));

    expect(r.ok).toBe(true);
    const used = r.plan.assignments
      .filter(a => a.slotId === 'mon')
      .reduce((s, a) => s + a.lanes, 0);
    expect(used).toBeLessThanOrEqual(6);
  });

  test('a squad is never in two pools at once', () => {
    const slots = [
      S('here', 'Monday', '18:00', '19:30', { venue: 'Main' }),
      S('there', 'Monday', '19:00', '20:30', { venue: 'Annex' })
    ];
    const r = solveRestructure(inputs(slots, [Q('Solo', 12, 14, { targetSessionsPerWeek: 2 })]));
    expect(r.plan.assignments).toHaveLength(1);
    expect(r.diagnostics.rejections.map(x => x.reason).join(' ')).toContain('at the same time');
  });

  test('overlapping slots at the same venue are more lanes, not a clash', () => {
    // How this club records a lane count that changes through an evening: Age
    // Development holds three lanes 20:00-22:00 and six more 20:00-21:00 in the
    // same pool. Reading that as a double-booking threw away nine of its lanes
    // and produced a plan short of the week the club already runs.
    const slots = [
      S('long', 'Monday', '20:00', '22:00', { venue: 'Main' }),
      S('boost', 'Monday', '20:00', '21:00', { venue: 'Main' })
    ];
    const r = solveRestructure(inputs(slots, [
      Q('Solo', 12, 14, { targetSize: 40, targetSessionsPerWeek: 2, sessionsOfferedPerWeek: 2 })
    ]));
    expect(r.plan.assignments).toHaveLength(2);
    expect(new Set(r.plan.assignments.map(a => a.slotId))).toEqual(new Set(['long', 'boost']));
  });

  test('travel guard blocks two venues inside the transit window', () => {
    const slots = [
      S('main', 'Monday', '17:00', '18:00', { venue: 'Main' }),
      S('annex', 'Monday', '18:20', '19:20', { venue: 'Annex' }) // 20 min later
    ];
    const r = solveRestructure(inputs(slots, [Q('Roam', 12, 14, { targetSessionsPerWeek: 2 })], {
      policy: { venueTransitMinutes: 30 }
    }));
    expect(r.plan.assignments).toHaveLength(1);
    expect(r.diagnostics.rejections.map(x => x.reason).join(' ')).toContain('travel guard');
  });

  test('the same pair 40 minutes apart is allowed', () => {
    const slots = [
      S('main', 'Monday', '17:00', '18:00', { venue: 'Main' }),
      S('annex', 'Monday', '18:40', '19:40', { venue: 'Annex' }) // 40 min later
    ];
    const r = solveRestructure(inputs(slots, [Q('Roam', 12, 14, { targetSessionsPerWeek: 2 })], {
      policy: { venueTransitMinutes: 30 }
    }));
    expect(r.plan.assignments).toHaveLength(2);
  });

  test('two venues on different days are never a travel clash', () => {
    const slots = [
      S('mon', 'Monday', '18:00', '19:30', { venue: 'Main' }),
      S('tue', 'Tuesday', '18:00', '19:30', { venue: 'Annex' })
    ];
    const r = solveRestructure(inputs(slots, [Q('Roam', 12, 14, { targetSessionsPerWeek: 2 })]));
    expect(r.plan.assignments).toHaveLength(2);
  });
});

test.describe('solveRestructure — the curfew is soft', () => {
  test('a young squad IS placed in a late slot, but flagged', () => {
    // The whole point of the soft rule: show the cost of the compromise rather
    // than hiding the option.
    const slots = [S('late', 'Tuesday', '19:30', '21:00')];
    const r = solveRestructure(inputs(slots, [Q('Minnows', 9, 10)]));

    expect(r.plan.assignments).toHaveLength(1);
    const flags = r.plan.assignments[0].flags.map(f => f.type);
    expect(flags).toContain('CURFEW');
    expect(r.plan.assignments[0].curfewPenalty).toBeGreaterThan(0);
    expect(r.metrics.totalCurfewPenalty).toBeGreaterThan(0);
  });

  test('given a choice, the earlier slot wins for the younger squad', () => {
    const slots = [
      S('late', 'Tuesday', '19:30', '21:00'),
      S('early', 'Tuesday', '17:30', '19:00')
    ];
    const r = solveRestructure(inputs(slots, [Q('Minnows', 9, 10)]));
    expect(r.plan.assignments[0].slotId).toBe('early');
    expect(r.plan.assignments[0].flags).toEqual([]);
  });

  test('an older squad takes the late slot without penalty', () => {
    const slots = [S('late', 'Tuesday', '19:30', '21:00')];
    const r = solveRestructure(inputs(slots, [Q('Seniors', 15, 18)]));
    expect(r.plan.assignments[0].curfewPenalty).toBe(0);
    expect(r.metrics.totalCurfewPenalty).toBe(0);
  });
});

test.describe('solveRestructure — metrics', () => {
  // Two 6-lane slots of 1.5h = 18 lane-hours available.
  // One squad of 16 at 8/lane needs 2 lanes, twice a week.
  const slots = [
    S('mon', 'Monday', '18:00', '19:30'),
    S('wed', 'Wednesday', '18:00', '19:30')
  ];
  const squads = [Q('Gold', 11, 13, {
    targetSize: 16, swimmersPerLane: 8, targetSessionsPerWeek: 2, targetHoursPerWeek: 3
  })];

  test('utilisation is assigned over available lane-hours', () => {
    const r = solveRestructure(inputs(slots, squads));
    expect(r.metrics.availableLaneHours).toBeCloseTo(18, 2);   // 2 x 6 x 1.5
    expect(r.metrics.assignedLaneHours).toBeCloseTo(6, 2);     // 2 x 2 x 1.5
    expect(r.metrics.utilisationPct).toBeCloseTo(33.3, 1);
  });

  test('occupancy is expected bodies over allocated places', () => {
    const r = solveRestructure(inputs(slots, squads));
    // 16 swimmers into 2 lanes x 8 = 16 places, at both sessions.
    expect(r.metrics.occupancyPct).toBeCloseTo(100, 1);
  });

  test('swimmers served is capped by the narrowest session', () => {
    const r = solveRestructure(inputs(slots, squads));
    expect(r.metrics.swimmersServed).toBe(16);
    expect(r.metrics.unservedDemand).toBe(0);
  });

  test('growth assumptions raise total demand and surface a shortfall', () => {
    const r = solveRestructure(inputs(slots, squads, {
      growth: { expectedNewSwimmers: 10, attritionPct: 0 }
    }));
    expect(r.metrics.totalDemand).toBe(26);
    expect(r.metrics.unservedDemand).toBe(10);
    expect(r.metrics.subScores.served).toBeLessThan(100);
  });

  test('attrition reduces demand', () => {
    const r = solveRestructure(inputs(slots, squads, {
      growth: { expectedNewSwimmers: 0, attritionPct: 25 }
    }));
    expect(r.metrics.totalDemand).toBe(12); // 16 less 25%
  });

  test('lane-hours gained is measured against the supplied baseline', () => {
    const r = solveRestructure(inputs(slots, squads), { baselineLaneHours: 9 });
    expect(r.metrics.newLaneHoursGained).toBeCloseTo(9, 2);
  });

  test('continuity counts assignments landing on existing slots', () => {
    const mixed = [
      S('mon', 'Monday', '18:00', '19:30', { source: 'existing' }),
      S('wed', 'Wednesday', '18:00', '19:30', { source: 'candidate' })
    ];
    const r = solveRestructure(inputs(mixed, squads));
    expect(r.metrics.subScores.continuity).toBeCloseTo(50, 1);
  });

  test('non-competitive squads are excluded from the LTAD average', () => {
    const r = solveRestructure(inputs(slots, [
      Q('Gold', 11, 13, { targetHoursPerWeek: 10 }),                        // in band 8-12
      Q('Club2', 15, 18, { competitive: false, targetHoursPerWeek: 0.5 })   // way under
    ]));
    expect(r.metrics.ltadCompliancePct).toBe(100);
  });

  test('every reported number is finite even for a zero-hour squad', () => {
    const r = solveRestructure(inputs(slots, [
      Q('Bronze', 9, 10, { targetHoursPerWeek: 0, targetSessionsPerWeek: 2 })
    ]));
    // Every number must be real. `null` is allowed and meaningful — coach
    // coverage is null when nobody is rostered, which reads as "not answered
    // yet" rather than as total failure.
    const walk = value => {
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(r.metrics);
    expect(JSON.stringify(r.metrics)).not.toContain('NaN');
    expect(r.warnings.join(' ')).toContain('derived');
  });
});

test.describe('solveRestructure — reporting rather than failing', () => {
  test('reports a demand shortfall before drawing a timetable', () => {
    // One 6-lane 1.5h slot = 9 lane-hours. Demand is far beyond it.
    const r = solveRestructure(inputs(
      [S('mon', 'Monday', '18:00', '19:30')],
      [Q('Big', 12, 14, { targetSize: 80, targetHoursPerWeek: 10, targetSessionsPerWeek: 4 })]
    ));
    expect(r.diagnostics.demandVsSupply.feasible).toBe(false);
    expect(r.diagnostics.demandVsSupply.shortfallLaneHours).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain('Demand exceeds supply');
  });

  test('an unplaceable squad becomes a capacity gap, not a thrown error', () => {
    const r = solveRestructure(inputs(
      [S('mon', 'Monday', '18:00', '19:30', { lanes: 1 })],
      [Q('A', 12, 14, { targetSize: 40 }), Q('B', 12, 14, { targetSize: 40 })]
    ));
    expect(r.ok).toBe(true);
    expect(r.gaps.capacity.length).toBeGreaterThan(0);
    expect(r.gaps.capacity[0].message).toMatch(/sessions could be placed|places across the week/);
    expect(r.gaps.capacity[0].placesShortfall).toBeGreaterThan(0);
  });

  test('a squad squeezed into fewer lanes than it needs is flagged UNDER_CAPACITY', () => {
    const r = solveRestructure(inputs(
      [S('mon', 'Monday', '18:00', '19:30', { lanes: 1 })],
      [Q('Big', 12, 14, { targetSize: 32, swimmersPerLane: 8 })]
    ));
    const flags = r.plan.assignments.flatMap(a => a.flags.map(f => f.type));
    expect(flags).toContain('UNDER_CAPACITY');
  });

  test('unused slots are listed with the reason they went unused', () => {
    const r = solveRestructure(inputs(
      [S('mon', 'Monday', '18:00', '19:30'), S('sun', 'Sunday', '08:00', '09:00')],
      [Q('One', 12, 14, { targetSessionsPerWeek: 1 })]
    ));
    expect(r.diagnostics.unusableSlots.length).toBe(1);
    expect(r.diagnostics.unusableSlots[0]).toHaveProperty('label');
  });

  test('an invalid scenario returns errors instead of throwing', () => {
    const r = solveRestructure({ poolSlots: [], squads: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.plan.assignments).toEqual([]);
    expect(r.metrics).toBeNull();
  });

  test('disabled slots are ignored entirely', () => {
    const r = solveRestructure(inputs([
      S('on', 'Monday', '18:00', '19:30'),
      S('off', 'Tuesday', '18:00', '19:30', { enabled: false })
    ], [Q('One', 12, 14, { targetSessionsPerWeek: 2 })]));
    expect(r.metrics.availableLaneHours).toBeCloseTo(9, 2);
    expect(r.plan.assignments).toHaveLength(1);
  });
});

test.describe('solveRestructure — determinism and quality', () => {
  const slots = [
    S('mon', 'Monday', '18:00', '19:30', { source: 'existing' }),
    S('tue', 'Tuesday', '19:00', '21:00'),
    S('wed', 'Wednesday', '18:00', '19:30'),
    S('sat', 'Saturday', '08:00', '10:00'),
    S('thu', 'Thursday', '17:00', '18:30', { venue: 'Annex' })
  ];
  const squads = [
    Q('NAR', 14, 18, { targetSize: 24, targetSessionsPerWeek: 3, targetHoursPerWeek: 8, requireWeekend: true }),
    Q('AgeDev', 11, 14, { targetSize: 30, targetSessionsPerWeek: 3, targetHoursPerWeek: 8 }),
    Q('GoldDev', 9, 11, { targetSize: 20, targetSessionsPerWeek: 2, targetHoursPerWeek: 4 })
  ];

  test('identical inputs give an identical result', () => {
    const a = solveRestructure(inputs(slots, squads));
    const b = solveRestructure(inputs(slots, squads));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('input ordering does not change the outcome', () => {
    const a = solveRestructure(inputs(slots, squads));
    const b = solveRestructure(inputs(slots.slice().reverse(), squads.slice().reverse()));
    expect(b.metrics.total).toBeCloseTo(a.metrics.total, 5);
    expect(b.metrics.assignedLaneHours).toBeCloseTo(a.metrics.assignedLaneHours, 5);
  });

  test('honours a weekend requirement when a weekend slot exists', () => {
    const r = solveRestructure(inputs(slots, squads));
    const nar = r.plan.assignments.filter(a => a.squadId === 'NAR');
    expect(nar.some(a => a.day === 'Saturday')).toBe(true);
    expect(r.metrics.weekendRequirementMet).toBe(true);
  });

  test('spreads a squad across days rather than stacking one', () => {
    const r = solveRestructure(inputs(slots, squads));
    const days = r.plan.assignments.filter(a => a.squadId === 'AgeDev').map(a => a.day);
    expect(new Set(days).size).toBe(days.length);
  });

  test('assignments come back sorted by day then start time', () => {
    const r = solveRestructure(inputs(slots, squads));
    const order = r.plan.assignments.map(a => a.day);
    const rank = d => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(d);
    expect(order.map(rank)).toEqual(order.map(rank).slice().sort((x, y) => x - y));
  });

  test('every assignment carries the fields the timetable and export need', () => {
    const r = solveRestructure(inputs(slots, squads));
    r.plan.assignments.forEach(a => {
      expect(a).toMatchObject({
        slotId: expect.any(String), squadId: expect.any(String), squadName: expect.any(String),
        day: expect.any(String), startTime: expect.any(String), endTime: expect.any(String),
        venue: expect.any(String), lanes: expect.any(Number),
        durationHours: expect.any(Number), capacity: expect.any(Number)
      });
      expect(Array.isArray(a.flags)).toBe(true);
    });
  });

  test('more pool time never serves fewer swimmers', () => {
    const lean = solveRestructure(inputs(slots.slice(0, 3), squads));
    const rich = solveRestructure(inputs(slots, squads));
    expect(rich.metrics.swimmersServed).toBeGreaterThanOrEqual(lean.metrics.swimmersServed);
  });
});
