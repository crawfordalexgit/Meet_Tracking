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
  test('SCM saying yes turns it on', () => {
    expect(resolveSessionActive({ active: 'Yes' }, { is_active: false })).toBe(true);
    expect(resolveSessionActive({ Active: 'Yes' }, { is_active: false })).toBe(true);
    expect(resolveSessionActive({ isActive: true }, { is_active: false })).toBe(true);
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
