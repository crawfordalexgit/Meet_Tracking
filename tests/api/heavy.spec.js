// Contract layer 5: expensive external routes (Gemini AI, Puppeteer PDF, docx).
// Skipped unless RUN_HEAVY=1 — they cost API quota / spawn headless Chrome.
import { test, expect } from '@playwright/test';
import { authHeaders } from '../helpers/auth';
import { getServiceClient } from '../helpers/supabase';

const HEAVY = process.env.RUN_HEAVY === '1';
test.skip(!HEAVY, 'set RUN_HEAVY=1 to exercise AI/PDF routes');

let swimmerId, meetId;

test.beforeAll(async () => {
  const supabase = getServiceClient();
  const { data: sw } = await supabase.from('swimmers').select('id').limit(1);
  swimmerId = sw?.[0]?.id;
  const { data: meets } = await supabase
    .from('meets').select('id, results(id)')
    .order('date', { ascending: false }).limit(10);
  meetId = meets?.find(m => m.results?.length)?.id || meets?.[0]?.id;
});

test('POST /api/ai/analyze returns analysis for a swimmer @ai', async ({ request }) => {
  test.skip(!swimmerId, 'no swimmers');
  test.setTimeout(180_000);
  const res = await request.post('/api/ai/analyze', {
    headers: authHeaders(),
    data: { swimmerId, type: 'general' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof (body.analysis ?? body.result ?? body.insight)).toBe('string');
});

test('POST /api/ai/chat answers a message @ai', async ({ request }) => {
  test.setTimeout(120_000);
  const res = await request.post('/api/ai/chat', {
    headers: authHeaders(),
    data: { message: 'In one sentence, what does this dashboard do?' },
  });
  expect(res.status()).toBe(200);
});

test('POST /api/ai/sandbox previewOnly returns metrics without calling Gemini @ai', async ({ request }) => {
  test.skip(!swimmerId, 'no swimmers');
  const res = await request.post('/api/ai/sandbox', {
    headers: authHeaders('admin'),
    data: { swimmerId, period: 90, previewOnly: true },
  });
  expect(res.status()).toBe(200);
});

test('GET /api/export/meet-word produces a .docx @pdf', async ({ request }) => {
  test.skip(!meetId, 'no meets');
  test.setTimeout(120_000);
  const res = await request.get(`/api/export/meet-word?meetId=${meetId}`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  const ct = res.headers()['content-type'] || '';
  expect(ct).toContain('officedocument.wordprocessingml');
  expect((await res.body()).length).toBeGreaterThan(1000);
});

test('POST /api/generate-pdf renders a meet PDF @pdf', async ({ request }) => {
  test.skip(!meetId, 'no meets');
  test.setTimeout(300_000);
  const res = await request.post('/api/generate-pdf', {
    headers: authHeaders(),
    data: { meetId, type: 'meet' },
  });
  expect(res.status()).toBe(200);
  const ct = res.headers()['content-type'] || '';
  expect(ct).toContain('pdf');
});
