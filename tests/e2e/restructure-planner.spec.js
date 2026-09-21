// E2E for the restructuring planner.
//
// This page had no e2e coverage at all, which is exactly why a bug where NO TAB
// EVER RENDERED ITS HEADING survived for as long as it did: `Section` only
// emitted its <h2> when a `show` prop was truthy, and every interactive call
// site passed `show={isPrint}`. Nothing was watching.
//
// So the tests here are mostly about what the page structurally is, rather than
// about any single figure.
import { test, expect } from '@playwright/test';

const PATH = '/restructure';
const TAB_LABELS = ['The Plan', 'The Club Today', 'Build the Plan', 'Compare'];

async function open(page, path = PATH) {
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
  return jsErrors;
}

/**
 * Headings, matched exactly.
 *
 * Playwright's `hasText` is a case-insensitive *contains*, and "The Plan" is a
 * substring of "Build the Plan" — so a loose match counts two headings where
 * there is one.
 */
function heading(page, label) {
  return page.locator('h2.section-title')
    .filter({ hasText: new RegExp(`^${label}$`) });
}

test.describe('the planner', () => {
  test('loads authenticated, with four tabs and no uncaught errors', async ({ page }) => {
    const jsErrors = await open(page);
    expect(page.url()).toContain(PATH);
    expect(jsErrors, 'uncaught JS errors').toHaveLength(0);

    const tabs = page.locator('.period-btn-premium');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('The Plan');
  });

  test('every tab shows a heading', async ({ page }) => {
    // The direct regression test. Before this change the interactive app showed
    // an unlabelled slab of content under the tab bar on all nine tabs.
    await open(page);
    for (const label of TAB_LABELS) {
      await page.getByRole('button', { name: label, exact: true }).click();
      const h = page.locator('h2.section-title').first();
      await expect(h, `${label} has no visible heading`).toBeVisible();
      await expect(h).toHaveText(label);
    }
  });

  test('UNSAVED appears once, not four times', async ({ page }) => {
    // It used to be able to show in the scenario bar, the verdict card, the
    // model card and a comparison column name simultaneously.
    await open(page);
    await page.locator('.rp-name').fill('Throwaway e2e name');
    await expect(page.getByText('UNSAVED', { exact: true })).toHaveCount(1);
  });

  test('Build is a numbered path, with the first four steps open', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Build the Plan', exact: true }).click();

    const steps = page.locator('details.rp-subsection');
    await expect(steps).toHaveCount(7);
    // 1–4 are the path and open; 5–7 are the fine print and closed.
    for (let i = 0; i < 4; i++) {
      await expect(steps.nth(i)).toHaveAttribute('open', '');
    }
    for (let i = 4; i < 7; i++) {
      await expect(steps.nth(i)).not.toHaveAttribute('open', '');
    }
  });

  test('a term opens its meaning on click and closes on Escape', async ({ page }) => {
    await open(page);
    const term = page.locator('button.term').first();
    await expect(term).toBeVisible();

    await term.click();
    await expect(page.locator('[role="tooltip"]').first()).toBeVisible();
    await expect(term).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
  });

  test('a term is reachable and openable from the keyboard', async ({ page }) => {
    // A hover-only tooltip is unreachable by keyboard and invisible on the
    // tablet a committee member will actually open this on.
    await open(page);
    await page.locator('button.term').first().focus();
    await expect(page.locator('[role="tooltip"]').first()).toBeVisible();
  });

  test('the print view carries every heading, with Build fully expanded', async ({ page }) => {
    const jsErrors = await open(page, `${PATH}?view=print&printTheme=light`);
    expect(jsErrors, 'print view threw').toHaveLength(0);

    for (const label of TAB_LABELS) {
      await expect(heading(page, label), `${label} missing from print`).toHaveCount(1);
    }

    // A <details> that is closed when Puppeteer prints loses its content from
    // the PDF entirely, so every step has to be open in print.
    const steps = page.locator('details.rp-subsection');
    const n = await steps.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(steps.nth(i), `print step ${i + 1} is collapsed`).toHaveAttribute('open', '');
    }

    // And the glossary appendix, since the hover cards cannot travel into a PDF.
    await expect(heading(page, 'What these words mean')).toHaveCount(1);
  });

  test('the printed plan is the proposal, not the club timetable', async ({ page }) => {
    // The old timetable component defaulted its view to "current" whenever a
    // baseline existed, and print cannot set React state — so every PDF showed
    // the club's existing week under a heading that meant the proposal. Each
    // week now renders only itself, under its own heading.
    await open(page, `${PATH}?view=print&printTheme=light`);

    const plan = page.locator('section').filter({ has: heading(page, 'The Plan') });
    const today = page.locator('section').filter({ has: heading(page, 'The Club Today') });

    await expect(plan.locator('.wv-grid, .wv-list-wrap').first()).toBeVisible();
    await expect(today.locator('.wv-grid, .wv-list-wrap').first()).toBeVisible();

    // The two weeks must not be the same rendering: only the club's own week
    // carries measured attendance.
    await expect(today.locator('.wv-pct').first()).toBeVisible();
    await expect(plan.locator('.wv-pct')).toHaveCount(0);
  });
});
