import { test, expect } from '@playwright/test';
import { planMembershipChanges } from '../../pages/api/sync-session-memberships.js';

/**
 * Session memberships are written as a difference, not a replacement.
 *
 * The sync inserted the whole wanted set and then deleted the old one, so that
 * a failed insert could never strand a swimmer on zero sessions. The table
 * forbids it: (swimmer_id, session_id) is unique, and a swimmer keeps most of
 * their sessions week to week, so the insert collided on the first unchanged
 * row and Postgres rejected the statement whole. The log filled with
 *
 *   SESSION SYNC ERROR for Isla Welch: duplicate key value violates unique
 *   constraint "session_memberships_swimmer_id_session_id_key"
 *
 * for swimmer after swimmer, none of whom were updated — new sessions
 * included, because they travelled in the same insert as the unchanged ones.
 * It also loaded the database enough to time out unrelated pages.
 */
const rows = (...ids) => ids.map((session_id, i) => ({ id: 'row' + i, session_id }));

test.describe('planning a swimmer\'s membership changes', () => {
  test('an unchanged swimmer needs no writes at all', () => {
    // The case that used to fail on every single swimmer.
    const p = planMembershipChanges(rows('a', 'b', 'c'), ['a', 'b', 'c']);
    expect(p.toAdd).toEqual([]);
    expect(p.toRemove).toEqual([]);
  });

  test('only the genuinely new session is inserted', () => {
    const p = planMembershipChanges(rows('a', 'b'), ['a', 'b', 'c']);
    expect(p.toAdd).toEqual(['c']);
    expect(p.toRemove).toEqual([]);
  });

  test('only the withdrawn session is removed', () => {
    const p = planMembershipChanges(rows('a', 'b', 'c'), ['a', 'c']);
    expect(p.toAdd).toEqual([]);
    expect(p.toRemove.map(r => r.session_id)).toEqual(['b']);
  });

  test('a swap adds one and removes one', () => {
    const p = planMembershipChanges(rows('a', 'b'), ['a', 'z']);
    expect(p.toAdd).toEqual(['z']);
    expect(p.toRemove.map(r => r.session_id)).toEqual(['b']);
  });

  test('a swimmer new to the club gets everything inserted', () => {
    const p = planMembershipChanges([], ['a', 'b']);
    expect(p.toAdd).toEqual(['a', 'b']);
    expect(p.toRemove).toEqual([]);
    expect(p.existingCount).toBe(0);
  });

  test('SCM listing a session twice inserts it once', () => {
    // Two identical rows in one insert violate the constraint just as surely
    // as one colliding with a stored row.
    const p = planMembershipChanges([], ['a', 'a', 'b']);
    expect(p.toAdd).toEqual(['a', 'b']);
    expect(p.wanted).toEqual(['a', 'b']);
  });

  test('nothing is ever both added and removed', () => {
    const p = planMembershipChanges(rows('a', 'b', 'c'), ['b', 'c', 'd']);
    const removed = new Set(p.toRemove.map(r => r.session_id));
    p.toAdd.forEach(id => expect(removed.has(id)).toBe(false));
  });

  test('running it again after applying it is a no-op', () => {
    // Idempotence is what makes a failed run safe to repeat.
    const first = planMembershipChanges(rows('a', 'b'), ['b', 'c']);
    const after = rows('b', 'c');
    const second = planMembershipChanges(after, ['b', 'c']);
    expect(first.toAdd).toEqual(['c']);
    expect(second.toAdd).toEqual([]);
    expect(second.toRemove).toEqual([]);
  });

  test('existingCount is what the shrink guard measures', () => {
    // The circuit breaker compares against this, so it must count rows on file
    // rather than the deduplicated wanted set.
    const p = planMembershipChanges(rows('a', 'b', 'c', 'd'), ['a']);
    expect(p.existingCount).toBe(4);
    expect(p.wanted).toEqual(['a']);
  });

  test('survives missing input without throwing', () => {
    expect(planMembershipChanges(null, null).toAdd).toEqual([]);
    expect(planMembershipChanges(undefined, ['a']).toAdd).toEqual(['a']);
    expect(planMembershipChanges(rows('a'), [null, undefined, 'a']).toAdd).toEqual([]);
  });
});
