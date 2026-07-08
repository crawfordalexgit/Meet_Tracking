// Cross-page metric consistency: the squads registry and the squad detail page
// must report the SAME training/volume/health/compliance for a given squad+period.
// Found 2026-07-08: they diverge because each page rolls its own computation
// (different swimmer set, different compliance definition, different health formula).
//
// These are source-level guards: they FAIL until both pages derive squad stats
// from one shared helper. Flip nothing — fix the code so a single
// `computeSquadStats` (or calculateSquadHealth) drives both pages.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const P = f => fs.readFileSync(path.join(__dirname, '..', '..', 'pages', f), 'utf8');
const registry = P('squads.js');
const detail = P('squad/[id].js');

test('squad HEALTH is computed by the shared helper on both pages, not an inline formula', () => {
  // detail already uses calculateSquadHealth; registry must too (not inline weights).
  const registryUsesShared = /calculateSquadHealth/.test(registry);
  const registryHasInlineWeights = /\*\s*0\.[0-9]+/.test(registry); // e.g. training * 0.2
  expect(detail, 'detail should use calculateSquadHealth').toMatch(/calculateSquadHealth/);
  expect(registryUsesShared, 'squads.js must use calculateSquadHealth like the detail page').toBe(true);
  expect(registryHasInlineWeights, 'squads.js still hardcodes health weights inline').toBe(false);
});

test('both pages average the same swimmer set (active/non-exempt) for squad stats', () => {
  // detail filters to activeNonExempt before averaging; registry averages all.
  const detailFiltersExempt = /activeNonExempt|is_exempt|isExempt/.test(detail);
  const registryFiltersExempt = /activeNonExempt|is_exempt|isExempt/.test(registry);
  expect(detailFiltersExempt, 'detail filters exempt swimmers').toBe(true);
  expect(registryFiltersExempt, 'squads.js does NOT apply the same exempt filter as the detail page').toBe(true);
});
