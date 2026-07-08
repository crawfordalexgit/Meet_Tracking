import { timeToSeconds } from './wa-points';

/**
 * Collapses multiple results for the same swimmer+event within one meet down to
 * a single fastest row. Swimmers race an event more than once per meet (heats +
 * finals), which the DB's UNIQUE(swimmer_id, meet_id, event) constraint rejects
 * on a bulk insert — dropping the whole meet's results. Keeping the fastest swim
 * per event satisfies the constraint and is the value analytics/PBs care about.
 *
 * @param {Array<{swimmer_id:string, event:string, time:string}>} rows  results for ONE meet
 * @returns {Array} deduped rows (one fastest per swimmer+event), original order preserved
 */
export function dedupeFastestPerEvent(rows) {
  if (!Array.isArray(rows)) return [];
  const bestByKey = new Map(); // key -> { row, secs }
  for (const row of rows) {
    const key = `${row.swimmer_id}||${(row.event || '').trim().toLowerCase()}`;
    const raw = timeToSeconds(row.time);
    const secs = Number.isFinite(raw) && raw > 0 ? raw : 0; // DQ / unparseable -> 0
    const existing = bestByKey.get(key);
    // keep the fastest valid time; if a time is unparseable (0) prefer any parseable one
    if (!existing) {
      bestByKey.set(key, { row, secs });
    } else if (secs > 0 && (existing.secs <= 0 || secs < existing.secs)) {
      bestByKey.set(key, { row, secs });
    }
  }
  return Array.from(bestByKey.values()).map(v => v.row);
}
