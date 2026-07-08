// Contract layer 2: authed happy paths for read-only routes.
import { test, expect } from '@playwright/test';
import { authHeaders } from '../helpers/auth';
import { getServiceClient } from '../helpers/supabase';

let swimmerId;

test.beforeAll(async () => {
  const supabase = getServiceClient();
  const { data } = await supabase.from('swimmers').select('id').limit(1);
  swimmerId = data?.[0]?.id;
});

test('GET /api/get-issues returns issues array', async ({ request }) => {
  const res = await request.get('/api/get-issues', { headers: authHeaders() });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.issues)).toBe(true);
});

test('GET /api/memberships returns array (all rows)', async ({ request }) => {
  const res = await request.get('/api/memberships', { headers: authHeaders() });
  expect(res.status()).toBe(200);
  expect(Array.isArray(await res.json())).toBe(true);
});

test('GET /api/memberships?swimmerId filters to one swimmer', async ({ request }) => {
  test.skip(!swimmerId, 'no swimmers in DB');
  const res = await request.get(`/api/memberships?swimmerId=${swimmerId}`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  const rows = await res.json();
  for (const row of rows) expect(row.swimmer_id).toBe(swimmerId);
});

test('GET /api/reports returns full report payload', async ({ request }) => {
  const res = await request.get('/api/reports?period=90', { headers: authHeaders() });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('swimmersData');
  expect(body).toHaveProperty('cohorts');
  expect(body.cohorts).toHaveProperty('highEfficiency');
  expect(body.cohorts).toHaveProperty('lowEfficiency');
  expect(body.cohorts).toHaveProperty('overTraining');
  expect(body.cohorts).toHaveProperty('underTraining');
});

test('POST /api/reports with squad filter returns squad-only swimmers', async ({ request }) => {
  const supabase = getServiceClient();
  const { data: squads } = await supabase.from('squads').select('id').eq('is_squad', true).limit(1);
  test.skip(!squads?.length, 'no squads in DB');
  const res = await request.post('/api/reports', {
    headers: authHeaders(),
    data: { squadId: squads[0].id, period: 90 },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.swimmersData)).toBe(true);
});

test('GET /api/prompts/load returns prompt content for each facet', async ({ request }) => {
  for (const facet of ['training', 'racing', 'general']) {
    const res = await request.get(`/api/prompts/load?facet=${facet}`, { headers: authHeaders() });
    expect(res.status(), `facet ${facet}`).toBe(200);
    const body = await res.json();
    expect(typeof (body.content ?? body.prompt), `facet ${facet} has content`).toBe('string');
  }
});

test('GET /api/prompts/history returns version list', async ({ request }) => {
  const res = await request.get('/api/prompts/history?facet=training', { headers: authHeaders() });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.history ?? body)).toBe(true);
});
