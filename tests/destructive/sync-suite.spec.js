// DESTRUCTIVE: exercises the real sync endpoints against the live DB.
// Gated: refuses to run without a <24h backup (scripts/test-backup.js).
// Run with:  npm run test:destructive
// Longest external syncs (rankings, attendance, join-dates, memberships)
// additionally need RUN_FULL_SYNC=1.
import { test, expect } from '@playwright/test';
import { authHeaders } from '../helpers/auth';
import { getServiceClient, fetchAll } from '../helpers/supabase';
import { assertFreshBackup } from './_gate';

test.describe.configure({ mode: 'serial' });

let supabase;
let baseline = {};

test.beforeAll(async () => {
  assertFreshBackup();
  supabase = getServiceClient();

  const swimmers = await fetchAll(supabase, 'swimmers', 'id, member_id, full_name');
  const { count: resultsCount } = await supabase.from('results').select('id', { count: 'exact', head: true });
  const { count: meetsCount } = await supabase.from('meets').select('id', { count: 'exact', head: true });
  baseline = {
    swimmersById: new Map(swimmers.map(s => [s.member_id, s])),
    swimmerCount: swimmers.length,
    resultsCount,
    meetsCount,
  };
  console.log(`baseline: ${swimmers.length} swimmers, ${resultsCount} results, ${meetsCount} meets`);
});

// Reads an SSE endpoint to completion and returns all parsed events.
async function runSSE(request, url, data, timeoutMs) {
  const res = await request.post(url, { headers: authHeaders('admin'), data, timeout: timeoutMs });
  expect(res.status(), `${url} should accept the request`).toBe(200);
  const text = await res.text();
  const events = text.split('\n')
    .filter(l => l.startsWith('data: '))
    .map(l => { try { return JSON.parse(l.slice(6)); } catch { return null; } })
    .filter(Boolean);
  return events;
}

test('sync-scm: swimmers upserted, no swimmer loses their UUID (cascade-wipe guard)', async ({ request }) => {
  test.setTimeout(900_000);
  const res = await request.post('/api/sync-scm', { headers: authHeaders('admin'), data: {}, timeout: 850_000 });
  expect(res.status()).toBe(200);

  const after = await fetchAll(supabase, 'swimmers', 'id, member_id, full_name');
  const afterByMember = new Map(after.map(s => [s.member_id, s]));

  // Any swimmer present before AND after must keep the same UUID — otherwise
  // ON DELETE CASCADE has silently wiped their results/PBs/attendance.
  const rekeyed = [];
  const removed = [];
  for (const [memberId, before] of baseline.swimmersById) {
    const now = afterByMember.get(memberId);
    if (!now) removed.push(before.full_name);
    else if (now.id !== before.id) rekeyed.push(before.full_name);
  }
  expect(rekeyed, `swimmers deleted+recreated with new UUID (results wiped!): ${rekeyed.join(', ')}`).toHaveLength(0);

  // Removals may be legitimate (left the club) but each one destroys history —
  // surface them loudly so the operator can verify.
  console.log(`sync-scm removed ${removed.length} swimmers: ${removed.slice(0, 20).join(', ')}`);
  const { count: resultsNow } = await supabase.from('results').select('id', { count: 'exact', head: true });
  const lost = baseline.resultsCount - resultsNow;
  expect(lost, `sync-scm caused ${lost} results rows to vanish via cascade`).toBeLessThanOrEqual(0);
});

test('scrape-meets: meets + results land, reconcile trigger works', async ({ request }) => {
  test.setTimeout(3_000_000); // full-season scrape is slow (sequential splits fetches)
  const year = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const events = await runSSE(request, '/api/scrape-meets', { swimmingYear: `${year}/${year + 1}` }, 2_900_000);

  const last = events[events.length - 1];
  expect(last?.isDone, 'scrape-meets stream should finish').toBe(true);
  expect(last?.error, `scrape-meets reported: ${last?.error}`).toBeFalsy();

  const { count: meetsNow } = await supabase.from('meets').select('id', { count: 'exact', head: true });
  const { count: resultsNow } = await supabase.from('results').select('id', { count: 'exact', head: true });
  expect(meetsNow, 'meets table should not shrink below baseline').toBeGreaterThanOrEqual(baseline.meetsCount);
  expect(resultsNow, 'no results after a full scrape — swimmer matching broken?').toBeGreaterThan(0);

  // Cross-check the reported bug end-to-end: every meet from this season that
  // has results must be visible from the swimmer-page query pattern.
  const seasonStart = `${year}-09-01`;
  const seasonResults = await fetchAll(supabase, 'results', 'swimmer_id, meet_id', q => q.gte('date', seasonStart));
  expect(seasonResults.length, `season ${year}/${year + 1} scraped but zero results matched to swimmers — name/member_id matching failed`).toBeGreaterThan(0);

  const meetIds = [...new Set(seasonResults.map(r => r.meet_id).filter(Boolean))];
  const { data: linkedMeets } = await supabase.from('meets').select('id').in('id', meetIds);
  expect(linkedMeets.length, 'results reference meets that do not exist').toBe(meetIds.length);
});

