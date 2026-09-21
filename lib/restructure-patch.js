/**
 * Changes to a scenario, expressed as small named operations.
 *
 * The assistant is not allowed to hand back a rewritten `inputs` blob. It would
 * be free to drop a squad, invent a lane count or quietly change a target while
 * claiming to have done one thing, and nothing would catch it — a blob diff
 * against a 40-slot scenario is not reviewable by eye.
 *
 * So it may only request operations from this list. Each one is applied here,
 * in ordinary code, against the real inputs; anything an operation cannot do is
 * rejected with a reason rather than half-applied. What comes back is a
 * plain-English list of what changed, which is what the user actually approves.
 *
 * Pure: no I/O, no clock, no randomness. The solver re-runs on the result.
 */

import { timeToMinutes } from './restructure-solver';
import { GOALS, weightsForGoals } from './restructure-goals';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Squads are addressed by name as often as by id, because that is how people talk. */
function findSquad(squads, ref) {
  if (!ref) return null;
  const key = String(ref).trim().toLowerCase();
  return squads.find(s => String(s.id).toLowerCase() === key)
    || squads.find(s => String(s.name).toLowerCase() === key)
    || squads.find(s => String(s.name).toLowerCase().startsWith(key))
    || null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const OPS = {
  /** Change what a squad is set to do, or how big it is. */
  set_squad(inputs, op) {
    const squads = inputs.squads || [];
    const squad = findSquad(squads, op.squad);
    if (!squad) return { error: `There is no squad called "${op.squad}".` };

    const patch = {};
    const said = [];

    const sessions = num(op.sessionsPerWeek);
    if (sessions !== null) {
      if (sessions < 0 || sessions > 14) return { error: 'Sessions a week must be between 0 and 14.' };
      patch.targetSessionsPerWeek = Math.round(sessions);
      said.push(`${squad.targetSessionsPerWeek} to ${patch.targetSessionsPerWeek} sessions a week`);
    }

    const hours = num(op.hoursPerWeek);
    if (hours !== null) {
      if (hours < 0 || hours > 30) return { error: 'Hours a week must be between 0 and 30.' };
      patch.targetHoursPerWeek = hours;
      patch.targetHoursDerived = false;
      said.push(`${squad.targetHoursPerWeek || 0} to ${hours} hours a week`);
    }

    const size = num(op.targetSize);
    if (size !== null) {
      if (size < 0) return { error: 'A squad cannot have a negative number of swimmers.' };
      patch.targetSize = Math.round(size);
      said.push(`${squad.targetSize} to ${patch.targetSize} swimmers`);
    }

    const perLane = num(op.swimmersPerLane);
    if (perLane !== null) {
      if (perLane < 1 || perLane > 12) return { error: 'Swimmers per lane must be between 1 and 12.' };
      patch.swimmersPerLane = Math.round(perLane);
      said.push(`${squad.swimmersPerLane} to ${patch.swimmersPerLane} swimmers per lane`);
    }

    const minAge = num(op.minAge);
    const maxAge = num(op.maxAge);
    if (minAge !== null || maxAge !== null) {
      const lo = minAge === null ? squad.minAge : Math.round(minAge);
      const hi = maxAge === null ? squad.maxAge : Math.round(maxAge);
      if (lo > hi) return { error: `Ages ${lo}-${hi} run backwards.` };
      patch.minAge = lo;
      patch.maxAge = hi;
      said.push(`ages ${squad.minAge}–${squad.maxAge} to ${lo}–${hi}`);
    }

    if (typeof op.locked === 'boolean') {
      patch.locked = op.locked;
      said.push(op.locked ? 'held as it is' : 'opened up to be remodelled');
    }
    if (typeof op.requireWeekend === 'boolean') {
      patch.requireWeekend = op.requireWeekend;
      said.push(op.requireWeekend ? 'must have a weekend session' : 'no longer needs a weekend session');
    }

    if (!said.length) return { error: 'That change did not say what to alter.' };

    return {
      inputs: { ...inputs, squads: squads.map(s => (s.id === squad.id ? { ...s, ...patch } : s)) },
      applied: `${squad.name}: ${said.join(', ')}.`
    };
  },

  /** Add pool time the club is considering, on one or several days. */
  add_slots(inputs, op) {
    const days = (Array.isArray(op.days) ? op.days : [op.day])
      .filter(Boolean)
      .map(d => DAYS.find(x => x.toLowerCase() === String(d).trim().toLowerCase()));
    if (!days.length || days.some(d => !d)) {
      return { error: `Day must be one of ${DAYS.join(', ')}.` };
    }

    const { startTime, endTime } = op;
    if (!startTime || !endTime) return { error: 'A slot needs a start and an end time.' };
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      return { error: `${startTime}–${endTime} ends before it starts.` };
    }

    const lanes = num(op.lanes);
    if (lanes === null || lanes < 1 || lanes > 12) return { error: 'Lanes must be between 1 and 12.' };

    const venue = String(op.venue || '').trim();
    if (!venue) return { error: 'A slot needs a venue.' };

    const existing = inputs.poolSlots || [];
    let n = existing.length;
    const added = days.map(day => ({
      id: `slot_ai_${++n}_${day.slice(0, 3).toLowerCase()}_${String(startTime).replace(':', '')}`,
      label: `${day} ${startTime}-${endTime} ${venue}`,
      venue,
      day,
      startTime,
      endTime,
      lanes: Math.round(lanes),
      source: 'candidate',
      existingSessionId: null,
      enabled: true
    }));

    return {
      inputs: { ...inputs, poolSlots: existing.concat(added) },
      applied: `Added ${added.length} candidate session${added.length === 1 ? '' : 's'}: ${days.join(', ')} ${startTime}–${endTime}, ${Math.round(lanes)} lanes at ${venue}.`
    };
  },

  /** Turn a slot off without deleting it, so it can be turned back on. */
  set_slot_enabled(inputs, op) {
    const slots = inputs.poolSlots || [];
    const key = String(op.slot || '').trim().toLowerCase();
    const slot = slots.find(s => String(s.id).toLowerCase() === key)
      || slots.find(s => String(s.label).toLowerCase() === key);
    if (!slot) return { error: `There is no slot called "${op.slot}".` };
    const enabled = op.enabled !== false;

    return {
      inputs: {
        ...inputs,
        poolSlots: slots.map(s => (s.id === slot.id ? { ...s, enabled } : s))
      },
      applied: `${slot.label}: ${enabled ? 'back in the model' : 'taken out of the model'}.`
    };
  },

  /** Drop candidate water. Sessions the club actually runs are turned off, never deleted. */
  remove_slots(inputs, op) {
    const slots = inputs.poolSlots || [];
    const wanted = (Array.isArray(op.slots) ? op.slots : [op.slot])
      .filter(Boolean).map(s => String(s).trim().toLowerCase());
    const hit = slots.filter(s =>
      wanted.includes(String(s.id).toLowerCase()) || wanted.includes(String(s.label).toLowerCase()));
    if (!hit.length) return { error: 'No slot matched.' };

    const realIds = new Set(hit.filter(s => s.source === 'existing').map(s => s.id));
    const dropIds = new Set(hit.filter(s => s.source !== 'existing').map(s => s.id));

    const next = slots
      .filter(s => !dropIds.has(s.id))
      .map(s => (realIds.has(s.id) ? { ...s, enabled: false } : s));

    const bits = [];
    if (dropIds.size) bits.push(`removed ${dropIds.size} candidate session${dropIds.size === 1 ? '' : 's'}`);
    if (realIds.size) bits.push(`turned off ${realIds.size} session${realIds.size === 1 ? '' : 's'} the club runs today`);

    return { inputs: { ...inputs, poolSlots: next }, applied: `Pool time: ${bits.join(', ')}.` };
  },

  /** Change what the model is optimising for. */
  set_goals(inputs, op) {
    const wanted = (Array.isArray(op.goals) ? op.goals : [op.goals]).filter(Boolean);
    const keys = wanted.map(k => String(k).trim().toLowerCase());
    const bad = keys.filter(k => !GOALS.some(g => g.key === k));
    if (bad.length) {
      return { error: `Not a goal: ${bad.join(', ')}. Choose from ${GOALS.map(g => g.key).join(', ')}.` };
    }
    if (!keys.length) return { error: 'At least one goal is needed.' };

    // Goals are only intentions until they reach the weights the solver scores
    // on. Setting one without the other leaves the picker showing a goal the
    // search is not actually pursuing.
    const labels = keys.map(k => GOALS.find(g => g.key === k).label);
    return {
      inputs: { ...inputs, goals: keys, weights: weightsForGoals(keys) || {} },
      applied: `Now aiming for: ${labels.join('; ')}.`
    };
  },

  /** Expected intake and drop-out, which set how much water the club has to find. */
  set_growth(inputs, op) {
    const growth = { ...(inputs.growth || {}) };
    const said = [];
    const joining = num(op.expectedNewSwimmers);
    if (joining !== null) {
      if (joining < 0) return { error: 'Expected new swimmers cannot be negative.' };
      growth.expectedNewSwimmers = Math.round(joining);
      said.push(`${growth.expectedNewSwimmers} swimmers joining`);
    }
    const attrition = num(op.attritionPct);
    if (attrition !== null) {
      if (attrition < 0 || attrition > 100) return { error: 'Attrition must be a percentage between 0 and 100.' };
      growth.attritionPct = attrition;
      said.push(`${attrition}% leaving`);
    }
    if (!said.length) return { error: 'That change did not say what to alter.' };
    return { inputs: { ...inputs, growth }, applied: `Assuming ${said.join(' and ')}.` };
  }
};

export const PATCH_OPS = Object.keys(OPS);

/**
 * Apply a list of operations in order.
 *
 * Each is independent: one being rejected does not stop the rest, because a
 * request like "give Gold a fifth session and add Thursday water" should not
 * fail entirely because the club has no squad called Gold.
 *
 * Returns { inputs, applied[], rejected[] } — `inputs` is a fresh object and the
 * original is never mutated.
 */
export function applyPatch(inputs, ops) {
  const list = Array.isArray(ops) ? ops : [ops];
  let next = inputs;
  const applied = [];
  const rejected = [];

  list.filter(Boolean).forEach(op => {
    const fn = OPS[op.op];
    if (!fn) {
      rejected.push(`"${op.op}" is not something that can be changed.`);
      return;
    }
    let outcome;
    try {
      outcome = fn(next, op);
    } catch (err) {
      rejected.push(`${op.op} failed: ${err.message}`);
      return;
    }
    if (outcome.error) rejected.push(outcome.error);
    else { next = outcome.inputs; applied.push(outcome.applied); }
  });

  return { inputs: next, applied, rejected };
}
