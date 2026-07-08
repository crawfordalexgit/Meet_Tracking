/**
 * Relay lineup optimiser — pure functions, no I/O.
 *
 * Turns a roster of swimmers (with their 50m short-course PBs) into the fastest
 * legal relay teams for the Kent Relays event grid. "Legal" enforces every
 * condition encoded in kent-relays-config.js: age bands, gender composition,
 * medley = four distinct strokes, and one-team-per-band-per-event.
 *
 * Entry time = sum of the four legs' 50m PBs (cond 5.2).
 */

import {
  AGE_BANDS, CATEGORIES, LEG_EVENT, MEDLEY_LEGS, relayEvents,
} from './kent-relays-config.js';
import { normalizeEvent } from '../analytics-utils.js';

const STROKES = ['Back', 'Breast', 'Fly', 'Free'];
const NORM_LEG_EVENT = Object.fromEntries(
  Object.entries(LEG_EVENT).map(([leg, ev]) => [leg, normalizeEvent(ev)])
);

/** 'F' if the swimmer's gender starts with F, else 'M'. */
function sex(g) {
  return (g || '').toString().trim().toUpperCase().startsWith('F') ? 'F' : 'M';
}

/**
 * Build the enriched swimmer pool the optimiser works on.
 *
 * @param {Array} swimmers  rows with { id, full_name, known_as, year_of_birth, gender }
 * @param {Object} pbsBySwimmer  { [swimmerId]: [{ event, course, time_seconds }] } — course 'S' only
 * @param {number} ageYear  meet age year (2026)
 * @returns {Array} [{ id, name, age, sex, times:{Back,Breast,Fly,Free} }]
 */
export function buildSwimmerPool(swimmers, pbsBySwimmer, ageYear) {
  return (swimmers || []).map((s) => {
    const pbs = pbsBySwimmer[s.id] || [];
    const times = {};
    for (const leg of STROKES) {
      const wantNorm = NORM_LEG_EVENT[leg];
      let best = null;
      for (const pb of pbs) {
        if (normalizeEvent(pb.event || '') !== wantNorm) continue;
        const t = Number(pb.time_seconds);
        if (!t || t <= 0) continue;
        if (best === null || t < best) best = t;
      }
      times[leg] = best;
    }
    return {
      id: s.id,
      name: s.known_as ? `${s.known_as}` : (s.full_name || 'Unknown'),
      fullName: s.full_name || '',
      age: s.year_of_birth ? ageYear - s.year_of_birth : null,
      yob: s.year_of_birth || null,
      sex: sex(s.gender),
      times,
    };
  });
}

/**
 * Swimmers eligible for one event: right age band, right sex, and holding the
 * PB(s) the relay needs. Returns { pool, benched } where benched are age/sex-
 * eligible swimmers who lack a required 50m time (can't be placed).
 */
export function eligiblePool(pool, event, { allowAnyGender = false } = {}) {
  const { band, cat, relay } = event;
  const needFree = relay.key === 'FREE';
  const okAge = (p) => p.age != null && p.age <= band.maxAge;
  const okSex = (p) => {
    if (cat.key === 'F') return p.sex === 'F';
    if (cat.key === 'M') return allowAnyGender ? true : p.sex === 'M';
    return true; // mixed — both sexes allowed
  };
  const hasTime = (p) =>
    needFree ? p.times.Free != null : STROKES.some((l) => p.times[l] != null);

  const eligible = pool.filter((p) => okAge(p) && okSex(p));
  return {
    pool: eligible.filter(hasTime),
    benched: eligible.filter((p) => !hasTime(p)),
  };
}

function meetsComposition(members, composition) {
  if (composition === '4F') return members.every((m) => m.sex === 'F');
  if (composition === '4M') return true; // pool already male-filtered (or any allowed)
  // 2M2F
  const f = members.filter((m) => m.sex === 'F').length;
  return f === 2 && members.length === 4;
}

/** Fastest 4×50 free team from a pool, honouring mixed 2M+2F. */
function bestFreeTeam(pool, composition) {
  const withFree = pool.filter((p) => p.times.Free != null);
  let picked;
  if (composition === '2M2F') {
    const fs = withFree.filter((p) => p.sex === 'F').sort((a, b) => a.times.Free - b.times.Free);
    const ms = withFree.filter((p) => p.sex === 'M').sort((a, b) => a.times.Free - b.times.Free);
    if (fs.length < 2 || ms.length < 2) return null;
    picked = [fs[0], fs[1], ms[0], ms[1]];
  } else {
    const sorted = [...withFree].sort((a, b) => a.times.Free - b.times.Free);
    if (sorted.length < 4) return null;
    picked = sorted.slice(0, 4);
  }
  const legs = picked.map((s) => ({ stroke: 'Free', swimmer: s, time: s.times.Free }));
  return { legs, total: legs.reduce((a, l) => a + l.time, 0) };
}

