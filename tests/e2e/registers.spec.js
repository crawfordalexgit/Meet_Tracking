import { test, expect } from '@playwright/test';

/**
 * The register check.
 *
 * A register that was never taken looks exactly like a session nobody attends,
 * so the page's job is to name the sessions whose numbers should not be
 * trusted — and to say how many are fine, because five findings with no
 * denominator read as a broken club.
 */
test.describe('the register check', () => {
  test('loads clean and reports both the flagged and the fine', async ({ page }) => {
    const errors = [];
    const bad = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url()}`); });

    test.setTimeout(120000);
    await page.goto('/registers');
    await expect(page.getByRole('heading', { name: 'Register Check' })).toBeVisible();
    await expect(page.getByText('Sessions flagged', { exact: true })).toBeVisible();
    await expect(page.getByText(/look fine/).first()).toBeVisible();
    await expect(page.getByText('Session by session')).toBeVisible();

    // The window has to be stated; every figure on the page depends on it.
    await expect(page.getByText(/\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/).first()).toBeVisible();

    expect(bad, 'no 5xx').toEqual([]);
    expect(errors.filter(e => !/favicon|404/i.test(e))).toEqual([]);
  });

  test('every flagged session says which night it was last taken', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/registers');
    await expect(page.getByText('Session by session')).toBeVisible();
    const rows = page.locator('.reg-row');
    if (await rows.count() === 0) test.skip(true, 'nothing flagged, nothing to check');
    await expect(rows.first()).toContainText(/taken \d+ of \d+ nights/);
    await expect(rows.first()).toContainText(/last \d{4}-\d{2}-\d{2}|never taken/);
  });

  test('the window follows the period asked for', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/registers?days=30');
    await expect(page.getByRole('heading', { name: 'Register Check' })).toBeVisible();
    await expect(page.getByText('Sessions flagged', { exact: true })).toBeVisible();
    const thirty = await page.getByText(/\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/).first().textContent();

    test.setTimeout(120000);
    await page.goto('/registers?days=365');
    await expect(page.getByText('Sessions flagged', { exact: true })).toBeVisible();
    const year = await page.getByText(/\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/).first().textContent();

    expect(year, 'a different window reads differently').not.toBe(thirty);
  });

  test('printing adds a cover and drops the controls', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/registers?report=registers&days=90');
    await expect(page.getByText('Session by session')).toBeVisible({ timeout: 60000 });
    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('.reg-cover')).toBeVisible();
    await expect(page.getByRole('button', { name: /Report/ })).toBeHidden();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r + g + b, 'prints dark, like the interface').toBeLessThan(200);
  });
});

test.describe('opening a finding', () => {
  test('a flagged session opens to show every night it ran', async ({ page }) => {
    test.setTimeout(120000);
    // "Taken on 3 of 13" is a claim; the thirteen dates are the evidence.
    await page.goto('/registers?days=90');
    await expect(page.getByText('Session by session')).toBeVisible({ timeout: 60000 });

    const row = page.locator('.reg-row').first();
    await expect(row.locator('.reg-nights')).toHaveCount(0);

    await row.click();
    const nights = row.locator('.reg-nights');
    await expect(nights).toBeVisible();
    await expect(nights).toContainText('Every night it ran');
    // Each night is a dated chip, either a register or a gap.
    await expect(nights.getByText(/^\d{2}-\d{2} · /).first()).toBeVisible();

    await row.click();
    await expect(row.locator('.reg-nights')).toHaveCount(0);
  });

  test('the printed report opens every finding, because paper cannot be clicked', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/registers?report=registers&days=90');
    await expect(page.getByText('Session by session')).toBeVisible({ timeout: 60000 });
    const rows = page.locator('.reg-row');
    if (await rows.count() === 0) test.skip(true, 'nothing flagged');
    await expect(rows.first().locator('.reg-nights')).toBeVisible();
  });
});

test.describe('grouped by squad', () => {
  test('a card per squad, and the session list under squad headings', async ({ page }) => {
    test.setTimeout(120000);
    // Fifty-two sessions worst-first is a list to work through; the same
    // fifty-two under squad headings is a page somebody can scan.
    await page.goto('/registers?days=90');
    await expect(page.getByText('Squad by squad')).toBeVisible({ timeout: 60000 });

    const groups = page.locator('.reg-squad');
    expect(await groups.count(), 'the flagged sessions sit under squad headings').toBeGreaterThan(1);

    // Each heading is readable without the rows beneath it.
    await expect(groups.first()).toContainText(/\d+ of \d+ sessions · \d+ of \d+ registers/);
    // Every flagged row belongs to exactly one squad group.
    const inGroups = await page.locator('.reg-squad .reg-row').count();
    const all = await page.locator('.reg-row').count();
    expect(inGroups).toBe(all);
  });

  test('squads with the most wrong come first', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/registers?days=90');
    await expect(page.getByText('Squad by squad')).toBeVisible({ timeout: 60000 });
    const first = await page.locator('.reg-squad').first().innerText();
    const last = await page.locator('.reg-squad').last().innerText();
    const flagged = t => Number(t.match(/(\d+) of \d+ sessions/)[1]);
    expect(flagged(first)).toBeGreaterThanOrEqual(flagged(last));
  });
});

test.describe('a pool the club did not have', () => {
  /**
   * The town pool went for ten days in September and training carried on
   * everywhere else. A coach whose water was gone has nothing to answer for,
   * and the report has to say so before it lists anything — otherwise the
   * first thing they read is their own name against a missing register.
   */
  test('the closure is named before any finding', async ({ page }) => {
    await page.goto('/registers?days=180');
    await expect(page.getByText('Squad by squad')).toBeVisible();

    const banner = page.locator('h2.section-title').filter({ hasText: 'Pools the club did not have' });
    await expect(banner).toBeVisible();

    const headings = await page.locator('h2.section-title').allTextContents();
    expect(headings[0], 'the closure comes first').toBe('Pools the club did not have');

    const cards = banner.locator('xpath=following-sibling::div');
    const text = (await cards.allTextContents()).join(' ');
    expect(text).toContain('Tonbridge Town Pool');
    expect(text).toContain('No register is owed for those nights and no swimmer is counted absent');
  });

  test('each affected session carries the reason on its own line', async ({ page }) => {
    // A coach reads their own row, not the banner above it.
    await page.goto('/registers?days=180');
    await expect(page.getByText('Squad by squad')).toBeVisible();
    expect(await page.getByText('Pool closed', { exact: true }).count()).toBeGreaterThan(0);
  });

  test('the printed report keeps the closure and drops the controls', async ({ page }) => {
    await page.goto('/registers?report=registers&days=180&printTheme=dark');
    await expect(page.getByText('Squad by squad')).toBeVisible();
    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('h2.section-title').filter({ hasText: 'Pools the club did not have' })).toBeVisible();
    expect(await page.getByText('Pool closed', { exact: true }).count()).toBeGreaterThan(0);
    expect(await page.getByRole('button', { name: /Report|PDF/ }).count()).toBe(0);

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r + g + b, 'printed dark, like the rest of the reports').toBeLessThan(200);
  });
});
