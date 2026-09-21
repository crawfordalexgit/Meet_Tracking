import { test, expect } from '@playwright/test';
import { GOALS, weightsForGoals, scoreGoals } from '../../lib/restructure-goals.js';

const metrics = (over = {}) => ({
  swimmersServed: 150, assignedLaneHours: 130, availableLaneHours: 160,
  utilisationPct: 81, ltadCompliancePct: 75,
  subScores: { continuity: 90 }, coach: { coveragePct: 100, gapHours: 0 },
  bySquad: [
    { name: 'A', sessionsTarget: 4, requirementMet: true },
    { name: 'B', sessionsTarget: 2, requirementMet: true }
  ], ...over
});
const baseline = (over = {}) => ({
  squads: [{ activeNonExemptCount: 100 }, { activeNonExemptCount: 45 }],
  utilisation: { totalLaneHours: 145 }, ...over
});

test.describe('goals', () => {
  test('every goal has a purpose, weights and a test', () => {
    GOALS.forEach(g => {
      expect(g.label.length).toBeGreaterThan(5);
      expect(g.blurb.length).toBeGreaterThan(10);
      expect(Object.values(g.weights).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      expect(typeof g.test).toBe('function');
    });
  });

  test('choosing a goal changes what the search optimises', () => {
    const cover = weightsForGoals(['cover']);
    const efficient = weightsForGoals(['efficient']);
    expect(cover.served).toBeGreaterThan(efficient.served);
    expect(efficient.utilisation).toBeGreaterThan(cover.utilisation);
  });

  test('several goals combine rather than one winning', () => {
    const both = weightsForGoals(['efficient', 'settled']);
    const efficient = weightsForGoals(['efficient']);
    const settled = weightsForGoals(['settled']);
    expect(both.utilisation).toBeLessThan(efficient.utilisation);
    expect(both.continuity).toBeLessThan(settled.continuity);
    expect(both.utilisation).toBeGreaterThan(settled.utilisation);
  });

  test('no goal chosen leaves the weights alone', () => {
    expect(weightsForGoals([])).toBeNull();
    expect(weightsForGoals(null)).toBeNull();
  });

  test('a model is judged on whether it delivered the goal', () => {
    const met = scoreGoals(['cover'], metrics(), baseline());
    expect(met[0].met).toBe(true);
    expect(met[0].detail).toContain('2 of 2 squads');

    const missed = scoreGoals(['cover'], metrics({
      bySquad: [
        { name: 'A', sessionsTarget: 4, requirementMet: false },
        { name: 'B', sessionsTarget: 2, requirementMet: true }
      ]
    }), baseline());
    expect(missed[0].met).toBe(false);
    expect(missed[0].detail).toContain('1 of 2');
  });

  test('serving more swimmers is measured against the club today', () => {
    expect(scoreGoals(['grow'], metrics({ swimmersServed: 150 }), baseline())[0].met).toBe(true);
    expect(scoreGoals(['grow'], metrics({ swimmersServed: 120 }), baseline())[0].met).toBe(false);
  });

  test('using existing water is measured against what the club books', () => {
    expect(scoreGoals(['efficient'], metrics({ assignedLaneHours: 130 }), baseline())[0].met).toBe(true);
    expect(scoreGoals(['efficient'], metrics({ assignedLaneHours: 200 }), baseline())[0].met).toBe(false);
  });

  test('the new-water goal says plainly when no new water has been added', () => {
    const none = scoreGoals(['newwater'], metrics({ availableLaneHours: 140 }), baseline());
    expect(none[0].met).toBe(false);
    expect(none[0].detail).toContain('add candidate slots');
  });

  test('the coaching goal says plainly when no roster exists', () => {
    const none = scoreGoals(['coaching'], metrics({ coach: { coveragePct: null } }), baseline());
    expect(none[0].met).toBe(false);
    expect(none[0].detail).toContain('no coach roster');
  });

  test('unknown goals are ignored rather than throwing', () => {
    expect(scoreGoals(['nonsense'], metrics(), baseline())).toEqual([]);
    expect(scoreGoals(['cover'], null, baseline())).toEqual([]);
  });
});
