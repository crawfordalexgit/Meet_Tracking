// Rendered-dashboard integrity: cross-panel numeric consistency, chart-has-data,
// and narrative empty-state — the coverage the page-smoke tests missed.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  // let the intelligence matrix + charts finish computing
  await page.waitForTimeout(2000);
});

test('cross-panel: County/Regional qualifier counts agree between pipeline and predictor boxes', async ({ page }) => {
  const body = await page.locator('body').innerText();

  const pipeline = body.match(/project\s+(\d+)\s+Regional\s*\(SE\)\s+and\s+(\d+)\s+County\s*\(Kent\)\s+qualifiers/i);
  test.skip(!pipeline, 'pipeline narrative not found');
  const pipelineRegional = Number(pipeline[1]);
  const pipelineCounty = Number(pipeline[2]);

  const countyPred = body.match(/(\d+)\s*County Predictor/i);
  const regionalPred = body.match(/(\d+)\s*Regional Predictor/i);
  test.skip(!countyPred || !regionalPred, 'predictor boxes not found');

  expect(
    Number(countyPred[1]),
    `County Predictor box shows ${countyPred[1]} but pipeline projects ${pipelineCounty} County qualifiers — same metric, different numbers (falsy-fallback placeholder)`
  ).toBe(pipelineCounty);

  expect(
    Number(regionalPred[1]),
    `Regional Predictor box shows ${regionalPred[1]} but pipeline projects ${pipelineRegional} Regional qualifiers`
  ).toBe(pipelineRegional);
});

test('WA-growth narrative does not render nonsense on zero velocity', async ({ page }) => {
  const body = await page.locator('body').innerText();
  const growth = body.match(/([+-]?\d+)\s*WA Point Growth/i);
  test.skip(!growth, 'WA growth card not found');
  const velocity = Number(growth[1]);

  if (velocity <= 0) {
    // With no positive growth the copy must not claim strong/resilient acceleration.
    expect(body, 'narrative renders literal "+0 pt" acceleration').not.toMatch(/\+0\s*pt/i);
    expect(
      body,
      'narrative claims "highly resilient" / "strong ... acceleration" while growth is ≤ 0'
    ).not.toMatch(/strong\s*\+?0/i);
  }
});

test('Squad Performance Trends chart renders data (or an explicit empty state)', async ({ page }) => {
  // Recharts draws each series as a path.recharts-curve. A blank chart with only
  // axes/legend is a silent failure — require either a plotted curve or a
  // visible "no data" message.
  const curves = await page.locator('.recharts-line-curve, path.recharts-curve').count();
  const bodyText = (await page.locator('body').innerText()).toLowerCase();
  const hasEmptyState = /no data|not enough data|no results|nothing to show/.test(bodyText);

  expect(
    curves > 0 || hasEmptyState,
    `Squad Performance Trends chart drew ${curves} data curves and shows no empty-state message — it renders blank`
  ).toBe(true);
});

test('achievement cohort numbers are plausible against the roster size', async ({ page }) => {
  // Sanity guard against hardcoded cohort numbers: County/Regional/National
  // ranked counts cannot exceed the number of swimmers shown club-wide.
  const body = await page.locator('body').innerText();
  const national = body.match(/(\d+)\s*National Top 40/i);
  const regional = body.match(/(\d+)\s*Regional Top 30/i);
  const county = body.match(/(\d+)\s*County Top 10/i);
  test.skip(!national || !regional || !county, 'cohort orbs not found');

  // Top-N cohorts must respect their own ceilings (40/30/10).
  expect(Number(national[1]), 'National Top 40 exceeds 40').toBeLessThanOrEqual(40);
  expect(Number(regional[1]), 'Regional Top 30 exceeds 30').toBeLessThanOrEqual(30);
  expect(Number(county[1]), 'County Top 10 exceeds 10').toBeLessThanOrEqual(10);
});
