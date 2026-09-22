/**
 * A closure that took one pool away, not the whole club.
 *
 * The club loses a pool from time to time — a boiler, a gala, a leisure centre
 * letting the booking go. Everything that happens next is the same shape as a
 * club shutdown but narrower: no register is owed for the sessions in that
 * water, and no swimmer who was not there should be counted as having missed
 * anything. Recording it as a club-wide closure would excuse every session in
 * every other pool at the same time, which is how a fortnight of real absence
 * quietly disappears.
 *
 * So a closure carries an optional venue. No venue means the whole club, which
 * is what every closure recorded before this meant, so nothing already in the
 * table changes meaning.
 *
 * Pure: rows in, answers out.
 */

/**
 * Venue names as typed by humans into two systems.
 *
 * "Tonbridge Town Pool" and "tonbridge town pool " are one pool; "Tonbridge
 * Town Pool - SP" is a different one and must not be folded into it, so this
 * only tidies case and spacing and never trims a suffix.
 */
export function normaliseVenue(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Does this closure cover this venue? A closure with no venue covers them all. */
export function closureCoversVenue(closure, venue) {
  if (!closure) return false;
  if (!closure.venue) return true;
  return normaliseVenue(closure.venue) === normaliseVenue(venue);
}

/**
 * The closure that shut this venue on this date, or null.
 *
 * Only `exempt` rows count. A `credit` is a bank holiday the club trains
 * through and excuses nobody from anything; reading one as a closure is how
 * 112 bank-holiday registers were wrongly cleared once already.
 */
export function closureOn(dateKey, venue, exemptions = []) {
  if (!dateKey) return null;
  return (exemptions || []).find(c =>
    c && c.type === 'exempt' &&
    dateKey >= c.start_date && dateKey <= c.end_date &&
    closureCoversVenue(c, venue)) || null;
}

/** Was this venue shut on this date? */
export function isVenueClosed(dateKey, venue, exemptions = []) {
  return closureOn(dateKey, venue, exemptions) !== null;
}

/**
 * Attendance marks with the ones recorded inside a closure taken out.
 *
 * When a pool goes, some coaches cancel and some open the register anyway and
 * mark the squad absent — this club had eleven sessions' worth of absences
 * recorded across a fortnight when the water was not there. Left in, they read
 * as swimmers who could not be bothered, and they land on the swimmer's record
 * rather than the pool's.
 *
 * `venueOf` maps a mark to the venue of the session it belongs to, so the
 * caller decides where that comes from. A mark whose venue cannot be resolved
 * is kept: dropping attendance on a guess is worse than keeping it.
 */
export function excuseMarks(marks, venueOf, exemptions = []) {
  const kept = [];
  const excused = [];
  (marks || []).forEach(m => {
    if (!m || !m.date) { kept.push(m); return; }
    const venue = typeof venueOf === 'function' ? venueOf(m) : null;
    if (venue == null) { kept.push(m); return; }
    const closure = closureOn(String(m.date).slice(0, 10), venue, exemptions);
    if (closure) excused.push({ mark: m, closure });
    else kept.push(m);
  });
  return { kept, excused };
}

/** One line a coach can read: which pool, which dates, and why nothing is owed. */
export function describeClosure(closure) {
  if (!closure) return '';
  const where = closure.venue ? closure.venue : 'the whole club';
  const when = closure.start_date === closure.end_date
    ? closure.start_date
    : `${closure.start_date} to ${closure.end_date}`;
  return `${closure.name || 'Closure'} — ${where}, ${when}. No register was owed and nobody is counted absent.`;
}

/**
 * Every venue a set of closures names, for a filter or a settings dropdown.
 */
export function closedVenues(exemptions = []) {
  const seen = new Map();
  (exemptions || []).forEach(c => {
    if (c && c.type === 'exempt' && c.venue) seen.set(normaliseVenue(c.venue), c.venue);
  });
  return Array.from(seen.values());
}
