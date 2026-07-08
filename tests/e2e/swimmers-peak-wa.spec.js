// F13: the /swimmers registry "WA POINTS" (Peak WA) column showed 0 for EVERY
// swimmer, because it read wa_pts from swimmer_pbs — a table with no wa_pts
// column — so every query returned nothing and every peak fell back to 0.
// Peak WA is now derived from results.wa_pts (mirroring the swimmer detail page).
//
// Guard: a swimmer whose max results.wa_pts > 0 must render a non-zero Peak WA.
import { test, expect } from '@playwright/test';
import { getServiceClient, fetchAll } from '../helpers/supabase';

test('a swimmer with results.wa_pts > 0 shows a non-zero Peak WA on /swimmers', async ({ page }) => {
  test.setTimeout(240_000);
  const supabase = getServiceClient();

  // Highest wa_pts per swimmer, straight from results (the true source).
  const results = await fetchAll(supabase, 'results', 'swimmer_id, wa_pts');
  const peakBySwimmer = new Map();
  results.forEach(r => {
    const v = Number(r.wa_pts) || 0;
    if (v > (peakBySwimmer.get(r.swimmer_id) || 0)) peakBySwimmer.set(r.swimmer_id, v);
  });
  test.skip(peakBySwimmer.size === 0, 'no results.wa_pts in DB — run a meet sync first');

  // Pick the squad swimmer with the highest peak — clearest non-zero case.
  const { data: swimmers } = await supabase
    .from('swimmers').select('id, full_name, known_as, squad_id').not('squad_id', 'is', null);
  const candidates = (swimmers || [])
    .map(s => ({ ...s, peak: peakBySwimmer.get(s.id) || 0 }))
    .filter(s => s.peak > 0)
    .sort((a, b) => b.peak - a.peak);
  test.skip(candidates.length === 0, 'no squad swimmer has results.wa_pts > 0');
  const target = candidates[0];
  const surname = target.full_name.trim().split(/\s+/).pop();

  await page.goto('/swimmers?period=365', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 150_000 }).catch(() => {});
  // The registry is heavy (loads all attendance/results) — wait until at least
  // one real "WA POINTS" value has rendered before interacting.
  await page.waitForFunction(
    () => /\d+\s*WA POINTS/i.test(document.body.innerText),
    null, { timeout: 150_000 }
  );

  // Narrow to the target via the search box so its row is unambiguous.
  const search = page.locator('input[placeholder*="earch" i], input[type="text"], input[type="search"]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(surname);
    await page.waitForTimeout(1200);
  }

  const body = await page.locator('body').innerText();
  // Grab every "<n> WA POINTS" on the (now-filtered) page; the target's peak
  // must appear and be > 0.
  const peaks = [...body.matchAll(/(\d+)\s*WA POINTS/gi)].map(m => Number(m[1]));
  expect(peaks.length, `no "WA POINTS" values rendered for ${target.full_name}`).toBeGreaterThan(0);
  const maxShown = Math.max(...peaks);
  expect(
    maxShown,
    `Swimmer ${target.full_name} has a peak results.wa_pts of ${target.peak} but /swimmers shows only 0s (F13 regressed)`
  ).toBeGreaterThan(0);
  // The top value shown should reflect the real peak (±1 rounding).
  expect(
    Math.abs(maxShown - Math.round(target.peak)) <= 1,
    `Peak WA shown ${maxShown} but DB max wa_pts is ${target.peak} for ${target.full_name}`
  ).toBe(true);
});
