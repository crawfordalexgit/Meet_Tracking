/**
 * What the registers would have said, had they been taken.
 *
 * Two thirds of this club's registers are taken, so every attendance figure it
 * publishes is roughly two thirds of the truth — and a squad whose coach marks
 * the sheet looks worse than one whose coach does not. Filling a missing night
 * with that session's own average removes that penalty, and it is what an
 * outside report of the same figures appeared to have done to reach a club
 * total half again as large as ours.
 *
 * This is an estimate and never data. Nothing here is written back to the
 * database, every figure is returned beside the measured one it came from, and
 * a session with no register at all is returned as unknown rather than
 * estimated from its squad or filled with a zero. An average of nothing is not
 * an average.
 *
 * The honest part is the uncertainty. A single night varies about 38% around
 * its session's mean in this club, which makes one imputed night a poor guess.
 * Imputed nights are summed, though, and independent errors grow with the
 * square root of the count while the total grows with the count — so the club
 * figure is far firmer than any session in it. Both are returned, so nobody
 * quotes a session estimate with the confidence only the total has earned.
 *
 * Pure: counts in, estimates out.
 */

/** Below this many registers, a session's average is not an average. */
const MIN_REGISTERS_TO_ESTIMATE = 4;

/** Above this spread, the mean describes nothing anybody should plan against. */
const HIGH_VARIANCE_CV = 0.6;

/**
 * More nights imputed than observed, and the estimate is mostly invention.
 * The figure is still returned — it is the best available — but it is marked.
 */
const THIN_EVIDENCE_RATIO = 1.5;

export function mean(values) {
  if (!values || !values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values) {
  const m = mean(values);
  if (m === null) return null;
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

/**
 * One session's attendance, measured and estimated.
 *
 * `headcounts` is the number present on each night a register was taken.
 * `expected` is how many nights the session actually ran, already net of
 * closures — a night the pool was shut is not a missing register and must not
 * be filled in with swimmers who could not have been there.
 *
 * `rosterCount` caps an estimate: a session cannot have had more swimmers in it
 * than are booked onto it, however the average falls.
 */
export function estimateSession({ headcounts = [], expected = 0, rosterCount = 0, name = null } = {}) {
  const taken = headcounts.length;
  const missing = Math.max(0, expected - taken);
  const measured = headcounts.reduce((a, b) => a + b, 0);
  const avg = mean(headcounts);
  const sd = stdDev(headcounts);
  const cv = avg > 0 ? sd / avg : null;

  const base = {
    name, taken, expected, missing, measured,
    mean: avg === null ? null : +avg.toFixed(2),
    sd: sd === null ? null : +sd.toFixed(2),
    cv: cv === null ? null : +cv.toFixed(2)
  };

  if (taken === 0) {
    return {
      ...base,
      estimated: null,
      uncertainty: null,
      basis: 'unknown',
      note: `No register was taken in ${expected} nights, so there is no average to fill the gaps with. This session's attendance is unknown, not zero.`
    };
  }

  if (missing === 0) {
    return {
      ...base,
      estimated: measured,
      uncertainty: 0,
      basis: 'measured',
      note: 'Every night this session ran has a register. Nothing is estimated.'
    };
  }

  if (taken < MIN_REGISTERS_TO_ESTIMATE) {
    return {
      ...base,
      estimated: null,
      uncertainty: null,
      basis: 'too-few',
      note: `Only ${taken} registers to average from. That is not enough to stand in for ${missing} nights.`
    };
  }

  const capped = rosterCount > 0 ? Math.min(avg, rosterCount) : avg;
  const filled = capped * missing;
  // Independent per-night errors, so the error on their sum grows with the
  // square root of how many nights are filled, not with the count.
  const uncertainty = sd * Math.sqrt(missing);

  const flags = [];
  if (cv !== null && cv > HIGH_VARIANCE_CV) flags.push('varies');
  if (missing > taken * THIN_EVIDENCE_RATIO) flags.push('thin');

  return {
    ...base,
    estimated: +(measured + filled).toFixed(1),
    uncertainty: +uncertainty.toFixed(1),
    basis: 'estimated',
    flags,
    note: `${taken} registers averaging ${capped.toFixed(1)} swimmers, used to fill ${missing} nights with no register.`
      + (flags.includes('varies') ? ` Attendance swings widely on this session (${Math.round(cv * 100)}%), so the average describes it loosely.` : '')
      + (flags.includes('thin') ? ` More nights are filled in than were ever recorded, so most of this figure is inferred.` : '')
  };
}

/**
 * The club figure, and how much of it was never actually seen.
 *
 * Uncertainties are combined in quadrature rather than added: they are
 * independent, so adding them would overstate the doubt on the total by about
 * the same factor it understates the value of having many sessions.
 */
export function estimateTotal(sessions) {
  const rows = (sessions || []).filter(Boolean);
  const usable = rows.filter(r => r.basis === 'estimated' || r.basis === 'measured');

  const measured = rows.reduce((n, r) => n + (r.measured || 0), 0);
  const estimated = usable.reduce((n, r) => n + (r.estimated || 0), 0);
  const variance = usable.reduce((n, r) => n + (r.uncertainty || 0) ** 2, 0);
  const unknown = rows.filter(r => r.basis === 'unknown');
  const tooFew = rows.filter(r => r.basis === 'too-few');

  return {
    measured,
    estimated: +estimated.toFixed(1),
    // Measured nights that the estimate did not have to guess at.
    filledIn: +(estimated - usable.reduce((n, r) => n + (r.measured || 0), 0)).toFixed(1),
    uncertainty: +Math.sqrt(variance).toFixed(1),
    sessions: rows.length,
    estimatedSessions: usable.filter(r => r.basis === 'estimated').length,
    unknownSessions: unknown.length,
    tooFewSessions: tooFew.length,
    // Sessions nothing can be said about are named, because they are the part
    // of the club this method cannot reach and a total should not hide them.
    unreachable: [...unknown, ...tooFew].map(r => ({ name: r.name, basis: r.basis, taken: r.taken, expected: r.expected }))
  };
}

export const ESTIMATE_THRESHOLDS = {
  MIN_REGISTERS_TO_ESTIMATE, HIGH_VARIANCE_CV, THIN_EVIDENCE_RATIO
};
