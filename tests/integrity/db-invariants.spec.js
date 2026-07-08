// Cross-table consistency checks against the live DB (service role, read-only).
// This layer exists to catch the class of bug reported on 2026-07-08:
// meets visible on /meets but missing from a swimmer's page.
import { test, expect } from '@playwright/test';
import { getServiceClient, fetchAll } from '../helpers/supabase';

let supabase, swimmers, meets, results;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  supabase = getServiceClient();
  [swimmers, meets, results] = await Promise.all([
    fetchAll(supabase, 'swimmers', 'id, member_id, full_name, squad_id'),
    fetchAll(supabase, 'meets', 'id, name, date, level, type, meet_code'),
    fetchAll(supabase, 'results', 'id, swimmer_id, meet_id, event, time, date, is_pb'),
  ]);
});

test('every result points at an existing swimmer', () => {
  const swimmerIds = new Set(swimmers.map(s => s.id));
  const orphans = results.filter(r => !r.swimmer_id || !swimmerIds.has(r.swimmer_id));
  expect(orphans, `${orphans.length} results reference missing swimmers`).toHaveLength(0);
});

test('every result points at an existing meet', () => {
  const meetIds = new Set(meets.map(m => m.id));
  const orphans = results.filter(r => !r.meet_id || !meetIds.has(r.meet_id));
  const sample = orphans.slice(0, 5).map(r => `${r.event} ${r.time} on ${r.date}`);
  expect(orphans, `${orphans.length} results have no/dead meet_id, e.g. ${sample.join('; ')}`).toHaveLength(0);
});

test('swimmer page meets window (limit 500) covers all meets referenced by results', () => {
  // pages/swimmer/[id].js:460 fetches only the 500 most recent meets and joins
  // client-side. Any result whose meet falls outside that window renders with
  // meets:null — the meet silently vanishes from the swimmer page.
  const newest500 = new Set(
    [...meets]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 500)
      .map(m => m.id)
  );
  const referencedMeetIds = new Set(results.map(r => r.meet_id).filter(Boolean));
  const outside = [...referencedMeetIds].filter(id => !newest500.has(id));
  expect(outside, `${outside.length} meets with results fall outside the swimmer-page 500-meet window`).toHaveLength(0);
});

test('meets with results in the last 450 days: every participating swimmer has matching results rows', () => {
  // Symmetry check between /meets and swimmer pages: a meet that shows on the
  // meets page but has zero results means no swimmer page can ever show it.
  const cutoff = new Date(Date.now() - 450 * 86400000);
  const resultsByMeet = new Map();
  results.forEach(r => resultsByMeet.set(r.meet_id, (resultsByMeet.get(r.meet_id) || 0) + 1));

  const recentMeets = meets.filter(m => m.date && new Date(m.date) >= cutoff);
  const empty = recentMeets.filter(m => !resultsByMeet.get(m.id));
  const sample = empty.slice(0, 10).map(m => `${m.name} (${m.date})`);
  expect(
    empty,
    `${empty.length}/${recentMeets.length} recent meets have ZERO results — they appear on /meets but on no swimmer page. e.g.:\n${sample.join('\n')}`
  ).toHaveLength(0);
});

test('every swimmer with PBs also has results (cascade-wipe detector)', async () => {
  const pbs = await fetchAll(supabase, 'swimmer_pbs', 'swimmer_id');
  const swimmersWithResults = new Set(results.map(r => r.swimmer_id));
  const swimmerIds = new Set(swimmers.map(s => s.id));
  const pbSwimmers = [...new Set(pbs.map(p => p.swimmer_id))];

  const deadRefs = pbSwimmers.filter(id => !swimmerIds.has(id));
  expect(deadRefs, 'PBs referencing deleted swimmers').toHaveLength(0);

  const noResults = pbSwimmers.filter(id => !swimmersWithResults.has(id));
  const names = noResults.slice(0, 10).map(id => swimmers.find(s => s.id === id)?.full_name || id);
  expect(
    noResults,
    `${noResults.length} swimmers have Swim England PBs but ZERO results rows — their meets are invisible. ` +
    `Likely scraper name/member_id mismatch or cascade delete. e.g.: ${names.join(', ')}`
  ).toHaveLength(0);
});

test('meets have level and type set', () => {
  const missing = meets.filter(m => !m.level || !m.type);
  const sample = missing.slice(0, 10).map(m => `${m.name} (level=${m.level}, type=${m.type})`);
  expect(missing, `${missing.length} meets missing level/type — swimmer-page open/internal split breaks:\n${sample.join('\n')}`).toHaveLength(0);
});

test('duplicate meets by (name, date) — informational only', () => {
  // Per Alex (2026-07-08): same name+date duplicates are NORMAL — some galas
  // (Kent Junior League, Arena League) run multiple rounds under one name.
  // meet_code uniqueness is the real identity and is enforced by the DB.
  const seen = new Map();
  const dupes = [];
  meets.forEach(m => {
    const key = `${(m.name || '').toLowerCase().trim()}|${m.date}`;
    if (seen.has(key)) dupes.push(m.name);
    seen.set(key, m.id);
  });
  if (dupes.length) console.log(`info: ${dupes.length} same-name+date meets (expected for multi-round galas): ${[...new Set(dupes)].slice(0, 10).join(', ')}`);
  expect(true).toBe(true);
});

test('swimmer names are stored in "First Last" format (no commas)', () => {
  const commaNames = swimmers.filter(s => (s.full_name || '').includes(','));
  expect(commaNames.map(s => s.full_name), 'comma-format names break scraper matching').toHaveLength(0);
});

test('all swimmers have a member_id (needed for SE scraper matching)', () => {
  const missing = swimmers.filter(s => !s.member_id);
  expect(missing.map(s => s.full_name), `${missing.length} swimmers without member_id can only match by exact name`).toHaveLength(0);
});

test('results date sanity: no future dates, none before 2000', () => {
  const now = Date.now() + 86400000;
  const bad = results.filter(r => {
    const t = new Date(r.date || 0).getTime();
    return !r.date || t > now || t < new Date('2000-01-01').getTime();
  });
  const sample = bad.slice(0, 5).map(r => `${r.event} ${r.time} date=${r.date}`);
  expect(bad, `${bad.length} results with bogus dates: ${sample.join('; ')}`).toHaveLength(0);
});
