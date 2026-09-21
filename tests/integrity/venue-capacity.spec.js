/**
 * No venue-day may book more lanes than its pool holds.
 *
 * The club's timetable is curated by hand, and until venue lane counts were
 * recorded there was no way to tell an over-booked pool from sessions that
 * merely start at different times. Reconciling it against the published grid
 * turned up a Friday missing two lanes, a Tuesday and a Sunday each an hour
 * short, and four retired duplicates the sync had switched back on — three of
 * which were adding 138 places to the club's capacity.
 *
 * Every one of those was invisible in the totals and obvious the moment each
 * venue-day was checked against its pool. So it is checked, on every run.
 *
 * Read-only. A venue with no recorded lane count is reported and skipped
 * rather than failed: an unknown pool size is missing information, not an
 * over-booking.
 */
import { test, expect } from '@playwright/test';
import { getServiceClient, fetchAll } from '../helpers/supabase';
import { lanesOf } from '../../lib/restructure-baseline.js';
import { laneLoad, describeLanes } from '../../lib/session-lanes.js';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

test('every venue-day against its pool', async () => {
  const supabase = getServiceClient();
  const settings = await fetchAll(supabase, 'ai_brain_settings');
  const phaseCfg = settings.find(s => s.key === 'session_lane_phases')?.value || {};
  const venueLanes = settings.find(s => s.key === 'venue_lanes')?.value || {};
  const ph = s => phaseCfg[s.id] || phaseCfg[s.scm_guid] || phaseCfg[s.name] || [];

  const sessions = (await fetchAll(supabase, 'sessions')).filter(s => s.is_active !== false);
  const dayOf = s => s.day_of_week || DAYS.find(d => new RegExp(d,'i').test(s.name||'')) || null;

  let over = 0, unchecked = 0;
  DAYS.forEach(day => {
    const onDay = sessions.filter(s => dayOf(s) === day);
    [...new Set(onDay.map(s => s.location || '(no venue)'))].sort().forEach(v => {
      const list = onDay.filter(s => (s.location || '(no venue)') === v);
      const cap = Number(venueLanes[v]);
      const bands = laneLoad(list, { lanesFor: lanesOf, phasesFor: ph });
      const peak = bands.reduce((m,b) => Math.max(m, b.lanes), 0);
      const known = Number.isFinite(cap) && cap > 0;
      if (!known) unchecked++;
      const bad = known && peak > cap;
      if (bad) over++;
      console.log(`${(day + ' ' + v).padEnd(42)} peak ${String(peak).padStart(2)}${known ? ` of ${cap}` : ' (pool size not set)'}${bad ? '   OVER' : known ? '   ok' : ''}`);
      if (bad) bands.filter(b => b.lanes > cap).forEach(b =>
        console.log(`    ${b.startTime}-${b.endTime}: ${b.lanes} lanes — ${b.parts.map(p => `${p.session.name} (${p.lanes})`).join(', ')}`));
    });
  });
  console.log(`\nover capacity: ${over} | pool size not recorded: ${unchecked}`);
  expect(over, 'venue-days booking more lanes than the pool holds').toBe(0);
});
