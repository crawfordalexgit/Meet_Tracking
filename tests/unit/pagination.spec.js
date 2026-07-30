/**
 * Regression tests for the pre-launch audit (2026-07-27).
 *
 * PostgREST caps every response at 1000 rows. The results table already holds
 * several thousand, so any unpaginated select silently returns a truncated
 * slice that looks exactly like a complete result set. reconcilePbs was reading
 * that slice, which made is_pb wrong for most of the table — and every
 * PB-derived metric in the product inherits that.
 *
 * Uses a fake Supabase client; no live DB.
 */
import { test, expect } from '@playwright/test';
import { fetchAllRows } from '../../lib/paginate.js';
import { reconcilePbs } from '../../lib/reconcile-pbs.js';

/**
 * Minimal fake of the Supabase query builder, enforcing the same 1000-row cap
 * PostgREST applies. `calls` records the .order() sequence so we can assert the
 * caller's sort stays primary.
 */
function makeFakeClient(tables, { failOnPage = null } = {}) {
  const calls = { orders: [], ranges: [], upserts: [] };

  const builder = (table) => {
    const state = { orders: [], range: null };
    const api = {
      select() { return api; },
      order(column, opts) { state.orders.push({ column, ...(opts || {}) }); return api; },
      eq() { return api; },
      in() { return api; },
      not() { return api; },
      gte() { return api; },
      range(from, to) { state.range = [from, to]; return api; },
      upsert(rows) { calls.upserts.push(rows); return Promise.resolve({ error: null }); },
      then(resolve) {
        calls.orders.push(state.orders.map(o => o.column));
        const [from, to] = state.range || [0, 999];
        const page = Math.floor(from / 1000);
        calls.ranges.push([from, to]);

        if (failOnPage !== null && page === failOnPage) {
          return resolve({ data: null, error: { message: 'simulated network failure' } });
        }
        // The cap: never return more than 1000 rows for one request.
        const size = Math.min(to - from + 1, 1000);
        return resolve({ data: (tables[table] || []).slice(from, from + size), error: null });
      },
    };
    return api;
  };

  return { from: builder, _calls: calls };
}

// ── fetchAllRows ────────────────────────────────────────────────────────────

test.describe('fetchAllRows', () => {
  test('returns every row past the 1000-row cap', async () => {
    const rows = Array.from({ length: 2350 }, (_, i) => ({ id: i }));
    const client = makeFakeClient({ results: rows });

    const all = await fetchAllRows(client, 'results');

    expect(all).toHaveLength(2350);
    expect(all[0].id).toBe(0);
    expect(all[2349].id).toBe(2349);
  });

  test('stops cleanly on an exact multiple of the page size', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i }));
    const client = makeFakeClient({ results: rows });
    expect(await fetchAllRows(client, 'results')).toHaveLength(2000);
  });

  test('throws instead of returning a partial array when a page fails', async () => {
    // It used to `break` on error and return whatever had been collected, so
    // callers received a truncated array indistinguishable from a complete one.
    const rows = Array.from({ length: 3000 }, (_, i) => ({ id: i }));
    const client = makeFakeClient({ results: rows }, { failOnPage: 1 });

    await expect(fetchAllRows(client, 'results')).rejects.toThrow(/failed on page 1/);
  });

  test("the caller's sort stays primary, with id only as the tiebreaker", async () => {
    // .order('id') used to be applied BEFORE the caller's filter, demoting a
    // caller-supplied .order('date') to a secondary key — so the "most recent
    // first" ordering getSwimmerDNA relies on was not what it got.
    const client = makeFakeClient({ results: [{ id: 1 }] });

    await fetchAllRows(client, 'results', { filter: q => q.order('date', { ascending: false }) });

    expect(client._calls.orders[0]).toEqual(['date', 'id']);
  });
});

// ── reconcilePbs ────────────────────────────────────────────────────────────

test.describe('reconcilePbs', () => {
  /** n results for one swimmer, getting steadily faster, oldest meet first. */
  function makeResults(n) {
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      swimmer_id: 'sw-1',
      event: '50 Free',
      course: 'SC',
      time: `${(60 - i * 0.01).toFixed(2)}`,
      meets: { date: `2020-01-01` },
    }));
  }

  test('examines every row, not just the first 1000', async () => {
    const rows = makeResults(2500);
    const client = makeFakeClient({ results: rows });

    const processed = await reconcilePbs(client);

    expect(processed).toBe(2500);
    const written = client._calls.upserts.flat();
    expect(written).toHaveLength(2500);
  });

  test('marks each successive improvement as a PB and nothing else', async () => {
    const client = makeFakeClient({ results: makeResults(5) });
    await reconcilePbs(client);

    const written = client._calls.upserts.flat();
    // Every swim is faster than the last, so all five are PBs.
    expect(written.every(r => r.is_pb === true)).toBe(true);
  });

  test('a slower swim after a PB is not a PB', async () => {
    const rows = [
      { id: 1, swimmer_id: 'sw-1', event: '50 Free', course: 'SC', time: '30.00', meets: { date: '2026-01-01' } },
      { id: 2, swimmer_id: 'sw-1', event: '50 Free', course: 'SC', time: '31.00', meets: { date: '2026-02-01' } },
      { id: 3, swimmer_id: 'sw-1', event: '50 Free', course: 'SC', time: '29.00', meets: { date: '2026-03-01' } },
    ];
    const client = makeFakeClient({ results: rows });
    await reconcilePbs(client);

    const byId = Object.fromEntries(client._calls.upserts.flat().map(r => [r.id, r.is_pb]));
    expect(byId[1]).toBe(true);
    expect(byId[2]).toBe(false);
    expect(byId[3]).toBe(true);
  });

  test('event naming variants share one PB lineage', async () => {
    // "50m Freestyle" and "50 Free" come from different scrape sources. Keying
    // on the raw string gave each its own PB and inflated PB counts.
    const rows = [
      { id: 1, swimmer_id: 'sw-1', event: '50 Free', course: 'SC', time: '30.00', meets: { date: '2026-01-01' } },
      { id: 2, swimmer_id: 'sw-1', event: '50m Freestyle', course: 'SC', time: '31.00', meets: { date: '2026-02-01' } },
    ];
    const client = makeFakeClient({ results: rows });
    await reconcilePbs(client);

    const byId = Object.fromEntries(client._calls.upserts.flat().map(r => [r.id, r.is_pb]));
    expect(byId[1]).toBe(true);
    // Slower than the earlier swim in the SAME event — must not be a second PB.
    expect(byId[2]).toBe(false);
  });

  test('an unparseable time is never a PB', async () => {
    const rows = [
      { id: 1, swimmer_id: 'sw-1', event: '50 Free', course: 'SC', time: 'DNF', meets: { date: '2026-01-01' } },
    ];
    const client = makeFakeClient({ results: rows });
    await reconcilePbs(client);

    expect(client._calls.upserts.flat()[0].is_pb).toBe(false);
  });
});
