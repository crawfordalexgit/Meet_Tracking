import { test, expect } from '@playwright/test';
import {
  buildSwimmerPool, eligiblePool, bestTeam, optimiseMeet,
} from '../../lib/relays/relay-optimizer.js';
import { MEET, relayEvents, PROGRAMME_NO } from '../../lib/relays/kent-relays-config.js';

const ev = (band, cat, relay) => relayEvents().find((e) => e.key === `${band}-${cat}-${relay}`);
// pool swimmer with explicit per-stroke 50m times
const P = (id, age, sex, t) => ({
  id, name: id, fullName: id, age, yob: MEET.ageYear - age, sex,
  times: { Free: t.fr ?? null, Back: t.bk ?? null, Breast: t.br ?? null, Fly: t.fl ?? null },
});

test.describe('kent-relays-config', () => {
  test('event grid has all 24 relay events', () => {
    expect(relayEvents()).toHaveLength(24);
    expect(PROGRAMME_NO['13U-F-MEDLEY']).toBe(105);
    expect(PROGRAMME_NO['OPEN-X-FREE']).toBe(212);
  });
});

test.describe('buildSwimmerPool', () => {
  test('derives age from meet year, best short-course 50 per stroke, sex from gender', () => {
    const swimmers = [{ id: 's', full_name: 'Test Swimmer', known_as: 'Tess', year_of_birth: 2014, gender: 'F' }];
    const pbs = {
      s: [
        { event: '50 Free', course: 'S', time_seconds: 31.5 },
        { event: '50 Freestyle', course: 'S', time_seconds: 30.9 }, // faster dupe, different label
        { event: '50 Back', course: 'S', time_seconds: 35.2 },
      ],
    };
    const [p] = buildSwimmerPool(swimmers, pbs, MEET.ageYear);
    expect(p.age).toBe(MEET.ageYear - 2014);
    expect(p.sex).toBe('F');
    expect(p.times.Free).toBeCloseTo(30.9, 2); // takes the faster of the two labels
    expect(p.times.Back).toBeCloseTo(35.2, 2);
    expect(p.times.Breast).toBeNull();
  });
});

test.describe('medley assignment', () => {
  test('finds the optimal (non-greedy) split of four distinct strokes and swimmers', () => {
    // s5 is fastest at Back AND fast at Free — the optimum must use it on Back.
    const pool = [
      P('s1', 13, 'M', { bk: 30 }),
      P('s2', 13, 'M', { br: 32 }),
      P('s3', 13, 'M', { fl: 34 }),
      P('s4', 13, 'M', { fr: 24 }),
      P('s5', 13, 'M', { bk: 29, fr: 25 }),
    ];
    const team = bestTeam(pool, ev('13U', 'M', 'MEDLEY'));
    expect(team.legs.map((l) => l.stroke).sort()).toEqual(['Back', 'Breast', 'Fly', 'Free']);
    expect(new Set(team.legs.map((l) => l.swimmer.id)).size).toBe(4);
    expect(team.total).toBeCloseTo(119, 6);
    expect(team.legs.find((l) => l.stroke === 'Back').swimmer.id).toBe('s5');
  });

  test('returns null when a stroke has no swimmer', () => {
    const pool = [P('a', 13, 'M', { bk: 30, br: 30, fr: 30 })]; // no fly
    expect(bestTeam(pool, ev('13U', 'M', 'MEDLEY'))).toBeNull();
  });
});

test.describe('free relay', () => {
  test('is the four fastest 50 frees', () => {
    const pool = [28, 24, 26, 25, 27].map((fr, i) => P('x' + i, 13, 'F', { fr }));
    const team = bestTeam(pool, ev('13U', 'F', 'FREE'));
    expect(team.total).toBeCloseTo(24 + 25 + 26 + 27, 6);
  });
});

test.describe('mixed composition', () => {
  test('mixed medley is exactly two male and two female', () => {
    const pool = [
      P('m1', 13, 'M', { bk: 29 }), P('m2', 13, 'M', { fr: 25 }), P('m3', 13, 'M', { br: 31 }),
      P('f1', 13, 'F', { br: 33 }), P('f2', 13, 'F', { fl: 34 }), P('f3', 13, 'F', { bk: 30 }),
    ];
    const team = bestTeam(pool, ev('13U', 'X', 'MEDLEY'));
    const f = team.legs.filter((l) => l.swimmer.sex === 'F').length;
    expect(f).toBe(2);
  });
});

test.describe('age eligibility (own band and every older band)', () => {
  const pool = [
    P('young', 12, 'F', { bk: 30, br: 30, fl: 30, fr: 30 }),
    P('old', 15, 'F', { bk: 30, br: 30, fl: 30, fr: 30 }),
  ];
  test('a 12yo is barred from 11/under', () => {
    expect(eligiblePool(pool, ev('11U', 'F', 'MEDLEY')).pool).toHaveLength(0);
  });
  test('a 12yo swims up into 13/under, 15/under and Open', () => {
    expect(eligiblePool(pool, ev('13U', 'F', 'MEDLEY')).pool.some((p) => p.id === 'young')).toBe(true);
    expect(eligiblePool(pool, ev('OPEN', 'F', 'MEDLEY')).pool).toHaveLength(2);
  });
  test('missing a required 50 time benches an otherwise-eligible swimmer', () => {
    const p2 = [P('nofly', 13, 'F', { bk: 30, br: 30, fr: 30 })];
    const { pool: elig, benched } = eligiblePool(p2, ev('13U', 'F', 'MEDLEY'));
    expect(elig).toHaveLength(1); // medley only needs one of the four strokes to be considered
    const freeOnly = eligiblePool([P('back', 13, 'F', { bk: 30 })], ev('13U', 'F', 'FREE'));
    expect(freeOnly.pool).toHaveLength(0);
    expect(freeOnly.benched).toHaveLength(1);
    expect(benched).toBeDefined();
  });
});

test.describe('per-swimmer cap', () => {
  test('no swimmer is assigned to more relays than the cap allows', () => {
    const pool = [];
    for (let i = 0; i < 8; i++) pool.push(P('c' + i, 13, 'M', { bk: 30 + i, br: 30 + i, fl: 30 + i, fr: 30 + i }));
    const res = optimiseMeet(pool, { depth: 2, capPerSwimmer: 1 });
    const usage = {};
    for (const slot of Object.values(res)) for (const t of slot.teams) for (const l of t.legs) usage[l.swimmer.id] = (usage[l.swimmer.id] || 0) + 1;
    expect(Math.max(0, ...Object.values(usage))).toBeLessThanOrEqual(1);
  });
});
