// THE reported bug, reproduced end-to-end: meets visible on /meets must also
// surface on the pages of swimmers who have results at those meets.
import { test, expect } from '@playwright/test';
import { getServiceClient, fetchAll } from '../helpers/supabase';

test('swimmer with results sees their meets on their page', async ({ page }) => {
  test.setTimeout(300_000);
  const supabase = getServiceClient();

  // Pick the swimmer with the most results in the last 450 days — best case
  // for the page to show meets. If it fails for them, it fails for everyone.
  const cutoff = new Date(Date.now() - 450 * 86400000).toISOString().slice(0, 10);
  const results = await fetchAll(supabase, 'results', 'swimmer_id, meet_id, date', q => q.gte('date', cutoff));
  test.skip(results.length === 0, 'no results in last 450 days — run a meet sync first');

  const counts = new Map();
  results.forEach(r => counts.set(r.swimmer_id, (counts.get(r.swimmer_id) || 0) + 1));
  const [topSwimmerId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  const { data: swimmer } = await supabase.from('swimmers').select('id, full_name').eq('id', topSwimmerId).single();
  const swimmerMeetIds = [...new Set(results.filter(r => r.swimmer_id === topSwimmerId).map(r => r.meet_id).filter(Boolean))];
  const { data: swimmerMeets } = await supabase.from('meets').select('id, name, date').in('id', swimmerMeetIds);

  expect(swimmerMeets.length, 'swimmer has results but their meets are gone from the meets table').toBeGreaterThan(0);

  await page.goto(`/swimmer/${swimmer.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});

  // The meet list lives under the COMPETITION tab; it isn't mounted on the
  // default OVERVIEW view, so activate it before reading meet names.
  const compTab = page.getByText(/competition/i).first();
  if (await compTab.isVisible().catch(() => false)) {
    await compTab.click();
    await page.waitForTimeout(1500);
  }
  const body = await page.locator('body').innerText();

  // The page must mention at least one of the swimmer's actual meets by name.
  const shown = swimmerMeets.filter(m => m.name && body.toLowerCase().includes(m.name.toLowerCase().slice(0, 20)));
  expect(
    shown.length,
    `Swimmer ${swimmer.full_name} has ${swimmerMeets.length} meets with results ` +
    `(${swimmerMeets.slice(0, 5).map(m => m.name).join('; ')}) but NONE appear on /swimmer/${swimmer.id}`
  ).toBeGreaterThan(0);
});

test('meets page lists the same recent meets as the meets table', async ({ page }) => {
  test.setTimeout(180_000);
  const supabase = getServiceClient();
  const { data: recent } = await supabase
    .from('meets').select('name, date')
    .order('date', { ascending: false }).limit(5);
  test.skip(!recent?.length, 'no meets in DB');

  await page.goto('/meets', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  const body = (await page.locator('body').innerText()).toLowerCase();

  const missing = recent.filter(m => !body.includes((m.name || '').toLowerCase().slice(0, 20)));
  expect(
    missing.map(m => `${m.name} (${m.date})`),
    'recent meets in DB not rendered on /meets'
  ).toHaveLength(0);
});

test('swimmers page search finds a real swimmer and navigates to their page', async ({ page }) => {
  test.setTimeout(180_000);
  const supabase = getServiceClient();
  // the UI displays preferred names (known_as + surname), so match on surname
  const { data: swimmers } = await supabase.from('swimmers').select('id, full_name, known_as').limit(5);
  test.skip(!swimmers?.length, 'no swimmers in DB');
  const target = swimmers[0];
  const surname = target.full_name.trim().split(/\s+/).pop();

  await page.goto('/swimmers', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});

  const search = page.locator('input[type="search"], input[type="text"], input[placeholder*="earch" i]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(surname);
    await page.waitForTimeout(800);
  }
  const matches = page.getByText(new RegExp(surname, 'i'));
  await expect(matches.first(), `surname ${surname} not visible on /swimmers`).toBeVisible({ timeout: 15_000 });

  // The name text may sit inside a clickable card/row (onClick router.push) or a
  // header. Try each match until one actually navigates to a swimmer page.
  const n = Math.min(await matches.count(), 5);
  let navigated = false;
  for (let i = 0; i < n && !navigated; i++) {
    await matches.nth(i).click().catch(() => {});
    navigated = await page.waitForURL(/\/swimmer\//, { timeout: 8000 }).then(() => true).catch(() => false);
  }
  expect(navigated, `clicking "${surname}" on /swimmers did not open a swimmer page`).toBe(true);
});
