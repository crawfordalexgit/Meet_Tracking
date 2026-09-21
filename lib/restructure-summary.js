/**
 * A model, explained in words, against what the club does today.
 *
 * The planner reports a great many measures — places, swimmer-sessions,
 * lane-hours, occupancy, continuity — and every one of them is defensible on its
 * own. Together they answer eight questions at once and never the only one that
 * matters: is this better than what we do now, and what would change?
 *
 * This turns a solved model into a short verdict, a list of what moves, and a
 * list of what it costs. Deterministic prose assembled from figures the solver
 * has already computed — nothing here calculates anything new, and no language
 * model is involved, so the words cannot drift from the numbers.
 */

import { TERMS, hours as round1 } from './restructure-glossary';

/** The handful of terms the verdict itself leans on. */
const SUMMARY_TERMS = ['laneHour', 'place', 'swimmerSession', 'offered', 'target'];

/** "3 more" / "2 fewer" / "the same". */
function delta(now, then, moreWord = 'more', fewerWord = 'fewer') {
  const d = Math.round((now - then) * 10) / 10;
  if (d === 0) return null;
  return `${Math.abs(d)} ${d > 0 ? moreWord : fewerWord}`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Match a model squad to the club's current squads.
 *
 * Seeded squads carry sourceSquadId. Squads the search invented do not, so they
 * fall back to the current squad whose age band overlaps most — which is the
 * squad a coach would say it "replaces".
 */
function matchToToday(modelSquad, todaySquads) {
  if (modelSquad.sourceSquadId) {
    const exact = todaySquads.find(s => s.id === modelSquad.sourceSquadId);
    if (exact) return exact;
  }
  const byName = todaySquads.find(s =>
    String(s.name).toLowerCase() === String(modelSquad.name).toLowerCase());
  if (byName) return byName;

  let best = null;
  let bestOverlap = 0;
  todaySquads.forEach(s => {
    if (s.minAge === null) return;
    const overlap = Math.min(modelSquad.maxAge, s.maxAge) - Math.max(modelSquad.minAge, s.minAge) + 1;
    if (overlap > bestOverlap) { bestOverlap = overlap; best = s; }
  });
  return bestOverlap > 0 ? best : null;
}

/**
 * Summarise a solved model against the baseline.
 *
 * Returns { headline, verdict[], changes[], costs[], glossary[] } — all strings,
 * ready to render.
 */
export function summariseModel(metrics, baseline, { name } = {}) {
  if (!metrics || !baseline) return null;

  const todaySquads = baseline.squads || [];
  const todayWithTarget = todaySquads.filter(s => s.targetSessionsPerWeek > 0);
  const u = baseline.utilisation || {};

  const modelSquads = (metrics.bySquad || []).filter(s => s.sessionsTarget > 0);
  const met = modelSquads.filter(s => s.requirementMet).length;
  const todayMet = todayWithTarget.filter(s => s.requirementMet).length;

  /* ---- headline -------------------------------------------------------- */

  const headlineBits = [];
  const metDelta = met - todayMet;
  if (metDelta > 0) {
    headlineBits.push(`${plural(metDelta, 'more squad gets', 'more squads get')} the training they are set`);
  } else if (metDelta < 0) {
    headlineBits.push(`${plural(-metDelta, 'squad', 'squads')} would stop getting the training they are set`);
  } else {
    headlineBits.push(`the same ${plural(met, 'squad gets', 'squads get')} the training they are set`);
  }

  // Like for like: what the plan puts squads into, against what squads occupy
  // today. Comparing against every lane-hour the club books would count water
  // that no squad is in — Learn to Swim, and sessions nobody is allocated to —
  // and make any plan look like a saving it is not.
  const todayInUse = +todaySquads
    .reduce((a, s) => a + (s.currentLaneHours || 0), 0).toFixed(1);
  const laneDelta = delta(metrics.assignedLaneHours, todayInUse, 'more', 'fewer');
  if (laneDelta) headlineBits.push(`it puts squads into ${laneDelta} lane-hours a week`);

  const headline = `Compared with today, ${headlineBits.join(', and ')}.`;

  /* ---- verdict, the few figures that decide it ------------------------- */

  const verdict = [
    {
      term: 'fullTrainingWeek',
      label: 'Squads getting their full training week',
      now: `${met} of ${modelSquads.length}`,
      today: `${todayMet} of ${todayWithTarget.length}`,
      good: metDelta >= 0,
      note: 'A squad of 30 owing 4 sessions needs 120 swimmer-sessions of water. Either that is there or it is not.'
    },
    {
      term: 'poolTimeOccupied',
      label: 'Pool time squads occupy',
      now: `${round1(metrics.assignedLaneHours)} lane-hours`,
      today: `${round1(todayInUse)} lane-hours`,
      good: metrics.assignedLaneHours <= (u.totalLaneHours || Infinity),
      note: `One lane held for one hour is one lane-hour. Measured against the ${round1(todayInUse)} lane-hours squads occupy today, not against the ${round1(u.totalLaneHours)} the club books in all.`
    },
    {
      term: 'swimmersCovered',
      label: 'Swimmers the water covers',
      now: String(metrics.swimmersServed),
      today: String(todaySquads.reduce((a, s) => a + (s.activeNonExemptCount || 0), 0)),
      good: true,
      note: 'How many swimmers the allocated lanes can hold across the week.'
    }
  ];

  // The water this plan has to work with.
  //
  // Measured against the water squads can be put into today, NOT against every
  // lane-hour the club books. Those are two different quantities: the club total
  // includes Learn to Swim, which a restructure may not touch, and sessions with
  // no weekday in the record, which cannot be drawn on a timetable at all.
  // Comparing one against the other made a plan seeded straight from today read
  // as though it had quietly given up fifteen lane-hours it never had.
  //
  // Appended, never inserted: restructure-summary.spec.js indexes verdict[0].
  // Kept numeric for the comparisons; formatted only where it is printed.
  const squadWaterToday = u.squadLaneHours ?? u.totalLaneHours ?? 0;
  const extraWater = Math.round((metrics.availableLaneHours - squadWaterToday) * 10) / 10;
  const setAside = (u.reservedLaneHours || 0) + (u.undatedLaneHours || 0);

  verdict.push({
    term: 'poolTimeOnOffer',
    label: 'Pool time this plan can use',
    now: `${round1(metrics.availableLaneHours)} lane-hours`,
    today: `${round1(squadWaterToday)} lane-hours`,
    good: extraWater >= 0,
    note: [
      extraWater > 0
        ? `${round1(extraWater)} lane-hours more than squads can use today, so this plan depends on new pool time.`
        : extraWater < 0
          ? `${round1(Math.abs(extraWater))} lane-hours fewer than squads can use today — water has been switched off in this plan.`
          : 'Exactly the water squads can use today, so no new pool time is assumed.',
      setAside > 0
        ? `The club books ${round1(u.totalLaneHours)} lane-hours in all; the other ${round1(setAside)} is Learn to Swim and sessions with no weekday, which a restructure cannot reallocate.`
        : null
    ].filter(Boolean).join(' ')
  });

  // Room left over. This is the whole question when the squads are being held
  // as they are: not what should change, but how many more swimmers the water
  // already in the plan would carry.
  verdict.push({
    term: 'roomForMore',
    label: 'Room for more swimmers',
    now: String(metrics.roomForMore ?? 0),
    today: String(u.roomForMore ?? 0),
    good: (metrics.roomForMore ?? 0) >= (u.roomForMore ?? 0),
    note: 'How many more swimmers the squads could take before their water runs out, at the volume each squad is set.'
  });

  if (metrics.coach && metrics.coach.coveragePct !== null) {
    verdict.push({
      term: 'coachHour',
      label: 'Coaching covered',
      now: `${metrics.coach.coveragePct}%`,
      today: 'not tracked today',
      good: metrics.coach.gapHours <= 0,
      note: metrics.coach.gapHours > 0
        ? `${metrics.coach.gapHours} coach-hours a week would need covering.`
        : 'Every session has the coaches it needs.'
    });
  }

  /* ---- what would actually change -------------------------------------- */

  const changes = [];
  const matchedToday = new Set();

  modelSquads.forEach(m => {
    const t = matchToToday(m, todaySquads);
    if (t) matchedToday.add(t.id);

    if (!t) {
      changes.push({
        squad: m.name,
        kind: 'new',
        text: `New squad for ages ${m.minAge}–${m.maxAge}: ${m.targetSize} swimmers, ${m.sessionsTarget} sessions a week.`
      });
      return;
    }

    const bits = [];
    if (t.targetSessionsPerWeek !== m.sessionsTarget) {
      bits.push(`${t.targetSessionsPerWeek} to ${m.sessionsTarget} sessions a week`);
    }
    if (Math.abs((t.targetHoursPerWeek || 0) - m.effectiveTargetHours) > 0.05) {
      bits.push(`${t.targetHoursPerWeek || 0} to ${m.effectiveTargetHours} hours`);
    }
    const sizeShift = m.targetSize - (t.activeNonExemptCount || 0);
    if (Math.abs(sizeShift) >= 3) {
      bits.push(`${t.activeNonExemptCount} to ${m.targetSize} swimmers`);
    }
    const ageShift = t.p10Age !== null
      && (m.minAge !== t.p10Age || m.maxAge !== t.p90Age);
    if (ageShift) bits.push(`ages ${t.p10Age}–${t.p90Age} to ${m.minAge}–${m.maxAge}`);

    if (bits.length) {
      changes.push({
        squad: m.name === t.name ? m.name : `${m.name} (was ${t.name})`,
        kind: 'changed',
        text: `${bits.join('; ')}.`
      });
    }
  });

  // Where a squad's swimmers actually end up.
  //
  // A restructure is many-to-many: one new band absorbs several old squads, and
  // one old squad splits across several new bands. Matching them one-to-one and
  // calling the leftovers "gone" said Silver's 28 swimmers needed a home when
  // every one of them was placed — 17 into the 7-10 band, 11 into the 11-12.
  // Following each squad's ages into the new bands is the only honest reading.
  let uncoveredTotal = 0;

  todayWithTarget.forEach(t => {
    if (matchedToday.has(t.id)) return;
    const hist = t.ageHistogram || {};
    const destinations = {};
    let uncovered = 0;

    Object.entries(hist).forEach(([age, n]) => {
      const a = Number(age);
      const band = modelSquads.find(m => a >= m.minAge && a <= m.maxAge);
      if (band) destinations[band.name] = (destinations[band.name] || 0) + n;
      else uncovered += n;
    });

    uncoveredTotal += uncovered;
    const parts = Object.entries(destinations)
      .sort((x, y) => y[1] - x[1])
      .map(([name, n]) => `${n} to ${name}`);

    if (parts.length && !uncovered) {
      changes.push({
        squad: t.name,
        kind: 'split',
        text: `Absorbed into the new bands — ${parts.join(', ')}.`
      });
    } else if (parts.length) {
      changes.push({
        squad: t.name,
        kind: 'gone',
        text: `${parts.join(', ')}, but ${plural(uncovered, 'swimmer falls', 'swimmers fall')} outside every proposed band.`
      });
    } else {
      changes.push({
        squad: t.name,
        kind: 'gone',
        text: `No band covers its ages, so its ${plural(t.activeNonExemptCount || 0, 'swimmer', 'swimmers')} would need a home.`
      });
    }
  });

  if (!changes.length) {
    changes.push({ squad: null, kind: 'none', text: 'Nothing changes — this is the club as it stands.' });
  }

  /* ---- what it costs --------------------------------------------------- */

  const costs = [];

  modelSquads.filter(s => !s.requirementMet).forEach(s => {
    costs.push(`${s.name} is short ${plural(s.placesShortfall, 'place', 'places')} a week — ${s.weeklyPlaces} against the ${s.swimmerSessionsRequired} its swimmers need.`);
  });

  if (metrics.totalCurfewPenalty > 0) {
    const late = (metrics.bySquad || []).filter(s => s.curfewPenalty > 0);
    if (late.length) {
      costs.push(`${plural(late.length, 'squad trains', 'squads train')} outside the time guide for their age: ${late.map(s => s.name).join(', ')}.`);
    }
  }

  if (metrics.coach && metrics.coach.gapHours > 0) {
    costs.push(`${metrics.coach.gapHours} coach-hours a week are not covered by the current roster.`);
  }

  if (metrics.unservedDemand > 0) {
    costs.push(`${plural(metrics.unservedDemand, 'swimmer is', 'swimmers are')} beyond what the allocated water holds.`);
  }

  const overBooked = metrics.assignedLaneHours - (u.totalLaneHours || 0);
  if (overBooked > 0.05) {
    costs.push(`It needs ${Math.round(overBooked * 10) / 10} lane-hours a week more than the club books today, so it depends on new pool time.`);
  }

  if (uncoveredTotal > 0) {
    costs.unshift(`${plural(uncoveredTotal, 'swimmer is', 'swimmers are')} not covered by any proposed band and would have nowhere to go.`);
  }

  if (!costs.length) costs.push('Nothing gives — every squad is covered and the coaching is there.');

  return {
    name: name || null,
    headline,
    verdict,
    changes,
    costs,
    // Drawn from lib/restructure-glossary.js rather than written out here, so a
    // term cannot be reworded on the page and left stale in the briefing.
    glossary: SUMMARY_TERMS.map(k => [TERMS[k].term, TERMS[k].short])
  };
}
