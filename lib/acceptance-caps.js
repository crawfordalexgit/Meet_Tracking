/**
 * Maximum number of swimmers accepted per event at the Kent County
 * Championships, used to turn a county ranking into a SAFE / BUBBLE / OUTSIDE
 * verdict.
 *
 * PROVENANCE: transcribed from the Kent championship promoter's conditions
 * (maximum entries accepted per event, split by the under-17 / 17+ session
 * structure). These are not derived from any scraped data, so they must be
 * re-checked against each season's published conditions — they were last
 * confirmed against the 2026 conditions and have NOT been verified for 2027.
 *
 * Sentinel age used by the rankings scraper for the 'OP' (Open, all ages) list.
 */
export const OPEN_AGE = 99;

/**
 * South East Regional has no published per-event acceptance cap: the 2026 SE
 * qualification-times document lists Auto/Consideration times only. The rest of
 * this app therefore treats a top-30 regional ranking as the qualification
 * proxy (dashboard.js, api/squad-stats.js, squad/[id].js), and the rankings
 * scraper records the same threshold as its 'Regional Top 30' benchmark. Using
 * Kent's per-event caps here would be a different — and wrong — basis.
 */
export const REGIONAL_TOP_N = 30;

export function getMaxAcceptedSwimmers(eventStr, age, level = 'COUNTY') {
  if (String(level).toUpperCase() === 'REGIONAL') return REGIONAL_TOP_N;
  const younger = age < 17;
  if (eventStr.startsWith('50'))  return younger ? 34 : 46;
  if (eventStr.startsWith('100')) return younger ? 21 : 24;
  if (eventStr.startsWith('200')) return younger ? 16 : 18;
  // 400/800/1500 events — smaller heat allocation.
  return 14;
}

/** True when the figure is a ranking proxy rather than a published entry cap. */
export function isProxyThreshold(level) {
  return String(level).toUpperCase() === 'REGIONAL';
}

/**
 * Verdict thresholds: at or inside the cap is safe, the next 10 places are
 * waitlist-vulnerable.
 */
export const BUBBLE_MARGIN = 10;

export function getAcceptanceStatus(rank, maxAccepted) {
  if (!rank || rank <= 0) return 'UNRANKED';
  if (rank <= maxAccepted) return 'SAFE';
  if (rank <= maxAccepted + BUBBLE_MARGIN) return 'BUBBLE';
  return 'OUTSIDE';
}
