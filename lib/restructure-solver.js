/**
 * Squad restructuring / pool-time scenario solver.
 *
 * Pure module: no I/O, no Supabase, no Date.now(), no Math.random(). Given a
 * scenario `inputs` blob it returns a proposed timetable and the metrics that
 * score it. Determinism is load-bearing — the screen, the spreadsheet export and
 * the Puppeteer PDF all re-run this on the same inputs and must agree, so any
 * ambiguity in ordering is broken with an explicit id tie-break rather than left
 * to the engine's sort stability.
 *
 * Companion I/O module: lib/restructure-baseline.js (seeds inputs from the DB).
 * Follows the shape of lib/relays/relay-optimizer.js — the club's other pure
 * combinatorial solver — rather than the page-embedded rebalance engine in
 * pages/capacity.js, which solves a different problem (per-swimmer allocation
 * inside one squad against a timetable that already exists).
 */

import { DAY_NAMES_FULL, getDayOrder, getSessionDuration } from './analytics-utils';
import { UNIFIED_LTAD_STAGES } from './ai-training-data';
import { LTAD_STAGES } from './ltad-benchmarks';

/**
 * Which LTAD volume table scores squad hours.
 *
 * 'unified' (default) is UNIFIED_LTAD_STAGES from lib/ai-training-data.js. It is
 * numerically identical to the club's own commissioned reference
 * (AiTraining/LTAD-SwimmerProgression_TrainingTargets.md section 5.1), and its six
 * bands — Train to Train split 11-13 / 13-15 — are the granularity a
 * squad-structure tool needs. lib/ltad-benchmarks.js keeps a coarser five-band
 * model whose single 12-15 band cannot justify separating two squads; it is left
 * untouched for its existing per-swimmer consumers (lib/ai-context.js,
 * components/VorontsovLTADModule.js). Do not "reconcile" the two tables — they
 * answer different questions.
 */
export const LTAD_TABLES = {
  unified: UNIFIED_LTAD_STAGES.map(s => ({
    name: s.name, minAge: s.minAge, maxAge: s.maxAge,
    min: s.poolHours.min, max: s.poolHours.max
  })),
  benchmarks: LTAD_STAGES.map(s => ({
    name: s.name, minAge: s.minAge, maxAge: s.maxAge,
    min: s.minHours, max: s.maxHours
  }))
};

export const WEEKEND_DAYS = ['Saturday', 'Sunday'];

export const DEFAULT_POLICY = {
  schoolNights: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
  timeWindows: [
    { maxAge: 10, schoolNightEnd: '19:00', otherEnd: '20:00', earliestStart: '07:30', morningsDiscouraged: true },
    { maxAge: 12, schoolNightEnd: '20:00', otherEnd: '21:00', earliestStart: '07:00', morningsDiscouraged: true },
    { maxAge: 14, schoolNightEnd: '20:30', otherEnd: '21:30', earliestStart: '06:00', morningsDiscouraged: false },
    { maxAge: 99, schoolNightEnd: '21:30', otherEnd: '22:00', earliestStart: '05:30', morningsDiscouraged: false }
  ],
  curfewPenaltyPerMinute: 0.5,
  venueTransitMinutes: 30,
  minRestHoursBetweenSessions: 24,
  requireCoachCover: false,
  showRate: 1.0,
  ltadTable: 'unified',
  maxLanesPerCoach: 3,
  minCoachesPerSquadSession: 1,
  minCoachesPerSquadSessionUnder14: 2
};

export const DEFAULT_WEIGHTS = {
  ltad: 25, utilisation: 20, served: 25, coachCover: 15, timetableQuality: 10, continuity: 5
};

export const DEFAULT_GROWTH = { expectedNewSwimmers: 0, attritionPct: 0 };

