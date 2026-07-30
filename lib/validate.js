// Shared input guards for API routes.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Several routes build PostgREST filter strings by interpolation, e.g.
 *   .or(`id.eq.${meetId},parent_id.eq.${meetId}`)
 * An unvalidated value there rewrites the filter expression and selects
 * arbitrary rows through a service-role client. Validate before interpolating.
 */
export function assertUuid(value, label = 'id') {
  if (!isUuid(value)) {
    throw new Error(`Invalid ${label}: expected a UUID`);
  }
  return value;
}

/**
 * Escapes the PostgREST/SQL LIKE wildcards in a value that is about to be used
 * as an ilike() pattern. Without this, a value of "%" matches every row —
 * which on an UPDATE means rewriting the whole table.
 */
export function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, m => `\\${m}`);
}
