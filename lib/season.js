/**
 * Championship season helpers.
 *
 * A "season year" is the year the championships are held. Swim England county
 * age groups are the swimmer's age at 31 December of that year, which is also
 * how swimmingresults.org labels its rankings ("13 Years Age Group - At 31st
 * December 2026") — so the same year drives qualifying-time lookups, ranking
 * age groups and acceptance caps.
 */

// Championship entries close in the autumn, so from May onwards the season
// being planned for is next year's. Kept here so the predictor pages and the
// rankings scraper cannot drift apart.
const ROLLOVER_MONTH = 4; // 0-indexed: May

export function getTargetSeasonYear(now = new Date()) {
  return now.getMonth() >= ROLLOVER_MONTH ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * The year the *rankings* are bucketed by, which is NOT the target season.
 *
 * swimmingresults.org can re-bucket the same trailing-12-month times into any
 * year's age groups, but a future season's cohort is not yet meaningful: while
 * planning during 2026 for the 2027 championships, the only real ranking cohort
 * is the 2026 age group. The 2027 basis becomes usable once 2027 begins.
 *
 * Consequence: a ranking is always a statement about the current calendar year,
 * while the qualifying-time columns look ahead to getTargetSeasonYear(). The UI
 * must label the two separately rather than implying one season throughout.
 */
export function getRankingReferenceYear(now = new Date()) {
  return now.getFullYear();
}

/**
 * The date to send as swimmingresults.org's `date` param. It sets the age-group
 * reference date only — the ranked times are always the trailing 12 months from
 * today regardless of what is passed.
 */
export function getAgeGroupReferenceDate(referenceYear) {
  return `31/12/${referenceYear}`;
}

export function getSeasonAge(yearOfBirth, seasonYear) {
  if (!yearOfBirth) return null;
  return seasonYear - yearOfBirth;
}
