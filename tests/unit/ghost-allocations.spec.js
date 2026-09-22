import { test, expect } from '@playwright/test';
import {
  ghostReason, findGhosts, groupGhostsBySquad, wholeRosterGhosts, summariseGhosts
} from '../../lib/ghost-allocations.js';

/**
 * A ghost is a place nobody is standing in, and the list is used to take a
 * swimmer's place away. Half of this club's forty-eight ghosts were not the
 * swimmer's doing: seven sat on sessions whose register was never taken once,
 * and eighteen on sessions registered under 60% of the time. Reclaiming those
 * lanes would take water off squads that were using it.
 */
const health = (taken, expected) => ({
  taken, expected,
  coveragePct: expected ? Math.round(taken / expected * 100) : null
});

const SWIMMERS = [
  { id: 'a', full_name: 'Swimmer A', squads: { name: 'SILVER' } },
  { id: 'b', full_name: 'Swimmer B', squads: { name: 'SILVER' } },
  { id: 'c', full_name: 'Swimmer C', squads: { name: 'MASTERS' } }
];
const SESSIONS = [
  { id: 's1', name: 'SILVER Tuesday', day: 'Tuesday', location: 'Tonbridge Town Pool', is_active: true },
  { id: 's2', name: 'MASTERS Wednesday OUTDOOR', day: 'Wednesday', location: 'Tonbridge Town Outdoor', is_active: true },
  { id: 's3', name: 'Retired Thing', day: 'Monday', is_active: false }
];

test.describe('why a swimmer has no recorded swim', () => {
  test('a register never taken tells you nothing about the swimmer', () => {
    const r = ghostReason(health(0, 20));
    expect(r.trust).toBe('none');
    expect(r.key).toBe('never');
    expect(r.detail).toContain('whether they swam or not');
  });

  test('a patchy register counts the nights nobody wrote down', () => {
    const r = ghostReason(health(9, 20));
    expect(r.trust).toBe('weak');
    expect(r.label).toContain('45%');
    expect(r.detail).toContain('11 nights nobody wrote down');
  });

  test('a reliable register is the only one that says something', () => {
    const r = ghostReason(health(19, 20));
    expect(r.trust).toBe('good');
    expect(r.key).toBe('reliable');
  });

  test('sixty per cent is the line, and it is not crossed by being on it', () => {
    expect(ghostReason(health(6, 10)).trust).toBe('good');
    expect(ghostReason(health(59, 100)).trust).toBe('weak');
  });

  test('a session with no health record at all is judged by nothing', () => {
    expect(ghostReason(null).trust).toBe('none');
  });
});

test.describe('finding the ghosts', () => {
  const MEMBERSHIPS = [
    { swimmer_id: 'a', session_id: 's1' },
    { swimmer_id: 'b', session_id: 's1' },
    { swimmer_id: 'c', session_id: 's2' },
    { swimmer_id: 'c', session_id: 's3' },
    { swimmer_id: 'gone', session_id: 's1' },
    { swimmer_id: 'a', session_id: 'missing' }
  ];
  const opts = presentKeys => ({
    memberships: MEMBERSHIPS, swimmers: SWIMMERS, sessions: SESSIONS,
    presentKeys: new Set(presentKeys),
    healthBySession: { s1: health(19, 20), s2: health(0, 22) }
  });

  test('a swimmer with a recorded swim is not a ghost', () => {
    const { rows } = findGhosts(opts(['a|s1']));
    expect(rows.map(r => r.swimmerName)).not.toContain('Swimmer A');
  });

  test('a membership on a retired session is a tidy-up, not a ghost', () => {
    // The session owes nothing, so nobody on it can be failing to use it.
    const { rows, orphans } = findGhosts(opts([]));
    expect(rows.some(r => r.sessionId === 's3')).toBe(false);
    expect(orphans.retiredSession).toBe(1);
  });

  test('memberships pointing at nothing are counted, not dropped silently', () => {
    const { orphans } = findGhosts(opts([]));
    expect(orphans.noSwimmer).toBe(1);
    expect(orphans.noSession).toBe(1);
  });

  test('each ghost carries the register that judged it', () => {
    const { rows } = findGhosts(opts(['a|s1']));
    const b = rows.find(r => r.swimmerName === 'Swimmer B');
    expect(b.registerTaken).toBe(19);
    expect(b.coveragePct).toBe(95);
    expect(b.reason.trust).toBe('good');
    const c = rows.find(r => r.swimmerName === 'Swimmer C');
    expect(c.reason.trust).toBe('none');
  });

  test('the venue comes with it, so a closed pool is visible on the row', () => {
    const { rows } = findGhosts(opts([]));
    expect(rows.find(r => r.sessionId === 's1').venue).toBe('Tonbridge Town Pool');
  });
});

test.describe('grouping and counting', () => {
  const rows = [
    { swimmerId: 'a', sessionId: 's1', squadName: 'SILVER', sessionName: 'A', reason: { key: 'reliable', trust: 'good' } },
    { swimmerId: 'b', sessionId: 's1', squadName: 'SILVER', sessionName: 'A', reason: { key: 'reliable', trust: 'good' } },
    { swimmerId: 'c', sessionId: 's2', squadName: 'MASTERS', sessionName: 'B', reason: { key: 'never', trust: 'none' } },
    { swimmerId: 'd', sessionId: 's2', squadName: 'MASTERS', sessionName: 'B', reason: { key: 'never', trust: 'none' } },
    { swimmerId: 'e', sessionId: 's2', squadName: 'MASTERS', sessionName: 'B', reason: { key: 'never', trust: 'none' } }
  ];

  test('squads are ordered by what can actually be reclaimed', () => {
    // Masters has more ghosts but nothing to reclaim; putting it first would
    // send somebody to take lanes off a squad the register cannot judge.
    const groups = groupGhostsBySquad(rows);
    expect(groups[0].squad).toBe('SILVER');
    expect(groups[0].reclaimable).toBe(2);
    expect(groups[1].squad).toBe('MASTERS');
    expect(groups[1].reclaimable).toBe(0);
    expect(groups[1].unverifiable).toBe(3);
  });

  test('a session where the whole roster is a ghost is called out as one thing', () => {
    const whole = wholeRosterGhosts(rows, { s1: 8, s2: 3 });
    expect(whole).toHaveLength(1);
    expect(whole[0].sessionId).toBe('s2');
    expect(whole[0].detail).toContain('That is a register, not 3 swimmers');
  });

  test('two of eight missing is not a whole roster', () => {
    expect(wholeRosterGhosts(rows, { s1: 8, s2: 99 })).toEqual([]);
  });

  test('a roster of two is too small to call a register', () => {
    const pair = rows.slice(0, 2);
    expect(wholeRosterGhosts(pair, { s1: 2 })).toEqual([]);
  });

  test('the summary separates what can be acted on from what cannot', () => {
    const s = summariseGhosts(rows, { retiredSession: 43 });
    expect(s.total).toBe(5);
    expect(s.reclaimable).toBe(2);
    expect(s.unverifiable).toBe(3);
    expect(s.swimmers).toBe(5);
    expect(s.sessions).toBe(2);
    expect(s.orphans.retiredSession).toBe(43);
  });
});
