// Contract layer 1: every API route must reject unauthenticated requests (401)
// and unsupported methods (405). Covers all 39 routes.
import { test, expect } from '@playwright/test';

// [route, allowed method used for the 401 probe]
const ROUTES = [
  ['/api/ai/analyze', 'POST'],
  ['/api/ai/chat', 'POST'],
  ['/api/ai/feedback', 'POST'],
  ['/api/ai/gala-engine-v2', 'POST'],
  ['/api/ai/refine-prompt', 'POST'],
  ['/api/ai/sandbox', 'POST'],
  ['/api/ai/scrape-gala-url', 'POST'],
  ['/api/assign-coach', 'POST'],
  ['/api/delete-coach', 'POST'],
  ['/api/delete-issue', 'POST'],
  ['/api/detect-missing-sessions', 'POST'],
  ['/api/download-report?file=x.pdf', 'GET'],
  ['/api/export-report', 'POST'],
  ['/api/export/meet-word?meetId=x', 'GET'],
  ['/api/generate-pdf', 'POST'],
  ['/api/get-issues', 'GET'],
  ['/api/import-attendance', 'POST'],
  ['/api/import-join-dates', 'POST'],
  ['/api/invite-coach', 'POST'],
  ['/api/log-issue', 'POST'],
  ['/api/memberships', 'GET'],
  ['/api/parse-pdf', 'POST'],
  ['/api/prompts/history?facet=training', 'GET'],
  ['/api/prompts/load?facet=training', 'GET'],
  ['/api/prompts/rollback', 'POST'],
  ['/api/prompts/save', 'POST'],
  ['/api/reconcile-pbs', 'POST'],
  ['/api/reports', 'GET'],
  ['/api/scrape-meets', 'POST'],
  ['/api/scrape-rankings', 'POST'],
  // sync-attendance previously bypassed auth on localhost (started a real SCM
  // sync when probed). Fixed: only the CRON_SECRET path bypasses now, so the
  // anonymous probe correctly returns 401.
  ['/api/sync-attendance', 'POST'],
  ['/api/sync-join-dates', 'GET'],
  ['/api/sync-pbs', 'POST'],
  ['/api/sync-scm', 'POST'],
  ['/api/sync-session-memberships', 'POST'],
  ['/api/update-coach-password', 'POST'],
  ['/api/update-squad', 'POST'],
  ['/api/upload-meet-photo', 'POST'],
  ['/api/upvote-issue', 'POST'],
];

test.describe('401 without a token', () => {
  for (const [route, method] of ROUTES) {
    test(`${method} ${route}`, async ({ request }) => {
      const res = await request.fetch(route, { method, data: {} });
      expect(res.status(), `${route} must 401 for anonymous callers`).toBe(401);
    });
  }
});

test.describe('405 on unsupported method', () => {
  for (const [route] of ROUTES) {
    test(`PATCH ${route}`, async ({ request }) => {
      const res = await request.fetch(route, { method: 'PATCH', data: {} });
      expect(res.status(), `${route} should reject PATCH with 405`).toBe(405);
    });
  }
});
