/**
 * Current-state baseline for the squad restructuring planner.
 *
 * Server-only I/O module (uses the service client), mirroring the shape of
 * lib/allocation-data.js. It reads the live club record and returns the "today"
 * picture the planner seeds a scenario from. It never writes: a scenario is a
 * what-if, and the squads and sessions tables stay the club's record of fact.
 *
 * Pairs with lib/restructure-solver.js, which is pure and does the scoring.
 */

import { getServiceSupabase } from './supabase';
import { fetchAllRows } from './paginate';
import { extractSessionDay, getSessionDuration, DAY_NAMES_FULL, getDayOrder } from './analytics-utils';
import { laneSegments, laneHoursOf, peakLanesOf, normalisePhases, toTime, laneLoad } from './session-lanes';
import { resolveAttendanceDays as clampWindow } from './restructure-glossary';
import {
  partitionByTerm, exclusionsInWindow, termSpanOf, describeBasis, dateKeyDaysAgo
} from './term-dates';

/** UI default when a session carries no lane count, matching pages/settings.js. */
const DEFAULT_LANES = 6;

/**
 * The lanes a session holds, distinguishing "never recorded" from "none".
 *
 * `lanes_allocated || DEFAULT_LANES` cannot tell the two apart, so a session
 * deliberately set to zero lanes came back as six. That is not academic: the
 * club's land-training session sits in the pool timetable, and zeroing its lanes
 * — the correct fix, since it uses no water — left it still contributing six
 * lane-hours to every total, with no way to see why.
 *
 * null or undefined still means "not recorded", and still assumes the UI
 * default. An explicit 0 means none, and is honoured.
 */
export function lanesOf(session) {
  const raw = session?.lanes_allocated;
  if (raw === null || raw === undefined || raw === '') return DEFAULT_LANES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LANES;
}

/**
 * How capability is measured, and how coarsely it is banded.
 *
 * World Aquatics points are the only capability figure in the database that is
 * already normalised across event, age and gender, which is exactly what a
 * cross-squad comparison needs — raw times are not comparable between a
 * 10-year-old's 50 free and a 16-year-old's 200 fly. Peak points over a rolling
 * year is the convention the rest of the app already uses (lib/analytics-utils.js
 * computeSquadStats, lib/ai-context.js).
 *
 * 50-point buckets keep the number of possible band boundaries close to the
 * number of ages, so capability partitions stay as enumerable as age ones.
 */
const CAPABILITY_WINDOW_DAYS = 365;

/**
 * How much racing a World Aquatics score has to rest on before it is used.
 *
 * Three swims across two separate meets. Below that the figure is a sample of
 * one morning rather than a measure of how a swimmer swims, and at the bottom of
 * the pathway — where almost nobody races often — it would be doing the most
 * work on the least evidence.
 */
const MIN_RANKED_SWIMS = 3;
const MIN_RANKED_MEETS = 2;

/**
 * How far back registers are read for "how well is this session attended".
 *
 * Configurable, because the right answer moves with the calendar. Ninety days
 * spanning the summer break averages a fortnight when the club barely ran into
 * a term-time picture, which costs about three points of turn-up; thirty days
 * in September says what is happening now; a year smooths out both. The window
 * every figure was measured over travels with the baseline so a report can
 * state it rather than leave a reader to assume.
 */
export { ATTENDANCE_WINDOWS, resolveAttendanceDays } from './restructure-glossary';
const CAPABILITY_BUCKET = 50;

/** Final fallback in getSessionDuration when nothing at all can be parsed. */
const DURATION_FALLBACK = 1.5;

/**
 * Lanes a squad gets in a session that several squads share.
 *
 * Ported from getSessionLanesForSquad in pages/capacity.js (which closes over
 * component state and so cannot be imported) and made pure. The three-key
 * fallback is load-bearing: shared_sessions_config has been written under the
 * session id, the SCM guid and the session name at different times.
 */
export function getSessionLanesForSquad(session, squadId, sharedConfig = {}) {
  if (!session || !squadId) return lanesOf(session);
  const config = sharedConfig[session.id]
    || sharedConfig[session.scm_guid]
    || sharedConfig[session.name];
  if (config && Object.keys(config).length > 0) {
    return config[squadId] === undefined ? 0 : config[squadId];
  }
  return lanesOf(session);
}

/**
 * Swimmers per lane for a squad.
 *
 * swimmers_per_lane is the field the club actually configures, in Settings ->
 * Squad Management, and it varies by squad. max_swimmers_per_lane is never
 * written by any part of the app and sits at an untouched 5 on every squad, so
 * reading it first — as this and pages/capacity.js both used to — silently threw
 * away the configured density and made every squad identical. It is kept only as
 * a fallback for any row where the real field is missing.
 *
 * pages/capacity.js uses the same order, so the two pages agree on how many
 * bodies a lane holds.
 */
export function swimmersPerLaneFor(squad) {
  if (!squad) return 8;
  return squad.swimmers_per_lane || squad.max_swimmers_per_lane || 8;
}

/**
 * Swimming age: the age reached by 31 December, which is what squads and
 * championship age groups are built on — not the age today. Only year_of_birth
 * is stored, by design.
 */
