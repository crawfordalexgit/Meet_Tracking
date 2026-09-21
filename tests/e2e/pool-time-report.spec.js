import { test, expect } from '@playwright/test';

/**
 * The pool time report, as it will be printed.
 *
 * /capacity carries seven tabs of working; the report is three things — the
 * cover, the squad cards and the week laid out by day. The PDF is produced by
 * Puppeteer re-visiting this page with report=poolTime and printing it, so
 * whether the report is right comes down to what the print stylesheet leaves
 * standing. Emulating print media checks exactly that, without the cost of
 * running Chromium twice.
 *
 * The failure this guards against is silent: a report that quietly carries the
 * heatmap, every session breakdown and a swimmer list is still a valid PDF, and
 * nobody notices until it is being handed round a committee table.
 */
const REPORT_URL = '/capacity?tab=heatmap&report=poolTime&printTheme=light';

test.describe('the pool time report', () => {
  test('prints the cover, the cards and the by-day table, and nothing else', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(REPORT_URL);
    await expect(page.getByText('All Squads — Capacity Overview')).toBeVisible();
    await expect(page.getByText('Pool time by day')).toBeVisible();

    await page.emulateMedia({ media: 'print' });

    // What the report is for.
    await expect(page.locator('.pool-time-table')).toBeVisible();
    await expect(page.locator('.pool-time-cards')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pool Time/ })).toBeVisible();

    // What it must not carry.
    const hidden = page.locator('.pool-time-hide-in-report');
    const count = await hidden.count();
    expect(count, 'sections marked to be left out of the report').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(hidden.nth(i)).toBeHidden();
    }
    await expect(page.locator('#detailed-sessions-breakdown')).toBeHidden();

    // The button that builds the PDF must not appear inside it.
    await expect(page.getByRole('button', { name: /Pool Time Report/ })).toBeHidden();

    console.log('console errors:', JSON.stringify(errors));
    expect(errors.filter(e => !/favicon|404/i.test(e))).toEqual([]);
  });

  test('every squad with water appears, with a weekly total', async ({ page }) => {
    await page.goto(REPORT_URL);
    await expect(page.getByText('Pool time by day')).toBeVisible();

    const rows = page.locator('.pool-time-table tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count(), 'one row per squad').toBeGreaterThan(3);

    // Seven weekday columns, a total and a days column.
    const headers = page.locator('.pool-time-table thead th');
    expect(await headers.count()).toBe(10);
    await expect(headers.nth(1)).toHaveText('Mon');
    await expect(headers.nth(7)).toHaveText('Sun');

    // The club total row is what a reader checks the squads against.
    await expect(page.locator('.pool-time-table tfoot')).toContainText('All squads');
    await expect(page.locator('.pool-time-table tfoot')).toContainText('h');
  });

  test('the ordinary page still shows everything', async ({ page }) => {
    // The report hides sections by name; without report=poolTime nothing may be
    // missing, or the flag would be quietly degrading the page it prints from.
    await page.goto('/capacity?tab=heatmap');
    await expect(page.getByText('All Squads — Capacity Overview')).toBeVisible();
    await expect(page.locator('#detailed-sessions-breakdown')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pool Time Report/ })).toBeVisible();
  });
});
