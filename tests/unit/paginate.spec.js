import { test, expect } from '@playwright/test';
import { fetchAllRows } from '../../lib/paginate.js';

// Minimal fake Supabase client: serves `rows` in range() slices.
function fakeClient(rows, { failOnPage = -1 } = {}) {
  return {
    from: () => ({
      select: () => {
        const q = {
          _from: 0, _to: 0,
          order() { return q; },
          range(from, to) { q._from = from; q._to = to; return q; },
          eq() { return q; },
          then(resolve) {
            const page = Math.floor(q._from / (q._to - q._from + 1));
            if (page === failOnPage) return resolve({ data: null, error: { message: 'boom' } });
            return resolve({ data: rows.slice(q._from, q._to + 1), error: null });
          },
        };
        return q;
      },
    }),
  };
}

const makeRows = n => Array.from({ length: n }, (_, i) => ({ id: i }));

test('fetches a single partial page', async () => {
  const rows = await fetchAllRows(fakeClient(makeRows(42)), 't');
  expect(rows).toHaveLength(42);
});

test('crosses the 1000-row PostgREST cap', async () => {
  const rows = await fetchAllRows(fakeClient(makeRows(2500)), 't');
  expect(rows).toHaveLength(2500);
  expect(rows[2499].id).toBe(2499);
});

test('exact page boundary terminates (no infinite loop)', async () => {
  const rows = await fetchAllRows(fakeClient(makeRows(2000)), 't');
  expect(rows).toHaveLength(2000);
});

test('maxPages caps runaway fetches', async () => {
  const rows = await fetchAllRows(fakeClient(makeRows(5000)), 't', { maxPages: 2 });
  expect(rows).toHaveLength(2000);
});

test('error mid-pagination throws instead of returning a partial array', async () => {
  // Changed in the 2026-07-27 audit. Returning "rows so far" hands the caller a
  // truncated array that is indistinguishable from a complete one, which is
  // exactly how silently-wrong data reached the UI.
  await expect(fetchAllRows(fakeClient(makeRows(3000), { failOnPage: 1 }), 't'))
    .rejects.toThrow(/failed on page 1/);
});

test('missing client returns empty array', async () => {
  expect(await fetchAllRows(null, 't')).toEqual([]);
});
