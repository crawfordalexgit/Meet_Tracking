import { test, expect } from '@playwright/test';

/**
 * The ghost report, as somebody about to take a swimmer's place away reads it.
 *
 * The list was a single flat table of names. Half of this club's entries were
 * on sessions whose register was never taken, where the absence says nothing
 * about the swimmer at all — so the thing the page has to get right is the
 * separation between what can be acted on and what cannot.
 */
test.describe('ghost allocations', () => {
  test('loads clean and separates what can be reclaimed from what cannot', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/ghosts?days=180');
    await expect(page.getByText('Squad by squad')).toBeVisible();

    // Both phrases repeat on the squad cards below, so anchor on the figures.
    await expect(page.getByText('Places to reclaim').first()).toBeVisible();
    await expect(page.getByText('Register cannot say').first()).toBeVisible();

    const reclaim = await page.locator('.glass-card')
      .filter({ hasText: 'Places to reclaim' }).first().textContent();
    const cannot = await page.locator('.glass-card')
      .filter({ hasText: 'Register cannot say' }).first().textContent();
    console.log('reclaimable:', reclaim.trim(), '| unverifiable:', cannot.trim());

    expect(errors.filter(e => !/favicon|404/i.test(e))).toEqual([]);
  });

  test('a squad opens to show its names, and is shut by default', async ({ page }) => {
    // The names are an accusation. They should take a deliberate click.
    await page.goto('/ghosts?days=180');
    await expect(page.getByText('Every allocation')).toBeVisible();

    const squads = page.locator('.ghost-squad');
    await expect(squads.first()).toBeVisible();
    expect(await page.locator('.ghost-rows').count(), 'shut on arrival').toBe(0);

    await squads.first().locator('h3').first().click();
    await expect(page.locator('.ghost-rows').first()).toBeVisible();
  });

  test('every row says what the register can and cannot confirm', async ({ page }) => {
    await page.goto('/ghosts?days=180');
    await expect(page.getByText('Every allocation')).toBeVisible();
    await page.locator('.ghost-squad').first().locator('h3').first().click();

    const row = page.locator('.ghost-rows .glass-card').first();
    await expect(row).toBeVisible();
    const text = await row.textContent();
    expect(text).toMatch(/Place can be reclaimed|Register cannot confirm|No register to judge by/);
  });

  test('the window follows the period asked for', async ({ page }) => {
    await page.goto('/ghosts?days=30');
    await expect(page.getByText('Squad by squad')).toBeVisible();
    await expect(page.getByText(/A swimmer counts as having used their place/)).toBeVisible();
  });

  test('printing adds a cover, opens every squad and drops the controls', async ({ page }) => {
    await page.goto('/ghosts?report=ghosts&days=180');
    await expect(page.getByText('Squad by squad')).toBeVisible();
    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('.ghost-cover')).toBeVisible();
    // The cover's title and the page's own heading both match.
    await expect(page.locator('.ghost-cover').getByRole('heading', { name: 'Ghost Allocations' })).toBeVisible();

    // Paper cannot be clicked, so every squad's names must already be there.
    expect(await page.locator('.ghost-rows').count()).toBeGreaterThan(0);
    expect(await page.getByRole('button', { name: /Report/ }).count()).toBe(0);

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r + g + b, 'printed dark, like the other reports').toBeLessThan(200);
  });
});
