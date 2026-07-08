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
  // These count DISTINCT swimmers who rank in a county/regional/national top-N
  // for any of their events — so the count can exceed N (many events, many
  // swimmers). The real guard is: it must not exceed the club's swimmer count,
  // and must be a non-negative integer (catches hardcoded/garbage values).
  const { getServiceClient } = await import('../helpers/supabase.js');
  const { count: rosterSize } = await getServiceClient()
    .from('swimmers').select('id', { count: 'exact', head: true });

  const body = await page.locator('body').innerText();
  const national = body.match(/(\d+)\s*National Top 40/i);
  const regional = body.match(/(\d+)\s*Regional Top 30/i);
  const county = body.match(/(\d+)\s*County Top 10/i);
  test.skip(!national || !regional || !county, 'cohort orbs not found');

  for (const [label, m] of [['National', national], ['Regional', regional], ['County', county]]) {
    const n = Number(m[1]);
    expect(Number.isInteger(n) && n >= 0, `${label} cohort is not a valid count: ${m[1]}`).toBe(true);
    expect(n, `${label} cohort (${n}) exceeds the whole roster (${rosterSize})`).toBeLessThanOrEqual(rosterSize);
  }
});