/** Minutes since midnight. Returns null for anything unparseable. */
export function timeToMinutes(t) {
  if (typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToTime(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Slot length in hours.
 *
 * Delegates to getSessionDuration (lib/analytics-utils.js) so an operator-typed
 * candidate slot and a slot derived from the sessions table are measured by the
 * identical fallback chain. That function ends in a 1.5h default when it can
 * find nothing at all, which is why the baseline reports how many rows hit it.
 */
export function slotDurationHours(slot) {
  return getSessionDuration({
    start_time: slot.startTime,
    end_time: slot.endTime,
    name: slot.label || slot.name || ''
  });
}

/** True when two normalised slots share a day and their time ranges intersect. */
export function slotsOverlap(a, b) {
  if (a.day !== b.day) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/**
 * Gap in minutes between two slots on the same day, or null when they are on
 * different days. Negative means they overlap.
 */
export function gapMinutes(a, b) {
  if (a.day !== b.day) return null;
  if (a.startMin >= b.endMin) return a.startMin - b.endMin;
  if (b.startMin >= a.endMin) return b.startMin - a.endMin;
  return -1;
}

/**
 * The LTAD volume band covering an age range, as the union of every stage the
 * range touches.
 *
 * Deliberately not getUnifiedLTADStage(age): that returns the *highest* matching
 * stage on overlap, so a 13-14 squad would be scored against Train to Compete
 * (14-20h) alone and read as badly underloaded when Train to Train (Late)
 * (12-16h) applies just as much. Union is the honest read of a mixed-age band.
 */
export function ltadBandForAgeRange(minAge, maxAge, tableName = 'unified') {
  const table = LTAD_TABLES[tableName] || LTAD_TABLES.unified;
  const lo = Math.min(minAge, maxAge);
  const hi = Math.max(minAge, maxAge);
  const stages = table.filter(s => hi >= s.minAge && lo <= s.maxAge);
  if (!stages.length) return { min: 0, max: 0, stageNames: [], stageCount: 0 };
  return {
    min: Math.min(...stages.map(s => s.min)),
    max: Math.max(...stages.map(s => s.max)),
    stageNames: stages.map(s => s.name),
    stageCount: stages.length
  };
}

/**
 * Whether an age band is too wide for any single weekly volume to suit it.
 *
 * The stage count alone is not the test: the LTAD stages overlap at their
 * boundaries (13 sits in both Train to Train Early and Late, 14 in both Late and
 * Train to Compete), so even a one-year band routinely touches three stages. A
 * warning that fires on every squad teaches people to ignore it. Requiring a
 * genuinely wide age span as well leaves the flag meaning what it says.
 */
export function isBandTooWide(minAge, maxAge, band) {
  return band.stageCount >= 3 && (Math.abs(maxAge - minAge) >= 3);
}

/**
 * How well a squad's weekly hours sit inside its LTAD band.
 *
 * Reported alongside gapHours rather than as a pass/fail badge: the club's real
 * targets (Gold Development 4h, Age Development 8h) sit under the unified band
 * for their ages, so a bare verdict column would read all-red and be ignored.
 * The size of the gap is the part a coach can act on.
 */
export function ltadScore(hours, band) {
  if (!band || !band.stageCount || !(hours > 0)) {
    return { score: 0, verdict: 'UNKNOWN', gapHours: 0 };
  }
  if (hours < band.min) {
    return {
      score: Math.max(0, 100 - ((band.min - hours) / band.min) * 100),
      verdict: 'UNDERLOAD',
      gapHours: +(hours - band.min).toFixed(2)
    };
  }
  if (hours > band.max) {
    return {
      score: Math.max(0, 100 - ((hours - band.max) / band.max) * 100),
      verdict: 'OVERLOAD',
      gapHours: +(hours - band.max).toFixed(2)
    };
  }
  return { score: 100, verdict: 'OPTIMAL', gapHours: 0 };
}

/**
 * Weekly hours to score a squad against.
 *
 * Bronze and Silver carry target_hours_per_week = 0 in the live database, so
 * every hours-derived metric would collapse to zero for them. Derive from
 * sessions x median session length instead, flag it, and never write the derived
 * figure back to the squads table — the zero is the club's data, not a bug to
 * silently patch.
 */
export function resolveEffectiveTargetHours(squad) {
  const configured = Number(squad.targetHoursPerWeek) || 0;
  if (configured > 0) return { hours: configured, derived: false };
  const sessions = Number(squad.targetSessionsPerWeek) || 0;
  if (sessions > 0) {
    const median = Number(squad.medianSessionHours) > 0 ? Number(squad.medianSessionHours) : 1.0;
    return { hours: +(sessions * median).toFixed(2), derived: true };
  }
  return { hours: 0, derived: true };
}

/** The time-window band a squad is judged by — set by its YOUNGEST member. */
export function timeWindowForSquad(squad, policy) {
  const windows = policy.timeWindows || DEFAULT_POLICY.timeWindows;
  const sorted = [...windows].sort((a, b) => a.maxAge - b.maxAge);
  return sorted.find(w => squad.minAge <= w.maxAge) || sorted[sorted.length - 1];
}

/**
 * Youth time-of-day penalty for putting `squad` in `slot`.
 *
 * Soft by design: a late finish for a young squad is scored, flagged and shown,
 * never hidden. Seeing that an option costs 75 minutes past the guide is more
 * useful than being told the option does not exist.
 */
export function curfewPenalty(squad, slot, policy) {
  const band = timeWindowForSquad(squad, policy);
  if (!band) return { penalty: 0, overrunMins: 0, earlyMins: 0, reason: null };

  const schoolNights = policy.schoolNights || DEFAULT_POLICY.schoolNights;
  const isSchoolNight = schoolNights.includes(slot.day);
  const capTime = isSchoolNight ? band.schoolNightEnd : band.otherEnd;
  const cap = timeToMinutes(capTime);
  const floor = timeToMinutes(band.earliestStart);

  const overrunMins = cap == null ? 0 : Math.max(0, slot.endMin - cap);
  const earlyMins = floor == null ? 0 : Math.max(0, floor - slot.startMin);
  const isMorning = slot.startMin < 12 * 60;
  const multiplier = band.morningsDiscouraged && isMorning ? 2 : 1;
  const rate = policy.curfewPenaltyPerMinute == null
    ? DEFAULT_POLICY.curfewPenaltyPerMinute
    : policy.curfewPenaltyPerMinute;
  const penalty = (overrunMins + earlyMins) * rate * multiplier;

  let reason = null;
  if (overrunMins > 0) {
    reason = `finishes ${slot.endTime}, ${overrunMins} min past the ${capTime} ${isSchoolNight ? 'school-night' : 'non-school-night'} guide for age ${squad.minAge}`;
  } else if (earlyMins > 0) {
    reason = `starts ${slot.startTime}, ${earlyMins} min before the ${band.earliestStart} guide for age ${squad.minAge}`;
  }
  return { penalty, overrunMins, earlyMins, reason };
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export function validateInputs(inputs) {
  const errors = [];
  const warnings = [];
  const i = inputs || {};

  const slots = Array.isArray(i.poolSlots) ? i.poolSlots : [];
  const squads = Array.isArray(i.squads) ? i.squads : [];
  const coaches = Array.isArray(i.coaches) ? i.coaches : [];

  if (!slots.length) errors.push('No pool slots defined.');
  if (!squads.length) errors.push('No squads defined.');

  const slotIds = new Set();
  slots.forEach((s, idx) => {
    const where = s.label || s.id || `slot #${idx + 1}`;
    if (!s.id) errors.push(`${where}: missing id.`);
    else if (slotIds.has(s.id)) errors.push(`${where}: duplicate slot id "${s.id}".`);
    else slotIds.add(s.id);

    if (!DAY_NAMES_FULL.includes(s.day)) errors.push(`${where}: day "${s.day}" is not a weekday name.`);
    const start = timeToMinutes(s.startTime);
    const end = timeToMinutes(s.endTime);
    if (start == null) errors.push(`${where}: start time "${s.startTime}" is not HH:MM.`);
    if (end == null) errors.push(`${where}: end time "${s.endTime}" is not HH:MM.`);
    if (start != null && end != null && end <= start) errors.push(`${where}: ends at or before it starts.`);
    if (!(Number(s.lanes) >= 1)) errors.push(`${where}: lanes must be at least 1.`);
    if (!s.venue) warnings.push(`${where}: no venue set; the travel guard cannot protect it.`);
  });

  const squadIds = new Set();
  squads.forEach((sq, idx) => {
    const where = sq.name || sq.id || `squad #${idx + 1}`;
    if (!sq.id) errors.push(`${where}: missing id.`);
    else if (squadIds.has(sq.id)) errors.push(`${where}: duplicate squad id "${sq.id}".`);
    else squadIds.add(sq.id);

    const minAge = Number(sq.minAge);
    const maxAge = Number(sq.maxAge);
    if (!Number.isFinite(minAge) || !Number.isFinite(maxAge)) errors.push(`${where}: age band is not numeric.`);
    else if (minAge > maxAge) errors.push(`${where}: minAge ${minAge} is above maxAge ${maxAge}.`);

    if (!(Number(sq.targetSize) >= 0)) errors.push(`${where}: targetSize must be zero or more.`);
    if (!(Number(sq.swimmersPerLane) >= 1)) errors.push(`${where}: swimmersPerLane must be at least 1.`);
    if (!(Number(sq.targetSessionsPerWeek) >= 1)) {
      warnings.push(`${where}: no weekly session target, so it will not be scheduled.`);
    }
    if (!(Number(sq.targetHoursPerWeek) > 0)) {
      warnings.push(`${where}: target hours are zero; weekly hours will be derived from sessions x session length.`);
    }
    if (Number.isFinite(minAge) && Number.isFinite(maxAge) && minAge <= maxAge) {
      const band = ltadBandForAgeRange(minAge, maxAge, i.policy && i.policy.ltadTable);
      if (isBandTooWide(minAge, maxAge, band)) {
        warnings.push(`${where}: age band ${minAge}-${maxAge} spans ${band.stageCount} LTAD stages (${band.stageNames.join(', ')}) across ${band.min}-${band.max}h, so no single weekly volume suits all of it.`);
      }
    }
  });

  const coachIds = new Set();
  coaches.forEach((c, idx) => {
    const where = c.name || c.id || `coach #${idx + 1}`;
    if (!c.id) errors.push(`${where}: missing id.`);
    else if (coachIds.has(c.id)) errors.push(`${where}: duplicate coach id "${c.id}".`);
    else coachIds.add(c.id);

    (c.availability || []).forEach(w => {
      if (!DAY_NAMES_FULL.includes(w.day)) errors.push(`${where}: availability day "${w.day}" is not a weekday name.`);
      const from = timeToMinutes(w.from);
      const to = timeToMinutes(w.to);
      if (from == null || to == null) errors.push(`${where}: availability time is not HH:MM.`);
      else if (to <= from) errors.push(`${where}: an availability window ends at or before it starts.`);
    });

    const unknown = (c.squadIds || []).filter(id => !squadIds.has(id));
    if (unknown.length) {
      warnings.push(`${where}: assigned to ${unknown.length} squad(s) that no longer exist in this scenario.`);
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

/* ------------------------------------------------------------------ *
 * Pass 0 — normalise
 * ------------------------------------------------------------------ */

function normalise(inputs) {
  const policy = { ...DEFAULT_POLICY, ...(inputs.policy || {}) };
  const weights = { ...DEFAULT_WEIGHTS, ...(inputs.weights || {}) };
  const growth = { ...DEFAULT_GROWTH, ...(inputs.growth || {}) };
  const showRate = Number(policy.showRate) > 0 ? Number(policy.showRate) : 1.0;

  const slots = (inputs.poolSlots || [])
    .filter(s => s.enabled !== false)
    .map(s => {
      const startMin = timeToMinutes(s.startTime);
      const endMin = timeToMinutes(s.endTime);
      const durationHours = slotDurationHours(s);
      const lanes = Math.max(0, Math.floor(Number(s.lanes) || 0));
      return {
        ...s,
        startMin,
        endMin,
        durationHours,
        lanes,
        venue: s.venue || 'Unspecified',
        reservedFor: s.reservedFor || null,
        label: s.label || `${s.day} ${s.startTime}-${s.endTime}`,
        laneHours: +(lanes * durationHours).toFixed(3)
      };
    })
    .filter(s => s.startMin != null && s.endMin != null && s.endMin > s.startMin && s.lanes >= 1)
    .sort((a, b) => getDayOrder(a.day) - getDayOrder(b.day)
      || a.startMin - b.startMin
      || String(a.id).localeCompare(String(b.id)));

  const squads = normaliseSquads(inputs.squads, policy, showRate);

  const coaches = (inputs.coaches || []).map(c => ({
    ...c,
    maxLanes: Number(c.maxLanes) > 0 ? Number(c.maxLanes) : (policy.maxLanesPerCoach || 3),
    maxHoursPerWeek: Number(c.maxHoursPerWeek) > 0 ? Number(c.maxHoursPerWeek) : null,
    squadIds: Array.isArray(c.squadIds) ? c.squadIds : [],
    venues: Array.isArray(c.venues) ? c.venues : [],
    availability: Array.isArray(c.availability) ? c.availability : []
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return { policy, weights, growth, showRate, slots, squads, coaches };
}

/**
 * Normalise squads alone, against an already-normalised policy.
 *
 * Split out from normalise() because the structure search runs it a thousand
 * times over the same slots and the same policy, changing only the squads. Doing
 * the whole blob each time re-parsed and re-sorted every pool slot for nothing.
 */
function normaliseSquads(rawSquads, policy, showRate) {
  return (rawSquads || []).map(sq => {
    const resolved = resolveEffectiveTargetHours(sq);
    const swimmersPerLane = Math.max(1, Number(sq.swimmersPerLane) || 8);
    const targetSize = Math.max(0, Number(sq.targetSize) || 0);
    const expectedHeadcount = Math.round(targetSize * showRate);
    return {
      ...sq,
      minAge: Number(sq.minAge),
      maxAge: Number(sq.maxAge),
      targetSize,
      swimmersPerLane,
      targetSessionsPerWeek: Math.max(0, Math.floor(Number(sq.targetSessionsPerWeek) || 0)),
      competitive: sq.competitive !== false,
      locked: !!sq.locked,
      priority: Number(sq.priority) || 1,
      effectiveTargetHours: resolved.hours,
      targetHoursDerived: resolved.derived,
      expectedHeadcount,
      // How many sessions the club actually runs for this squad, as distinct
      // from how many each swimmer owes.
      //
      // NAR owes 5 sessions a week but is offered 8. The club has to book and
      // coach all 8; the swimmer only turns up to 5. Planning 5 would understate
      // the water and the coaching by three sessions, and sizing all 8 for the
      // whole squad at once would overstate the lanes, because the roster is
      // spread across the choice.
      sessionsOfferedPerWeek: Math.max(
        Math.max(0, Math.floor(Number(sq.sessionsOfferedPerWeek) || 0)),
        Math.max(0, Math.floor(Number(sq.targetSessionsPerWeek) || 0))
      ),
      // Lanes are sized for the whole squad divided across the sessions offered.
      //
      // The requirement — "30 swimmers owing four sessions need 120
      // swimmer-sessions of water" — is stated in whole swimmers, so the water
      // is sized the same way: total places across the week must cover it. Per
      // session, that is the roster spread over the choice on offer.
      //
      // showRate still does a job: expectedHeadcount drives occupancy, which is
      // how full the water actually gets in a normal week.
      lanesNeededPerSession: (() => {
        const owed = Math.max(1, Math.floor(Number(sq.targetSessionsPerWeek) || 0) || 1);
        const offered = Math.max(owed, Math.floor(Number(sq.sessionsOfferedPerWeek) || 0) || owed);
        const perSession = (targetSize * owed) / offered;
        return Math.max(1, Math.ceil(perSession / swimmersPerLane));
      })(),
      ltadBand: ltadBandForAgeRange(Number(sq.minAge), Number(sq.maxAge), policy.ltadTable)
    };
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/* ------------------------------------------------------------------ *
 * Pass 3 — hard feasibility of (slot, squad) given what is already placed
 * ------------------------------------------------------------------ */

/**
 * Hard constraints only. The youth curfew is deliberately absent: it is scored,
 * not enforced.
 *
 * H1 lane conservation, H2 no self-clash, H4 travel guard.
 *
 * Capacity is NOT hard. A squad that cannot get every lane it wants is placed in
 * what is free and flagged UNDER_CAPACITY, because a club can and does train at
 * higher lane density — pages/capacity.js tracks >100% density as a warning, not
 * an impossibility. Refusing the slot outright would leave squads unscheduled and
 * hide the very trade-off the tool exists to show.
 */
function feasibility(squad, slot, placed, policy, laneUse) {
  if (slot.reservedFor) {
    return { ok: false, reason: `${slot.label}: reserved for ${slot.reservedFor}, so it is not available to reallocate.` };
  }
  const free = slot.lanes - (laneUse[slot.id] || 0);
  if (free < 1) {
    return { ok: false, reason: `${slot.label}: all ${slot.lanes} lanes already allocated.` };
  }

  const mine = placed.filter(a => a.squadId === squad.id);
  if (mine.some(a => a.slotId === slot.id)) {
    return { ok: false, reason: `${slot.label}: ${squad.name} is already in this slot.` };
  }

  const transit = policy.venueTransitMinutes == null
    ? DEFAULT_POLICY.venueTransitMinutes
    : policy.venueTransitMinutes;

  for (const a of mine) {
    // Overlapping at the same venue is not a clash — it is more lanes.
    //
    // A squad cannot be in two pools at once, but it can perfectly well hold
    // three lanes from eight until ten and six more from eight until nine in the
    // same pool. That is how this club records a lane count that changes through
    // an evening, and refusing it threw away nine of Age Development's lanes —
    // sixty-three places — as an imagined double-booking, which is most of why a
    // plan came out short of what the club already runs.
    if (slotsOverlap(a.slot, slot) && a.slot.venue !== slot.venue) {
      return {
        ok: false,
        reason: `${slot.label}: ${squad.name} is at ${a.slot.venue} at the same time (${a.slot.startTime}-${a.slot.endTime}).`
      };
    }
    if (a.slot.venue !== slot.venue) {
      const gap = gapMinutes(a.slot, slot);
      if (gap !== null && gap < transit) {
        return {
          ok: false,
          reason: `${slot.label}: ${squad.name} is at ${a.slot.venue} ${a.slot.startTime}-${a.slot.endTime} the same day; ${gap < 0 ? 'overlapping' : `only ${gap} min`} between venues (travel guard needs ${transit} min).`
        };
      }
    }
  }
  return { ok: true, reason: null, free };
}

/* ------------------------------------------------------------------ *
 * Pass 4 — greedy assignment
 * ------------------------------------------------------------------ */

function buildFlags(squad, give, curfew) {
  const flags = [];
  if (curfew.reason) flags.push({ type: 'CURFEW', severity: 'warn', message: curfew.reason });
  if (give < squad.lanesNeededPerSession) {
    flags.push({
      type: 'UNDER_CAPACITY',
      severity: 'warn',
      message: `${give} of ${squad.lanesNeededPerSession} lanes needed for ${squad.targetSize} swimmers — ${Math.ceil(squad.targetSize / give)} per lane against a target of ${squad.swimmersPerLane}.`
    });
  }
  return flags;
}

/**
 * Marginal desirability of putting `squad` into `slot` next.
 *
 * Prefers slots that fit the squad's whole lane need, keep the existing
 * timetable, spread across days, satisfy a weekend requirement, and avoid a
 * youth curfew overrun. Returns -Infinity for a slot that cannot take them.
 */
function marginalScore(squad, slot, placed, policy, laneUse, weights) {
  const feas = feasibility(squad, slot, placed, policy, laneUse);
  if (!feas.ok) return { score: -Infinity, feas };

  const free = feas.free;
  const want = squad.lanesNeededPerSession;
  const give = Math.min(want, free);

  let score = 0;
  score += (give / want) * 40;                                 // how much of the need this covers
  if (give === want) score += 10;                              // whole squad in one slot
  score -= Math.max(0, free - give) * 1.5;                     // lanes left stranded

  const cp = curfewPenalty(squad, slot, policy);
  score -= cp.penalty;

  if (slot.source === 'existing') score += (weights.continuity || 0) * 0.6;

  const mine = placed.filter(a => a.squadId === squad.id);
  if (mine.some(a => a.slot.day === slot.day)) score -= 25;    // two sessions the same day

  const restHours = policy.minRestHoursBetweenSessions == null
    ? DEFAULT_POLICY.minRestHoursBetweenSessions
    : policy.minRestHoursBetweenSessions;
  const tooClose = mine.some(a => {
    const dayGap = Math.abs(getDayOrder(a.slot.day) - getDayOrder(slot.day));
    return dayGap > 0 && dayGap * 24 < restHours;
  });
  if (tooClose) score -= 6;

  if (squad.requireWeekend && WEEKEND_DAYS.includes(slot.day)
    && !mine.some(a => WEEKEND_DAYS.includes(a.slot.day))) {
    score += 30;                                               // unmet weekend requirement
  }
  if (squad.homeVenue && slot.venue === squad.homeVenue) score += 5;

  return { score, feas, give, curfew: cp };
}

function assignGreedy(state, order, startFrom = null) {
  const { policy, weights, slots } = state;
  // An optional starting allocation — the club's own timetable — which the pass
  // then completes. A squad only owns the sessions named for it, so seeding
  // alone leaves squads offered more sessions than they are named in short of
  // the rest; those are filled here exactly as they would be from nothing.
  const placed = startFrom ? startFrom.map(a => ({ ...a })) : [];
  const laneUse = {};
  placed.forEach(a => { laneUse[a.slotId] = (laneUse[a.slotId] || 0) + a.lanes; });
  const rejections = [];
  // One reason per (squad, slot). A slot is re-examined on every session pick,
  // and the first refusal is the informative one — later ones just repeat that
  // the squad is now busy. Recording only the first pick would leave a slot that
  // became unusable mid-solve with no explanation at all, which is precisely the
  // explanation the timetable needs to show.
  const seenRejection = new Set();

  /** Place one session for a squad, optionally restricted to a set of slots. */
  const placeOne = (squad, allowed) => {
    let best = null;
    for (const slot of allowed) {
      const m = marginalScore(squad, slot, placed, policy, laneUse, weights);
      if (m.score === -Infinity) {
        const key = `${squad.id} ${slot.id}`;
        if (!seenRejection.has(key)) {
          seenRejection.add(key);
          rejections.push({ squadId: squad.id, squadName: squad.name, slotId: slot.id, reason: m.feas.reason });
        }
        continue;
      }
      if (!best || m.score > best.m.score
        || (m.score === best.m.score && String(slot.id).localeCompare(String(best.slot.id)) < 0)) {
        best = { slot, m };
      }
    }
    if (!best) return false;

    laneUse[best.slot.id] = (laneUse[best.slot.id] || 0) + best.m.give;
    placed.push({
      slotId: best.slot.id, squadId: squad.id, slot: best.slot, squad, lanes: best.m.give,
      curfewPenalty: best.m.curfew.penalty,
      flags: buildFlags(squad, best.m.give, best.m.curfew)
    });
    return true;
  };

  // Squads that must train at the weekend claim a weekend session before
  // anybody claims anything.
  //
  // Wanting one was only a bonus inside marginalScore, so whichever squad the
  // ordering happened to reach first took the weekend water and a squad that
  // actually required it could arrive to find it full. That is how NAR ended up
  // with no Saturday while two squads that did not need one had it between them.
  // Ordering should decide who gets the *best* water, never who gets water they
  // are required to have.
  const weekendSlots = slots.filter(s => WEEKEND_DAYS.includes(s.day));
  if (weekendSlots.length) {
    for (const squad of order) {
      if (!squad.requireWeekend || squad.sessionsOfferedPerWeek < 1) continue;
      placeOne(squad, weekendSlots);
    }
  }

  for (const squad of order) {
    if (squad.sessionsOfferedPerWeek < 1) continue;

    const already = placed.filter(a => a.squadId === squad.id).length;
    for (let n = already; n < squad.sessionsOfferedPerWeek; n++) {
      let best = null;
      for (const slot of slots) {
        const m = marginalScore(squad, slot, placed, policy, laneUse, weights);
        if (m.score === -Infinity) {
          const key = `${squad.id} ${slot.id}`;
          if (!seenRejection.has(key)) {
            seenRejection.add(key);
            rejections.push({ squadId: squad.id, squadName: squad.name, slotId: slot.id, reason: m.feas.reason });
          }
          continue;
        }
        if (!best || m.score > best.m.score
          || (m.score === best.m.score && String(slot.id).localeCompare(String(best.slot.id)) < 0)) {
          best = { slot, m };
        }
      }
      if (!best) break;

      const slot = best.slot;
      const lanes = best.m.give;
      laneUse[slot.id] = (laneUse[slot.id] || 0) + lanes;

      placed.push({
        slotId: slot.id, squadId: squad.id, slot, squad, lanes,
        curfewPenalty: best.m.curfew.penalty,
        flags: buildFlags(squad, lanes, best.m.curfew)
      });
    }
  }
  return { placed, laneUse, rejections };
}

/* ------------------------------------------------------------------ *
 * Pass 5 — coach load, rolled up per squad
 * ------------------------------------------------------------------ */

/** How many coaches one squad session needs. */
export function coachesRequiredFor(assignment, policy) {
  const perCoach = policy.maxLanesPerCoach || DEFAULT_POLICY.maxLanesPerCoach;
  const floor = policy.minCoachesPerSquadSession == null
    ? DEFAULT_POLICY.minCoachesPerSquadSession
    : policy.minCoachesPerSquadSession;
  const youngFloor = policy.minCoachesPerSquadSessionUnder14 == null
    ? DEFAULT_POLICY.minCoachesPerSquadSessionUnder14
    : policy.minCoachesPerSquadSessionUnder14;
  return Math.max(
    Math.ceil(assignment.lanes / perCoach),
    floor,
    assignment.squad.minAge < 14 ? youngFloor : 1
  );
}

/**
 * Whether a coach can take a given slot.
 *
 * An empty availability list means "not stated yet", which is treated as
 * available. A freshly seeded roster has no windows typed against it, and
 * reading blank as unavailable would report the whole timetable uncovered on
 * first load — alarming, and wrong.
 */
export function coachAvailableFor(coach, slot) {
  if (coach.venues.length && !coach.venues.includes(slot.venue)) return false;
  if (!coach.availability.length) return true;
  return coach.availability.some(w => {
    if (w.day !== slot.day) return false;
    const from = timeToMinutes(w.from);
    const to = timeToMinutes(w.to);
    return from != null && to != null && from <= slot.startMin && to >= slot.endMin;
  });
}

/**
 * Match the rostered coaches against the coach-hours the timetable demands.
 *
 * Coaches attach to squads, not to individual slots, so this rolls each squad's
 * schedule up into an hours requirement and then fills it. What cannot be filled
 * is reported as a gap rather than treated as a failure — the roster is an input
 * and the gaps are the answer.
 */
export function assignCoaches(placed, state) {
  const { policy, coaches } = state;
  const transit = policy.venueTransitMinutes == null
    ? DEFAULT_POLICY.venueTransitMinutes
    : policy.venueTransitMinutes;

  const ordered = placed.slice().sort((a, b) =>
    getDayOrder(a.slot.day) - getDayOrder(b.slot.day)
    || a.slot.startMin - b.slot.startMin
    || String(a.squad.name).localeCompare(String(b.squad.name)));

  const load = {};
  coaches.forEach(c => { load[c.id] = { hours: 0, booked: [] }; });

  const assignments = [];
  const gaps = [];
  let requiredCoachHours = 0;
  let coveredCoachHours = 0;

  ordered.forEach(a => {
    const need = coachesRequiredFor(a, policy);
    const duration = a.slot.durationHours;
    requiredCoachHours += need * duration;

    const eligible = coaches.filter(c => {
      if (c.squadIds.length && !c.squadIds.includes(a.squadId)) return false;
      if (!coachAvailableFor(c, a.slot)) return false;
      if (c.maxHoursPerWeek && load[c.id].hours + duration > c.maxHoursPerWeek) return false;
      // No double-booking, and no teleporting between venues.
      return !load[c.id].booked.some(b => {
        if (slotsOverlap(b, a.slot)) return true;
        if (b.venue === a.slot.venue) return false;
        const gap = gapMinutes(b, a.slot);
        return gap !== null && gap < transit;
      });
    }).sort((x, y) =>
      // A coach tied to this squad before a floating one, then venue fit, then
      // whoever is least loaded, then id so the result never wobbles.
      (x.squadIds.includes(a.squadId) ? 0 : 1) - (y.squadIds.includes(a.squadId) ? 0 : 1)
      || (x.venues.includes(a.slot.venue) ? 0 : 1) - (y.venues.includes(a.slot.venue) ? 0 : 1)
      || load[x.id].hours - load[y.id].hours
      || String(x.id).localeCompare(String(y.id)));

    const taken = eligible.slice(0, need);
    taken.forEach(c => {
      load[c.id].hours += duration;
      load[c.id].booked.push(a.slot);
    });
    coveredCoachHours += taken.length * duration;

    assignments.push({
      slotId: a.slotId, squadId: a.squadId,
      coachIds: taken.map(c => c.id),
      coachNames: taken.map(c => c.name || c.id),
      required: need, assigned: taken.length
    });

    // With nobody rostered, every session is trivially "uncovered". Listing them
    // all would bury the real signal under noise and contradict scoring an empty
    // roster as unanswered rather than failed. The warning to add a roster says
    // it once instead.
    if (taken.length < need && coaches.length > 0) {
      gaps.push({
        squadId: a.squadId, squadName: a.squad.name,
        slotId: a.slotId, day: a.slot.day, venue: a.slot.venue,
        startTime: a.slot.startTime, endTime: a.slot.endTime,
        required: need, assigned: taken.length, shortfall: need - taken.length,
        hoursPerWeek: +((need - taken.length) * duration).toFixed(2),
        message: `${a.slot.day} ${a.slot.startTime}-${a.slot.endTime} at ${a.slot.venue}: ${a.squad.name} needs ${need} coach${need === 1 ? '' : 'es'}, ${taken.length} available.`
      });
    }
  });

  // Peak concurrent coach demand, per day. This is the number that says whether
  // a bundle of slots is staffable at all, as distinct from whether the weekly
  // hours happen to add up.
  const peakByDay = {};
  DAY_NAMES_FULL.forEach(day => {
    const dayItems = ordered.filter(a => a.slot.day === day);
    if (!dayItems.length) return;
    const points = new Set();
    dayItems.forEach(a => { points.add(a.slot.startMin); points.add(a.slot.endMin); });
    let peak = 0;
    Array.from(points).forEach(t => {
      const concurrent = dayItems
        .filter(a => a.slot.startMin <= t && a.slot.endMin > t)
        .reduce((s, a) => s + coachesRequiredFor(a, policy), 0);
      if (concurrent > peak) peak = concurrent;
    });
    if (peak > 0) peakByDay[day] = peak;
  });

  const byCoach = coaches.map(c => ({
    coachId: c.id, name: c.name || c.id, level: c.level || null,
    hours: +load[c.id].hours.toFixed(2),
    sessions: load[c.id].booked.length,
    maxHoursPerWeek: c.maxHoursPerWeek,
    overCommitted: !!(c.maxHoursPerWeek && load[c.id].hours > c.maxHoursPerWeek),
    unused: load[c.id].booked.length === 0
  })).sort((a, b) => b.hours - a.hours || String(a.name).localeCompare(String(b.name)));

  requiredCoachHours = +requiredCoachHours.toFixed(2);
  coveredCoachHours = +coveredCoachHours.toFixed(2);

  return {
    assignments,
    gaps,
    byCoach,
    peakByDay,
    peakConcurrent: Object.keys(peakByDay).length ? Math.max(...Object.values(peakByDay)) : 0,
    requiredCoachHours,
    coveredCoachHours,
    gapHours: +(requiredCoachHours - coveredCoachHours).toFixed(2),
    headcountUsed: byCoach.filter(c => c.sessions > 0).length,
    // Null rather than zero when nobody is rostered: an empty roster is "not
    // answered yet", and scoring it as total failure would bury every other
    // signal on the page.
    coveragePct: coaches.length === 0 ? null
      : (requiredCoachHours > 0 ? +(coveredCoachHours / requiredCoachHours * 100).toFixed(1) : 100)
  };
}

/* ------------------------------------------------------------------ *
 * Metrics
 * ------------------------------------------------------------------ */

export function scorePlan(placed, state, extras = {}) {
  const { slots, squads, weights, growth } = state;

  const assignableSlots = slots.filter(x => !x.reservedFor);
  const reservedLaneHours = +slots.filter(x => x.reservedFor)
    .reduce((s, x) => s + x.laneHours, 0).toFixed(2);
  const availableLaneHours = +assignableSlots.reduce((s, x) => s + x.laneHours, 0).toFixed(2);
  const assignedLaneHours = +placed.reduce((s, a) => s + a.lanes * a.slot.durationHours, 0).toFixed(2);
  const utilisationPct = availableLaneHours > 0
    ? +(assignedLaneHours / availableLaneHours * 100).toFixed(1) : 0;

  let headcountCapacity = 0;
  let expectedBodies = 0;
  placed.forEach(a => {
    headcountCapacity += a.lanes * a.squad.swimmersPerLane;
    expectedBodies += a.squad.expectedHeadcount;
  });
  const occupancyPct = headcountCapacity > 0
    ? +(expectedBodies / headcountCapacity * 100).toFixed(1) : 0;

  /*
   * Spare lanes, shared out so no lane is promised twice.
   *
   * The solver gives a squad exactly the lanes its swimmers need and no more, so
   * measuring headroom against what a squad was allocated always answers zero.
   * The question people actually ask — how many more could we take — is about
   * the lanes still going empty in the sessions a squad already runs.
   *
   * Those lanes are handed out in squad-id order and then struck off the pool.
   * Two squads sharing a session cannot both be told they may grow into the same
   * free lane, which is what a naive per-squad sum would have claimed, and the
   * club total is then just the sum of the parts.
   */
  const freeLanes = {};
  placed.forEach(a => { freeLanes[a.slotId] = a.slot.lanes; });
  placed.forEach(a => { freeLanes[a.slotId] -= a.lanes; });

  const sparePlaces = {};
  squads.slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .forEach(sq => {
      let places = 0;
      placed.filter(a => a.squadId === sq.id).forEach(a => {
        const free = Math.max(0, freeLanes[a.slotId] || 0);
        if (free > 0) {
          places += free * sq.swimmersPerLane;
          freeLanes[a.slotId] = 0;
        }
      });
      sparePlaces[sq.id] = places;
    });

  const bySquad = squads.map(sq => {
    const mine = placed.filter(a => a.squadId === sq.id);
    const sessions = mine.length;
    const hours = +mine.reduce((s, a) => s + a.slot.durationHours, 0).toFixed(2);
    const laneHours = +mine.reduce((s, a) => s + a.lanes * a.slot.durationHours, 0).toFixed(2);
    // The squad requirement in the club's own terms: a squad of 30 that must
    // train 4 times a week needs 120 swimmer-sessions of water. Places are
    // summed across the week and divided by the sessions each swimmer owes,
    // which is exactly maxSquadSize in pages/capacity.js — the two pages must
    // never disagree about how many swimmers a squad's water supports.
    const weeklyPlaces = mine.reduce((s, a) => s + a.lanes * sq.swimmersPerLane, 0);
    const sessionsOwed = Math.max(1, sq.targetSessionsPerWeek);
    const maxSquadSize = Math.floor(weeklyPlaces / sessionsOwed);
    const served = Math.min(sq.targetSize, maxSquadSize);
    // How many more swimmers this squad could take if it filled the lanes still
    // empty in the sessions it already runs. Zero for a squad with no weekly
    // target, because there is no volume to divide its water by.
    const roomForMore = sq.targetSessionsPerWeek > 0
      ? Math.max(0, Math.floor((weeklyPlaces + (sparePlaces[sq.id] || 0)) / sessionsOwed) - sq.targetSize)
      : 0;
    const sparePlacesForSquad = sparePlaces[sq.id] || 0;

    const swimmerSessionsRequired = sq.targetSize * sq.targetSessionsPerWeek;
    const swimmerSessionsDelivered = Math.min(weeklyPlaces, swimmerSessionsRequired);
    const enoughSessions = sessions >= sq.sessionsOfferedPerWeek;
    const enoughPlaces = weeklyPlaces >= swimmerSessionsRequired;
    const requirementMet = enoughSessions && enoughPlaces;

    const ltad = ltadScore(sq.effectiveTargetHours, sq.ltadBand);
    return {
      squadId: sq.id, name: sq.name, minAge: sq.minAge, maxAge: sq.maxAge,
      targetSize: sq.targetSize, competitive: sq.competitive,
      sessionsAssigned: sessions,
      sessionsTarget: sq.targetSessionsPerWeek,
      sessionsOffered: sq.sessionsOfferedPerWeek,
      hoursAssigned: hours, effectiveTargetHours: sq.effectiveTargetHours,
      targetHoursDerived: sq.targetHoursDerived,
      laneHours, maxSquadSize, served, roomForMore,
      sparePlaces: sparePlacesForSquad,
      unserved: Math.max(0, sq.targetSize - served),
      weeklyPlaces,
      swimmerSessionsRequired,
      swimmerSessionsDelivered,
      placesShortfall: Math.max(0, swimmerSessionsRequired - weeklyPlaces),
      requirementMet,
      requirementReason: requirementMet
        ? `${sq.targetSize} swimmers x ${sq.targetSessionsPerWeek} sessions covered by ${weeklyPlaces} places across the ${sessions} session${sessions === 1 ? '' : 's'} offered.`
        : !enoughSessions
          ? `Only ${sessions} of the ${sq.sessionsOfferedPerWeek} weekly sessions this squad runs could be placed.`
          : `${weeklyPlaces} places across the week against ${swimmerSessionsRequired} needed for ${sq.targetSize} swimmers x ${sq.targetSessionsPerWeek} sessions — short by ${swimmerSessionsRequired - weeklyPlaces}.`,
      ltadBand: sq.ltadBand,
      ltadScore: +ltad.score.toFixed(1),
      ltadVerdict: ltad.verdict,
      ltadGapHours: ltad.gapHours,
      bandWidthWarning: isBandTooWide(sq.minAge, sq.maxAge, sq.ltadBand),
      curfewPenalty: +mine.reduce((s, a) => s + a.curfewPenalty, 0).toFixed(1),
      unscheduled: sessions < sq.sessionsOfferedPerWeek
    };
  });

  const swimmersServed = bySquad.reduce((s, x) => s + x.served, 0);
  // Counted over squads that actually train: a squad with no session target has
  // no volume to divide its water by, so it has no meaningful headroom either.
  const roomForMore = bySquad
    .filter(x => x.sessionsTarget > 0)
    .reduce((s, x) => s + x.roomForMore, 0);
  const rosterDemand = squads.reduce((s, x) => s + x.targetSize, 0);
  const attrition = Math.round(rosterDemand * (Number(growth.attritionPct) || 0) / 100);
  const totalDemand = Math.max(0, rosterDemand + (Number(growth.expectedNewSwimmers) || 0) - attrition);
  const unservedDemand = Math.max(0, totalDemand - swimmersServed);

  const competitive = bySquad.filter(s => s.competitive && s.sessionsAssigned > 0);
  const ltadCompliancePct = competitive.length
    ? +(competitive.reduce((s, x) => s + x.ltadScore, 0) / competitive.length).toFixed(1) : 0;

  const totalCurfewPenalty = +placed.reduce((s, a) => s + a.curfewPenalty, 0).toFixed(1);
  const weekendMet = squads.filter(sq => sq.requireWeekend).every(sq =>
    placed.some(a => a.squadId === sq.id && WEEKEND_DAYS.includes(a.slot.day)));
  const unscheduledSquads = bySquad.filter(s => s.unscheduled).length;

  let timetableQuality = 100;
  timetableQuality -= Math.min(60, totalCurfewPenalty);
  if (!weekendMet) timetableQuality -= 15;
  timetableQuality -= unscheduledSquads * 10;
  timetableQuality = Math.max(0, +timetableQuality.toFixed(1));

  const existing = placed.filter(a => a.slot.source === 'existing').length;
  const continuityPct = placed.length ? +(existing / placed.length * 100).toFixed(1) : 0;

  const servedPct = totalDemand > 0 ? Math.min(100, +(swimmersServed / totalDemand * 100).toFixed(1)) : 0;
  const utilScore = Math.min(100, utilisationPct);

  const coach = extras.coach || null;
  const coachCoverPct = coach ? coach.coveragePct : null;

  const parts = [
    ['ltad', ltadCompliancePct], ['utilisation', utilScore], ['served', servedPct],
    ['timetableQuality', timetableQuality], ['continuity', continuityPct]
  ];
  if (coachCoverPct !== null && coachCoverPct !== undefined) parts.push(['coachCover', coachCoverPct]);

  const weightSum = parts.reduce((s, p) => s + (weights[p[0]] || 0), 0);
  const total = weightSum > 0
    ? +(parts.reduce((s, p) => s + (weights[p[0]] || 0) * p[1], 0) / weightSum).toFixed(1) : 0;

  const baselineLaneHours = Number(extras.baselineLaneHours) || 0;

  const subScores = {
    ltad: ltadCompliancePct, utilisation: utilScore, served: servedPct,
    timetableQuality, continuity: continuityPct
  };
  if (coachCoverPct !== null && coachCoverPct !== undefined) subScores.coachCover = coachCoverPct;

  return {
    total,
    subScores,
    availableLaneHours, assignedLaneHours, utilisationPct, occupancyPct,
    reservedLaneHours,
    newLaneHoursGained: +(availableLaneHours - baselineLaneHours).toFixed(2),
    swimmersServed, rosterDemand, totalDemand, unservedDemand, roomForMore,
    ltadCompliancePct, totalCurfewPenalty, weekendRequirementMet: weekendMet,
    unscheduledSquads, assignmentCount: placed.length,
    squadCount: squads.length,
    // The plain answer to "does every squad get the training it is supposed to?"
    // Counted over squads that are set a weekly target. A masters squad with no
    // target passes trivially, and counting those made the comparison row read
    // "7 of 7" on a plan two squads were short in.
    squadsMeetingRequirement: bySquad.filter(s => s.sessionsTarget > 0 && s.requirementMet).length,
    squadsWithTarget: bySquad.filter(s => s.sessionsTarget > 0).length,
    swimmerSessionsRequired: bySquad.reduce((s, x) => s + x.swimmerSessionsRequired, 0),
    swimmerSessionsDelivered: bySquad.reduce((s, x) => s + x.swimmerSessionsDelivered, 0),
    coach: coach ? {
      requiredCoachHours: coach.requiredCoachHours,
      coveredCoachHours: coach.coveredCoachHours,
      gapHours: coach.gapHours,
      coveragePct: coach.coveragePct,
      peakConcurrent: coach.peakConcurrent,
      peakByDay: coach.peakByDay,
      headcountUsed: coach.headcountUsed,
      rosterSize: state.coaches.length,
      byCoach: coach.byCoach
    } : null,
    bySquad
  };
}

/* ------------------------------------------------------------------ *
 * Pass 6 — bounded local repair
 * ------------------------------------------------------------------ */

/**
 * Hill-climb over move-one-assignment neighbours, accepting strict improvements
 * only. No annealing: reproducibility is worth more here than the last point of
 * score, because three separate renderers re-run this and must agree.
 *
 * Coach cover is deliberately left out of the repair objective. Matching the
 * roster costs roughly as much as scoring the whole plan, and the repair scores
 * thousands of candidate moves; folding it in would turn a sub-second solve into
 * a visible wait. Coaches are matched once per completed plan instead, and the
 * multi-start picks its winner on the coach-aware score.
 */
function localRepair(placed, state, extras, maxIterations) {
  let current = placed.slice();
  let currentScore = scorePlan(current, state, extras).total;

  for (let iter = 0; iter < maxIterations; iter++) {
    let bestMove = null;

    for (let i = 0; i < current.length; i++) {
      const moving = current[i];
      const without = current.filter((_, idx) => idx !== i);
      const laneUse = {};
      without.forEach(a => { laneUse[a.slotId] = (laneUse[a.slotId] || 0) + a.lanes; });

      for (const slot of state.slots) {
        if (slot.id === moving.slotId) continue;
        const m = marginalScore(moving.squad, slot, without, state.policy, laneUse, state.weights);
        if (m.score === -Infinity) continue;

        const candidate = without.concat([{
          slotId: slot.id, squadId: moving.squadId, slot, squad: moving.squad,
          lanes: m.give, curfewPenalty: m.curfew.penalty,
          flags: buildFlags(moving.squad, m.give, m.curfew)
        }]);

        // Repair may not trade away a weekend the squad is required to have.
        // The greedy pass takes it first on purpose; without this the repair
        // simply moved the squad off it again whenever some other gain scored
        // higher, and the requirement was silently lost between the two passes.
        if (moving.squad.requireWeekend
          && !candidate.some(a => a.squadId === moving.squadId && WEEKEND_DAYS.includes(a.slot.day))) {
          continue;
        }

        const score = scorePlan(candidate, state, extras).total;
        if (score > currentScore + 1e-9
          && (!bestMove || score > bestMove.score
            || (score === bestMove.score && String(slot.id).localeCompare(String(bestMove.slotId)) < 0))) {
          bestMove = { score, candidate, slotId: slot.id };
        }
      }
    }

    if (!bestMove) break;
    current = bestMove.candidate;
    currentScore = bestMove.score;
  }
  return current;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Give short squads the lanes still going spare in sessions they already have.
 *
 * lanesNeededPerSession spreads a squad's requirement evenly across the sessions
 * it is offered, which for Gold Development is exactly three lanes in each of
 * six sessions and not one lane of slack. Any session that cannot spare three
 * then leaves a shortfall the plan never recovers — while lanes sat unused in
 * Gold's own Friday session. The result was a proposal that served a squad worse
 * than the timetable the club already runs, which is the opposite of the point.
 *
 * This only ever takes lanes that are free, and only in slots the squad is
 * already placed in. No session is added, so nothing that was feasible before
 * can become infeasible: no new clash, no travel guard, no coach demand for a
 * session that was not already staffed. Lane conservation is respected because
 * a lane is taken only when the slot has it spare.
 *
 * Deterministic: squads in most-short-first order, ties by id; slots by id.
 */
function topUpShortSquads(placed, state) {
  const free = {};
  placed.forEach(a => { free[a.slotId] = a.slot.lanes; });
  placed.forEach(a => { free[a.slotId] -= a.lanes; });

  const shortfallOf = (squad, list) => {
    const mine = list.filter(a => a.squadId === squad.id);
    const places = mine.reduce((sum, a) => sum + a.lanes * squad.swimmersPerLane, 0);
    return squad.targetSize * squad.targetSessionsPerWeek - places;
  };

  let current = placed.map(a => ({ ...a }));

  const order = state.squads
    .filter(sq => sq.targetSessionsPerWeek > 0)
    .map(sq => ({ sq, short: shortfallOf(sq, current) }))
    .filter(x => x.short > 0)
    .sort((a, b) => b.short - a.short || String(a.sq.id).localeCompare(String(b.sq.id)));

  order.forEach(({ sq }) => {
    const mine = current
      .filter(a => a.squadId === sq.id)
      .sort((a, b) => String(a.slotId).localeCompare(String(b.slotId)));

    for (const assignment of mine) {
      while (shortfallOf(sq, current) > 0 && (free[assignment.slotId] || 0) > 0) {
        free[assignment.slotId] -= 1;
        assignment.lanes += 1;
      }
      if (shortfallOf(sq, current) <= 0) break;
    }
  });

  // Gaining a lane can only clear an under-capacity flag, never raise one, and
  // cannot touch the time-guide flag — so the flag is dropped rather than the
  // whole set rebuilt, which would need the curfew reason this no longer holds.
  return current.map(a => (a.lanes >= a.squad.lanesNeededPerSession
    ? { ...a, flags: a.flags.filter(f => f.type !== 'UNDER_CAPACITY') }
    : a));
}

/** Deterministic, principled squad orderings for the multi-start. */
function buildOrderings(squads) {
  const tie = (a, b) => String(a.id).localeCompare(String(b.id));
  const base = squads.slice().sort(tie);
  return [
    base.slice().sort((a, b) => a.priority - b.priority
      || (b.lanesNeededPerSession * b.effectiveTargetHours) - (a.lanesNeededPerSession * a.effectiveTargetHours)
      || tie(a, b)),
    base.slice().sort((a, b) => a.priority - b.priority || a.minAge - b.minAge || tie(a, b)),
    base.slice().sort((a, b) => a.priority - b.priority || b.minAge - a.minAge || tie(a, b)),
    base.slice().sort((a, b) => a.priority - b.priority
      || b.targetSessionsPerWeek - a.targetSessionsPerWeek || tie(a, b)),
    base
  ];
}

/** Run one greedy pass plus repair, then score it with the roster applied. */
function solveWithState(state, extras, maxIterations, orderings, seedPlan = null) {
  let best = null;

  const consider = (placed, rejections) => {
    const repaired = topUpShortSquads(localRepair(placed, state, extras, maxIterations), state);
    const coach = assignCoaches(repaired, state);
    const metrics = scorePlan(repaired, state, { ...extras, coach });
    if (!best || metrics.total > best.metrics.total) {
      best = { placed: repaired, metrics, coach, rejections };
    }
  };

  // The club's own timetable, entered as a competitor.
  //
  // Rebuilding a week from nothing does not reliably rediscover an allocation
  // the club arrived at over years, so a proposal could come out worse than the
  // status quo while still being the best thing the search had found. Starting
  // from what the club actually does means a plan can only be offered if it
  // beats that, and "change nothing" is always on the table.
  if (seedPlan && seedPlan.length) {
    const completed = assignGreedy(state, orderings[0] || state.squads, seedPlan);
    consider(completed.placed, completed.rejections);
  }

  for (const order of orderings) {
    const greedy = assignGreedy(state, order);
    consider(greedy.placed, greedy.rejections);
  }
  return best;
}

/**
 * Turn the club's recorded allocation into a plan the solver can score.
 *
 * Anything that does not resolve — a slot or squad the scenario no longer has,
 * a session whose lanes have been reduced below what was recorded — is dropped
 * rather than forced, so a re-banded structure simply produces nothing here and
 * the search proceeds as before.
 */
function planFromCurrent(state, currentAssignments) {
  if (!Array.isArray(currentAssignments) || !currentAssignments.length) return null;

  const slotById = {};
  state.slots.forEach(s => { slotById[s.id] = s; });
  const squadById = {};
  state.squads.forEach(s => { squadById[s.id] = s; });

  const laneUse = {};
  const placed = [];

  currentAssignments.forEach(a => {
    const slot = slotById[a.slotId];
    const squad = squadById[a.squadId];
    if (!slot || !squad || slot.reservedFor) return;

    const free = slot.lanes - (laneUse[slot.id] || 0);
    const lanes = Math.min(Math.max(0, Math.floor(Number(a.lanes) || 0)), free);
    if (lanes < 1) return;
    // A squad cannot be in two pools at once, however the record reads. Two
    // overlapping sessions at the same venue are not a clash — they are the
    // squad holding more lanes for part of the evening.
    if (placed.some(p => p.squadId === squad.id
      && (p.slotId === slot.id
        || (slotsOverlap(p.slot, slot) && p.slot.venue !== slot.venue)))) return;

    laneUse[slot.id] = (laneUse[slot.id] || 0) + lanes;
    const curfew = curfewPenalty(squad, slot, state.policy);
    placed.push({
      slotId: slot.id, squadId: squad.id, slot, squad, lanes,
      curfewPenalty: curfew.penalty,
      flags: buildFlags(squad, lanes, curfew)
    });
  });

  return placed.length ? placed : null;
}

/**
 * Solve a scenario. Deterministic: identical inputs give an identical result.
 *
 * opts.maxIterations caps the repair pass; opts.baselineLaneHours enables the
 * "lane-hours gained" headline.
 */
export function solveRestructure(inputs, opts = {}) {
  const validation = validateInputs(inputs);
  if (!validation.ok) {
    return {
      ok: false, errors: validation.errors, warnings: validation.warnings,
      plan: { assignments: [] }, metrics: null, gaps: { coach: [], capacity: [] },
      diagnostics: { unusableSlots: [], rejections: [], demandVsSupply: null }
    };
  }

  const state = normalise(inputs);
  const extras = { baselineLaneHours: opts.baselineLaneHours };
  const maxIterations = Number.isFinite(opts.maxIterations) ? opts.maxIterations : 200;

  // Pass 2 — demand against supply, computed before anything is placed so an
  // impossible ask is reported as such rather than buried in a partial plan.
  // Water has to cover every session the club runs, not only the hours each
  // swimmer owes. A squad owing 8h across 5 sessions but offered 8 needs the
  // lanes booked for all 8 — roughly 13h of pool — whether or not any one
  // swimmer is there for all of it.
  const requiredLaneHours = +state.squads.reduce((s, sq) => {
    const owed = Math.max(1, sq.targetSessionsPerWeek || 1);
    const offered = Math.max(owed, sq.sessionsOfferedPerWeek || owed);
    const hoursOffered = sq.effectiveTargetHours * (offered / owed);
    return s + sq.lanesNeededPerSession * hoursOffered;
  }, 0).toFixed(2);
  const availableLaneHours = +state.slots.filter(x => !x.reservedFor)
    .reduce((s, x) => s + x.laneHours, 0).toFixed(2);
  const demandVsSupply = {
    requiredLaneHours,
    availableLaneHours,
    shortfallLaneHours: +Math.max(0, requiredLaneHours - availableLaneHours).toFixed(2),
    feasible: requiredLaneHours <= availableLaneHours
  };

  // Multi-start over deterministic permutations of the squad ordering. The
  // greedy pass is order-sensitive, so trying a handful of principled orderings
  // and keeping the best costs microseconds and stops one arbitrary tie-break
  // deciding the whole timetable.
  const best = solveWithState(state, extras, maxIterations, buildOrderings(state.squads),
    planFromCurrent(state, inputs.currentAssignments));

  const usedSlotIds = new Set(best.placed.map(a => a.slotId));
  const unusableSlots = state.slots.filter(s => !usedSlotIds.has(s.id)).map(s => ({
    slotId: s.id, label: s.label, day: s.day, venue: s.venue,
    startTime: s.startTime, endTime: s.endTime, lanes: s.lanes,
    reasons: best.rejections.filter(r => r.slotId === s.id).map(r => r.reason)
  }));

  const capacityGaps = best.metrics.bySquad
    .filter(s => !s.requirementMet)
    .map(s => ({
      squadId: s.squadId, name: s.name,
      unserved: s.unserved,
      sessionsShort: Math.max(0, s.sessionsTarget - s.sessionsAssigned),
      placesShortfall: s.placesShortfall,
      message: `${s.name}: ${s.requirementReason}`
    }));

  const warnings = validation.warnings.slice();
  if (!demandVsSupply.feasible) {
    warnings.unshift(`Demand exceeds supply by ${demandVsSupply.shortfallLaneHours} lane-hours before any timetable is drawn — no arrangement of these slots serves every squad in full.`);
  }
  state.squads.filter(s => s.targetHoursDerived && s.targetSessionsPerWeek > 0).forEach(s => {
    warnings.push(`${s.name}: weekly hours derived as ${s.effectiveTargetHours}h (target hours are zero in the club record).`);
  });
  if (state.coaches.length === 0) {
    warnings.push('No coaches on the roster, so coach cover is not scored. Add the roster on the Coaches tab to see where the gaps fall.');
  }

  const coachByKey = {};
  best.coach.assignments.forEach(c => { coachByKey[`${c.slotId} ${c.squadId}`] = c; });

  const assignments = best.placed.map(a => {
    const c = coachByKey[`${a.slotId} ${a.squadId}`];
    const flags = a.flags.slice();
    if (state.coaches.length > 0 && c && c.assigned < c.required) {
      flags.push({
        type: 'NO_COACH', severity: 'error',
        message: `${c.assigned} of ${c.required} coaches available for this session.`
      });
    }
    return {
      slotId: a.slotId, squadId: a.squadId, squadName: a.squad.name,
      day: a.slot.day, startTime: a.slot.startTime, endTime: a.slot.endTime,
      venue: a.slot.venue, label: a.slot.label,
      lanes: a.lanes, durationHours: a.slot.durationHours,
      capacity: a.lanes * a.squad.swimmersPerLane,
      expected: a.squad.expectedHeadcount,
      source: a.slot.source || 'candidate',
      curfewPenalty: +a.curfewPenalty.toFixed(1),
      coachNames: c ? c.coachNames : [],
      coachesRequired: c ? c.required : 0,
      coachesAssigned: c ? c.assigned : 0,
      flags
    };
  }).sort((x, y) => getDayOrder(x.day) - getDayOrder(y.day)
    || timeToMinutes(x.startTime) - timeToMinutes(y.startTime)
    || String(x.squadName).localeCompare(String(y.squadName)));

  // requireCoachCover promotes an uncovered session from a reported gap to a
  // hard failure. Off by default: the roster is an input the club is still
  // filling in, and refusing to draw a timetable over it helps nobody.
  const errors = [];
  if (state.policy.requireCoachCover) {
    if (state.coaches.length === 0) {
      errors.push('Coach cover is set to required, but there is nobody on the roster to cover it.');
    } else if (best.coach.gaps.length) {
      errors.push(`${best.coach.gaps.length} session(s) have no coach and coach cover is set to required.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    plan: { assignments },
    metrics: best.metrics,
    gaps: { coach: best.coach.gaps, capacity: capacityGaps },
    diagnostics: { unusableSlots, rejections: best.rejections, demandVsSupply }
  };
}

/* ------------------------------------------------------------------ *
 * Structure search
 * ------------------------------------------------------------------ */

/**
 * Every way of cutting an age range into `k` contiguous bands.
 *
 * This is what makes "propose any structure" tractable. Squad bands are
 * contiguous ranges over swimming age, so the structural search space is the
 * set of contiguous partitions of a ten-or-so-year span — a few hundred
 * candidates, enumerable exactly. No heuristic, no sampling, no guessing.
 */
function partitions(ages, k) {
  const out = [];
  const cuts = ages.length - 1;
  if (k < 1 || k > ages.length) return out;

  const choose = (start, picked) => {
    if (picked.length === k - 1) {
      const bands = [];
      let from = 0;
      picked.concat([cuts]).forEach(cut => {
        bands.push([ages[from], ages[cut]]);
        from = cut + 1;
      });
      out.push(bands);
      return;
    }
    for (let i = start; i < cuts; i++) choose(i + 1, picked.concat([i]));
  };
  choose(0, []);
  return out;
}

/**
 * Candidate squad structures over the club's age histogram.
 *
 * Bands too small to run as a squad are pruned, as are bands so wide that no
 * single training volume could suit them. Each surviving band inherits its
 * session and hour targets from whichever existing squad overlaps it most, so a
 * suggestion arrives already resembling how the club actually trains.
 */
/**
 * Candidate squad structures banded on capability rather than age.
 *
 * Age is the weakest defensible axis for a squad. Between 10 and 14 biological
 * maturation varies so widely that banding on birth year largely selects the
 * oldest in the band rather than the most able — the relative age effect — and
 * published club structures almost universally gate on ability and commitment,
 * with age setting the ceiling and the volume expectation rather than deciding
 * membership.
 *
 * True bio-banding needs height, sitting height and body mass, none of which
 * this club holds and none of which it should start collecting lightly. World
 * Aquatics points are the available substitute: already normalised across event,
 * age and gender, so they compare a 10-year-old's 50 free with a 16-year-old's
 * 200 fly on one scale.
 *
 * Age does not disappear. It comes back as a hard guard on how wide a band may
 * be, because a squad spanning eight birth years is a safeguarding and
 * training-volume problem however well matched its swimmers are.
 */
function enumerateCapabilityStructures(capability, opts) {
  const {
    minSquads = 3, maxSquads = 7, minBandSize = 6,
    templateSquads = [], ltadTable = 'unified', maxCandidates = 400,
    varyVolume = true, sessionOptions = [2, 3, 4, 5, 6],
    reservedSquads = [], maxAgeSpread = 6
  } = opts;

  const buckets = Object.keys(capability.buckets || {}).map(Number)
    .filter(b => capability.buckets[b].count > 0)
    .sort((a, b) => a - b);
  if (buckets.length < 2) return [];

  const results = [];
  for (let k = minSquads; k <= Math.min(maxSquads, buckets.length); k++) {
    for (const bands of partitions(buckets, k)) {
      if (results.length >= maxCandidates) break;

      const sized = bands.map(([lo, hi]) => {
        const inBand = buckets.filter(b => b >= lo && b <= hi).map(b => capability.buckets[b]);
        const ages = inBand.filter(e => e.minAge !== null);
        return {
          lo, hi,
          count: inBand.reduce((s, e) => s + e.count, 0),
          minAge: ages.length ? Math.min(...ages.map(e => e.minAge)) : null,
          maxAge: ages.length ? Math.max(...ages.map(e => e.maxAge)) : null
        };
      });

      if (sized.some(b => b.count < minBandSize)) continue;
      // The age guard. A capability band that happens to span half the club's
      // birth years is not a squad anyone would run.
      if (sized.some(b => b.minAge !== null && (b.maxAge - b.minAge) > maxAgeSpread)) continue;

      results.push(sized.map((b, i) => {
        const minAge = b.minAge === null ? 9 : b.minAge;
        const maxAge = b.maxAge === null ? 18 : b.maxAge;
        const template = nearestTemplate(templateSquads, minAge, maxAge);
        const band = ltadBandForAgeRange(minAge, maxAge, ltadTable);
        const sessionHours = template && template.medianSessionHours > 0 ? template.medianSessionHours : 1.5;
        const bucketSize = capability.bucketSize || 50;

        let sessions = template ? Math.max(1, template.targetSessionsPerWeek) : 3;
        let hours = template ? template.targetHoursPerWeek : 0;
        if (varyVolume) {
          const v = volumeForBand(minAge, maxAge, templateSquads, sessionHours);
          sessions = v.sessions;
          hours = v.hours;
        }

        return {
          id: `sq_cap_${k}_${i}`,
          name: `${b.lo}-${b.hi + bucketSize - 1} WA pts`,
          sourceSquadId: null,
          // The capability gate is what defines the squad; the age range is
          // descriptive of who currently sits in it, and is what the LTAD
          // volume and the youth curfew are judged against.
          bandBy: 'capability',
          minWaPoints: b.lo,
          maxWaPoints: b.hi + bucketSize - 1,
          minAge, maxAge,
          targetSize: b.count,
          swimmersPerLane: template ? template.swimmersPerLane : 8,
          targetSessionsPerWeek: sessions,
          targetHoursPerWeek: hours,
          medianSessionHours: sessionHours,
          requireWeekend: template ? !!template.requireWeekend : false,
          competitive: true,
          priority: i + 1,
          allowSharedSlot: true,
          homeVenue: null
        };
      }).concat(reservedSquads));
    }
  }
  return results;
}

export function enumerateStructures(ageHistogram, opts = {}) {
  // Capability banding partitions the same way, over a different ordered axis.
  if (opts.bandBy === 'capability') {
    return opts.capability ? enumerateCapabilityStructures(opts.capability, opts) : [];
  }
  const {
    minSquads = 3, maxSquads = 7, minBandSize = 6,
    templateSquads = [], ltadTable = 'unified', maxCandidates = 400,
    // Weekly volume is searched rather than inherited. Copying the nearest
    // existing squad's sessions and hours re-draws the age lines but never
    // proposes a different amount of training, which is most of what makes a
    // restructure a restructure.
    varyVolume = true,
    sessionOptions = [2, 3, 4, 5, 6],
    // Squads carried through untouched — the non-competitive off-ramps.
    // Their swimmers must already be excluded from ageHistogram by the caller,
    // or they would be counted twice: once in a competitive band and again here.
    reservedSquads = []
  } = opts;

  const ages = Object.keys(ageHistogram).map(Number)
    .filter(a => a > 0 && ageHistogram[a] > 0)
    .sort((a, b) => a - b);
  if (ages.length < 2) return [];

  const countIn = (lo, hi) => ages
    .filter(a => a >= lo && a <= hi)
    .reduce((s, a) => s + ageHistogram[a], 0);

  const results = [];
  for (let k = minSquads; k <= Math.min(maxSquads, ages.length); k++) {
    for (const bands of partitions(ages, k)) {
      if (results.length >= maxCandidates) break;

      const sized = bands.map(([lo, hi]) => ({ lo, hi, count: countIn(lo, hi) }));
      if (sized.some(b => b.count < minBandSize)) continue;
      if (sized.some(b => isBandTooWide(b.lo, b.hi, ltadBandForAgeRange(b.lo, b.hi, ltadTable)))) continue;

      results.push(sized.map((b, i) => {
        const template = nearestTemplate(templateSquads, b.lo, b.hi);
        const band = ltadBandForAgeRange(b.lo, b.hi, ltadTable);
        const sessionHours = template && template.medianSessionHours > 0
          ? template.medianSessionHours : 1.5;

        // Aim the band's own LTAD volume, then pick the session count that lands
        // closest to it without exceeding the plausible range. Older, fitter
        // bands come out with more training than younger ones, which is the
        // point of re-banding in the first place.
        let sessions = template ? Math.max(1, template.targetSessionsPerWeek) : 3;
        let hours = template ? template.targetHoursPerWeek : 0;

        if (varyVolume) {
          const v = volumeForBand(b.lo, b.hi, templateSquads, sessionHours);
          sessions = v.sessions;
          hours = v.hours;
        }

        return {
          id: `sq_gen_${k}_${i}`,
          name: `${b.lo}-${b.hi} squad`,
          sourceSquadId: null,
          minAge: b.lo, maxAge: b.hi,
          targetSize: b.count,
          swimmersPerLane: template ? template.swimmersPerLane : 8,
          targetSessionsPerWeek: sessions,
          targetHoursPerWeek: hours,
          medianSessionHours: sessionHours,
          requireWeekend: template ? !!template.requireWeekend : false,
          competitive: true,
          priority: i + 1,
          allowSharedSlot: true,
          homeVenue: null
        };
      }).concat(reservedSquads));
    }
  }
  return results;
}

/**
 * Non-competitive squads, in the shape enumerateStructures expects to carry
 * through untouched.
 *
 * Technical Development and Club 2 are off-ramps, not rungs on the pathway.
 * Re-banding the competitive squads should not quietly absorb them, because the
 * swimmers in them are there for a reason.
 */
export function reservableSquads(squads) {
  // Held out of the search: the non-competitive off-ramps, and anything the
  // user has locked. A lock is how you say "leave NAR exactly as it is and show
  // me what changing the rest would do" — the squad keeps its swimmers, its
  // volume and its water, and the search re-bands only what is left.
  return (squads || []).filter(s => s.competitive === false || s.locked === true).map(s => ({
    id: s.id, name: s.name, sourceSquadId: s.sourceSquadId || null,
    minAge: s.minAge, maxAge: s.maxAge, targetSize: s.targetSize,
    swimmersPerLane: s.swimmersPerLane,
    targetSessionsPerWeek: s.targetSessionsPerWeek,
    targetHoursPerWeek: s.targetHoursPerWeek,
    medianSessionHours: s.medianSessionHours,
    sessionsOfferedPerWeek: s.sessionsOfferedPerWeek,
    requireWeekend: !!s.requireWeekend,
    competitive: s.competitive !== false,
    locked: !!s.locked,
    priority: 99,
    allowSharedSlot: true,
    homeVenue: s.homeVenue || null
  }));
}

/**
 * Weekly volume for a proposed band, interpolated from the club's own squads.
 *
 * Aiming at the LTAD midpoint does not work here. The unified bands want 8-17
 * hours a week, and a squad running six sessions of one to two hours can reach
 * at most twelve, so every band saturated at the maximum and the search proposed
 * "6 sessions" for everyone — no variation at all, which is worse than useless.
 *
 * The club's own progression is the honest anchor: Silver 2/wk at 2h, Gold
 * Development 4/wk at 4h, Age Development 4/wk at 8h, NAR 5/wk at 8h. A new band
 * takes the volume its age implies on that curve. The LTAD gap is still reported
 * separately, so the aspiration stays visible without driving the proposal.
 */
export function volumeForBand(minAge, maxAge, templateSquads, fallbackSessionHours = 1.5) {
  const anchors = (templateSquads || [])
    .filter(s => s.competitive !== false
      && Number(s.targetSessionsPerWeek) > 0
      && Number.isFinite(Number(s.minAge)) && Number.isFinite(Number(s.maxAge)))
    .map(s => ({
      age: (Number(s.minAge) + Number(s.maxAge)) / 2,
      sessions: Number(s.targetSessionsPerWeek),
      hours: Number(s.targetHoursPerWeek) > 0
        ? Number(s.targetHoursPerWeek)
        : Number(s.targetSessionsPerWeek) * (Number(s.medianSessionHours) || fallbackSessionHours)
    }))
    .sort((a, b) => a.age - b.age);

  if (!anchors.length) {
    return { sessions: 3, hours: +(3 * fallbackSessionHours).toFixed(2), interpolated: false };
  }

  const mid = (Number(minAge) + Number(maxAge)) / 2;
  // Outside the club's own age span, hold the nearest squad's volume rather than
  // extrapolating into figures nobody has ever trained.
  if (mid <= anchors[0].age) {
    return { sessions: anchors[0].sessions, hours: +anchors[0].hours.toFixed(2), interpolated: false };
  }
  const last = anchors[anchors.length - 1];
  if (mid >= last.age) {
    return { sessions: last.sessions, hours: +last.hours.toFixed(2), interpolated: false };
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (mid >= a.age && mid <= b.age) {
      const span = b.age - a.age;
      const t = span === 0 ? 0 : (mid - a.age) / span;
      return {
        sessions: Math.max(1, Math.round(a.sessions + (b.sessions - a.sessions) * t)),
        hours: +(a.hours + (b.hours - a.hours) * t).toFixed(2),
        interpolated: true
      };
    }
  }

  return { sessions: last.sessions, hours: +last.hours.toFixed(2), interpolated: false };
}

/** The existing squad whose age band overlaps [lo, hi] most. */
function nearestTemplate(templates, lo, hi) {
  let best = null;
  let bestOverlap = -1;
  templates.forEach(t => {
    const overlap = Math.min(hi, Number(t.maxAge)) - Math.max(lo, Number(t.minAge)) + 1;
    if (overlap > bestOverlap
      || (overlap === bestOverlap && best && String(t.id).localeCompare(String(best.id)) < 0)) {
      bestOverlap = overlap;
      best = t;
    }
  });
  return bestOverlap > 0 ? best : null;
}

/**
 * Remove the swimmers already accounted for by reserved squads from the age
 * histogram, spread evenly across each reserved squad's age band.
 *
 * Even spreading is an approximation — the exact ages are known to the baseline
 * but not here — and it is the conservative one: it never removes more from an
 * age than that age holds.
 */
function withoutReserved(ageHistogram, reservedSquads) {
  if (!reservedSquads.length) return ageHistogram;
  const out = { ...ageHistogram };

  reservedSquads.forEach(sq => {
    const ages = Object.keys(out).map(Number)
      .filter(a => a >= sq.minAge && a <= sq.maxAge && out[a] > 0)
      .sort((a, b) => a - b);
    if (!ages.length) return;

    let remaining = sq.targetSize;
    const share = Math.ceil(remaining / ages.length);
    ages.forEach(a => {
      const take = Math.min(out[a], share, remaining);
      out[a] -= take;
      remaining -= take;
      if (out[a] <= 0) delete out[a];
    });
  });

  return out;
}

/**
 * Score every candidate structure against the scenario's pool slots and return
 * the best few.
 *
 * Each candidate gets a cheaper solve than the real one — a single squad
 * ordering and a short repair — because a few hundred full solves would be a
 * visible wait for a result the user is going to refine by hand anyway. Applying
 * a suggestion then runs the full solver on it.
 */
export function suggestStructures(inputs, ageHistogram, opts = {}) {
  const { topN = 5, maxIterations = 25 } = opts;
  const base = normalise(inputs);

  // Non-competitive squads ride through unchanged, and their swimmers come out
  // of the histogram first so a competitive band cannot claim them as well.
  const reservedSquads = opts.reservedSquads || reservableSquads(base.squads);
  // The caller supplies a histogram covering only the squads being remodelled,
  // so nothing is subtracted here. withoutReserved remains for callers that pass
  // a club-wide histogram.
  const histogram = opts.histogramExcludesReserved === false
    ? withoutReserved(ageHistogram, reservedSquads)
    : ageHistogram;

  const shared = {
    ...opts,
    reservedSquads,
    templateSquads: base.squads,
    ltadTable: base.policy.ltadTable
  };

  // 'hybrid' runs both axes and ranks them against each other, which is the
  // honest way to answer "is banding on ability actually better for us?" —
  // rather than asserting that it is.
  const bandBy = opts.bandBy || 'age';
  const candidates = bandBy === 'hybrid'
    ? enumerateStructures(histogram, { ...shared, bandBy: 'age' })
      .concat(enumerateStructures(histogram, { ...shared, bandBy: 'capability' }))
    : enumerateStructures(histogram, { ...shared, bandBy });

  // When nothing survives, say what was searched over. A silent empty result
  // after locking a squad looks like a broken tool rather than a search space
  // that has been narrowed past the point of having any answers.
  const diagnostics = {
    reserved: reservedSquads.map(s => `${s.name} (${s.targetSize})`),
    agesSearched: Object.keys(histogram).map(Number).sort((a, b) => a - b),
    swimmersSearched: Object.values(histogram).reduce((a, b) => a + b, 0),
    minSquads: opts.minSquads ?? 3,
    maxSquads: opts.maxSquads ?? 7,
    minBandSize: opts.minBandSize ?? 6
  };

  if (!candidates.length) {
    return {
      suggestions: [],
      candidatesConsidered: 0,
      diagnostics,
      reason: diagnostics.agesSearched.length < diagnostics.minSquads
        ? `Only ${diagnostics.agesSearched.length} age group(s) are left to re-band after holding ${reservedSquads.length} squad(s) out, which cannot be split into ${diagnostics.minSquads} squads. Unlock a squad, or lower the minimum squad count.`
        : `No banding of ${diagnostics.swimmersSearched} swimmers across ages ${diagnostics.agesSearched[0]}-${diagnostics.agesSearched[diagnostics.agesSearched.length - 1]} satisfies a minimum of ${diagnostics.minBandSize} per squad. Lower the minimum band size, or unlock a squad.`
    };
  }

  // Two stages, because drawing a finished timetable for every candidate does
  // not fit inside a click.
  //
  // Measured on the club's real scenario: 594 candidates, greedy assignment for
  // all of them takes 1.9 seconds, and the bounded local repair that follows
  // takes a further two minutes. Repair is essentially the whole cost, and a
  // two-minute wait reads as a hung page.
  //
  // So every candidate is greedily timetabled and ranked on that — a real score
  // off a real assignment, not a proxy — and only the best few are handed to
  // the repair pass that decides the winner. Ranking on a structural heuristic
  // instead was tried and was not good enough: it dropped the eventual winner
  // out of the top forty.
  //
  // The narrowing is reported rather than hidden: the result carries
  // candidatesConsidered alongside candidatesSolved.
  const screenTo = Math.max(topN, Number(opts.screenTo) || Math.max(topN * 6, 32));

  const prepared = candidates.map((squads, idx) => {
    const state = { ...base, squads: normaliseSquads(squads, base.policy, base.showRate) };
    const ordering = buildOrderings(state.squads)[0];
    const greedy = solveWithState(state, {}, 0, [ordering]);
    return { idx, squads, state, ordering, screen: greedy.metrics.total };
  });

  const screened = prepared
    .sort((a, b) => b.screen - a.screen || a.idx - b.idx)
    .slice(0, screenTo);

  const scored = screened.map(({ idx, squads, state, ordering }) => {
    const best = solveWithState(state, {}, maxIterations, [ordering]);
    return {
      key: `structure_${idx}`,
      squads,
      squadCount: squads.length,
      bandBy: squads.some(q => q.bandBy === 'capability') ? 'capability' : 'age',
      total: best.metrics.total,
      subScores: best.metrics.subScores,
      swimmersServed: best.metrics.swimmersServed,
      unservedDemand: best.metrics.unservedDemand,
      utilisationPct: best.metrics.utilisationPct,
      ltadCompliancePct: best.metrics.ltadCompliancePct,
      unscheduledSquads: best.metrics.unscheduledSquads,
      // The plain question a coach asks of any proposal: does every squad
      // actually get the training it is supposed to get?
      squadsMeetingRequirement: best.metrics.squadsMeetingRequirement,
      swimmerSessionsRequired: best.metrics.swimmerSessionsRequired,
      swimmerSessionsDelivered: best.metrics.swimmerSessionsDelivered,
      bands: squads.map(s => ({
        name: s.name, minAge: s.minAge, maxAge: s.maxAge,
        targetSize: s.targetSize,
        sessions: s.targetSessionsPerWeek,
        hours: s.targetHoursPerWeek,
        competitive: s.competitive !== false,
        minWaPoints: s.minWaPoints ?? null,
        maxWaPoints: s.maxWaPoints ?? null
      }))
    };
  }).sort((a, b) => b.total - a.total || a.squadCount - b.squadCount || a.key.localeCompare(b.key));

  return {
    suggestions: scored.slice(0, topN),
    candidatesConsidered: candidates.length,
    candidatesSolved: scored.length,
    diagnostics
  };
}


/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */

/**
 * Every measure two plans can be lined up on.
 *
 * `key` is the contract — the API, the spreadsheet and the tests all address
 * rows by it, and it never changes. `label` is what a reader sees, and `term`
 * anchors that wording to lib/restructure-glossary.js so a row cannot quietly
 * invent a second name for something the rest of the page already names. A unit
 * test walks these and fails if a `term` does not exist.
 *
 * `squadsMeetingRequirement` and `coachCoverage` were missing entirely, which
 * meant the headline measure of the whole tool — do the squads get the training
 * they are set — had never appeared on the comparison at all.
 */
export const COMPARISON_ROWS = [
  // Counted over squads that owe their swimmers something, which is how
  // summariseModel counts it for the verdict at the top of the page.
  // metrics.squadsMeetingRequirement counts every squad including those with no
  // target at all, so using it here put an 8 on the comparison directly beneath
  // a verdict reading "6 of 7".
  {
    key: 'squadsMeetingRequirement',
    term: 'fullTrainingWeek',
    label: 'Squads getting their full training week',
    higherIsBetter: true,
    get: m => (m.bySquad || []).filter(s => s.sessionsTarget > 0 && s.requirementMet).length
  },
  { key: 'swimmersServed', term: 'swimmersCovered', label: 'Swimmers the water covers', higherIsBetter: true, get: m => m.swimmersServed },
  { key: 'assignedLaneHours', term: 'poolTimeOccupied', label: 'Pool time squads occupy', higherIsBetter: true, get: m => m.assignedLaneHours },
  { key: 'coachCoverage', term: 'coachHour', label: 'Coaching covered', higherIsBetter: true, get: m => m.coach?.coveragePct ?? null },

  { key: 'total', term: 'fitScore', label: 'Fit score /100', higherIsBetter: true, get: m => m.total },
  { key: 'utilisationPct', term: 'waterUsed', label: 'Water used %', higherIsBetter: true, get: m => m.utilisationPct },
  { key: 'occupancyPct', term: 'lanesFilled', label: 'Lanes filled %', higherIsBetter: true, get: m => m.occupancyPct },
  { key: 'availableLaneHours', term: 'poolTimeOnOffer', label: 'Pool time this plan can use', higherIsBetter: true, get: m => m.availableLaneHours },
  { key: 'unservedDemand', term: 'swimmersNotCovered', label: 'Swimmers not covered', higherIsBetter: false, get: m => m.unservedDemand },
  { key: 'roomForMore', term: 'roomForMore', label: 'Room for more swimmers', higherIsBetter: true, get: m => m.roomForMore },
  { key: 'squadCount', term: 'squadCount', label: 'Squads in the plan', higherIsBetter: null, get: m => m.squadCount },
  { key: 'ltadCompliancePct', term: 'volumeFit', label: 'Volume fit /100', higherIsBetter: true, get: m => m.ltadCompliancePct },
  { key: 'timetableQuality', term: 'timetableQuality', label: 'Timetable quality /100', higherIsBetter: true, get: m => m.subScores.timetableQuality },
  { key: 'continuity', term: 'sessionsThatStayPut', label: 'Sessions that stay put %', higherIsBetter: true, get: m => m.subScores.continuity },
  { key: 'curfew', term: 'timeGuidePenalty', label: 'Time-guide penalty', higherIsBetter: false, get: m => m.totalCurfewPenalty },
  { key: 'coachRequired', term: 'coachHour', label: 'Coach-hours needed', higherIsBetter: false, get: m => m.coach?.requiredCoachHours ?? null },
  { key: 'coachCovered', term: 'coachHour', label: 'Coach-hours covered', higherIsBetter: true, get: m => m.coach?.coveredCoachHours ?? null },
  { key: 'coachGap', term: 'coachHoursShort', label: 'Coach-hours short', higherIsBetter: false, get: m => m.coach?.gapHours ?? null },
  { key: 'coachPeak', term: 'coachesAtOnce', label: 'Coaches needed at once', higherIsBetter: false, get: m => m.coach?.peakConcurrent ?? null }
];

/**
 * The four a committee reads first.
 *
 * Deliberately the same four figures ModelVerdict has been showing at the top of
 * the page all session, so comparing plans does not mean learning a second
 * vocabulary. Everything else in COMPARISON_ROWS stays one click away.
 */
export const HEADLINE_ROW_KEYS = [
  'squadsMeetingRequirement', 'swimmersServed', 'assignedLaneHours', 'coachCoverage'
];

/**
 * Line up two or more solved scenarios for comparison.
 *
 * Accepts a list of { name, metrics } and returns one row per measure with the
 * best value marked, plus the per-squad deltas between the first two.
 */
export function diffScenarios(entries) {
  const valid = (entries || []).filter(e => e && e.metrics);
  if (!valid.length) return { rows: [], squadDeltas: [], names: [] };

  const rows = COMPARISON_ROWS.map(row => {
    const values = valid.map(e => row.get(e.metrics));
    const numeric = values.filter(v => typeof v === 'number' && Number.isFinite(v));
    let bestIndex = -1;
    if (row.higherIsBetter !== null && numeric.length > 1) {
      const target = row.higherIsBetter ? Math.max(...numeric) : Math.min(...numeric);
      bestIndex = values.findIndex(v => v === target);
    }
    return { key: row.key, term: row.term, label: row.label, values, bestIndex, higherIsBetter: row.higherIsBetter };
  });

  let squadDeltas = [];
  if (valid.length >= 2) {
    const [a, b] = valid;
    const byName = {};
    (a.metrics.bySquad || []).forEach(s => { byName[s.name] = { a: s, b: null }; });
    (b.metrics.bySquad || []).forEach(s => {
      byName[s.name] = { a: byName[s.name]?.a || null, b: s };
    });
    squadDeltas = Object.keys(byName).sort().map(name => {
      const { a: x, b: y } = byName[name];
      return {
        name,
        inA: !!x, inB: !!y,
        sizeA: x?.targetSize ?? null, sizeB: y?.targetSize ?? null,
        sessionsA: x?.sessionsAssigned ?? null, sessionsB: y?.sessionsAssigned ?? null,
        hoursA: x?.effectiveTargetHours ?? null, hoursB: y?.effectiveTargetHours ?? null,
        servedA: x?.served ?? null, servedB: y?.served ?? null,
        ltadA: x?.ltadVerdict ?? null, ltadB: y?.ltadVerdict ?? null
      };
    });
  }

  return { rows, squadDeltas, names: valid.map(e => e.name) };
}
