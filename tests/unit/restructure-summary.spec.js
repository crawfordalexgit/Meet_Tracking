import { test, expect } from '@playwright/test';
import { summariseModel } from '../../lib/restructure-summary.js';

const todaySquad = (over = {}) => ({
  id: 'sq1', name: 'GOLD DEVELOPMENT', targetSessionsPerWeek: 4, targetHoursPerWeek: 4,
  activeNonExemptCount: 36, minAge: 10, maxAge: 14, p10Age: 10, p90Age: 13,
  currentLaneHours: 27, requirementMet: true, ...over
});

const modelSquad = (over = {}) => ({
  squadId: 'm1', name: 'GOLD DEVELOPMENT', sourceSquadId: 'sq1',
  minAge: 10, maxAge: 13, targetSize: 36,
  sessionsTarget: 4, sessionsAssigned: 4, effectiveTargetHours: 4,
  weeklyPlaces: 160, swimmerSessionsRequired: 144, placesShortfall: 0,
  requirementMet: true, curfewPenalty: 0, competitive: true, ...over
});

const metrics = (over = {}) => ({
  assignedLaneHours: 27, swimmersServed: 36, unservedDemand: 0,
  totalCurfewPenalty: 0, coach: null, bySquad: [modelSquad()], ...over
});

const baseline = (over = {}) => ({
  squads: [todaySquad()],
  utilisation: { totalLaneHours: 40 },
  ...over
});

test.describe('summariseModel', () => {
  test('says plainly when nothing changes', () => {
    const s = summariseModel(metrics(), baseline());
    expect(s.headline).toContain('the same 1 squad gets');
    expect(s.changes[0].text).toContain('Nothing changes');
    expect(s.costs[0]).toContain('Nothing gives');
  });

  test('leads with squads gaining or losing their training week', () => {
    const worse = summariseModel(
      metrics({ bySquad: [modelSquad({ requirementMet: false, weeklyPlaces: 100, placesShortfall: 44 })] }),
      baseline());
    expect(worse.headline).toContain('1 squad would stop getting the training');
    expect(worse.verdict[0].now).toBe('0 of 1');
    expect(worse.verdict[0].today).toBe('1 of 1');
    expect(worse.verdict[0].good).toBe(false);

    const better = summariseModel(
      metrics(),
      baseline({ squads: [todaySquad({ requirementMet: false })] }));
    expect(better.headline).toContain('1 more squad gets the training');
  });

  test('compares pool time like for like, against water squads occupy today', () => {
    // Not against every lane-hour the club books: Learn to Swim and unallocated
    // sessions are in that total, and counting them would make any plan look
    // like a saving it is not.
    const s = summariseModel(metrics({ assignedLaneHours: 30 }), baseline());
    const row = s.verdict.find(v => v.label === 'Pool time squads occupy');
    expect(row.today).toBe('27 lane-hours');      // the squad's own lane-hours
    expect(row.note).toContain('40');             // the club's total, as context
    expect(s.headline).toContain('3 more lane-hours');
  });

  test('names what changes for a squad in words', () => {
    const s = summariseModel(
      metrics({ bySquad: [modelSquad({ sessionsTarget: 5, effectiveTargetHours: 8, targetSize: 42 })] }),
      baseline());
    const change = s.changes.find(c => c.kind === 'changed');
    expect(change.text).toContain('4 to 5 sessions a week');
    expect(change.text).toContain('4 to 8 hours');
    expect(change.text).toContain('36 to 42 swimmers');
  });

  test('flags a squad that disappears and how many swimmers it holds', () => {
    const s = summariseModel(
      metrics({ bySquad: [] }),
      baseline({ squads: [todaySquad({ activeNonExemptCount: 28 })] }));
    const gone = s.changes.find(c => c.kind === 'gone');
    expect(gone.squad).toBe('GOLD DEVELOPMENT');
    expect(gone.text).toContain('28 swimmers would need a home');
  });

  test('recognises a squad invented by the search as replacing an existing one', () => {
    const s = summariseModel(
      metrics({ bySquad: [modelSquad({ sourceSquadId: null, name: '11-13 squad', minAge: 11, maxAge: 13 })] }),
      baseline());
    const change = s.changes.find(c => c.kind === 'changed');
    expect(change.squad).toBe('11-13 squad (was GOLD DEVELOPMENT)');
  });

  test('a genuinely new age range is called new, not a change', () => {
    const s = summariseModel(
      metrics({ bySquad: [modelSquad({ sourceSquadId: null, name: '17-18 squad', minAge: 17, maxAge: 18 })] }),
      baseline());
    expect(s.changes.some(c => c.kind === 'new')).toBe(true);
  });

  test('states the cost of a shortfall in swimmers, not percentages', () => {
    const s = summariseModel(
      metrics({ bySquad: [modelSquad({ requirementMet: false, weeklyPlaces: 100, placesShortfall: 44 })] }),
      baseline());
    expect(s.costs[0]).toContain('short 44 places a week');
    expect(s.costs[0]).toContain('100 against the 144');
  });

  test('warns when a plan needs more water than the club books', () => {
    const s = summariseModel(metrics({ assignedLaneHours: 60 }), baseline());
    expect(s.costs.join(' ')).toContain('depends on new pool time');
  });

  test('reports coach cover only once a roster exists', () => {
    const without = summariseModel(metrics(), baseline());
    expect(without.verdict.some(v => v.label === 'Coaching covered')).toBe(false);

    const withRoster = summariseModel(
      metrics({ coach: { coveragePct: 80, gapHours: 6 } }), baseline());
    const row = withRoster.verdict.find(v => v.label === 'Coaching covered');
    expect(row.now).toBe('80%');
    expect(row.good).toBe(false);
    expect(withRoster.costs.join(' ')).toContain('6 coach-hours');
  });

  test('names the squads training outside their age guide', () => {
    const s = summariseModel(
      metrics({ totalCurfewPenalty: 30, bySquad: [modelSquad({ curfewPenalty: 30 })] }),
      baseline());
    expect(s.costs.join(' ')).toContain('outside the time guide');
    expect(s.costs.join(' ')).toContain('GOLD DEVELOPMENT');
  });

  test('carries a glossary for the invented vocabulary', () => {
    const s = summariseModel(metrics(), baseline());
    const terms = s.glossary.map(g => g[0]);
    expect(terms).toContain('Lane-hour');
    expect(terms).toContain('Place');
    expect(terms).toContain('Swimmer-session');
  });

  test('returns nothing rather than throwing on missing input', () => {
    expect(summariseModel(null, baseline())).toBeNull();
    expect(summariseModel(metrics(), null)).toBeNull();
  });
});
