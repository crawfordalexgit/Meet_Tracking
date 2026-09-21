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

test.describe('the report says what it was measured over', () => {
  /** The bands are print-only, so what matters is how they compute under print. */
  const bandsUnderPrint = page => page.evaluate(() =>
    Array.from(document.querySelectorAll('.print-only'))
      .filter(el => /Attendance over the last/.test(el.textContent || ''))
      .map(el => ({ text: el.textContent.trim(), display: getComputedStyle(el).display })));

  test('the cover states the window, its dates and what does not move with it', async ({ page }) => {
    // "48% attended" is unreadable without knowing 48% of what, over how long.
    await page.goto('/capacity?tab=heatmap&report=poolTime&printTheme=dark&periodDays=90');
    await expect(page.getByText('All Squads — Capacity Overview')).toBeVisible();
    await page.emulateMedia({ media: 'print' });

    const cover = page.locator('.roster-cover-page').first();
    await expect(cover).toContainText('Attendance measured over 90 days');
    await expect(cover).toContainText('about 13 weeks of registers');
    // en-GB abbreviates September to four letters, so allow 3-5.
    await expect(cover).toContainText(/\d{1,2} \w{3,5} \d{4} to \d{1,2} \w{3,5} \d{4}/);
    // Lanes and places are the timetable as it stands, not a measurement.
    await expect(cover).toContainText('do not move with that window');
  });

  test('the window is repeated where the report breaks to a new page', async ({ page }) => {
    // A reader who opens at the session breakdowns must not find attendance
    // figures with no period attached to them.
    await page.goto('/capacity?tab=heatmap&report=poolTime&printTheme=dark&periodDays=30');
    await expect(page.getByText('All Squads — Capacity Overview')).toBeVisible();
    await page.emulateMedia({ media: 'print' });

    const bands = await bandsUnderPrint(page);
    expect(bands.length, 'one band per page break').toBeGreaterThan(1);
    bands.forEach(b => {
      expect(b.display, 'band shown when printing').not.toBe('none');
      expect(b.text).toContain('Attendance over the last 30 days');
    });
  });

  test('the window follows the period asked for', async ({ page }) => {
    await page.goto('/capacity?tab=heatmap&report=poolTime&printTheme=dark&periodDays=180');
    await expect(page.getByText('All Squads — Capacity Overview')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.roster-cover-page').first())
      .toContainText('Attendance measured over 180 days');
    const bands = await bandsUnderPrint(page);
    expect(bands[0].text).toContain('Attendance over the last 180 days');
  });

  test('the bands stay off the screen', async ({ page }) => {
    await page.goto('/capacity?tab=heatmap&report=poolTime&printTheme=dark');
    await expect(page.getByText('All Squads — Capacity Overview')).toBeVisible();
    const bands = await bandsUnderPrint(page);
    expect(bands.length).toBeGreaterThan(1);
    bands.forEach(b => expect(b.display, 'hidden on screen').toBe('none'));
  });
});
