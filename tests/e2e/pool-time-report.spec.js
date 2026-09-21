import { test, expect } from '@playwright/test';

/**
 * The pool time report, as it will be printed.
 *
 * The PDF is produced by Puppeteer re-visiting /capacity with report=poolTime
 * and printing it, so whether the report is right comes down to what the print
 * stylesheet leaves standing. Emulating print media checks exactly that,
 * without the cost of running Chromium twice.
 *
 * The report is the whole capacity view, not a summary of it: the cover, the
 * club figures, the squad cards, the week by day, the heatmap and every
 * session breakdown. It began as three sections on a white background, which
 * was wrong twice over — the page is read dark, and the colour carries meaning
 * a reader uses before they read a number.
 */
const REPORT_URL = '/capacity?tab=heatmap&report=poolTime&printTheme=dark';

test.describe('the pool time report', () => {
  test('prints every part of the capacity view', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(REPORT_URL);
    await expect(page.getByText('All Squads — Capacity Overview')).toBeVisible();
    await page.emulateMedia({ media: 'print' });

    // The cover.
    await expect(page.getByRole('heading', { name: /Pool Time/ })).toBeVisible();

    // Everything the page holds about capacity, not just the overview.
    await expect(page.locator('.pool-time-cards')).toBeVisible();
    await expect(page.locator('.pool-time-table')).toBeVisible();
    await expect(page.locator('#detailed-sessions-breakdown')).toBeVisible();
    await expect(page.getByText('Detailed Session Breakdowns')).toBeVisible();
    await expect(page.getByText('Average Club Occupancy')).toBeVisible();

    // Controls are not data and must not appear in a printed report.
    await expect(page.getByRole('button', { name: /Pool Time Report/ })).toBeHidden();

    console.log('console errors:', JSON.stringify(errors));
    expect(errors.filter(e => !/favicon|404/i.test(e))).toEqual([]);
  });

  test('prints dark, because the colours carry meaning', async ({ page }) => {
    await page.goto(REPORT_URL);
    await page.emulateMedia({ media: 'print' });

    const bg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor);
    // Anything near white would lose the rose, amber and cyan the page uses to
    // say over capacity, nearly full, and has water.
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    console.log('print background:', bg);
    expect(r + g + b, 'a dark background').toBeLessThan(200);
  });

  test('every squad with water appears, with a weekly total', async ({ page }) => {
    await page.goto(REPORT_URL);
    await expect(page.getByText('Pool time by day')).toBeVisible();

    const rows = page.locator('.pool-time-table tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count(), 'one row per squad').toBeGreaterThan(3);

    const headers = page.locator('.pool-time-table thead th');
    expect(await headers.count()).toBe(10);
    await expect(headers.nth(1)).toHaveText('Mon');
    await expect(headers.nth(7)).toHaveText('Sun');

    await expect(page.locator('.pool-time-table tfoot')).toContainText('All squads');
  });

  test('the ordinary page is unchanged by the report flag', async ({ page }) => {
    // The flag only adds a cover and re-lays the print view; without it the
    // page must look exactly as it always did.
    await page.goto('/capacity?tab=heatmap');
    await expect(page.getByText('All Squads — Capacity Overview')).toBeVisible();
    await expect(page.locator('#detailed-sessions-breakdown')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pool Time Report/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pool Time$/ })).toBeHidden();
  });
});
