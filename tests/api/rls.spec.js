/**
 * Row-Level Security contract tests (added by the 2026-07-27 pre-launch audit).
 *
 * WHY THIS FILE EXISTS
 * The rest of the api suite tests ROUTE-level auth: 401/403/405 from the
 * handlers in pages/api. Nothing tested the RLS policies themselves. That is
 * exactly how three CRITICAL holes survived to launch: sessions,
 * training_attendance and rankings each carried a policy named "Allow service
 * role ..." declared as `FOR ALL USING (true)` with no `TO` clause. A policy
 * with no role applies to PUBLIC — which includes `anon`, whose key ships in
 * the client bundle. Anyone could DELETE every row in those tables.
 *
 * These tests use the anon key directly (no signed-in user), which is what an
 * attacker holding the public key has.
 *
 * PREREQUISITE: migrations/2026-07-27_rls-hardening.sql must have been applied
 * to the database under test. These tests are the check that it was.
 *
 * SAFETY: every write attempted here is expected to be REJECTED. If a write
 * unexpectedly succeeds the test fails loudly and the inserted row is cleaned
 * up in afterAll via the service client.
 */
const { test, expect } = require('@playwright/test');
const { getAnonClient, getServiceClient } = require('../helpers/supabase');

const MARKER = `rls-probe-${Date.now()}`;

/** True when a Supabase error means "RLS said no". */
function isDenied(error) {
  if (!error) return false;
  // 42501 = insufficient_privilege; PGRST301/204 and "row-level security"
  // messages cover the PostgREST-side rejections.
  return (
    error.code === '42501' ||
    /row-level security|permission denied|violates row-level/i.test(error.message || '')
  );
}

test.describe('RLS: anon key cannot write to minors\' data', () => {
  test('anon cannot DELETE training_attendance', async () => {
    const anon = getAnonClient();
    // Scoped to an impossible id: even a successful call must affect no rows.
    // We are asserting the ERROR, not relying on the filter for safety.
    const { error } = await anon
      .from('training_attendance')
      .delete()
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .select();

    expect(isDenied(error), `anon DELETE on training_attendance was not denied (error: ${JSON.stringify(error)})`).toBe(true);
  });

  test('anon cannot DELETE sessions', async () => {
    const anon = getAnonClient();
    const { error } = await anon
      .from('sessions')
      .delete()
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .select();

    expect(isDenied(error), `anon DELETE on sessions was not denied (error: ${JSON.stringify(error)})`).toBe(true);
  });

  test('anon cannot DELETE rankings', async () => {
    const anon = getAnonClient();
    const { error } = await anon
      .from('rankings')
      .delete()
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .select();

    expect(isDenied(error), `anon DELETE on rankings was not denied (error: ${JSON.stringify(error)})`).toBe(true);
  });

  test('anon cannot INSERT training_attendance', async () => {
    const anon = getAnonClient();
    const { error } = await anon.from('training_attendance').insert({
      swimmer_id: '00000000-0000-0000-0000-000000000000',
      session_id: '00000000-0000-0000-0000-000000000000',
      date: '2026-01-01',
      status: MARKER,
    });

    expect(error, 'anon INSERT on training_attendance should have failed').toBeTruthy();
  });
});

test.describe('RLS: anon key cannot READ minors\' data', () => {
  // These tables carry named minors' attendance history and rankings. Their
  // SELECT policies used `USING (true)` with no `TO authenticated`, so they
  // were readable by anyone holding the public key.
  for (const table of ['training_attendance', 'sessions', 'rankings']) {
    test(`anon SELECT on ${table} returns nothing`, async () => {
      const anon = getAnonClient();
      const { data, error } = await anon.from(table).select('*').limit(1);

      // Either the query is rejected, or RLS filters it to zero rows. Both are
      // acceptable; returning real rows is not.
      const denied = !!error || (Array.isArray(data) && data.length === 0);
      expect(denied, `anon could read ${table} (${data?.length ?? 0} rows returned)`).toBe(true);
    });
  }
});

test.describe('RLS: profile emails are not enumerable', () => {
  test('anon cannot list profiles', async () => {
    const anon = getAnonClient();
    const { data, error } = await anon.from('profiles').select('email, role').limit(5);

    const denied = !!error || (Array.isArray(data) && data.length === 0);
    expect(denied, 'anon could enumerate profile emails and roles').toBe(true);
  });
});

test.afterAll(async () => {
  // Belt and braces: if any probe insert DID land, remove it.
  try {
    const service = getServiceClient();
    await service.from('training_attendance').delete().eq('status', MARKER);
  } catch {
    // Service key not configured in this environment — nothing to clean up.
  }
});