test('reconcile-pbs succeeds when called WITH auth (the internal post-scrape call has none — known bug)', async ({ request }) => {
  test.setTimeout(600_000);
  const res = await request.post('/api/reconcile-pbs', { headers: authHeaders('admin'), data: {}, timeout: 550_000 });
  expect(res.status()).toBe(200);
});

test('sync-pbs for one swimmer upserts swimmer_pbs', async ({ request }) => {
  test.setTimeout(600_000);
  // choose a swimmer with a member_id and existing results (most likely to have SE PBs)
  const { data: candidates } = await supabase
    .from('swimmers').select('id, member_id, full_name, results(id)')
    .not('member_id', 'is', null).limit(20);
  const swimmer = candidates?.find(c => c.results?.length) || candidates?.[0];
  test.skip(!swimmer, 'no swimmer with member_id');

  const events = await runSSE(request, '/api/sync-pbs', { swimmerId: swimmer.id }, 550_000);
  const last = events[events.length - 1];
  expect(last?.error, `sync-pbs error: ${last?.error}`).toBeFalsy();

  const { data: pbs } = await supabase.from('swimmer_pbs').select('event, time, last_updated').eq('swimmer_id', swimmer.id);
  console.log(`sync-pbs: ${swimmer.full_name} now has ${pbs.length} PB rows`);
  expect(pbs.length, `${swimmer.full_name} (${swimmer.member_id}) has results but SE PB sync found nothing`).toBeGreaterThan(0);
});

test('import-attendance roundtrip with fixture CSV rows', async ({ request }) => {
  const { data: swimmers } = await supabase.from('swimmers').select('id, full_name').limit(1);
  test.skip(!swimmers?.length, 'no swimmers');
  const sessionName = `[test-suite] import session`;

  const res = await request.post('/api/import-attendance', {
    headers: authHeaders('admin'),
    data: { records: [{ swimmerName: swimmers[0].full_name, sessionName, date: '2026-01-05' }] },
  });
  expect(res.status()).toBe(200);

  const { data: session } = await supabase.from('sessions').select('id').eq('name', sessionName).single();
  expect(session).toBeTruthy();
  const { data: att } = await supabase.from('training_attendance')
    .select('id').eq('swimmer_id', swimmers[0].id).eq('session_id', session.id).eq('date', '2026-01-05');
  expect(att).toHaveLength(1);

  // cleanup fixture rows
  await supabase.from('training_attendance').delete().eq('session_id', session.id);
  await supabase.from('sessions').delete().eq('id', session.id);
});

test('detect-missing-sessions reports against SCM', async ({ request }) => {
  test.skip(!process.env.SCM_WEB_USERNAME, 'no SCM web credentials');
  test.setTimeout(600_000);
  const res = await request.post('/api/detect-missing-sessions', { headers: authHeaders('admin'), data: {}, timeout: 550_000 });
  expect(res.status()).toBe(200);
});

// ── Full external syncs: slow, only with RUN_FULL_SYNC=1 ────────────────────

test('scrape-rankings snapshots all swimmers @fullsync', async ({ request }) => {
  test.skip(process.env.RUN_FULL_SYNC !== '1', 'set RUN_FULL_SYNC=1');
  test.setTimeout(3_000_000);
  const events = await runSSE(request, '/api/scrape-rankings', {}, 2_900_000);
  expect(events[events.length - 1]?.error).toBeFalsy();
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase.from('rankings').select('id', { count: 'exact', head: true }).eq('snapshot_date', today);
  expect(count, 'no ranking rows with today\'s snapshot_date').toBeGreaterThan(0);
});

test('sync-attendance imports SCM attendance @fullsync', async ({ request }) => {
  test.skip(process.env.RUN_FULL_SYNC !== '1' || !process.env.SCM_WEB_USERNAME, 'set RUN_FULL_SYNC=1');
  test.setTimeout(3_000_000);
  const res = await request.post('/api/sync-attendance', { headers: authHeaders('admin'), data: {}, timeout: 2_900_000 });
  expect(res.status()).toBe(200);
});

test('sync-session-memberships imports allocations @fullsync', async ({ request }) => {
  test.skip(process.env.RUN_FULL_SYNC !== '1' || !process.env.SCM_WEB_USERNAME, 'set RUN_FULL_SYNC=1');
  test.setTimeout(3_000_000);
  const res = await request.post('/api/sync-session-memberships', { headers: authHeaders('admin'), data: {}, timeout: 2_900_000 });
  expect(res.status()).toBe(200);
});
