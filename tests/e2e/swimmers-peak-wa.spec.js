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

  // The registry only lists swimmers with a squad_id assigned. Pick, among those,
  // the swimmer with the highest peak — the clearest case for a non-zero render.
  const { data: swimmers } = await supabase
    .from('swimmers').select('id, full_name, known_as, squad_id').not('squad_id', 'is', null);
  const candidates = (swimmers || [])
    .map(s => ({ ...s, peak: peakBySwimmer.get(s.id) || 0 }))
    .filter(s => s.peak > 0)
    .sort((a, b) => b.peak - a.peak);
  test.skip(candidates.length === 0, 'no squad swimmer has results.wa_pts > 0');
  const target = candidates[0];

  await page.goto('/swimmers?period=365', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  // Wait until the target swimmer's row (matched by the ID prefix the UI prints)
  // is present in the rendered table.
  const idPrefix = target.id.slice(0, 8);
  await page.waitForFunction((idp) => {
    const rows = [...document.querySelectorAll('tr.registry-row')];
    return rows.some(r => r.innerText.includes('ID: ' + idp));
  }, idPrefix, { timeout: 120_000 });

  const rendered = await page.evaluate((idp) => {
    const rows = [...document.querySelectorAll('tr.registry-row')];
    const row = rows.find(r => r.innerText.includes('ID: ' + idp));
    if (!row) return null;
    const m = row.innerText.match(/(\d+)\s*WA POINTS/i);
    return m ? Number(m[1]) : null;
  }, idPrefix);

  expect(rendered, `Peak WA cell not found for swimmer ${target.full_name} (ID ${idPrefix})`).not.toBeNull();
  expect(
    rendered,
    `Swimmer ${target.full_name} has a peak results.wa_pts of ${target.peak} but /swimmers renders Peak WA = ${rendered} (F13: every peak was 0)`
  ).toBeGreaterThan(0);

  // And it should reflect the real peak (allow ±1 for any rounding on display).
  expect(
    Math.abs(rendered - Math.round(target.peak)) <= 1,
    `Peak WA rendered ${rendered} but DB max wa_pts is ${target.peak} for ${target.full_name}`
  ).toBe(true);
});
