/**
 * Swimmers booked onto a session they have never been recorded swimming.
 *
 * A ghost is a place nobody is standing in. The club uses the list to reclaim
 * lanes, so every name on it is an accusation of sorts — and half of them were
 * not the swimmer's doing. A session whose coach never opened a register makes
 * a ghost of every swimmer on it at once, and so does a week the pool was shut.
 * Reclaiming those lanes would take water away from squads that were using it
 * and hand it to whoever asked most recently.
 *
 * So a ghost is reported with the reason it looks like one, and the ones the
 * register cannot vouch for are separated from the ones it can. The first group
 * is a conversation with a coach. Only the second is a conversation about a
 * swimmer's place.
 *
 * Pure: rows in, findings out.
 */

/** Below this share of nights registered, the session cannot vouch for anybody. */
const UNRELIABLE_COVERAGE = 60;

/**
 * Why this swimmer has no recorded swim.
 *
 * Ordered by who has to act. "No register" is a coach; "patchy" is a coach with
 * a partial record; "reliable" is the only one where the absence is evidence
 * about the swimmer.
 */
export function ghostReason(health) {
  if (!health) {
    return {
      key: 'unknown',
      label: 'No register data',
      trust: 'none',
      detail: 'This session has no register record in the window at all, so nothing can be concluded about who swam.'
    };
  }
  if (health.taken === 0) {
    return {
      key: 'never',
      label: 'Register never taken',
      trust: 'none',
      detail: `The register was not taken once in ${health.expected} nights, so every swimmer on this session looks like a ghost whether they swam or not.`
    };
  }
  if (health.coveragePct !== null && health.coveragePct < UNRELIABLE_COVERAGE) {
    return {
      key: 'patchy',
      label: `Register only ${health.coveragePct}% taken`,
      trust: 'weak',
      detail: `Taken on ${health.taken} of ${health.expected} nights. A swimmer could have attended on any of the ${health.expected - health.taken} nights nobody wrote down.`
    };
  }
  return {
    key: 'reliable',
    label: 'Register reliable',
    trust: 'good',
    detail: `Taken on ${health.taken} of ${health.expected} nights and this swimmer appears on none of them.`
  };
}

/**
 * The ghost list, each entry carrying what the register can and cannot say.
 *
 * `presentKeys` is the set of "swimmerId|sessionId" pairs with at least one
 * recorded swim. Memberships on a retired session are dropped rather than
 * reported: the session owes nothing and the membership is tidy-up, not a
 * ghost.
 */
export function findGhosts({ memberships, swimmers, sessions, presentKeys, healthBySession = {} }) {
  const swimmerById = new Map((swimmers || []).map(s => [s.id, s]));
  const sessionById = new Map((sessions || []).map(s => [s.id, s]));

  const orphans = { noSwimmer: 0, noSession: 0, retiredSession: 0 };
  const rows = [];

  (memberships || []).forEach(m => {
    if (!m) return;
    const swimmer = swimmerById.get(m.swimmer_id);
    if (!swimmer) { orphans.noSwimmer++; return; }
    const session = sessionById.get(m.session_id);
    if (!session) { orphans.noSession++; return; }
    if (session.is_active === false) { orphans.retiredSession++; return; }
    if (presentKeys.has(m.swimmer_id + '|' + m.session_id)) return;

    const health = healthBySession[m.session_id] || null;
    const reason = ghostReason(health);
    rows.push({
      swimmerId: swimmer.id,
      swimmerName: swimmer.full_name,
      squadName: swimmer.squads?.name || swimmer.squadName || 'No squad',
      sessionId: session.id,
      sessionName: session.name,
      sessionDay: session.day || session.day_of_week || null,
      sessionTime: session.start_time || null,
      venue: session.location || null,
      registerTaken: health ? health.taken : null,
      registerExpected: health ? health.expected : null,
      coveragePct: health ? health.coveragePct : null,
      reason
    });
  });

  rows.sort((a, b) =>
    (a.squadName || '').localeCompare(b.squadName || '') ||
    (a.sessionName || '').localeCompare(b.sessionName || '') ||
    (a.swimmerName || '').localeCompare(b.swimmerName || ''));

  return { rows, orphans };
}

/**
 * The ghosts gathered under the squad whose lanes they are.
 *
 * Squad order is by how many places could actually be reclaimed, not by how
 * many ghosts there are — a squad with twenty ghosts on an unregistered session
 * has nothing to reclaim and should not head the list.
 */
export function groupGhostsBySquad(rows) {
  const groups = new Map();
  (rows || []).forEach(r => {
    const key = r.squadName || 'No squad';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  return Array.from(groups.entries())
    .map(([squad, list]) => ({
      squad,
      rows: list,
      total: list.length,
      reclaimable: list.filter(r => r.reason.trust === 'good').length,
      unverifiable: list.filter(r => r.reason.trust !== 'good').length,
      swimmers: new Set(list.map(r => r.swimmerId)).size
    }))
    .sort((a, b) => b.reclaimable - a.reclaimable || b.total - a.total);
}

/**
 * Sessions where every swimmer on the roster is a ghost.
 *
 * One swimmer never recorded is a swimmer. A whole roster never recorded is a
 * register, and reading it as twelve absent swimmers is how a session gets its
 * lanes taken away for a fault that was never theirs.
 */
export function wholeRosterGhosts(rows, rosterBySession = {}) {
  const bySession = new Map();
  (rows || []).forEach(r => {
    if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, []);
    bySession.get(r.sessionId).push(r);
  });

  const out = [];
  bySession.forEach((list, sessionId) => {
    const roster = rosterBySession[sessionId] || 0;
    if (roster >= 3 && list.length === roster) {
      out.push({
        sessionId,
        sessionName: list[0].sessionName,
        venue: list[0].venue,
        day: list[0].sessionDay,
        roster,
        reason: list[0].reason,
        detail: `Every one of the ${roster} swimmers on this session has no recorded swim. That is a register, not ${roster} swimmers.`
      });
    }
  });
  return out.sort((a, b) => b.roster - a.roster);
}

export function summariseGhosts(rows, orphans = {}) {
  const byReason = {};
  (rows || []).forEach(r => { byReason[r.reason.key] = (byReason[r.reason.key] || 0) + 1; });
  return {
    total: rows.length,
    reclaimable: rows.filter(r => r.reason.trust === 'good').length,
    unverifiable: rows.filter(r => r.reason.trust !== 'good').length,
    swimmers: new Set(rows.map(r => r.swimmerId)).size,
    sessions: new Set(rows.map(r => r.sessionId)).size,
    byReason,
    orphans
  };
}

export const GHOST_THRESHOLDS = { UNRELIABLE_COVERAGE };
