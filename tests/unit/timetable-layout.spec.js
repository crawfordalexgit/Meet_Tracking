import { test, expect } from '@playwright/test';
import { buildSegments, assignTracks } from '../../lib/timetable-layout.js';

const at = (h, m = 0) => h * 60 + m;

test.describe('buildSegments', () => {
  test('collapses the empty middle of a swimming day', () => {
    // The real shape of a club week: an early morning session and an evening
    // block, with seven dead hours between. Drawn on one continuous axis the
    // dead time takes most of the height and squeezes the bookings flat.
    const layout = buildSegments([
      { start: at(6, 45), end: at(7, 45) },
      { start: at(18), end: at(21) }
    ]);

    expect(layout.segments).toHaveLength(2);
    expect(layout.segments[0]).toMatchObject({ start: at(6), end: at(8) });
    expect(layout.segments[1]).toMatchObject({ start: at(18), end: at(21) });

    // Five hours of content, not the fifteen the clock spans.
    const contentMinutes = layout.segments.reduce((s, x) => s + (x.end - x.start), 0);
    expect(contentMinutes).toBe(at(5));
  });

  test('keeps sessions an hour apart in one band', () => {
    const layout = buildSegments([
      { start: at(18), end: at(19) },
      { start: at(20), end: at(21) }
    ]);
    expect(layout.segments).toHaveLength(1);
    expect(layout.segments[0]).toMatchObject({ start: at(18), end: at(21) });
  });

  test('snaps bands out to whole hours so the axis labels read sensibly', () => {
    const layout = buildSegments([{ start: at(18, 30), end: at(20, 15) }]);
    expect(layout.segments[0]).toMatchObject({ start: at(18), end: at(21) });
  });

  test('offsets are ordered, and a later time is never above an earlier one', () => {
    const layout = buildSegments([
      { start: at(6, 45), end: at(7, 45) },
      { start: at(18), end: at(21) }
    ]);
    const times = [at(6, 45), at(7), at(7, 45), at(18), at(19, 30), at(21)];
    const offsets = times.map(t => layout.offsetOf(t));
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
    }
  });

  test('a time inside a collapsed gap clamps to the band edge', () => {
    const layout = buildSegments([
      { start: at(7), end: at(8) },
      { start: at(18), end: at(19) }
    ]);
    const endOfMorning = layout.segments[0].top + layout.segments[0].height;
    expect(layout.offsetOf(at(13))).toBe(endOfMorning);
  });

  test('leaves a visible break between bands', () => {
    const layout = buildSegments([
      { start: at(7), end: at(8) },
      { start: at(18), end: at(19) }
    ], { breakPx: 30 });
    const gap = layout.segments[1].top - (layout.segments[0].top + layout.segments[0].height);
    expect(gap).toBe(30);
  });

  test('ticks land on the hour and never inside a collapsed gap', () => {
    const layout = buildSegments([
      { start: at(7), end: at(8) },
      { start: at(18), end: at(20) }
    ]);
    layout.ticks.forEach(t => {
      expect(t.minute % 60).toBe(0);
      const inABand = layout.segments.some(s => t.minute >= s.start && t.minute <= s.end);
      expect(inABand).toBe(true);
    });
    expect(layout.ticks.some(t => t.minute === at(13))).toBe(false);
  });

  test('an empty or malformed input does not throw', () => {
    expect(buildSegments([]).isEmpty).toBe(true);
    expect(buildSegments([]).offsetOf(600)).toBe(0);
    expect(buildSegments(null).segments).toEqual([]);
    // End before start, and non-numeric, are both discarded.
    expect(buildSegments([{ start: at(20), end: at(18) }]).isEmpty).toBe(true);
    expect(buildSegments([{ start: 'x', end: 'y' }]).isEmpty).toBe(true);
  });

  test('total height is the sum of bands plus the breaks', () => {
    const layout = buildSegments([
      { start: at(7), end: at(8) },
      { start: at(18), end: at(19) }
    ], { pxPerMinute: 1, breakPx: 20 });
    expect(layout.totalHeight).toBe(60 + 20 + 60);
  });
});

test.describe('assignTracks', () => {
  test('puts overlapping sessions in separate tracks', () => {
    const items = [
      { startMin: at(18), endMin: at(19, 30) },
      { startMin: at(18, 30), endMin: at(20) }
    ];
    expect(assignTracks(items)).toBe(2);
    expect(items[0].track).toBe(0);
    expect(items[1].track).toBe(1);
  });

  test('reuses a track once the previous session has finished', () => {
    const items = [
      { startMin: at(18), endMin: at(19) },
      { startMin: at(19), endMin: at(20) }
    ];
    expect(assignTracks(items)).toBe(1);
    expect(items[1].track).toBe(0);
  });

  test('handles three concurrent sessions', () => {
    const items = [
      { startMin: at(18), endMin: at(20) },
      { startMin: at(18), endMin: at(20) },
      { startMin: at(18), endMin: at(20) }
    ];
    expect(assignTracks(items)).toBe(3);
    expect(items.map(i => i.track)).toEqual([0, 1, 2]);
  });

  test('an empty day still reports one track', () => {
    expect(assignTracks([])).toBe(1);
  });
});
