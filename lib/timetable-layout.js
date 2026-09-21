/**
 * Vertical layout for a weekly timetable.
 *
 * A swimming week is nearly all empty. Sessions cluster at 06:45 and again from
 * 18:00, and the seven hours in between contain nothing at all. Drawing one
 * continuous axis from first to last gives most of the height to dead time and
 * squeezes every real booking into an unreadable sliver.
 *
 * So the axis is cut into bands around the times that actually contain
 * something, and the empty stretches between are collapsed to a marked break.
 * Pure — no React, no DOM — so it can be unit tested and shared between the
 * proposed timetable and the venue schedule.
 */

/** Round down to the hour. */
const floorHour = m => Math.floor(m / 60) * 60;
/** Round up to the hour. */
const ceilHour = m => Math.ceil(m / 60) * 60;

/**
 * Group intervals into bands of occupied time.
 *
 * `gapMinutes` is how much empty time is tolerated inside a band before it is
 * worth breaking. Sixty minutes keeps a morning session and one starting an
 * hour later together, while still cutting the long midday void.
 */
export function buildSegments(intervals, { gapMinutes = 90, pxPerMinute = 1.1, breakPx = 26 } = {}) {
  const valid = (intervals || [])
    .filter(i => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start);

  if (!valid.length) {
    return { segments: [], totalHeight: 0, offsetOf: () => 0, ticks: [], isEmpty: true };
  }

  // Merge into occupied bands, snapped out to whole hours so the axis labels
  // land on sensible times.
  const bands = [];
  valid.forEach(i => {
    const start = floorHour(i.start);
    const end = ceilHour(i.end);
    const last = bands[bands.length - 1];
    if (last && start - last.end <= gapMinutes) {
      last.end = Math.max(last.end, end);
    } else {
      bands.push({ start, end });
    }
  });

  // Give each band a vertical offset, with a fixed-height break between.
  let y = 0;
  const segments = bands.map((b, idx) => {
    if (idx > 0) y += breakPx;
    const height = (b.end - b.start) * pxPerMinute;
    const seg = { ...b, top: y, height, index: idx };
    y += height;
    return seg;
  });

  const totalHeight = y;

  /**
   * Minutes since midnight to a y position. Times inside a collapsed gap clamp
   * to the nearest band edge rather than landing in the break.
   */
  const offsetOf = (min) => {
    for (const s of segments) {
      if (min >= s.start && min <= s.end) return s.top + (min - s.start) * pxPerMinute;
    }
    if (min < segments[0].start) return segments[0].top;
    for (let i = 0; i < segments.length - 1; i++) {
      if (min > segments[i].end && min < segments[i + 1].start) {
        return segments[i].top + segments[i].height;
      }
    }
    const last = segments[segments.length - 1];
    return last.top + last.height;
  };

  // Hour ticks, per band, so no label is drawn against collapsed time.
  const ticks = [];
  segments.forEach(s => {
    for (let m = s.start; m <= s.end; m += 60) {
      ticks.push({ minute: m, top: offsetOf(m), segment: s.index });
    }
  });

  return { segments, totalHeight, offsetOf, ticks, isEmpty: false };
}

/**
 * Lay items into non-overlapping tracks so concurrent bookings sit side by side
 * rather than on top of one another. Returns the track count per day.
 */
export function assignTracks(items) {
  const tracks = [];
  items.forEach(item => {
    let t = tracks.findIndex(tr => tr.every(o => item.startMin >= o.endMin || o.startMin >= item.endMin));
    if (t === -1) { tracks.push([]); t = tracks.length - 1; }
    tracks[t].push(item);
    item.track = t;
  });
  return Math.max(1, tracks.length);
}