export function swimmingAge(yearOfBirth, currentYear) {
  if (!yearOfBirth) return null;
  return currentYear - yearOfBirth;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The value at a percentile of an age histogram.
 *
 * Squad age bands are seeded from the 10th/90th percentile rather than the
 * outright min/max: one 17-year-old lingering in a junior squad should not
 * widen the whole band and drag its LTAD volume target with it.
 */
export function percentileFromHistogram(histogram, p) {
  const ages = Object.keys(histogram).map(Number).sort((a, b) => a - b);
  const total = ages.reduce((s, a) => s + histogram[a], 0);
  if (!total) return null;
  const target = total * p;
  let seen = 0;
  for (const age of ages) {
    seen += histogram[age];
    if (seen >= target) return age;
  }
  return ages[ages.length - 1];
}

/**
 * Which squad a session belongs to, read off its name.
 *
 * This is the timetable as it appears in Config: "GOLD DEVELOPMENT Friday" is a
 * Gold session, and that is all there is to it. Nothing is inferred from who is
 * allocated, so what the tool calls a squad's offer is exactly what the club has
 * written down.
 *
 * Where a name mentions more than one squad — "MASTERS/Junior MASTERS" — the one
 * named first wins, so the session lands with the squad it is chiefly for.
 */
export function squadForSessionName(sessionName, squads) {
  const name = String(sessionName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!name) return null;

  let best = null;
  squads.forEach(sq => {
    const full = String(sq.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const firstWord = full.split(' ')[0];
    // The full name, plus the leading word so "Age Monday pm" still finds
    // AGE DEVELOPMENT and "NAR+ Friday" still finds NAR.
    const aliases = full === firstWord ? [full] : [full, firstWord];

    aliases.forEach(alias => {
      if (!alias) return;
      const at = name.indexOf(alias);
      if (at === -1) return;
      const better = !best
        || at < best.at
        || (at === best.at && alias.length > best.alias.length)
        || (at === best.at && alias.length === best.alias.length
            && String(sq.name).localeCompare(best.name) < 0);
      if (better) best = { id: sq.id, name: sq.name, at, alias };
    });
  });

  return best ? best.id : null;
}

/**
 * The lanes one squad holds in a session.
 *
 * A configured split is authoritative. Without one, the session's lanes are
 * divided in proportion to who is actually allocated to it — a squad with two
 * swimmers in someone else's six-lane session does not hold six lanes.
 *
 * Used for both places and lane-hours so the two can never disagree about how
 * much water a squad has: crediting a squad the whole session for lane-hours
 * while giving it a proportional share for places overstates its footprint.
 */
function squadLaneShare(session, rawSession, squadId, sharedConfig) {
  const configured = sharedConfig[session.id]
    || sharedConfig[rawSession.scm_guid]
    || sharedConfig[session.name];
  if (configured && Object.keys(configured).length > 0) {
    return getSessionLanesForSquad(rawSession, squadId, sharedConfig);
  }
  const count = session.squadCounts[squadId] || 0;
  const total = Object.values(session.squadCounts).reduce((a, b) => a + b, 0);
  if (!total) return session.lanes;
  return (session.lanes * count) / total;
}

/**
 * Index sessions by both id and scm_guid.
 *
 * Membership and attendance rows carry either form depending on when they were
 * synced, so a single-key lookup silently drops a slice of the roster.
 */
/**
 * Present as a share of present-plus-absent, for a set of register marks.
 *
 * 'excused' counts on neither side: a swimmer told not to come is not a
 * no-show, and counting them absent would read as the session being avoided.
 */
function ratePctOf(rows) {
  let present = 0;
  let counted = 0;
  (rows || []).forEach(r => {
    if (r.status === 'present') { present++; counted++; }
    else if (r.status === 'absent') { counted++; }
  });
  return counted > 0 ? +(present / counted * 100).toFixed(1) : null;
}

function indexSessions(sessions) {
  const byKey = {};
  sessions.forEach(s => {
    if (s.id) byKey[s.id] = s;
    if (s.scm_guid) byKey[s.scm_guid] = s;
  });
  return byKey;
}

/**
 * Read the club's current squad, session, roster and coach picture.
 *
 * Returns a plain object; every derived figure is computed here so the API
 * route stays a thin auth-and-orchestrate shell.
 */
export async function fetchRestructureBaseline({ currentYear, attendanceDays, termOnly } = {}) {
  const supabase = getServiceSupabase();
  const year = currentYear || new Date().getFullYear();
  const attendanceWindowDays = clampWindow(attendanceDays);
  // Default on. A figure that blends term and holidays is the one a committee
  // can pull apart, so the safe default is the defensible one; a reader who
  // wants the blended picture asks for it.
  const wantTermOnly = termOnly !== false;
  const windowFrom = dateKeyDaysAgo(attendanceWindowDays);
  const windowTo = dateKeyDaysAgo(0);

  const [squads, rawSessions, swimmers, memberships, profiles, coachSquads, settings, results, attendance] = await Promise.all([
    fetchAllRows(supabase, 'squads', { filter: q => q.eq('is_squad', true) }),
    fetchAllRows(supabase, 'sessions'),
    fetchAllRows(supabase, 'swimmers', { select: '*, squads(id, name)' }),
    fetchAllRows(supabase, 'session_memberships', { select: 'swimmer_id, session_id' }),
    fetchAllRows(supabase, 'profiles', { select: 'id, email, role' }),
    fetchAllRows(supabase, 'coach_squads', { select: 'coach_id, squad_id' }),
    fetchAllRows(supabase, 'ai_brain_settings', { select: 'key, value' }),
    // results carries no date of its own; the meet it belongs to does.
    fetchAllRows(supabase, 'results', { select: 'swimmer_id, wa_pts, meets(date)' }),
    // Registers for the recent window, so a session can be shown as it is
    // actually attended rather than only as it is allocated on paper.
    fetchAllRows(supabase, 'training_attendance', {
      select: 'session_id, date, status',
      filter: q => q.gte('date', windowFrom)
    })
  ]);

  const settingsByKey = {};
  settings.forEach(s => { settingsByKey[s.key] = s.value; });
  const sharedConfig = settingsByKey.shared_sessions_config || {};
  // Lane counts that change part-way through a session, keyed the same three
  // ways shared_sessions_config is, for the same reason.
  const lanePhaseConfig = settingsByKey.session_lane_phases || {};
  // How many lanes each pool actually has. Without it there is no telling an
  // over-booked pool from sessions that merely start at different times.
  const venueLanes = settingsByKey.venue_lanes || {};
  const phasesFor = raw => lanePhaseConfig[raw.id] || lanePhaseConfig[raw.scm_guid] || lanePhaseConfig[raw.name] || [];
  const defaults = settingsByKey.restructure_defaults || {};

  // School holidays the club has recorded. Registers taken inside them are set
  // aside rather than deleted: the club does train through the holidays, but at
  // 44-57% turn-up against 63-80% in term, so a window that blends the two
  // describes neither. See lib/term-dates.js.
  const termExclusions = settingsByKey.term_exclusions || [];
  const split = partitionByTerm(attendance, termExclusions);
  const attendanceRows = wantTermOnly ? split.term : attendance;
  const termSpan = termSpanOf(wantTermOnly ? termExclusions : [], windowFrom, windowTo);

  const warnings = [];

  // Asking for term weeks only and getting every week back is the one failure
  // that looks like success: the figures come out unchanged and nothing says
  // why. It happens the first time anybody opens this before the holidays are
  // entered in Settings.
  if (wantTermOnly && !exclusionsInWindow(termExclusions, windowFrom, windowTo).length) {
    warnings.push(`Attendance is set to term weeks only, but no school holidays are recorded inside ${windowFrom} to ${windowTo}, so nothing has been excluded. If any of this window was a school holiday, add it under Settings so the turn-up figures describe term-time training.`);
  }

  // --- Sessions -----------------------------------------------------------
  // day_of_week is NULL on every row in this database, so the weekday is
  // recovered from the session name by extractSessionDay. Duration is likewise
  // inferred rather than stored; count the rows that fall all the way through to
  // the 1.5h default, because those quietly shape the utilisation headline.
  let durationFallbacks = 0;
  let unknownDays = 0;

  const sessions = rawSessions.map(s => {
    const day = extractSessionDay(s);
    const durationHours = getSessionDuration(s);
    const hasExplicitTimes = !!(s.start_time && s.end_time);
    if (!hasExplicitTimes && durationHours === DURATION_FALLBACK) durationFallbacks++;
    if (!DAY_NAMES_FULL.includes(day)) unknownDays++;
    return {
      id: s.id,
      scmGuid: s.scm_guid || null,
      name: s.name,
      day,
      startTime: s.start_time || null,
      endTime: s.end_time || null,
      durationHours: +durationHours.toFixed(2),
      durationInferred: !hasExplicitTimes,
      location: s.location || 'Unspecified',
      // The lanes it opens with, and the largest it ever holds. Both are needed:
      // places are sized on the peak, because a squad with two lanes for an hour
      // needs room for two lanes' worth of swimmers, while lane-hours are the
      // area under the whole run.
      lanes: peakLanesOf(s, phasesFor(s), lanesOf(s)) || lanesOf(s),
      openingLanes: lanesOf(s),
      lanePhases: normalisePhases(s, phasesFor(s)).map(p => ({ from: toTime(p.at), lanes: p.lanes })),
      laneSegments: laneSegments(s, phasesFor(s), lanesOf(s)),
      isActive: s.is_active !== false,
      laneHours: +(hasExplicitTimes
        ? laneHoursOf(s, phasesFor(s), lanesOf(s))
        : lanesOf(s) * durationHours).toFixed(2),
      rosterCount: 0,
      squadCounts: {},
      // Whose session this is, per the timetable in Config.
      squadIdFromName: squadForSessionName(s.name, squads)
    };
  }).sort((a, b) => getDayOrder(a.day) - getDayOrder(b.day)
    || String(a.startTime || '').localeCompare(String(b.startTime || ''))
    || String(a.name).localeCompare(String(b.name)));

  if (durationFallbacks > 0) {
    warnings.push(`${durationFallbacks} session${durationFallbacks === 1 ? '' : 's'} carry no start/end time and no parseable length in the name, so ${durationFallbacks === 1 ? 'it was' : 'they were'} measured at the ${DURATION_FALLBACK}h default. Pool utilisation is an estimate to that extent.`);
  }
  // Sessions deliberately recorded as using no lanes. Named, so "why is this
  // not on the timetable" has an answer on the page rather than in the code.
  const noLanes = sessions.filter(s => s.isActive && s.lanes < 1);
  if (noLanes.length > 0) {
    warnings.push(
      `${noLanes.length} session${noLanes.length === 1 ? '' : 's'} ${noLanes.length === 1 ? 'is' : 'are'} recorded as using no lanes, so ${noLanes.length === 1 ? 'it holds' : 'they hold'} no pool time and ${noLanes.length === 1 ? 'is' : 'are'} left out of the plans: ${noLanes.map(s => `"${s.name}"`).join(', ')}. ${noLanes.length === 1 ? 'It still counts' : 'They still count'} on the club timetable and in attendance.`
    );
  }

  /*
   * How many lanes each pool is holding at once, against how many it has.
   *
   * A venue-day running four sessions is perfectly fine if they are staggered
   * and a problem if they are not, so the week is cut at every point a session
   * starts, ends or changes its lane count and the live lanes are added up in
   * each band. Where the club has recorded how many lanes a pool actually has,
   * anything over that is reported by name and time — which is what turns "the
   * numbers look odd" into "Tuesday at eight books twelve lanes in a six-lane
   * pool". Venues with no lane count recorded are measured but not judged.
   */
  const venueLoad = [];
  const byVenueDay = {};
  sessions.filter(s => s.isActive && DAY_NAMES_FULL.includes(s.day)).forEach(s => {
    // Keyed on a tuple: venue names contain spaces, so a joined string
    // cannot be split back apart reliably.
    const key = JSON.stringify([s.location, s.day]);
    (byVenueDay[key] = byVenueDay[key] || []).push(s);
  });

  Object.entries(byVenueDay).forEach(([key, list]) => {
    const [venue, day] = JSON.parse(key);
    const capacity = Number(venueLanes[venue]);
    // The parsed sessions already carry the lanes they open on and any
    // changes through the evening, so the raw rows are not needed again.
    const bands = laneLoad(list, {
      lanesFor: x => x.openingLanes,
      phasesFor: x => x.lanePhases
    });
    if (!bands.length) return;

    const peak = bands.reduce((m, b) => (b.lanes > m.lanes ? b : m), bands[0]);
    const over = Number.isFinite(capacity) && capacity > 0
      ? bands.filter(b => b.lanes > capacity)
      : [];

    venueLoad.push({
      venue,
      day,
      capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
      peakLanes: peak.lanes,
      peakAt: `${peak.startTime}-${peak.endTime}`,
      over: over.map(b => ({
        startTime: b.startTime,
        endTime: b.endTime,
        lanes: b.lanes,
        overBy: b.lanes - capacity,
        sessions: b.parts.map(p => ({ name: p.session.name, lanes: p.lanes }))
      }))
    });
  });

  const overBooked = venueLoad.filter(v => v.over.length);
  overBooked.forEach(v => {
    const worst = v.over.reduce((m, b) => (b.overBy > m.overBy ? b : m), v.over[0]);
    warnings.push(
      `${v.venue} on ${v.day} books ${worst.lanes} lanes at ${worst.startTime} in a ${v.capacity}-lane pool — ${worst.overBy} too many. In the water then: ${worst.sessions.map(s => `${s.name} (${s.lanes})`).join(', ')}.`
    );
  });

  const unmeasuredVenues = Array.from(new Set(venueLoad.filter(v => v.capacity === null).map(v => v.venue)));
  if (unmeasuredVenues.length) {
    warnings.push(
      `No lane count is recorded for ${unmeasuredVenues.join(', ')}, so the timetable cannot be checked against what ${unmeasuredVenues.length === 1 ? 'that pool holds' : 'those pools hold'}. Set it under Settings, Timetable.`
    );
  }

  if (unknownDays > 0) {
    // Name them and price them. These sessions are dropped when a plan is
    // seeded, so the plan's pool time is lower than the club's total by exactly
    // this much — which looks like a mistake until you can see what it was.
    const undated = sessions.filter(s => s.isActive && !DAY_NAMES_FULL.includes(s.day));
    const hours = +undated.reduce((a, s) => a + s.laneHours, 0).toFixed(1);
    warnings.push(
      `${undated.length} session${undated.length === 1 ? '' : 's'} ${undated.length === 1 ? `carries` : `carry`} no weekday, so ${undated.length === 1 ? `it cannot` : `they cannot`} be placed on a timetable and ${undated.length === 1 ? 'is' : 'are'} left out of every plan: ${undated.map(s => `"${s.name}"`).join(', ')} (${hours} lane-hours).`
    );
  }

  // --- Roster -------------------------------------------------------------
  const sessionByKey = indexSessions(rawSessions);
  const sessionsById = {};
  sessions.forEach(s => { sessionsById[s.id] = s; });

  const swimmerById = {};
  swimmers.forEach(sw => { swimmerById[sw.id] = sw; });

  let guidMatches = 0;
  let orphanMemberships = 0;
  memberships.forEach(m => {
    const raw = sessionByKey[m.session_id];
    if (!raw) { orphanMemberships++; return; }
    if (raw.id !== m.session_id) guidMatches++;
    const session = sessionsById[raw.id];
    if (!session) return;
    session.rosterCount++;
    // Who is actually in this water, so a session's occupancy can be measured
    // against the lane density the squads in it actually train at.
    const squadId = swimmerById[m.swimmer_id]?.squad_id;
    if (squadId) session.squadCounts[squadId] = (session.squadCounts[squadId] || 0) + 1;
  });
  if (guidMatches > 0) {
    warnings.push(`${guidMatches} session membership rows referenced a session by its SCM guid rather than its id; both forms were matched.`);
  }
  if (orphanMemberships > 0) {
    warnings.push(`${orphanMemberships} session membership rows point at a session that no longer exists and were ignored.`);
  }

  const squadById = {};
  squads.forEach(sq => { squadById[sq.id] = sq; });

  const rawSessionById = {};
  rawSessions.forEach(s => { rawSessionById[s.id] = s; });
  const swimmersBySquad = {};
  swimmers.forEach(sw => {
    if (!sw.squad_id) return;
    (swimmersBySquad[sw.squad_id] || (swimmersBySquad[sw.squad_id] = [])).push(sw);
  });

  const sessionIdsBySquad = {};
  memberships.forEach(m => {
    const raw = sessionByKey[m.session_id];
    if (!raw) return;
    const swimmer = swimmerById[m.swimmer_id];
    if (!swimmer || !swimmer.squad_id) return;
    const set = sessionIdsBySquad[swimmer.squad_id] || (sessionIdsBySquad[swimmer.squad_id] = new Set());
    set.add(raw.id);
  });

  const clubAgeHistogram = {};

  const squadRows = squads.map(sq => {
    const members = swimmersBySquad[sq.id] || [];
    // A squad's working size: everyone on its books, less those marked exempt
    // from the club's performance measures under Settings. pages/dashboard.js and
    // pages/api/squad-stats.js count squads the same way, so the planner and the
    // rest of the app agree on how big a squad is.
    //
    // The is_active check is inherited from those two and is currently a no-op:
    // swimmers has no is_active column, so it reads undefined on every row. Kept
    // for the day one is added, but it is exemption that does the work here.
    const active = members.filter(sw => sw.is_active !== false && !sw.is_exempt);
    const ages = active
      .map(sw => swimmingAge(sw.year_of_birth, year))
      .filter(a => a !== null && a > 0);

    const ageHistogram = {};
    ages.forEach(a => {
      ageHistogram[a] = (ageHistogram[a] || 0) + 1;
      clubAgeHistogram[a] = (clubAgeHistogram[a] || 0) + 1;
    });

    const currentSessionIds = Array.from(sessionIdsBySquad[sq.id] || []);
    const currentSessions = currentSessionIds.map(id => sessionsById[id]).filter(Boolean);

    // The squad's sessions as the timetable in Config lists them, matched on the
    // session name. Not "every session one of its swimmers appears in" — that
    // counted Gold Development as running 13 sessions and 15.5 hours when the
    // timetable plainly shows 6 and 7.5.
    const ownSessions = sessions.filter(s => s.isActive && s.squadIdFromName === sq.id);
    const sessionHours = ownSessions.map(s => s.durationHours);

    return {
      id: sq.id,
      name: sq.name,
      targetSessionsPerWeek: sq.target_sessions_per_week || 0,
      targetHoursPerWeek: sq.target_hours_per_week || 0,
      targetTrainingPercent: sq.target_training_percent || 75,
      requireWeekend: !!sq.require_weekend,
      useOrLogic: sq.use_or_logic !== false,
      swimmersPerLane: swimmersPerLaneFor(sq),
      ageBasedCriteria: sq.age_based_criteria || null,
      memberCount: members.length,
      activeNonExemptCount: active.length,
      ageHistogram,
      minAge: ages.length ? Math.min(...ages) : null,
      maxAge: ages.length ? Math.max(...ages) : null,
      medianAge: ages.length ? median(ages) : null,
      p10Age: percentileFromHistogram(ageHistogram, 0.10),
      p90Age: percentileFromHistogram(ageHistogram, 0.90),
      currentSessionIds,
      ownSessionIds: ownSessions.map(s => s.id),
      // The club's offer to this squad: the sessions it runs and the pool hours
      // it books for them.
      ownSessionCount: ownSessions.length,
      currentWeeklyHours: +sessionHours.reduce((s, h) => s + h, 0).toFixed(2),
      medianSessionHours: +median(sessionHours).toFixed(2),
      currentLaneHours: +currentSessions.reduce((s, sess) =>
        s + squadLaneShare(sess, rawSessionById[sess.id] || {}, sq.id, sharedConfig)
          * sess.durationHours, 0).toFixed(2)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // --- Capability ---------------------------------------------------------
  // Peak World Aquatics points over a rolling year, per swimmer. Same measure
  // the squad registry already reports, so a swimmer's capability reads the
  // same wherever it appears.
  const capabilityCutoff = new Date(Date.now() - CAPABILITY_WINDOW_DAYS * 86400000);

  const racing = {};
  results.forEach(r => {
    const date = r.meets?.date;
    if (!date || new Date(date) < capabilityCutoff) return;
    const pts = Number(r.wa_pts) || 0;
    if (pts <= 0) return;
    const rec = racing[r.swimmer_id] || (racing[r.swimmer_id] = { peak: 0, swims: 0, days: new Set() });
    rec.swims += 1;
    rec.days.add(date);
    if (pts > rec.peak) rec.peak = pts;
  });

  /*
   * A single race is a sample of one, not a measure of capability.
   *
   * Peak points off one gala says what a swimmer managed on one morning, which
   * is a poor basis for deciding what squad they belong in. It matters most at
   * the bottom of the pathway, where it would do the most damage: Bronze's
   * median racer has two swims across two days and half of those who raced at
   * all did so at a single meet, while Age Development and NAR sit on thirty-odd
   * swims across seventeen days.
   *
   * So a score counts only where there is enough racing behind it. Below that a
   * swimmer has no usable capability figure and is banded on age instead —
   * which is what the club does with them anyway.
   */
  const peakWaBySwimmer = {};
  Object.entries(racing).forEach(([id, rec]) => {
    if (rec.swims >= MIN_RANKED_SWIMS && rec.days.size >= MIN_RANKED_MEETS) {
      peakWaBySwimmer[id] = rec.peak;
    }
  });

  const bucketOf = pts => Math.floor(pts / CAPABILITY_BUCKET) * CAPABILITY_BUCKET;

  // Capability profile of each squad as it stands. This is what calibrates the
  // bands: rather than inventing tiers, the boundaries come from where the
  // club's own squads already sit.
  squadRows.forEach(sq => {
    const members = (swimmersBySquad[sq.id] || [])
      .filter(sw => sw.is_active !== false && !sw.is_exempt);
    const pts = members.map(sw => peakWaBySwimmer[sw.id]).filter(p => p > 0).sort((a, b) => a - b);
    sq.capability = {
      withData: pts.length,
      withoutData: members.length - pts.length,
      median: pts.length ? Math.round(median(pts)) : null,
      p10: pts.length ? pts[Math.floor(pts.length * 0.10)] : null,
      p90: pts.length ? pts[Math.min(pts.length - 1, Math.floor(pts.length * 0.90))] : null,
      min: pts.length ? pts[0] : null,
      max: pts.length ? pts[pts.length - 1] : null
    };
  });

  // The age spread that structure search is allowed to re-band.
  //
  // Not every squad is on the competitive pathway: Masters run to 66, and the
  // non-competitive off-ramps are carried through a restructure rather than
  // re-banded. Feeding their ages into the search would have it drawing squad
  // bands across a fifty-year spread, which is nonsense. Squads with no weekly
  // session target are excluded on the same grounds — there is no training
  // requirement to design around.
  const pathwaySquads = squadRows.filter(s =>
    isCompetitiveSquad(s.name) && s.targetSessionsPerWeek > 0);
  const pathwayAgeHistogram = {};
  pathwaySquads.forEach(sq => {
    Object.entries(sq.ageHistogram).forEach(([age, n]) => {
      pathwayAgeHistogram[age] = (pathwayAgeHistogram[age] || 0) + n;
    });
  });

  // Capability spread of the competitive pathway, bucketed, carrying the age
  // range found in each bucket so a capability band can still be checked for an
  // age spread no squad should sensibly have.
  const capabilityBuckets = {};
  let pathwayWithoutCapability = 0;
  const ageBandedSquads = [];
  pathwaySquads.forEach(sq => {
    // Foundation squads are banded on age whatever the axis.
    //
    // Bronze and Silver race occasionally and mostly at one meet, so their
    // points describe a morning rather than a swimmer. Silver looks adequate on
    // coverage alone — seven in ten have some score — which is exactly why this
    // is a stated rule about the squads rather than a threshold that would let
    // it through.
    if (!bandsOnAbility(sq.name)) {
      const n = (swimmersBySquad[sq.id] || [])
        .filter(sw => sw.is_active !== false && !sw.is_exempt).length;
      pathwayWithoutCapability += n;
      ageBandedSquads.push({ name: sq.name, swimmers: n });
      return;
    }
    (swimmersBySquad[sq.id] || [])
      .filter(sw => sw.is_active !== false && !sw.is_exempt)
      .forEach(sw => {
        const pts = peakWaBySwimmer[sw.id];
        const age = swimmingAge(sw.year_of_birth, year);
        if (!pts) { pathwayWithoutCapability++; return; }
        const b = bucketOf(pts);
        const entry = capabilityBuckets[b] || (capabilityBuckets[b] = { count: 0, minAge: null, maxAge: null });
        entry.count++;
        if (age) {
          entry.minAge = entry.minAge === null ? age : Math.min(entry.minAge, age);
          entry.maxAge = entry.maxAge === null ? age : Math.max(entry.maxAge, age);
        }
      });
  });

  const pathwayWithCapability = Object.values(capabilityBuckets).reduce((s, b) => s + b.count, 0);

  if (ageBandedSquads.length) {
    const named = ageBandedSquads.map(s => `${s.name} (${s.swimmers})`).join(' and ');
    warnings.push(
      `${named} are always banded on age, never on ability. Their swimmers race occasionally and mostly at a single meet, so a ranking score describes one morning rather than how they swim. Choosing to band on ability changes nothing for them.`
    );
  }

  const restWithout = pathwayWithoutCapability - ageBandedSquads.reduce((a, s) => a + s.swimmers, 0);
  if (restWithout > 0) {
    warnings.push(
      `${restWithout} of the remaining ${pathwayWithCapability + restWithout} pathway swimmers have too little racing in the last ${CAPABILITY_WINDOW_DAYS} days to band on ability — a score counts only with at least ${MIN_RANKED_SWIMS} ranked swims across ${MIN_RANKED_MEETS} separate meets — so they fall back to their age.`
    );
  }

  const excludedFromPathway = squadRows
    .filter(s => s.activeNonExemptCount > 0 && !pathwaySquads.includes(s))
    .map(s => ({
      name: s.name,
      swimmers: s.activeNonExemptCount,
      reason: squadHoldReason(s.name)
    }));
  if (excludedFromPathway.length) {
    warnings.push(`${excludedFromPathway.length} squad(s) are held out of structure search — ${excludedFromPathway.map(s => `${s.name} (${s.swimmers} swimmers, ${s.reason})`).join('; ')}. They keep their swimmers and their water; only the competitive pathway is re-banded.`);
  }

  // Squads where too few swimmers race often enough for ability banding to mean
  // anything. Named, because "band on capability" is offered as a choice and the
  // reader deserves to know where it would be guessing.
  const thinlyRanked = squadRows
    .filter(s => isCompetitiveSquad(s.name) && bandsOnAbility(s.name)
      && s.targetSessionsPerWeek > 0 && s.activeNonExemptCount > 0)
    .filter(s => (s.capability.withData || 0) / s.activeNonExemptCount < 0.6);
  if (thinlyRanked.length) {
    const named = thinlyRanked
      .map(s => `${s.name} (${s.capability.withData} of ${s.activeNonExemptCount} swimmers)`)
      .join(', ');
    warnings.push(
      `Ranking points are too thin to band on ability in ${named}. A score counts only where a swimmer has at least ${MIN_RANKED_SWIMS} ranked swims across ${MIN_RANKED_MEETS} separate meets in the year — one gala is a sample of one — and below that they are banded on age instead.`
    );
  }

  const unbandedSquads = squadRows.filter(s => s.activeNonExemptCount > 0 && s.minAge === null);
  if (unbandedSquads.length) {
    warnings.push(`${unbandedSquads.length} squad${unbandedSquads.length === 1 ? ' has' : 's have'} no usable years of birth, so ${unbandedSquads.length === 1 ? 'its' : 'their'} age band must be set by hand.`);
  }

  // --- What actually turns up ---------------------------------------------
  // A register exists for both outcomes whenever one was taken, so
  // present / (present + absent) is a true rate rather than a count against a
  // guessed denominator. Sessions with no register produce no rows and are
  // reported as unregistered rather than as empty — those are different things.
  const gatherAttendance = (rows) => {
    const bySession = {};
    rows.forEach(a => {
      const raw = sessionByKey[a.session_id];
      if (!raw) return;
      const rec = bySession[raw.id]
        || (bySession[raw.id] = { dates: {}, present: 0, counted: 0, lastDate: null });
      if (a.status === 'present') { rec.present++; rec.counted++; }
      else if (a.status === 'absent') { rec.counted++; }
      else return; // 'excused' belongs in neither side of the rate
      const d = rec.dates[a.date] || (rec.dates[a.date] = 0);
      if (a.status === 'present') rec.dates[a.date] = d + 1;
      if (!rec.lastDate || a.date > rec.lastDate) rec.lastDate = a.date;
    });
    return bySession;
  };

  const attendanceBySession = gatherAttendance(attendanceRows);
  // Holiday registers are set aside from the headline, not discarded. Every
  // session keeps its holiday attendance beside its term attendance, so the
  // club can still answer "how well attended was the summer programme" — and
  // so nobody has to take on trust that excluding a week did not delete it.
  // Only meaningful when holidays were actually set aside; including them in
  // the headline and reporting them again as "set aside" would double-count.
  const holidayBySession = wantTermOnly ? gatherAttendance(split.holiday) : {};

  /** A session's holiday registers, always reported, never used in the headline. */
  const holidayFor = (id) => {
    const rec = holidayBySession[id];
    if (!rec) return { registers: 0, avgPresent: null, ratePct: null, lastRegister: null };
    const perDate = Object.values(rec.dates);
    return {
      registers: perDate.length,
      avgPresent: perDate.length
        ? +(perDate.reduce((a, b) => a + b, 0) / perDate.length).toFixed(1) : 0,
      ratePct: rec.counted > 0 ? +(rec.present / rec.counted * 100).toFixed(1) : null,
      lastRegister: rec.lastDate
    };
  };

  sessions.forEach(s => {
    const rec = attendanceBySession[s.id];
    if (!rec) {
      s.attendance = {
        registers: 0, avgPresent: null, ratePct: null,
        ofCapacityPct: null, ofBookedPct: null, lastRegister: null,
        holiday: holidayFor(s.id)
      };
      return;
    }
    const perDate = Object.values(rec.dates);
    const avgPresent = perDate.length
      ? +(perDate.reduce((a, b) => a + b, 0) / perDate.length).toFixed(1) : 0;
    s.attendance = {
      registers: perDate.length,
      avgPresent,
      // Of the swimmers booked into this session, how many are in the water.
      ofBookedPct: s.rosterCount > 0 ? +(avgPresent / s.rosterCount * 100).toFixed(1) : null,
      // Of the places the water actually provides, how many are used. This is
      // the one that says whether the session is worth its lanes: a session can
      // be fully attended by the handful booked into it and still be mostly
      // empty pool. `places` is filled in by the occupancy pass below.
      ofCapacityPct: null,
      ratePct: rec.counted > 0 ? +(rec.present / rec.counted * 100).toFixed(1) : null,
      lastRegister: rec.lastDate,
      // Set aside from the figures above, kept so the holiday programme can
      // still be read. Empty when holidays are already included.
      holiday: holidayFor(s.id)
    };
  });

  const registered = sessions.filter(s => s.isActive && s.attendance.registers > 0 && s.rosterCount > 0);
  const allocatedTotal = registered.reduce((sum, s) => sum + s.rosterCount, 0);
  const presentTotal = registered.reduce((sum, s) => sum + (s.attendance.avgPresent || 0), 0);
  if (allocatedTotal > 0) {
    const rate = presentTotal / allocatedTotal;
    if (rate < 0.85) {
      warnings.push(`Across sessions with registers, an average of ${Math.round(rate * 100)}% of the swimmers booked into a session are actually in the water. Allocation is close to each squad's weekly target, so this is genuine non-attendance rather than a wide eligibility list — and it means capacity measured on allocation overstates how full the pool really is.`);
    }
  }

  const incompleteSplits = sessions.filter(s => s.isActive && s.lanesConfigIncomplete);
  if (incompleteSplits.length) {
    warnings.push(`${incompleteSplits.length} session(s) have a configured lane split that leaves out a squad allocated to them — ${incompleteSplits.map(s => s.name).join('; ')}. Those squads show as having no lanes, so the session's lanes were used instead. Worth correcting the split in Config.`);
  }

  const unclaimed = sessions.filter(s => s.isActive && !s.squadIdFromName);
  if (unclaimed.length) {
    warnings.push(`${unclaimed.length} active session(s) are not named after any squad, so they belong to nobody in these figures — ${unclaimed.map(s => s.name).join('; ')}. Bronze and Learn to Swim sit outside the squad list, so their sessions land here.`);
  }

  const unregistered = sessions.filter(s => s.isActive && s.attendance.registers === 0).length;
  if (unregistered > 0) {
    warnings.push(`${unregistered} active session${unregistered === 1 ? ' has' : 's have'} no register in the last ${attendanceWindowDays} days, so actual attendance cannot be shown for ${unregistered === 1 ? 'it' : 'them'}. That is not the same as nobody turning up.`);
  }

  // --- Session occupancy --------------------------------------------------
  // Places in a session depend on the lane density of the squads training in
  // it, which differs squad to squad. Where a shared-lane split is configured
  // it is authoritative; otherwise the session's lanes are divided in
  // proportion to who is actually allocated to it, which is the closest
  // defensible reading of an unconfigured shared session.
  const squadByIdForPlaces = {};
  squads.forEach(sq => { squadByIdForPlaces[sq.id] = sq; });

  sessions.forEach(session => {
    const raw = rawSessionById[session.id] || {};
    const entries = Object.entries(session.squadCounts);
    if (!entries.length) {
      session.places = session.lanes * (defaults.defaultSwimmersPerLane || 8);
      session.occupancyPct = 0;
      session.squadIds = [];
      session.lanesConfigured = false;
      if (session.attendance && session.attendance.registers > 0 && session.places > 0) {
        session.attendance.ofCapacityPct =
          +(session.attendance.avgPresent / session.places * 100).toFixed(1);
      }
      return;
    }

    const configured = sharedConfig[session.id] || sharedConfig[raw.scm_guid] || sharedConfig[session.name];
    const hasConfig = !!(configured && Object.keys(configured).length);
    const totalAllocated = entries.reduce((s, [, n]) => s + n, 0);

    let places = 0;
    entries.forEach(([squadId, count]) => {
      const squad = squadByIdForPlaces[squadId];
      const perLane = swimmersPerLaneFor(squad);
      const lanes = hasConfig
        ? getSessionLanesForSquad(raw, squadId, sharedConfig)
        : (session.lanes * count) / totalAllocated;
      places += lanes * perLane;
    });

    // A configured split that omits a squad which is nonetheless allocated to the
    // session leaves that squad with no lanes, and the session with no places at
    // all. Treating that as zero capacity would report a well-attended session as
    // infinitely over-full. Fall back to the session's own lanes and flag the gap,
    // because the fix belongs in the lane split, not here.
    if (places === 0 && totalAllocated > 0) {
      const fallbackPerLane = swimmersPerLaneFor(squadByIdForPlaces[entries[0][0]]);
      places = session.lanes * fallbackPerLane;
      session.lanesConfigIncomplete = true;
    }

    session.places = Math.round(places);
    session.occupancyPct = places > 0 ? +(session.rosterCount / places * 100).toFixed(1) : 0;
    session.squadIds = entries.map(([id]) => id);
    session.lanesConfigured = hasConfig;

    // Now places are known, the honest use-of-water figure can be finished.
    if (session.attendance && session.attendance.registers > 0 && places > 0) {
      session.attendance.ofCapacityPct = +(session.attendance.avgPresent / places * 100).toFixed(1);
    }
  });

  // --- Does today actually deliver? ---------------------------------------
  // The same question asked of any proposal, asked of the timetable the club is
  // running now: a squad of 30 owing four sessions a week needs 120
  // swimmer-sessions of water. Scored identically so "today" and "proposed" sit
  // in the same units and can be read side by side.
  squadRows.forEach(sq => {
    const mine = sq.currentSessionIds.map(id => sessionsById[id]).filter(Boolean);
    const perLane = sq.swimmersPerLane;
    const weeklyPlaces = Math.round(mine.reduce((sum, session) =>
      sum + squadLaneShare(session, rawSessionById[session.id] || {}, sq.id, sharedConfig) * perLane,
    0));

    const required = sq.activeNonExemptCount * sq.targetSessionsPerWeek;
    sq.currentSessionCount = sq.ownSessionCount;
    sq.weeklyPlaces = weeklyPlaces;
    sq.swimmerSessionsRequired = required;
    sq.swimmerSessionsDelivered = Math.min(weeklyPlaces, required);
    sq.placesShortfall = Math.max(0, required - weeklyPlaces);
    sq.maxSquadSize = sq.targetSessionsPerWeek > 0
      ? Math.floor(weeklyPlaces / sq.targetSessionsPerWeek) : 0;
    // How many more swimmers today's water would carry at today's volume. The
    // club record already divides every shared session between the squads in
    // it, so unlike a solved plan there are no unclaimed lanes to hand out —
    // this is purely what the squad's own share supports.
    sq.roomForMore = sq.targetSessionsPerWeek > 0
      ? Math.max(0, sq.maxSquadSize - sq.activeNonExemptCount) : 0;
    sq.requirementMet = sq.targetSessionsPerWeek > 0
      && mine.length >= sq.targetSessionsPerWeek
      && weeklyPlaces >= required;
    // currentSessionCount is how many distinct sessions the squad's swimmers are
    // spread across, not how many each swimmer attends. A squad owing four a
    // week may be offered ten and choose from them, so this is a supply figure,
    // never a shortfall against the target.
    sq.requirementReason = sq.targetSessionsPerWeek === 0
      ? 'No weekly session target is set for this squad, so there is nothing to check against.'
      : mine.length < sq.targetSessionsPerWeek
        ? `Spread across only ${mine.length} session${mine.length === 1 ? '' : 's'} a week, fewer than the ${sq.targetSessionsPerWeek} each swimmer is supposed to train.`
        : weeklyPlaces >= required
          ? `${sq.activeNonExemptCount} swimmers x ${sq.targetSessionsPerWeek} sessions covered by ${weeklyPlaces} places across ${mine.length} sessions a week.`
          : `${weeklyPlaces} places across the week against ${required} needed for ${sq.activeNonExemptCount} swimmers x ${sq.targetSessionsPerWeek} sessions — short by ${required - weeklyPlaces}.`;
  });

  // --- Coaches ------------------------------------------------------------
  // profiles carries only id, email and role — there is no name, availability,
  // qualification level or lane limit anywhere in the database. The planner's
  // roster editor is where those are captured; this only seeds the identities.
  const squadIdsByCoach = {};
  coachSquads.forEach(cs => {
    (squadIdsByCoach[cs.coach_id] || (squadIdsByCoach[cs.coach_id] = [])).push(cs.squad_id);
  });

  const coaches = profiles
    .filter(p => ['admin', 'headcoach', 'coach'].includes(p.role))
    .map(p => ({
      profileId: p.id,
      email: p.email,
      role: p.role,
      squadIds: squadIdsByCoach[p.id] || [],
      name: null   // not stored anywhere; typed into the scenario
    }))
    .sort((a, b) => String(a.email).localeCompare(String(b.email)));

  // --- Club totals --------------------------------------------------------
  const activeSessions = sessions.filter(s => s.isActive);
  const totalLaneHours = +activeSessions.reduce((s, x) => s + x.laneHours, 0).toFixed(2);
  const venues = Array.from(new Set(activeSessions.map(s => s.location))).sort();

  return {
    capturedAt: new Date().toISOString(),
    currentYear: year,
    // The periods every measured figure rests on, so a report can state them
    // rather than leave a reader guessing how far back "attendance" reaches.
    windows: {
      attendanceDays: attendanceWindowDays,
      capabilityDays: CAPABILITY_WINDOW_DAYS,
      from: windowFrom,
      to: windowTo,
      // Everything below is what a reader needs to check the figures without
      // asking anybody: what was excluded, how much was left, and how the two
      // sides compare.
      termOnly: wantTermOnly,
      termWeeks: termSpan.termWeeks,
      termDays: termSpan.termDays,
      holidayDaysExcluded: termSpan.holidayDays,
      exclusions: exclusionsInWindow(termExclusions, windowFrom, windowTo),
      registersUsed: attendanceRows.length,
      registersSetAside: wantTermOnly ? split.holiday.length : 0,
      termRatePct: ratePctOf(split.term),
      holidayRatePct: ratePctOf(split.holiday),
      basis: describeBasis({
        days: attendanceWindowDays, termOnly: wantTermOnly,
        exclusions: termExclusions, from: windowFrom, to: windowTo
      })
    },
    squads: squadRows,
    sessions,
    venues,
    venueLanes,
    venueLoad,
    coaches,
    clubAgeHistogram,
    pathwayAgeHistogram,
    excludedFromPathway,
    capability: {
      windowDays: CAPABILITY_WINDOW_DAYS,
      bucketSize: CAPABILITY_BUCKET,
      buckets: capabilityBuckets,
      withData: pathwayWithCapability,
      withoutData: pathwayWithoutCapability,
      // Where the club's own squads currently sit on the capability scale.
      // These are the boundaries a capability banding is calibrated against.
      bySquad: squadRows
        .filter(sq => sq.capability.withData > 0)
        .map(sq => ({ name: sq.name, ...sq.capability }))
        .sort((a, b) => (a.median || 0) - (b.median || 0))
    },
    defaults,
    utilisation: {
      totalLaneHours,
      // Of that total, the part a restructure can actually move squads around
      // in. Two slices come off it, and both have to be named rather than
      // silently dropped, or the planner appears to lose water it never had:
      //
      //  - sessions with no weekday in the record, which cannot be drawn on a
      //    timetable at all (at this club that is "Land training", which is not
      //    pool time in the first place);
      //  - water already committed to something outside the squad list, chiefly
      //    Learn to Swim. It is booked and it is real, but it is not available
      //    to reallocate.
      //
      // squadLaneHours is what a plan seeded from today starts with, so a
      // seeded plan compares against it and correctly reads "no change".
      ...(() => {
        const dated = activeSessions.filter(s => DAY_NAMES_FULL.includes(s.day));
        const sum = list => +list.reduce((a, s) => a + s.laneHours, 0).toFixed(2);
        return {
          squadLaneHours: sum(dated.filter(s => s.squadIdFromName)),
          reservedLaneHours: sum(dated.filter(s => !s.squadIdFromName)),
          undatedLaneHours: sum(activeSessions.filter(s => !DAY_NAMES_FULL.includes(s.day))),
          undatedSessionNames: activeSessions
            .filter(s => !DAY_NAMES_FULL.includes(s.day)).map(s => s.name)
        };
      })(),
      activeSessionCount: activeSessions.length,
      totalSessionCount: sessions.length,
      rosterPlaces: activeSessions.reduce((s, x) => s + x.rosterCount, 0),
      // Allocation is what is booked; attendance is what happens. Reporting
      // only the first overstates how full the water is, and a model built on
      // it plans for swimmers who do not come.
      actualAttending: +activeSessions
        .filter(s => s.attendance.registers > 0)
        .reduce((s, x) => s + (x.attendance.avgPresent || 0), 0).toFixed(1),
      actualOccupancyPct: (() => {
        const withReg = activeSessions.filter(s => s.attendance.registers > 0);
        const places = withReg.reduce((s, x) => s + (x.places || 0), 0);
        const bodies = withReg.reduce((s, x) => s + (x.attendance.avgPresent || 0), 0);
        return places > 0 ? +(bodies / places * 100).toFixed(1) : null;
      })(),
      // The club's measured turn-up: of the swimmers booked into a session, the
      // share who are actually in the water. This is the honest default for
      // sizing a squad, rather than assuming everyone attends everything.
      measuredShowRate: (() => {
        const withReg = activeSessions.filter(s => s.attendance.registers > 0 && s.rosterCount > 0);
        const allocated = withReg.reduce((s, x) => s + x.rosterCount, 0);
        const present = withReg.reduce((s, x) => s + (x.attendance.avgPresent || 0), 0);
        return allocated > 0 ? +(present / allocated).toFixed(3) : null;
      })(),
      sessionsWithRegisters: activeSessions.filter(s => s.attendance.registers > 0).length,
      // How full the water the club already pays for actually is. This is the
      // number a restructure has to beat.
      totalPlaces: activeSessions.reduce((s, x) => s + (x.places || 0), 0),
      occupancyPct: (() => {
        const places = activeSessions.reduce((s, x) => s + (x.places || 0), 0);
        const bodies = activeSessions.reduce((s, x) => s + x.rosterCount, 0);
        return places > 0 ? +(bodies / places * 100).toFixed(1) : 0;
      })(),
      emptySessionCount: activeSessions.filter(s => s.rosterCount === 0).length,
      squadsMeetingRequirement: squadRows.filter(s => s.requirementMet).length,
      // Only squads that are set a weekly target can be judged against one.
      //
      // Counting all nine made the verdict read "6 of 9" while two of those nine
      // — the masters squads — have no target at all and so can never be met.
      // The plan's own verdict measures today over squads with a target, so the
      // two tabs were quietly disagreeing about the same fact.
      squadsWithTargetCount: squadRows.filter(s => s.targetSessionsPerWeek > 0).length,
      squadsWithoutTarget: squadRows
        .filter(s => s.targetSessionsPerWeek === 0).map(s => s.name),
      roomForMore: squadRows.filter(s => s.targetSessionsPerWeek > 0)
        .reduce((a, s) => a + (s.roomForMore || 0), 0),
      squadCount: squadRows.length,
      swimmerSessionsRequired: squadRows.reduce((s, x) => s + (x.swimmerSessionsRequired || 0), 0),
      swimmerSessionsDelivered: squadRows.reduce((s, x) => s + (x.swimmerSessionsDelivered || 0), 0)
    },
    warnings
  };
}

/**
 * Turn a baseline into a valid scenario `inputs` blob.
 *
 * Pure, so it is unit-testable and so the same seeding runs on the server or in
 * the browser. This is what makes "seed from live data, then edit freely" work
 * without ever writing back to the club record.
 */
export function buildScenarioInputsFromBaseline(baseline, overrides = {}) {
  const defaults = { ...(baseline.defaults || {}), ...(overrides.defaults || {}) };

  const poolSlots = baseline.sessions
    // A session using no lanes is not pool time, so it is not a pool slot.
    //
    // Land training is the case in point: it belongs on the club timetable and
    // its attendance is real, but there is no water in it to give a squad. The
    // solver rightly refuses a slot with no lanes, so seeding one made the whole
    // scenario unsolvable — the honest answer is to leave it out of the slots
    // while keeping it in the club picture on the Today tab.
    .filter(s => s.isActive && DAY_NAMES_FULL.includes(s.day) && s.lanes >= 1)
    .map(s => ({
      id: `slot_${s.id}`,
      label: s.name,
      venue: s.location,
      day: s.day,
      startTime: s.startTime || '18:00',
      endTime: s.endTime || deriveEndTime(s.startTime || '18:00', s.durationHours),
      lanes: s.lanes,
      source: 'existing',
      existingSessionId: s.id,
      enabled: true,
      // Water already committed to something outside the squad list — Learn to
      // Swim, and any squad not flagged is_squad. It is booked and it is real,
      // so it stays on the timetable, but a restructure must not hand those
      // lanes to a competitive squad.
      reservedFor: s.squadIdFromName ? null : s.name,
      // How hard this water is worked today, carried onto the slot rather than
      // left behind in the baseline.
      //
      // Every question about whether to keep a session, move it or give the
      // lanes to somebody else turns on this, and a slot that knows only its
      // lane count cannot answer any of them. Booked and attended are both
      // here on purpose: this club allocates roughly twice the swimmers who
      // turn up, so a session can be full on paper and half empty in the water.
      currentUse: {
        places: s.places ?? null,
        booked: s.rosterCount ?? null,
        bookedPctOfPlaces: s.occupancyPct ?? null,
        // A session with no attendance block has never had a register taken.
        // That is missing data, and it reads as null throughout rather than as
        // a zero that would rank it alongside genuinely empty water.
        registers: s.attendance?.registers ?? 0,
        averageAttending: s.attendance?.avgPresent ?? null,
        attendingPctOfPlaces: s.attendance?.ofCapacityPct ?? null,
        attendingPctOfBooked: s.attendance?.ofBookedPct ?? null
      }
    }));

  const squads = baseline.squads
    .filter(sq => sq.activeNonExemptCount > 0)
    .map((sq, idx) => ({
      id: `sq_${sq.id}`,
      name: sq.name,
      sourceSquadId: sq.id,
      // 10th/90th percentile, not min/max: a single outlier should not widen the
      // band and pull the squad's LTAD volume target with it.
      minAge: sq.p10Age === null ? 9 : sq.p10Age,
      maxAge: sq.p90Age === null ? 18 : sq.p90Age,
      targetSize: sq.activeNonExemptCount,
      swimmersPerLane: sq.swimmersPerLane,
      targetSessionsPerWeek: sq.targetSessionsPerWeek,
      // What the club actually runs for this squad, as opposed to what each
      // swimmer owes. Seeded from the sessions the squad is currently spread
      // across, so a model starts by booking the week the club really runs.
      sessionsOfferedPerWeek: Math.max(sq.ownSessionCount || 0, sq.targetSessionsPerWeek || 0),
      hoursOfferedPerWeek: sq.currentWeeklyHours,
      targetHoursPerWeek: sq.targetHoursPerWeek,
      medianSessionHours: sq.medianSessionHours,
      requireWeekend: sq.requireWeekend,
      competitive: isCompetitiveSquad(sq.name),
      priority: idx + 1,
      allowSharedSlot: true,
      homeVenue: null
    }));

  const coaches = baseline.coaches.map((c, idx) => ({
    id: `co_${c.profileId}`,
    name: c.name || c.email,
    profileId: c.profileId,
    level: c.role === 'headcoach' ? 'head' : 'L2',
    maxLanes: defaults.maxLanesPerCoach || 3,
    maxHoursPerWeek: null,
    squadIds: c.squadIds.map(id => `sq_${id}`),
    availability: [],
    venues: []
  }));

  // The club's own timetable, expressed as a plan.
  //
  // Handed to the solver as a starting candidate so that a proposal has to beat
  // what the club already does rather than merely rebuild it from nothing. The
  // greedy pass re-timetables from scratch and cannot always rediscover the
  // allocation the club arrived at over years, which is how a plan came to be
  // offered that left Gold Development shorter of water than it is today.
  const currentAssignments = baseline.sessions
    .filter(s => s.isActive && DAY_NAMES_FULL.includes(s.day) && s.lanes >= 1 && s.squadIdFromName)
    .map(s => ({ slotId: `slot_${s.id}`, squadId: `sq_${s.squadIdFromName}`, lanes: s.lanes }));

  return {
    version: 1,
    poolSlots,
    currentAssignments,
    squads,
    coaches,
    policy: {
      ltadTable: defaults.ltadTable || 'unified',
      venueTransitMinutes: defaults.venueTransitMinutes || 30,
      requireCoachCover: false,
      // Seeded from what the club's registers actually show, not from an
      // assumption that everyone attends everything. Sizing squads at a show
      // rate of 1.0 when the measured rate is nearer a half asks for roughly
      // twice the water the club uses. Editable on the Assumptions tab, and
      // 1.0 remains the right choice for planning a guaranteed place per
      // swimmer rather than a typical week.
      showRate: baseline.utilisation.measuredShowRate || 1.0
    },
    growth: { expectedNewSwimmers: 0, attritionPct: 0 },
    weights: {},
    baselineLaneHours: baseline.utilisation.totalLaneHours
  };
}

/**
 * Whether a squad's swimmers can be re-banded by the structure search.
 *
 * The club's pathway is Bronze -> Silver -> Gold Development -> Age Development
 * -> NAR. Two squads sit outside that ladder and must be carried through a
 * restructure rather than re-banded, but for quite different reasons, and the
 * difference is worth keeping straight because it ends up in a committee paper.
 *
 * Club 2 is an off-ramp: its swimmers have chosen to train without competing.
 *
 * Technical Development is not an off-ramp at all. It holds swimmers who have
 * aged out of Silver but are not yet technically ready for Gold — squarely on
 * the pathway, and its swimmers do race. It cannot be re-banded because the
 * thing that defines it is technique, which is neither their age (they are
 * deliberately older than the Silver band) nor their ranking points.
 *
 * Nothing in the database records either distinction, so both are matched on
 * name here.
 */
export function isCompetitiveSquad(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('technical development')) return false;
  if (/\bclub\s*2\b/.test(n)) return false;
  return true;
}

/** Why a squad is carried through untouched, in words a reader can act on. */
/**
 * Whether a squad's swimmers can be grouped by ranking points at all.
 *
 * Bronze and Silver cannot. Their swimmers race occasionally — Bronze's median
 * racer has two swims across two days, Silver's six across three — and half of
 * Bronze's raced at a single meet. A World Aquatics score off that is a sample
 * of one morning, and it would be carrying the most weight exactly where the
 * evidence is thinnest.
 *
 * Deliberately a rule about which squads, not a coverage threshold: seven in ten
 * Silver swimmers have some score, so any reasonable threshold would let Silver
 * through on a number that does not mean what it appears to.
 *
 * Their swimmers are banded on age instead, which is what the club does anyway.
 */
export function bandsOnAbility(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('bronze')) return false;
  if (n.includes('silver')) return false;
  return true;
}

export function squadHoldReason(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('technical development')) {
    return 'grouped by technique, not age or ranking points';
  }
  if (/\bclub\s*2\b/.test(n)) return 'trains without competing';
  return 'no weekly session target';
}

/** End time for a session that records a start and a duration but no finish. */
function deriveEndTime(startTime, durationHours) {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + Math.round((durationHours || DURATION_FALLBACK) * 60);
  const mins = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
