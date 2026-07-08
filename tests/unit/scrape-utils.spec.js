import { test, expect } from '@playwright/test';
import { dedupeFastestPerEvent } from '../../lib/scrape-utils.js';

// Regression cover for the scrape blocker found 2026-07-08: swimmers race an
// event more than once per meet (heats + finals); the DB UNIQUE(swimmer_id,
// meet_id, event) constraint rejected the whole meet's insert. dedupeFastestPerEvent
// collapses to one fastest row so the insert succeeds.

test('collapses heats+finals to the single fastest time per swimmer+event', () => {
  const rows = [
    { swimmer_id: 'a', event: '50 Freestyle', time: '28.90', round: 'heat' },
    { swimmer_id: 'a', event: '50 Freestyle', time: '28.41', round: 'final' },
  ];
  const out = dedupeFastestPerEvent(rows);
  expect(out).toHaveLength(1);
  expect(out[0].time).toBe('28.41');
});

test('keeps distinct events and distinct swimmers', () => {
  const rows = [
    { swimmer_id: 'a', event: '50 Freestyle', time: '28.90' },
    { swimmer_id: 'a', event: '100 Freestyle', time: '1:02.10' },
    { swimmer_id: 'b', event: '50 Freestyle', time: '30.10' },
  ];
  expect(dedupeFastestPerEvent(rows)).toHaveLength(3);
});

test('event matching is case/space-insensitive', () => {
  const rows = [
    { swimmer_id: 'a', event: '50 Freestyle', time: '29.00' },
    { swimmer_id: 'a', event: ' 50 freestyle ', time: '28.50' },
  ];
  const out = dedupeFastestPerEvent(rows);
  expect(out).toHaveLength(1);
  expect(out[0].time).toBe('28.50');
});

test('produces no duplicate (swimmer_id, event) keys — satisfies the DB constraint', () => {
  const rows = [
    { swimmer_id: 'a', event: '50 Free', time: '28.9' },
    { swimmer_id: 'a', event: '50 Free', time: '28.4' },
    { swimmer_id: 'a', event: '100 Free', time: '62.0' },
    { swimmer_id: 'b', event: '50 Free', time: '30.1' },
  ];
  const out = dedupeFastestPerEvent(rows);
  const keys = out.map(r => `${r.swimmer_id}|${r.event.toLowerCase().trim()}`);
  expect(new Set(keys).size).toBe(keys.length);
});

test('handles unparseable times without dropping the row', () => {
  const rows = [
    { swimmer_id: 'a', event: '50 Free', time: 'DQ' },
    { swimmer_id: 'a', event: '50 Free', time: '28.40' },
  ];
  const out = dedupeFastestPerEvent(rows);
  expect(out).toHaveLength(1);
  expect(out[0].time).toBe('28.40'); // the real time wins over the unparseable one
});

test('empty / non-array input returns []', () => {
  expect(dedupeFastestPerEvent([])).toEqual([]);
  expect(dedupeFastestPerEvent(null)).toEqual([]);
});
