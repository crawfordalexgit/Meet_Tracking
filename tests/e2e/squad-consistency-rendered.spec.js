// F11 (rendered): the squad registry card (/squads) and the squad detail page
// (/squad/[id]) must show the SAME Health / Consistency(Training) / Volume for a
// given squad+period. They previously diverged because /squads pre-filtered
// attendance & results to the period before handing them to computeSquadStats,
// which windows internally — double-filtering. Both pages now feed all-time rows
// to the shared computeSquadStats, so the numbers must agree.
//
// This is the RENDERED guard the earlier source-only test could not provide:
// it reads the actual numbers off both pages and asserts they match (±1 rounding).
import { test, expect } from '@playwright/test';
import { getServiceClient } from '../helpers/supabase';

const PERIOD = 365;

// Read the value that appears immediately BEFORE a label (orb / health-indicator
// layout renders the number first, the label second).
const numBeforeLabel = (text, label) => {
  const m = text.match(new RegExp(`(\\d+)\\s*%\\s*${label}`, 'i'));
  return m ? Number(m[1]) : null;
};

// Read the value that appears immediately AFTER a label (stat-pill layout renders
// the label first, the number second).
const numAfterLabel = (text, label) => {
  const m = text.match(new RegExp(`${label}\\s*(\\d+)\\s*%`, 'i'));
  return m ? Number(m[1]) : null;
};

test('squad registry card and detail page render identical Health / Consistency / Volume', async ({ page }) => {
  test.setTimeout(300_000);
  const supabase = getServiceClient();

  // Pick the is_squad squad with the most active, non-exempt swimmers — the one
  // most likely to render non-trivial (non-zero) numbers, making this a real guard.
  const { data: squads } = await supabase.from('squads').select('id, name').eq('is_squad', true);
  test.skip(!squads?.length, 'no is_squad squads in DB');
  const { data: swimmers } = await supabase.from('swimmers').select('squad_id, is_active, is_exempt');
  const counts = new Map();
  (swimmers || []).forEach(s => {
    if (s.is_active === false || s.is_exempt) return;
    counts.set(s.squad_id, (counts.get(s.squad_id) || 0) + 1);
  });
  const ranked = squads
    .map(s => ({ ...s, n: counts.get(s.id) || 0 }))
    .sort((a, b) => b.n - a.n);
  const squad = ranked[0];
  test.skip(!squad, 'no squad to test');

  // ---- REGISTRY (/squads) ----
  await page.goto(`/squads?period=${PERIOD}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  // Wait until this squad's card exists and has rendered a HEALTH number.
  await page.waitForFunction((name) => {
    const cards = [...document.querySelectorAll('.squad-card')];
    const card = cards.find(c => c.querySelector('.squad-name')?.textContent.trim() === name);
    return card && /\d+\s*%\s*HEALTH/i.test(card.innerText);
  }, squad.name, { timeout: 120_000 });

  const cardText = await page.evaluate((name) => {
    const cards = [...document.querySelectorAll('.squad-card')];
    const card = cards.find(c => c.querySelector('.squad-name')?.textContent.trim() === name);
    return card ? card.innerText : null;
  }, squad.name);
  expect(cardText, `squad card for "${squad.name}" not found on /squads`).toBeTruthy();

  const registryHealth = numBeforeLabel(cardText, 'HEALTH');
  const registryTraining = numAfterLabel(cardText, 'TRAINING');
  const registryVolume = numAfterLabel(cardText, 'VOLUME');
  expect(registryHealth, `no HEALTH% on registry card:\n${cardText}`).not.toBeNull();
  expect(registryTraining, `no TRAINING% on registry card:\n${cardText}`).not.toBeNull();
  expect(registryVolume, `no VOLUME% on registry card:\n${cardText}`).not.toBeNull();

  // ---- DETAIL (/squad/[id]) ----
  await page.goto(`/squad/${squad.id}?period=${PERIOD}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  // Wait until the Consistency orb has rendered a number (overview tab, default).
  await page.waitForFunction(() => /\d+\s*%\s*Consistency/i.test(document.body.innerText), null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const detailText = await page.locator('body').innerText();

  // Detail orbs render the value BEFORE the label. Consistency == registry TRAINING.
  const detailHealth = numBeforeLabel(detailText, 'Overall\\s+Health');
  const detailConsistency = numBeforeLabel(detailText, 'Consistency');
  const detailVolume = numBeforeLabel(detailText, 'Volume');
  expect(detailConsistency, `no Consistency% on /squad/${squad.id}`).not.toBeNull();
  expect(detailVolume, `no Volume% on /squad/${squad.id}`).not.toBeNull();
  expect(detailHealth, `no Overall Health% on /squad/${squad.id}`).not.toBeNull();

  const near = (a, b) => Math.abs(a - b) <= 1;

  expect(
    near(registryTraining, detailConsistency),
    `Training/Consistency mismatch for "${squad.name}": registry=${registryTraining}% detail=${detailConsistency}%`
  ).toBe(true);

  expect(
    near(registryVolume, detailVolume),
    `Volume mismatch for "${squad.name}": registry=${registryVolume}% detail=${detailVolume}%`
  ).toBe(true);

  expect(
    near(registryHealth, detailHealth),
    `Health mismatch for "${squad.name}": registry=${registryHealth}% detail=${detailHealth}%`
  ).toBe(true);
});
