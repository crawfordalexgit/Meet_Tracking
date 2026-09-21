import { test, expect } from '@playwright/test';
import { authHeaders } from '../helpers/auth';

/**
 * API coverage for the scenario planner.
 *
 * Runs against the live database, so anything created here carries an obvious
 * throwaway name and is deleted afterwards — otherwise these runs litter the
 * club's real scenario list.
 */

const THROWAWAY = 'ZZZ-TEST-DELETE-ME';

const FIXTURE_INPUTS = {
  version: 1,
  poolSlots: [
    {
      id: 'slot_t1', label: 'Test Monday', venue: 'Test Pool', day: 'Monday',
      startTime: '18:00', endTime: '19:30', lanes: 6, source: 'candidate', enabled: true
    },
    {
      id: 'slot_t2', label: 'Test Wednesday', venue: 'Test Pool', day: 'Wednesday',
      startTime: '18:00', endTime: '19:30', lanes: 6, source: 'candidate', enabled: true
    }
  ],
  squads: [
    {
      id: 'sq_t1', name: 'Test Squad', sourceSquadId: null, minAge: 11, maxAge: 13,
      targetSize: 16, swimmersPerLane: 8, targetSessionsPerWeek: 2,
      targetHoursPerWeek: 3, competitive: true, priority: 1
    }
  ],
  coaches: []
};

let created = [];

test.afterAll(async ({ request }) => {
  for (const id of created) {
    await request.delete(`/api/restructure/scenarios?id=${id}`, { headers: await authHeaders() })
      .catch(() => {});
  }
  created = [];
});

test.describe('auth and method gating', () => {
  const routes = [
    { path: '/api/restructure/baseline', method: 'get' },
    { path: '/api/restructure/scenarios', method: 'get' },
    { path: '/api/restructure/solve', method: 'post' },
    { path: '/api/restructure/suggest', method: 'post' },
    { path: '/api/restructure/coach-roster', method: 'get' },
    { path: '/api/restructure/assist', method: 'post' }
  ];

  for (const route of routes) {
    test(`${route.path} rejects an unauthenticated caller`, async ({ request }) => {
      const res = await request[route.method](route.path, route.method === 'post' ? { data: {} } : {});
      expect(res.status()).toBe(401);
    });
  }

  test('baseline rejects the wrong method', async ({ request }) => {
    const res = await request.post('/api/restructure/baseline', {
      headers: await authHeaders(), data: {}
    });
    expect(res.status()).toBe(405);
  });

  test('solve rejects the wrong method', async ({ request }) => {
    const res = await request.get('/api/restructure/solve', { headers: await authHeaders() });
    expect(res.status()).toBe(405);
  });

  test('assist rejects the wrong method', async ({ request }) => {
    const res = await request.get('/api/restructure/assist', { headers: await authHeaders() });
    expect(res.status()).toBe(405);
  });
});

