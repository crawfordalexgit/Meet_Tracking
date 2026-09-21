import { test, expect } from '@playwright/test';
import { resolveSessionActive } from '../../pages/api/sync-scm.js';

/**
 * The sync must not undo a decision the club made.
 *
 * SCM's ClubSessions payload carries no active flag at all, and the old
 * expression `s.isActive !== false` read that absence as "yes, active". Every
 * sync therefore turned retired sessions back on, and three of them were
 * quietly adding 138 places to the club's capacity — two with no weekday set,
 * so they appeared in no day-by-day view while still deflating every figure
 * for how full the pool is.
 */
test.describe('whether a synced session is active', () => {
  test('SCM saying yes turns on a session nobody has ruled on', () => {
    expect(resolveSessionActive({ active: 'Yes' }, undefined)).toBe(true);
    expect(resolveSessionActive({ Active: 'Yes' }, {})).toBe(true);
    expect(resolveSessionActive({ isActive: true }, { is_active: null })).toBe(true);
  });

  test('SCM saying yes does not undo a retirement made here', () => {
    // Tightened deliberately. SCM marks nothing as inactive unless it has been
    // archived, so "yes" is the default state of every row rather than a
    // decision — and reading it as one put four retired duplicates back into
    // the club's capacity on every sync.
    expect(resolveSessionActive({ active: 'Yes' }, { is_active: false })).toBe(false);
    expect(resolveSessionActive({ isActive: true }, { is_active: false })).toBe(false);
  });

  test('SCM saying no turns it off', () => {
    expect(resolveSessionActive({ active: 'No' }, { is_active: true })).toBe(false);
    expect(resolveSessionActive({ Active: 'No' }, { is_active: true })).toBe(false);
    expect(resolveSessionActive({ isActive: false }, { is_active: true })).toBe(false);
  });

  test('SCM silent leaves a retired session retired', () => {
    // The whole bug: this returned true, so every sync resurrected it.
    expect(resolveSessionActive({ name: 'Age Tuesday 1h' }, { is_active: false })).toBe(false);
  });

  test('SCM silent leaves an active session active', () => {
    expect(resolveSessionActive({ name: 'NAR+ Friday' }, { is_active: true })).toBe(true);
  });

  test('a session the club has never seen defaults to active', () => {
    // A new session arriving from SCM should appear, not be invisible.
    expect(resolveSessionActive({ name: 'New squad Monday' }, undefined)).toBe(true);
    expect(resolveSessionActive({ name: 'New squad Monday' }, {})).toBe(true);
    expect(resolveSessionActive({ name: 'New squad Monday' }, { is_active: null })).toBe(true);
  });

  test('survives a missing payload without throwing', () => {
    expect(resolveSessionActive(null, { is_active: false })).toBe(false);
    expect(resolveSessionActive(undefined, undefined)).toBe(true);
  });
});

/**
 * SCM's `archived` flag, now that the sync actually reads it.
 *
 * The asymmetry is the point. "Archived: Yes" is a decision the club made in
 * SCM and should be honoured. "Archived: No" is the default state of every row
 * SCM holds, including four this club switched off here after finding them
 * duplicated — so it must not be read as an instruction to switch them back on.
 */
test.describe('SCM archived flag', () => {
  test('archived in SCM retires it here', () => {
    expect(resolveSessionActive({ archived: 'Yes' }, { is_active: true })).toBe(false);
    expect(resolveSessionActive({ Archived: 'Yes' }, { is_active: true })).toBe(false);
  });

  test('not archived does not undo a local retirement', () => {
    // The Gold Sunday 2 Hour row: live in SCM, deliberately off here.
    expect(resolveSessionActive({ archived: 'No' }, { is_active: false })).toBe(false);
  });

  test('not archived leaves a live session live', () => {
    expect(resolveSessionActive({ archived: 'No' }, { is_active: true })).toBe(true);
  });

  test('a session new to this database follows SCM', () => {
    expect(resolveSessionActive({ archived: 'No' }, undefined)).toBe(true);
    expect(resolveSessionActive({ archived: 'Yes' }, undefined)).toBe(false);
  });

  test('a real SCM payload is read correctly', () => {
    // Exactly the shape the ClubSessions endpoint returns.
    const payload = {
      guid: '1a34884e', sessionName: 'NAR Sunday MORNING (3 hours)',
      weekDay: 'Sunday', startTime: '07:00', endTime: '10:00',
      sessionLocation: 'Wally Hall School Pool, Sevenoaks', archived: 'No'
    };
    expect(resolveSessionActive(payload, { is_active: true })).toBe(true);
    expect(resolveSessionActive(payload, { is_active: false })).toBe(false);
  });
});
