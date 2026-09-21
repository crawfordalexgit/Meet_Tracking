/**
 * Lanes that change part-way through a session.
 *
 * A session has carried one lane count for its whole length, which is not how
 * the club actually swims. Age Development holds two lanes at Radnor House from
 * seven, and one from eight when Masters come in on the other. Recorded as "two
 * lanes, 19:00-21:00" that is four lane-hours; in the water it is three.
 *
 * Six of the club's twelve venue-days have a lane count that changes mid-evening,
 * so this is not an edge case — every lane-hour, place and headroom figure for
 * those evenings was overstated.
 *
 * A session therefore keeps its single row, its single register and its single
 * roster, and gains an optional list of changes: the times its lane count moves,
 * and what it moves to. Only the changes are recorded, so a session that never
 * changes needs nothing at all and behaves exactly as before.
 *
 * Pure and dependency-free, so the Settings editor and the server-side baseline
 * measure a session identically.
 */

/** "19:30" -> 1170. Null for anything unparseable. */
export function toMinutes(t) {
  if (t === null || t === undefined) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/** 1170 -> "19:30". */
export function toTime(mins) {
  const v = Math.max(0, Math.round(Number(mins) || 0));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/**
 * Normalise the recorded changes: in time order, inside the session, deduped.
 *
 * Anything outside the session's own start and end is dropped rather than
 * clamped — a change at a time the session is not running is a mistake, and
 * silently moving it would hide that.
 */
export function normalisePhases(session, phases) {
  const start = toMinutes(session?.start_time ?? session?.startTime);
  const end = toMinutes(session?.end_time ?? session?.endTime);
  if (start === null || end === null || end <= start) return [];

  const seen = new Set();
  return (Array.isArray(phases) ? phases : [])
    .map(p => ({ at: toMinutes(p?.from ?? p?.at), lanes: Number(p?.lanes) }))
    .filter(p => p.at !== null && Number.isFinite(p.lanes) && p.lanes >= 0)
    .filter(p => p.at > start && p.at < end)
    .sort((a, b) => a.at - b.at)
    .filter(p => (seen.has(p.at) ? false : seen.add(p.at)));
}

/**
 * The session as a run of segments, each with a start, an end and a lane count.
 *
 * A session with no recorded changes is one segment holding its whole length,
 * which is exactly the old behaviour.
 */
export function laneSegments(session, phases, baseLanes) {
  const start = toMinutes(session?.start_time ?? session?.startTime);
  const end = toMinutes(session?.end_time ?? session?.endTime);
  if (start === null || end === null || end <= start) return [];

  const opening = Number.isFinite(Number(baseLanes)) ? Number(baseLanes) : 0;
  const changes = normalisePhases(session, phases);

  const segments = [];
  let at = start;
  let lanes = opening;
  changes.forEach(change => {
    if (change.at > at) segments.push({ startMin: at, endMin: change.at, lanes });
    at = change.at;
    lanes = change.lanes;
  });
  if (end > at) segments.push({ startMin: at, endMin: end, lanes });
  return segments;
}

/** Lane-hours across the whole session, honouring every change within it. */
export function laneHoursOf(session, phases, baseLanes) {
  return laneSegments(session, phases, baseLanes)
    .reduce((sum, s) => sum + s.lanes * ((s.endMin - s.startMin) / 60), 0);
}

/**
 * The lanes held at one moment.
 *
 * Used to work out how many lanes a venue has in the water at a given time,
 * which is what tells an over-booked pool from sessions that merely start at
 * different times.
 */
export function lanesAt(session, phases, baseLanes, minutes) {
  const seg = laneSegments(session, phases, baseLanes)
    .find(s => minutes >= s.startMin && minutes < s.endMin);
  return seg ? seg.lanes : 0;
}

/**
 * How many lanes a set of sessions puts in the water at each moment.
 *
 * Sessions are cut at every point any of them starts, ends, or changes its lane
 * count, and the lanes live in each resulting band are added up. That is the
 * only way to tell an over-booked pool from sessions that merely start at
 * different times: a venue running four sessions is fine if they are staggered
 * and a problem if they are not.
 *
 * `sessions` are raw rows; `lanesFor` and `phasesFor` say how to read each one,
 * so this stays free of any opinion about where lane counts are stored.
 */
export function laneLoad(sessions, { lanesFor, phasesFor }) {
  const usable = (sessions || []).filter(s => {
    const a = toMinutes(s.start_time ?? s.startTime);
    const b = toMinutes(s.end_time ?? s.endTime);
    return a !== null && b !== null && b > a;
  });
  if (!usable.length) return [];

  const edges = new Set();
  usable.forEach(s => {
    edges.add(toMinutes(s.start_time ?? s.startTime));
    edges.add(toMinutes(s.end_time ?? s.endTime));
    normalisePhases(s, phasesFor(s)).forEach(p => edges.add(p.at));
  });

  const points = Array.from(edges).sort((a, b) => a - b);
  const bands = [];
  for (let i = 0; i < points.length - 1; i++) {
    const startMin = points[i];
    const endMin = points[i + 1];
    const live = usable.filter(s =>
      toMinutes(s.start_time ?? s.startTime) < endMin
      && toMinutes(s.end_time ?? s.endTime) > startMin);
    const parts = live.map(s => ({
      session: s,
      lanes: lanesAt(s, phasesFor(s), lanesFor(s), startMin)
    })).filter(p => p.lanes > 0);
    bands.push({
      startMin,
      endMin,
      startTime: toTime(startMin),
      endTime: toTime(endMin),
      lanes: parts.reduce((sum, p) => sum + p.lanes, 0),
      parts
    });
  }
  return bands;
}

/**
 * The largest lane count the session ever holds.
 *
 * What a squad needs at its busiest, as distinct from its average across the
 * session — a squad down to one lane for the last half hour still needs two
 * lanes' worth of room while it has them.
 */
export function peakLanesOf(session, phases, baseLanes) {
  const segs = laneSegments(session, phases, baseLanes);
  return segs.length ? Math.max(...segs.map(s => s.lanes)) : 0;
}

/**
 * Problems worth telling somebody about before they save.
 *
 * Returns plain sentences, not codes: this is shown directly in Settings under
 * the editor.
 */
export function validatePhases(session, phases) {
  const start = toMinutes(session?.start_time ?? session?.startTime);
  const end = toMinutes(session?.end_time ?? session?.endTime);
  const errors = [];

  if (start === null || end === null || end <= start) {
    errors.push('Set a start and end time for the session before recording lane changes.');
    return errors;
  }

  const seen = new Set();
  (Array.isArray(phases) ? phases : []).forEach((p, i) => {
    const at = toMinutes(p?.from ?? p?.at);
    const lanes = Number(p?.lanes);
    const where = `Change ${i + 1}`;

    if (at === null) { errors.push(`${where}: enter the time the lane count changes.`); return; }
    if (at <= start || at >= end) {
      errors.push(`${where}: ${toTime(at)} is outside this session, which runs ${toTime(start)}–${toTime(end)}.`);
    }
    if (seen.has(at)) errors.push(`${where}: there is already a change at ${toTime(at)}.`);
    seen.add(at);

    if (!Number.isFinite(lanes) || lanes < 0) errors.push(`${where}: lanes must be zero or more.`);
  });

  return errors;
}

/** One line a person can read: "2 lanes to 20:00, then 1". */
export function describeLanes(session, phases, baseLanes) {
  const segs = laneSegments(session, phases, baseLanes);
  if (segs.length <= 1) return `${baseLanes} lane${Number(baseLanes) === 1 ? '' : 's'} throughout`;
  return segs
    .map((s, i) => (i === segs.length - 1
      ? `then ${s.lanes}`
      : `${s.lanes} to ${toTime(s.endMin)}`))
    .join(', ');
}
