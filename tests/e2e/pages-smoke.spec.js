// E2E smoke: every page renders authenticated with no uncaught JS errors and
// no failed same-origin requests. Uses the admin storageState from global-setup.
import { test, expect } from '@playwright/test';
import { getServiceClient } from '../helpers/supabase';

const STATIC_PAGES = [
  '/dashboard',
  '/swimmers',
  '/meets',
  '/squads',
  '/capacity',
  '/predictor',
  '/reports',
  '/settings',
  '/feedback',
  '/sandbox/coacheseye',
  '/restructure',
];

async function visitAndCheck(page, path) {
  const jsErrors = [];
  const consoleErrors = [];
  const badResponses = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('response', res => {
    const url = res.url();
    if (res.status() >= 500 && url.includes('localhost')) badResponses.push(`${res.status()} ${url}`);
  });

  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});

  // still on the page (not bounced to /login) and something rendered
  expect(page.url(), `${path} redirected — auth broken?`).toContain(path.split('?')[0]);
  const text = await page.locator('body').innerText();
  expect(text.trim().length, `${path} rendered an empty body`).toBeGreaterThan(50);

  expect(jsErrors, `${path} threw uncaught JS errors`).toHaveLength(0);
  expect(badResponses, `${path} triggered 5xx API calls`).toHaveLength(0);
  return { consoleErrors, text };
}

for (const path of STATIC_PAGES) {
  test(`page ${path} loads clean`, async ({ page }) => {
    test.setTimeout(180_000);
    const { consoleErrors } = await visitAndCheck(page, path);
    // console.error noise is reported but only fails if it looks like a data fetch blew up
    const fatal = consoleErrors.filter(t => /supabase|fetch failed|500|uncaught/i.test(t));
    expect(fatal, `${path} console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);
  });
}

test('dynamic pages: swimmer, squad, meet detail load clean', async ({ page }) => {
  test.setTimeout(300_000);
  const supabase = getServiceClient();

  const { data: r } = await supabase.from('results').select('swimmer_id, meet_id').limit(1);
  const { data: sq } = await supabase.from('squads').select('id').eq('is_squad', true).limit(1);
  test.skip(!r?.length || !sq?.length, 'DB missing results or squads');

  await visitAndCheck(page, `/swimmer/${r[0].swimmer_id}`);
  await visitAndCheck(page, `/squad/${sq[0].id}`);
  await visitAndCheck(page, `/meet/${r[0].meet_id}`);
});

test('unauthenticated visit to /dashboard redirects to login', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/login|\/$/, { timeout: 30_000 });
  await ctx.close();
});

test('landing page renders for anonymous visitors', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const text = await page.locator('body').innerText();
  expect(text.length).toBeGreaterThan(100);
  await ctx.close();
});

test('password login flow works end-to-end', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/login', { waitUntil: 'networkidle' });

  // switch to password mode if the toggle exists
  const toggle = page.getByText(/password/i).first();
  if (await toggle.isVisible().catch(() => false)) await toggle.click().catch(() => {});

  await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL);
  await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD);
  await page.locator('button[type="submit"], form button').last().click();
  await page.waitForURL(/dashboard/, { timeout: 60_000 });
  await ctx.close();
});
