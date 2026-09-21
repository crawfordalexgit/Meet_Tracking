import { test, expect } from '@playwright/test';
import { applyPatch, PATCH_OPS } from '../../lib/restructure-patch.js';

const inputs = () => ({
  goals: ['cover'],
  weights: { served: 40 },
  growth: { expectedNewSwimmers: 0, attritionPct: 0 },
  squads: [
    {
      id: 'sq1', name: 'GOLD DEVELOPMENT', minAge: 10, maxAge: 13,
      targetSize: 36, swimmersPerLane: 8,
      targetSessionsPerWeek: 4, targetHoursPerWeek: 4, locked: false
    },
    {
      id: 'sq2', name: 'SILVER', minAge: 9, maxAge: 12,
      targetSize: 28, swimmersPerLane: 8,
      targetSessionsPerWeek: 2, targetHoursPerWeek: 0, locked: false
    }
  ],
  poolSlots: [
    {
      id: 'slot1', label: 'Mon 18:00-19:30 Radnor House', venue: 'Radnor House',
      day: 'Monday', startTime: '18:00', endTime: '19:30', lanes: 6,
      source: 'existing', enabled: true
    },
    {
      id: 'slot2', label: 'Tue 19:00-20:30 Tonbridge Town Pool', venue: 'Tonbridge Town Pool',
      day: 'Tuesday', startTime: '19:00', endTime: '20:30', lanes: 4,
      source: 'candidate', enabled: true
    }
  ]
});

