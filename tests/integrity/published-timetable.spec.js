/**
 * The stored timetable, checked cell by cell against the club's published grid.
 *
 * https://www.tonbridgeswimmingclub.co.uk/page/squad-timetable-%7C-2026/130351
 *
 * The published grid is an HTML table whose cells carry column spans, and the
 * spans are the part that matters: on a Tuesday, lanes 2 and 3 hold "Age Dev"
 * across both the 8-9 and 9-10 columns, which is how a squad comes to run for
 * two hours while the lane beside it changes hands. Read as plain text the
 * spans vanish, every session looks like one hour, and the stored timetable
 * agrees with a grid that says something else.
 *
 * Every expectation below was taken from those spans, and every one is written
 * out in full rather than derived, so a coach can read this file against the
 * website and see which is wrong.
 *
 * Read-only.
 */
import { test, expect } from '@playwright/test';
import { getServiceClient, fetchAll } from '../helpers/supabase';
import { laneSegments, toMinutes } from '../../lib/session-lanes.js';
import { lanesOf } from '../../lib/restructure-baseline.js';

/** Pools, as the venue settings record them. */
const POOL = {
  'Radnor House': 4,
  'Tonbridge Town Pool': 6,
  'St Johns': 3,
  'Tonbridge School Pool': 6,
  'New Beacon': 4,
  'Wally Hall': 6
};

/**
 * The published grid, one entry per venue-day-hour.
 *
 * Squad keys are the normalised names below. Masters and Junior Masters share
 * a key because this club stores them as one session; the published grid splits
 * them on a Friday (3 + 2) and the stored row carries the total of 5.
 */
const PUBLISHED = [
  // Monday — Radnor House. Lane 2 is "Bronze/Silver" shared; the club's record
  // assigns that lane to Silver, so Silver reads 2 and Bronze 1.
  ['Monday', 'Radnor House', '18:00', { Bronze: 1, Silver: 2, Gold: 1 }],
  ['Monday', 'Radnor House', '19:00', { Age: 2, NAR: 2 }],
  ['Monday', 'Radnor House', '20:00', { Masters: 1, Age: 1, NAR: 2 }],

  // Tuesday — Tonbridge Town Pool. Age spans 8-10 on lanes 2-3, NAR spans
  // 8-10 on lanes 4-6.
  ['Tuesday', 'Tonbridge Town Pool', '19:00', { Gold: 4, Technical: 1, Silver: 1 }],
  ['Tuesday', 'Tonbridge Town Pool', '20:00', { Age: 3, NAR: 3 }],
  ['Tuesday', 'Tonbridge Town Pool', '21:00', { Masters: 1, Age: 2, NAR: 3 }],

  // Wednesday — St Johns.
  ['Wednesday', 'St Johns', '18:30', { NAR: 1, Age: 2 }],
  ['Wednesday', 'St Johns', '19:30', { NAR: 1, Age: 2 }],

  // Thursday — two venues.
  ['Thursday', 'Tonbridge School Pool', '20:00', { Masters: 1, Age: 2, NAR: 3 }],
  ['Thursday', 'Tonbridge School Pool', '21:00', { Masters: 1, Age: 2, NAR: 3 }],
  ['Thursday', 'New Beacon', '19:30', { Gold: 3, Club2: 1 }],
  ['Thursday', 'New Beacon', '20:00', { Gold: 3, Club2: 1 }],

  // Friday — Town Pool, then the School Pool in parallel.
  ['Friday', 'Tonbridge Town Pool', '19:00', { LTS56: 1, Bronze: 2, Silver: 3 }],
  ['Friday', 'Tonbridge Town Pool', '20:00', { Technical: 1, Gold: 5 }],
  ['Friday', 'Tonbridge Town Pool', '21:00', { Masters: 5, Club2: 1 }],
  ['Friday', 'Tonbridge School Pool', '19:00', { NAR: 3, Age: 3 }],
  ['Friday', 'Tonbridge School Pool', '20:00', { NAR: 3, Age: 3 }],

  // Saturday.
  ['Saturday', 'Tonbridge Town Pool', '06:45', { Gold: 2, Masters: 1, Age: 2, NAR: 1 }],

  // Sunday mornings — Age and NAR span 7-9; lane 5 NAR spans 7-10.
  ['Sunday', 'Wally Hall', '07:00', { Age: 3, NAR: 2, Masters: 1 }],
  ['Sunday', 'Wally Hall', '08:00', { Age: 3, NAR: 2, Masters: 1 }],
  ['Sunday', 'Wally Hall', '09:00', { Bronze: 2, Silver: 2, NAR: 2 }],

  // Sunday evenings — Gold spans 7-9 on lanes 4-6.
  ['Sunday', 'Wally Hall', '18:00', { LTS56: 1, Silver: 3, Bronze: 2 }],
  ['Sunday', 'Wally Hall', '19:00', { Technical: 1, Gold: 5 }],
  ['Sunday', 'Wally Hall', '20:00', { Masters: 2, Club2: 1, Gold: 3 }]
];

