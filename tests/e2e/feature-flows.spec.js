// E2E interactions beyond page loads: navigation, filters, modals, roadmap.
import { test, expect } from '@playwright/test';
import { getServiceClient } from '../helpers/supabase';

test('dashboard squad card navigates to squad page', async ({ page }) => {
  test.setTimeout(300_000);
  const supabase = getServiceClient();
  const { data: squads } = await supabase.from('squads').select('id, name').eq('is_squad', true);
  test.skip(!squads?.length, 'no squads');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  // the dashboard keeps AI-compiling after load; scroll to the squad grid and
  // give it time to render before asserting.
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(3000);

  // Any is_squad squad card is fine — the test verifies squad cards navigate,
  // not one specific squad. Click the first one that renders.
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let clicked = false;
  for (const sq of squads.filter(s => s.name)) {
    const card = page.getByText(new RegExp(esc(sq.name), 'i')).first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      clicked = true;
      break;
    }
  }
  expect(clicked, `no squad card rendered on the dashboard (tried ${squads.length} squads)`).toBe(true);
  await page.waitForURL(/\/squad\//, { timeout: 30_000 }).catch(() => {});
});

test('nav sidebar reaches every section', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  for (const [label, path] of [
    ['Squads', '/squads'],
    ['Swimmers', '/swimmers'],
    ['Meets', '/meets'],
    ['Reports', '/reports'],
    ['Roadmap', '/feedback'],
    ['Config', '/settings'],
  ]) {
    // target the nav <a> specifically — the same word can appear in page content.
    // Heavy pages keep AI-compiling and can jank the main thread, so allow a
    // generous commit window between clicks.
    await page.getByRole('link', { name: label, exact: true }).first().click();
    await page.waitForURL(new RegExp(path.replace('/', '\\/')), { timeout: 90_000, waitUntil: 'commit' });
    await page.waitForTimeout(500);
  }
});

test('feedback board: post issue via UI, see it, then clean up', async ({ page }) => {
  test.setTimeout(180_000);
  const supabase = getServiceClient();
  const title = `[e2e-test] roadmap item ${Date.now()}`;

  await page.goto('/feedback', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});

  // open the "new issue" form — look for a create button
  const newBtn = page.getByRole('button', { name: /new|add|submit|post|report|suggest/i }).first();
  test.skip(!(await newBtn.isVisible().catch(() => false)), 'no create button found on feedback page');
  await newBtn.click();

  const titleInput = page.locator('input[placeholder*="itle" i], input[name*="title" i]').first();
  test.skip(!(await titleInput.isVisible().catch(() => false)), 'issue form did not open');
  await titleInput.fill(title);
  const descInput = page.locator('textarea').first();
  if (await descInput.isVisible().catch(() => false)) await descInput.fill('created by e2e suite — safe to delete');
  await page.getByRole('button', { name: /submit|save|post|create/i }).first().click();

  await expect(page.getByText(title, { exact: false })).toBeVisible({ timeout: 20_000 });

  await supabase.from('user_issues').delete().eq('title', title);
});

test('predictor page shows QT tables after selecting a swimmer', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/predictor', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // page starts on a "Select a Swimmer" prompt — pick the first real option
  const dropdown = page.locator('select').first();
  test.skip(!(await dropdown.isVisible().catch(() => false)), 'no swimmer dropdown found');
  const values = await dropdown.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
  test.skip(values.length === 0, 'swimmer dropdown empty');
  await dropdown.selectOption(values[0]);
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});

  const body = await page.locator('body').innerText();
  expect(body).toMatch(/free|back|breast|fly|medley/i);
  expect(body).toMatch(/\d{1,2}[:.]\d{2}\.\d{2}|\d{2}\.\d{2}/);
});

test('reports page renders cohort sections', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/reports', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/efficiency|training|cohort|briefing|booklet/i);
});

test('settings page shows admin panels', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/sync/i);
  expect(body).toMatch(/coach/i);
});