test.describe('applyPatch', () => {
  test('never mutates the inputs it was given', () => {
    const before = inputs();
    const snapshot = JSON.stringify(before);
    applyPatch(before, [{ op: 'set_squad', squad: 'GOLD DEVELOPMENT', sessionsPerWeek: 5 }]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('addresses a squad by name, id or opening words', () => {
    ['sq1', 'GOLD DEVELOPMENT', 'gold'].forEach(ref => {
      const r = applyPatch(inputs(), [{ op: 'set_squad', squad: ref, sessionsPerWeek: 5 }]);
      expect(r.rejected).toEqual([]);
      expect(r.inputs.squads.find(s => s.id === 'sq1').targetSessionsPerWeek).toBe(5);
    });
  });

  test('says what changed in words, with both the old and new figure', () => {
    const r = applyPatch(inputs(), [
      { op: 'set_squad', squad: 'GOLD DEVELOPMENT', sessionsPerWeek: 5, hoursPerWeek: 6.5 }
    ]);
    expect(r.applied[0]).toContain('4 to 5 sessions a week');
    expect(r.applied[0]).toContain('4 to 6.5 hours a week');
  });

  test('setting hours explicitly clears the derived flag', () => {
    // Bronze and Silver carry zero target hours in the club record, so the
    // solver derives them. Typing a real figure must stop it being overwritten.
    const r = applyPatch(inputs(), [{ op: 'set_squad', squad: 'SILVER', hoursPerWeek: 3 }]);
    const silver = r.inputs.squads.find(s => s.id === 'sq2');
    expect(silver.targetHoursPerWeek).toBe(3);
    expect(silver.targetHoursDerived).toBe(false);
  });

  test('refuses figures outside what a swimming club can mean', () => {
    const cases = [
      [{ op: 'set_squad', squad: 'sq1', sessionsPerWeek: 20 }, 'between 0 and 14'],
      [{ op: 'set_squad', squad: 'sq1', hoursPerWeek: 40 }, 'between 0 and 30'],
      [{ op: 'set_squad', squad: 'sq1', swimmersPerLane: 30 }, 'between 1 and 12'],
      [{ op: 'set_squad', squad: 'sq1', targetSize: -4 }, 'negative'],
      [{ op: 'set_squad', squad: 'sq1', minAge: 14, maxAge: 11 }, 'backwards'],
      [{ op: 'set_squad', squad: 'NONESUCH', sessionsPerWeek: 4 }, 'no squad called']
    ];
    cases.forEach(([op, expected]) => {
      const r = applyPatch(inputs(), [op]);
      expect(r.applied).toEqual([]);
      expect(r.rejected.join(' ')).toContain(expected);
    });
  });

  test('a change that says nothing is rejected rather than silently passing', () => {
    const r = applyPatch(inputs(), [{ op: 'set_squad', squad: 'sq1' }]);
    expect(r.rejected.join(' ')).toContain('did not say what to alter');
  });

  test('adds one candidate slot per day named, with unique ids', () => {
    const r = applyPatch(inputs(), [{
      op: 'add_slots', days: ['tuesday', 'Thursday'],
      startTime: '19:00', endTime: '20:30', lanes: 6, venue: 'New Beacon'
    }]);
    const added = r.inputs.poolSlots.filter(s => s.venue === 'New Beacon');
    expect(added).toHaveLength(2);
    expect(new Set(added.map(s => s.id)).size).toBe(2);
    expect(added.every(s => s.source === 'candidate' && s.enabled === true)).toBe(true);
    expect(r.applied[0]).toContain('Tuesday, Thursday');
  });

  test('refuses a slot that ends before it starts, or an unknown day', () => {
    const backwards = applyPatch(inputs(), [{
      op: 'add_slots', days: ['Monday'], startTime: '20:00', endTime: '19:00',
      lanes: 6, venue: 'Radnor House'
    }]);
    expect(backwards.rejected.join(' ')).toContain('ends before it starts');

    const noDay = applyPatch(inputs(), [{
      op: 'add_slots', days: ['Bankday'], startTime: '19:00', endTime: '20:00',
      lanes: 6, venue: 'Radnor House'
    }]);
    expect(noDay.rejected.join(' ')).toContain('Day must be one of');
  });

  test('a session the club actually runs is turned off, never deleted', () => {
    // Deleting it would lose the provenance the continuity score reads, and
    // there would be no way to put it back without re-seeding the scenario.
    const r = applyPatch(inputs(), [{ op: 'remove_slots', slots: ['slot1', 'slot2'] }]);
    expect(r.inputs.poolSlots.map(s => s.id)).toEqual(['slot1']);
    expect(r.inputs.poolSlots[0].enabled).toBe(false);
    expect(r.applied[0]).toContain('removed 1 candidate session');
    expect(r.applied[0]).toContain('turned off 1 session');
  });

  test('a disabled slot can be switched back on', () => {
    const off = applyPatch(inputs(), [{ op: 'set_slot_enabled', slot: 'slot1', enabled: false }]);
    expect(off.inputs.poolSlots[0].enabled).toBe(false);
    const on = applyPatch(off.inputs, [{ op: 'set_slot_enabled', slot: 'slot1', enabled: true }]);
    expect(on.inputs.poolSlots[0].enabled).toBe(true);
  });

  test('setting goals also sets the weights the solver scores on', () => {
    // A goal that does not reach the weights is a label on a search that is
    // still chasing something else.
    const r = applyPatch(inputs(), [{ op: 'set_goals', goals: ['efficient', 'coaching'] }]);
    expect(r.inputs.goals).toEqual(['efficient', 'coaching']);
    expect(r.inputs.weights.utilisation).toBeGreaterThan(0);
    expect(r.inputs.weights.coachCover).toBeGreaterThan(0);
  });

  test('an invented goal is refused and names the ones that exist', () => {
    const r = applyPatch(inputs(), [{ op: 'set_goals', goals: ['winmoremedals'] }]);
    expect(r.rejected.join(' ')).toContain('Not a goal: winmoremedals');
    expect(r.rejected.join(' ')).toContain('cover');
  });

  test('growth assumptions are bounded to something meanable', () => {
    const ok = applyPatch(inputs(), [{ op: 'set_growth', expectedNewSwimmers: 20, attritionPct: 8 }]);
    expect(ok.inputs.growth).toEqual({ expectedNewSwimmers: 20, attritionPct: 8 });

    const bad = applyPatch(inputs(), [{ op: 'set_growth', attritionPct: 140 }]);
    expect(bad.rejected.join(' ')).toContain('between 0 and 100');
  });

  test('one bad change does not throw away the good ones beside it', () => {
    const r = applyPatch(inputs(), [
      { op: 'set_squad', squad: 'GOLD DEVELOPMENT', sessionsPerWeek: 5 },
      { op: 'set_squad', squad: 'NONESUCH', sessionsPerWeek: 4 },
      { op: 'add_slots', days: ['Thursday'], startTime: '19:00', endTime: '20:30', lanes: 6, venue: 'New Beacon' }
    ]);
    expect(r.applied).toHaveLength(2);
    expect(r.rejected).toHaveLength(1);
    expect(r.inputs.squads.find(s => s.id === 'sq1').targetSessionsPerWeek).toBe(5);
    expect(r.inputs.poolSlots).toHaveLength(3);
  });

  test('changes apply in order, so a later one wins', () => {
    const r = applyPatch(inputs(), [
      { op: 'set_squad', squad: 'sq1', sessionsPerWeek: 5 },
      { op: 'set_squad', squad: 'sq1', sessionsPerWeek: 6 }
    ]);
    expect(r.inputs.squads.find(s => s.id === 'sq1').targetSessionsPerWeek).toBe(6);
  });

  test('an operation outside the list is refused, not attempted', () => {
    // The whole point of the operation list is that nothing else can reach the
    // scenario. A blob write dressed as an op must not find a way through.
    const r = applyPatch(inputs(), [{ op: 'replace_everything', squads: [] }]);
    expect(r.applied).toEqual([]);
    expect(r.rejected.join(' ')).toContain('not something that can be changed');
    expect(r.inputs.squads).toHaveLength(2);
  });

  test('the exported operation list is what the assistant is offered', () => {
    expect(PATCH_OPS.sort()).toEqual(
      ['add_slots', 'remove_slots', 'set_goals', 'set_growth', 'set_slot_enabled', 'set_squad']);
  });
});
