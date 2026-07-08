// Contract layer 4: requireAdminAuth routes must return 403 for a plain coach.
import { test, expect } from '@playwright/test';
import { authHeaders } from '../helpers/auth';

const ADMIN_ROUTES = [
  ['/api/invite-coach', 'POST'],
  ['/api/delete-coach', 'POST'],
  ['/api/update-coach-password', 'POST'],
  ['/api/assign-coach', 'POST'],
  ['/api/update-squad', 'POST'],
  ['/api/delete-issue', 'POST'],
  ['/api/prompts/save', 'POST'],
  ['/api/prompts/rollback', 'POST'],
  ['/api/ai/sandbox', 'POST'],
  ['/api/ai/refine-prompt', 'POST'],
];

for (const [route, method] of ADMIN_ROUTES) {
  test(`coach role gets 403 from ${route}`, async ({ request }) => {
    const res = await request.fetch(route, {
      method,
      headers: authHeaders('coach'),
      data: {},
    });
    expect(res.status(), `${route} must be admin-only`).toBe(403);
  });
}

test('coach role CAN read normal routes (200)', async ({ request }) => {
  const res = await request.get('/api/get-issues', { headers: authHeaders('coach') });
  expect(res.status()).toBe(200);
});