/**
 * Fastest 4×50 medley team (Back·Breast·Fly·Free, four distinct swimmers).
 *
 * Assignment problem. We restrict each leg to its fastest few candidates and
 * brute-force the ≤8^4 combinations — for an unconstrained medley the optimum
 * provably uses each leg's top-4 (only 3 other legs can block a cheaper pick),
 * and top-8 comfortably covers the mixed 2M+2F case too.
 */
function bestMedleyTeam(pool, composition) {
  const cand = {};
  for (const leg of MEDLEY_LEGS) {
    cand[leg] = pool
      .filter((p) => p.times[leg] != null)
      .sort((a, b) => a.times[leg] - b.times[leg])
      .slice(0, 8);
    if (cand[leg].length === 0) return null;
  }
  let best = null;
  for (const bk of cand.Back) {
    for (const br of cand.Breast) {
      if (br.id === bk.id) continue;
      for (const fl of cand.Fly) {
        if (fl.id === bk.id || fl.id === br.id) continue;
        for (const fr of cand.Free) {
          if (fr.id === bk.id || fr.id === br.id || fr.id === fl.id) continue;
          const members = [bk, br, fl, fr];
          if (!meetsComposition(members, composition)) continue;
          const total = bk.times.Back + br.times.Breast + fl.times.Fly + fr.times.Free;
          if (best === null || total < best.total) {
            best = {
              total,
              legs: [
                { stroke: 'Back', swimmer: bk, time: bk.times.Back },
                { stroke: 'Breast', swimmer: br, time: br.times.Breast },
                { stroke: 'Fly', swimmer: fl, time: fl.times.Fly },
                { stroke: 'Free', swimmer: fr, time: fr.times.Free },
              ],
            };
          }
        }
      }
    }
  }
  return best;
}

/** Fastest legal team for one event from an already-eligible pool. */
export function bestTeam(pool, event) {
  return event.relay.key === 'FREE'
    ? bestFreeTeam(pool, event.cat.composition)
    : bestMedleyTeam(pool, event.cat.composition);
}

/**
 * Optimise the whole meet.
 *
 * @param {Array}  pool  from buildSwimmerPool
 * @param {Object} opts
 * @param {number} opts.depth           teams to build per event (A=1, A+B=2…)
 * @param {number} opts.capPerSwimmer   max relays any one swimmer is assigned to
 * @param {boolean} opts.allowAnyGender allow females in the Open/Male category
 * @returns {Object} { [eventKey]: { event, teams:[{letter,legs,total,capForced}], benched, shortfall } }
 */
export function optimiseMeet(pool, { depth = 2, capPerSwimmer = Infinity, allowAnyGender = false } = {}) {
  const events = relayEvents();
  const usage = {};                 // swimmerId → relays assigned so far
  const result = {};
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, Math.max(1, depth));

  for (const event of events) {
    const { pool: elig, benched } = eligiblePool(pool, event, { allowAnyGender });
    // Uncapped A-team best, for flagging cap-forced compromises.
    const uncapped = bestTeam(elig, event);
    result[event.key] = {
      event,
      teams: [],
      benched,
      eligibleCount: elig.length,
      uncappedBest: uncapped ? uncapped.total : null,
      shortfall: elig.length < 4,
    };
  }

  for (const letter of letters) {
    for (const event of events) {
      const slot = result[event.key];
      const usedThisEvent = new Set(slot.teams.flatMap((t) => t.legs.map((l) => l.swimmer.id)));
      const { pool: elig } = eligiblePool(pool, event, { allowAnyGender });
      const avail = elig.filter(
        (p) => !usedThisEvent.has(p.id) && (usage[p.id] || 0) < capPerSwimmer
      );
      const team = bestTeam(avail, event);
      if (!team) continue;
      for (const l of team.legs) usage[l.swimmer.id] = (usage[l.swimmer.id] || 0) + 1;
      slot.teams.push({
        letter,
        legs: team.legs,
        total: team.total,
        // A-team materially slower than the uncapped ideal ⇒ the cap forced a compromise.
        capForced:
          letter === 'A' && slot.uncappedBest != null && team.total > slot.uncappedBest + 0.01,
      });
    }
  }
  return result;
}

/**
 * Re-optimise a single team in place given the swimmers already committed to
 * other letters of the same event and a set of swimmer ids to exclude
 * (e.g. capped out). Used by the "re-optimise this team" button.
 */
export function reoptimiseTeam(pool, event, { excludeIds = new Set(), allowAnyGender = false } = {}) {
  const { pool: elig } = eligiblePool(pool, event, { allowAnyGender });
  const avail = elig.filter((p) => !excludeIds.has(p.id));
  return bestTeam(avail, event);
}

/** Total entry fee across all selected teams. */
export function totalFee(result, feePerTeam) {
  const teams = Object.values(result).reduce((n, slot) => n + slot.teams.length, 0);
  return { teams, fee: teams * feePerTeam };
}

/** Distinct swimmers used across the whole meet. */
export function swimmersUsed(result) {
  const ids = new Set();
  for (const slot of Object.values(result)) {
    for (const t of slot.teams) for (const l of t.legs) ids.add(l.swimmer.id);
  }
  return ids.size;
}

export { STROKES, sex };
