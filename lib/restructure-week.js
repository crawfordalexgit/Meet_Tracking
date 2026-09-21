/**
 * A week of swimming, in one shape.
 *
 * The club's timetable used to be drawn five times across the planner: a table
 * on Today, a grid and a table on Venues, and a grid and a list inside the
 * timetable component — plus the same sessions again as editable rows. Five
 * renderings of one week, each deriving its own fields and rounding its own
 * percentages, which is how the same session came to read 46% on one tab and
 * 45% on another.
 *
 * These three functions turn each of the three sources — the club's real
 * sessions, a solved plan, and the slots a plan left empty — into the identical
 * field set, so a single renderer can draw any of them.
 *
 * Nothing here calculates a percentage. Every ratio already exists on the
 * baseline, computed server-side and unit-tested; recomputing it in the browser
 * is precisely what let the numbers drift apart.
 *
 * Pure: no I/O, no clock, no randomness.
 */

import { timeToMinutes } from './restructure-solver';
import { DAY_NAMES_FULL } from './analytics-utils';

/** Draggable onto a day column: needs a real day and a positive length. */
function placeable(item) {
  return item.startMin != null
    && item.endMin != null
    && item.endMin > item.startMin
    && DAY_NAMES_FULL.includes(item.day);
}

/**
 * The booked/attending pair, packaged for <SessionUse>.
 *
 * A session with no register keeps null, never zero. Zero would sort it
 * alongside water that genuinely stands empty, and those are different problems
 * with different answers.
 */
function useOf(session) {
  const a = session.attendance || {};
  const hasRegister = (a.registers || 0) > 0;
  return {
    places: session.places ?? null,
    booked: session.rosterCount ?? null,
    bookedPctOfPlaces: session.occupancyPct ?? null,
    averageAttending: hasRegister ? a.avgPresent ?? null : null,
    attendingPctOfPlaces: hasRegister ? a.ofCapacityPct ?? null : null,
    attendingPctOfBooked: hasRegister ? a.ofBookedPct ?? null : null,
    registers: a.registers || 0
  };
}

/**
 * The week the club actually runs, from the baseline.
 *
 * `venue` narrows to one site, which is what the Venues tab used to be.
 */
export function itemsFromSessions(baseline, { venue = null } = {}) {
  return (baseline?.sessions || [])
    .filter(s => s.isActive)
    .filter(s => !venue || s.location === venue)
    .map(s => {
      const use = useOf(s);
      return {
        key: s.id,
        day: s.day,
        startMin: timeToMinutes(s.startTime),
        endMin: timeToMinutes(s.endTime),
        startTime: s.startTime,
        endTime: s.endTime,
        title: s.name,
        subtitle: null,
        venue: s.location,
        lanes: s.lanes,
        colourKey: s.name,
        places: use.places,
        booked: use.booked,
        attending: use.averageAttending,
        placesFilledPct: use.attendingPctOfPlaces,
        turnUpPct: use.attendingPctOfBooked,
        registers: use.registers,
        use,
        squadCounts: s.squadCounts || {},
        coaches: [],
        flags: [],
        isUnused: false
      };
    })
    .filter(placeable);
}

/**
 * The week a solved plan would produce: one entry per squad in a booking.
 *
 * There is no attendance here on purpose — a proposed session has never been
 * run, so it has places and an expected head count and nothing measured.
 */
export function itemsFromPlan(result) {
  return (result?.plan?.assignments || [])
    .map(a => ({
      key: `${a.slotId}-${a.squadId}`,
      day: a.day,
      startMin: timeToMinutes(a.startTime),
      endMin: timeToMinutes(a.endTime),
      startTime: a.startTime,
      endTime: a.endTime,
      title: a.squadName,
      subtitle: a.label,
      venue: a.venue,
      lanes: a.lanes,
      colourKey: a.squadId,
      places: a.capacity,
      booked: a.expected ?? null,
      attending: null,
      placesFilledPct: null,
      turnUpPct: null,
      registers: 0,
      use: null,
      squadCounts: {},
      coaches: a.coachNames || [],
      flags: a.flags || [],
      isUnused: false,
      source: a.source || 'candidate'
    }))
    .filter(placeable);
}

/**
 * Water the plan booked and put nothing into.
 *
 * Drawn alongside the proposal as ghosts, because an empty lane you are paying
 * for is a finding, not an absence.
 */
export function itemsFromSlots(slots, result) {
  const used = new Set((result?.plan?.assignments || []).map(a => a.slotId));
  return (slots || [])
    .filter(s => s.enabled !== false && !used.has(s.id))
    .map(s => ({
      key: `unused-${s.id}`,
      day: s.day,
      startMin: timeToMinutes(s.startTime),
      endMin: timeToMinutes(s.endTime),
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.label || 'Nothing booked in',
      subtitle: s.reservedFor ? `Reserved for ${s.reservedFor}` : null,
      venue: s.venue,
      lanes: s.lanes,
      colourKey: null,
      places: null,
      booked: null,
      attending: null,
      placesFilledPct: null,
      turnUpPct: null,
      registers: 0,
      use: s.currentUse || null,
      squadCounts: {},
      coaches: [],
      flags: [],
      isUnused: true,
      source: s.source || 'candidate'
    }))
    .filter(placeable);
}

/** Every venue appearing in a set of items, for the filter pills. */
export function venuesOf(items) {
  return Array.from(new Set(items.map(i => i.venue).filter(Boolean))).sort();
}