/** Sessions the published grid does not cover, and why they are not failures. */
const NOT_ON_THE_GRID = {
  'MASTERS Wednesday OUTDOOR': 'outdoor pool, not shown on the published grid',
  'Land training': 'dry land at the school gym, holds no lanes',
  'LTS 3/4 Tuesday': 'learner pool, listed separately from the lanes',
  'LTS 3/4 Friday': 'learner pool, listed separately from the lanes',
  'LTS 5/6 Friday': 'learner pool at 19:00, counted in the Friday lanes',
  'LTS 5-6 Sunday pm': 'learner pool at 18:00, counted in the Sunday lanes'
};

/** A session name to the squad key the published grid uses. */
function squadKeyOf(name) {
  const n = String(name || '').toLowerCase();
  if (/lts\s*5/.test(n)) return 'LTS56';
  if (/lts\s*3/.test(n)) return 'LTS34';
  if (/master/.test(n)) return 'Masters';
  if (/club\s*2/.test(n)) return 'Club2';
  if (/technical/.test(n)) return 'Technical';
  if (/bronze/.test(n)) return 'Bronze';
  if (/silver/.test(n)) return 'Silver';
  if (/gold/.test(n)) return 'Gold';
  if (/nar/.test(n)) return 'NAR';
  if (/age/.test(n)) return 'Age';
  if (/land/.test(n)) return 'Land';
  return 'OTHER:' + name;
}

const fmt = (obj) => Object.keys(obj).sort().map(k => `${k} ${obj[k]}`).join(', ') || '(nothing)';

test('the stored timetable matches the published grid, hour by hour', async () => {
  const supabase = getServiceClient();
  const settings = await fetchAll(supabase, 'ai_brain_settings');
  const phaseCfg = settings.find(s => s.key === 'session_lane_phases')?.value || {};
  const phasesFor = s => phaseCfg[s.id] || phaseCfg[s.scm_guid] || phaseCfg[s.name] || [];

  const sessions = (await fetchAll(supabase, 'sessions')).filter(s => s.is_active !== false);

  /** What the club's record holds at one venue, on one day, during one hour. */
  const storedAt = (day, venue, hhmm) => {
    const at = toMinutes(hhmm);
    const held = {};
    sessions.forEach(s => {
      if ((s.day_of_week || '') !== day) return;
      if ((s.location || '') !== venue) return;
      laneSegments(s, phasesFor(s), lanesOf(s)).forEach(seg => {
        if (seg.startMin <= at && seg.endMin > at && seg.lanes > 0) {
          const k = squadKeyOf(s.name);
          held[k] = (held[k] || 0) + seg.lanes;
        }
      });
    });
    return held;
  };

  const problems = [];
  let lastDay = null;

  PUBLISHED.forEach(([day, venue, hhmm, expected]) => {
    if (day !== lastDay) { console.log(`\n===== ${day.toUpperCase()} =====`); lastDay = day; }

    const stored = storedAt(day, venue, hhmm);
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(stored)])).sort();
    const bad = keys.filter(k => (expected[k] || 0) !== (stored[k] || 0));

    const total = Object.values(stored).reduce((a, b) => a + b, 0);
    const pool = POOL[venue];
    const over = pool && total > pool;

    console.log(`  ${hhmm} ${venue.padEnd(22)} ${String(total).padStart(2)}/${pool || '?'} lanes  ${fmt(stored)}${bad.length ? '' : '   ok'}`);

    if (bad.length) {
      console.log(`       PUBLISHED: ${fmt(expected)}`);
      bad.forEach(k => {
        const msg = `${day} ${hhmm} ${venue}: ${k} is ${stored[k] || 0}, published says ${expected[k] || 0}`;
        console.log(`       MISMATCH  ${msg}`);
        problems.push(msg);
      });
    }
    if (over) {
      const msg = `${day} ${hhmm} ${venue}: ${total} lanes booked in a ${pool}-lane pool`;
      console.log(`       OVER POOL ${msg}`);
      problems.push(msg);
    }
  });

  // Anything active that no published cell accounts for. A session nobody is
  // checking is exactly how three retired duplicates kept adding places.
  const checked = new Set(PUBLISHED.map(([d, v]) => d + '|' + v));
  const unaccounted = sessions.filter(s => {
    if (NOT_ON_THE_GRID[s.name]) return false;
    return !checked.has((s.day_of_week || '') + '|' + (s.location || ''));
  });
  console.log('\n===== NOT COVERED BY ANY PUBLISHED CELL =====');
  if (!unaccounted.length) console.log('  (none)');
  unaccounted.forEach(s => {
    const msg = `${s.name} — ${s.day_of_week || '(no day)'} ${s.start_time}-${s.end_time} at ${s.location || '(no venue)'}`;
    console.log('  ' + msg);
    problems.push('not on the published grid: ' + msg);
  });

  console.log('\n===== ALLOWED DIFFERENCES =====');
  Object.entries(NOT_ON_THE_GRID).forEach(([n, why]) => console.log(`  ${n} — ${why}`));
  console.log('  Monday lane 2 is "Bronze/Silver" on the grid; the record gives it to Silver.');
  console.log('  Friday 21:00 Masters 5 is the grid\'s Masters 3 + Jnr Masters 2, stored as one session.');

  console.log(`\n${problems.length} problem(s)`);
  expect(problems, 'stored timetable disagrees with the published grid').toEqual([]);
});