test.describe('POST /api/restructure/assist', () => {
  // The provider call itself is gated behind RUN_HEAVY in heavy.spec.js. What
  // is checked here is everything before it: the route validates its input and
  // refuses to reach the model without a scenario to talk about.
  test('requires a history', async ({ request }) => {
    const res = await request.post('/api/restructure/assist', {
      headers: await authHeaders(), data: { inputs: FIXTURE_INPUTS }
    });
    expect(res.status()).toBe(400);
  });

  test('requires inputs', async ({ request }) => {
    const res = await request.post('/api/restructure/assist', {
      headers: await authHeaders(),
      data: { history: [{ role: 'user', content: 'How are we doing?' }] }
    });
    expect(res.status()).toBe(400);
  });

  test('answers without the model when the scenario will not solve', async ({ request }) => {
    // An unsolvable scenario must come back as an explanation, not as a 500 and
    // not as a question put to the provider it has no figures to answer from.
    const res = await request.post('/api/restructure/assist', {
      headers: await authHeaders(),
      data: {
        history: [{ role: 'user', content: 'How are we doing?' }],
        inputs: { poolSlots: [], squads: [] }
      }
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.reply).toContain('will not solve');
    expect(json.proposal).toBeNull();
  });
});

test.describe('GET /api/restructure/baseline', () => {
  test('returns the club picture with parsed days and durations', async ({ request }) => {
    const res = await request.get('/api/restructure/baseline', { headers: await authHeaders() });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();

    expect(json.baseline).toBeTruthy();
    expect(Array.isArray(json.baseline.squads)).toBe(true);
    expect(Array.isArray(json.baseline.sessions)).toBe(true);
    expect(Array.isArray(json.baseline.coaches)).toBe(true);
    expect(json.baseline.utilisation).toBeTruthy();

    // sessions.day_of_week is NULL on every row in this database, so a non-null
    // day here proves the name parser actually ran. A zero duration would mean
    // the fallback chain silently failed.
    json.baseline.sessions.forEach(s => {
      expect(s.day).toBeTruthy();
      expect(s.durationHours).toBeGreaterThan(0);
    });
  });

  test('ships seed inputs the solver accepts', async ({ request }) => {
    const res = await request.get('/api/restructure/baseline', { headers: await authHeaders() });
    const json = await res.json();
    expect(json.seedInputs).toBeTruthy();
    expect(Array.isArray(json.seedInputs.poolSlots)).toBe(true);
    expect(Array.isArray(json.seedInputs.squads)).toBe(true);

    const solve = await request.post('/api/restructure/solve', {
      headers: await authHeaders(), data: { inputs: json.seedInputs }
    });
    expect(solve.ok()).toBeTruthy();
    const solved = await solve.json();
    expect(solved.ok).toBe(true);
  });

  test('reports what it had to infer rather than hiding it', async ({ request }) => {
    const res = await request.get('/api/restructure/baseline', { headers: await authHeaders() });
    const json = await res.json();
    expect(Array.isArray(json.baseline.warnings)).toBe(true);
  });
});

test.describe('POST /api/restructure/solve', () => {
  test('solves a fixture and reports metrics in range', async ({ request }) => {
    const res = await request.post('/api/restructure/solve', {
      headers: await authHeaders(), data: { inputs: FIXTURE_INPUTS }
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.metrics.utilisationPct).toBeGreaterThanOrEqual(0);
    expect(json.metrics.utilisationPct).toBeLessThanOrEqual(100);
    expect(json.plan.assignments.length).toBe(2);
    expect(json.metrics.swimmersServed).toBe(16);
  });

  test('rejects a request with no inputs', async ({ request }) => {
    const res = await request.post('/api/restructure/solve', {
      headers: await authHeaders(), data: {}
    });
    expect(res.status()).toBe(400);
  });

  test('returns errors rather than a 500 for an invalid scenario', async ({ request }) => {
    const res = await request.post('/api/restructure/solve', {
      headers: await authHeaders(), data: { inputs: { poolSlots: [], squads: [] } }
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.errors.length).toBeGreaterThan(0);
  });

  test('is deterministic across calls', async ({ request }) => {
    const headers = await authHeaders();
    const a = await (await request.post('/api/restructure/solve', { headers, data: { inputs: FIXTURE_INPUTS } })).json();
    const b = await (await request.post('/api/restructure/solve', { headers, data: { inputs: FIXTURE_INPUTS } })).json();
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
    expect(a.metrics.total).toBe(b.metrics.total);
  });
});

test.describe('scenario CRUD', () => {
  test('round-trips a scenario and caches its solve', async ({ request }) => {
    const headers = await authHeaders();

    const createRes = await request.post('/api/restructure/scenarios', {
      headers, data: { name: `${THROWAWAY} round trip`, inputs: FIXTURE_INPUTS }
    });
    expect(createRes.ok()).toBeTruthy();
    const { scenario } = await createRes.json();
    created.push(scenario.id);
    expect(scenario.name).toContain(THROWAWAY);

    const getRes = await request.get(`/api/restructure/scenarios?id=${scenario.id}`, { headers });
    expect(getRes.ok()).toBeTruthy();
    expect((await getRes.json()).scenario.inputs.squads).toHaveLength(1);

    // Solving with a scenarioId should persist last_result for the list view.
    await request.post('/api/restructure/solve', {
      headers, data: { inputs: FIXTURE_INPUTS, scenarioId: scenario.id }
    });
    const listRes = await request.get('/api/restructure/scenarios', { headers });
    const row = (await listRes.json()).scenarios.find(s => s.id === scenario.id);
    expect(row).toBeTruthy();
    expect(row.summary).toBeTruthy();
    expect(row.summary.swimmersServed).toBe(16);

    const delRes = await request.delete(`/api/restructure/scenarios?id=${scenario.id}`, { headers });
    expect(delRes.ok()).toBeTruthy();
    created = created.filter(id => id !== scenario.id);

    const goneRes = await request.get(`/api/restructure/scenarios?id=${scenario.id}`, { headers });
    expect(goneRes.status()).toBe(404);
  });

  test('refuses to save structurally broken inputs', async ({ request }) => {
    // Better to fail here than in an export or a print view, where the cause is
    // far less obvious.
    const res = await request.post('/api/restructure/scenarios', {
      headers: await authHeaders(),
      data: {
        name: `${THROWAWAY} broken`,
        inputs: { ...FIXTURE_INPUTS, poolSlots: [{ ...FIXTURE_INPUTS.poolSlots[0], endTime: '17:00' }] }
      }
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.details.join(' ')).toContain('ends at or before it starts');
  });

  test('requires a name', async ({ request }) => {
    const res = await request.post('/api/restructure/scenarios', {
      headers: await authHeaders(), data: { name: '  ', inputs: FIXTURE_INPUTS }
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('POST /api/restructure/suggest', () => {
  test('returns ranked candidate structures', async ({ request }) => {
    const res = await request.post('/api/restructure/suggest', {
      headers: await authHeaders(),
      data: { inputs: FIXTURE_INPUTS, options: { minSquads: 3, maxSquads: 4, topN: 3 } }
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json.suggestions)).toBe(true);
    for (let i = 1; i < json.suggestions.length; i++) {
      expect(json.suggestions[i - 1].total).toBeGreaterThanOrEqual(json.suggestions[i].total);
    }
  });

  test('rejects a request with no inputs', async ({ request }) => {
    const res = await request.post('/api/restructure/suggest', {
      headers: await authHeaders(), data: {}
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('GET /api/restructure/coach-roster', () => {
  test('returns the shared roster', async ({ request }) => {
    const res = await request.get('/api/restructure/coach-roster', { headers: await authHeaders() });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json.coaches)).toBe(true);
  });

  test('refuses an invalid roster rather than half-writing it', async ({ request }) => {
    const res = await request.post('/api/restructure/coach-roster', {
      headers: await authHeaders(),
      data: { coaches: [{ name: '', availability: [] }] }
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('POST /api/export-restructure', () => {
  test('produces a workbook from inputs', async ({ request }) => {
    const res = await request.post('/api/export-restructure', {
      headers: await authHeaders(), data: { inputs: FIXTURE_INPUTS, name: `${THROWAWAY} export` }
    });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('spreadsheetml');
    const body = await res.body();
    expect(body.length).toBeGreaterThan(5000);
    // XLSX files are zip archives — check the magic bytes rather than trusting
    // the header alone.
    expect(body.slice(0, 2).toString('utf8')).toBe('PK');
  });

  test('rejects an invalid scenario', async ({ request }) => {
    const res = await request.post('/api/export-restructure', {
      headers: await authHeaders(), data: { inputs: { poolSlots: [], squads: [] } }
    });
    expect(res.status()).toBe(400);
  });

  test('404s for a scenario that does not exist', async ({ request }) => {
    const res = await request.post('/api/export-restructure', {
      headers: await authHeaders(),
      data: { scenarioId: '00000000-0000-0000-0000-000000000000' }
    });
    expect(res.status()).toBe(404);
  });
});
