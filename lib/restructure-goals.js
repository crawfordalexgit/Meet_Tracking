/**
 * What a model is trying to achieve.
 *
 * The solver has always optimised a weighted blend of six sub-scores, with
 * weights nobody chose and no stated purpose. That made every proposal an
 * answer to an unasked question — you could see what changed, but not what it
 * was for, or whether it succeeded.
 *
 * A goal is a plain intention with the weights that serve it, and a test of
 * whether the finished model actually delivered it. Pick one or several; the
 * weights combine, and each goal reports separately on whether it was met, so a
 * plan that trades one goal off against another says so.
 */

export const GOALS = [
  {
    key: 'cover',
    label: 'Give every squad its full training week',
    blurb: 'Enough water that each swimmer can do the sessions their squad is set.',
    weights: { served: 40, ltad: 10, utilisation: 10, coachCover: 20, timetableQuality: 10, continuity: 10 },
    // Did it work? Answered against the finished model.
    test: m => {
      const squads = (m.bySquad || []).filter(s => s.sessionsTarget > 0);
      const met = squads.filter(s => s.requirementMet).length;
      return {
        met: squads.length > 0 && met === squads.length,
        detail: `${met} of ${squads.length} squads get their full week`
      };
    }
  },
  {
    key: 'grow',
    label: 'Serve more swimmers',
    blurb: 'Fit more of the club, and any expected intake, into the water available.',
    weights: { served: 45, utilisation: 20, ltad: 10, coachCover: 10, timetableQuality: 10, continuity: 5 },
    test: (m, base) => {
      const today = (base.squads || []).reduce((a, s) => a + (s.activeNonExemptCount || 0), 0);
      return {
        met: m.swimmersServed >= today,
        detail: `covers ${m.swimmersServed} swimmers against ${today} in the club today`
      };
    }
  },
  {
    key: 'efficient',
    label: 'Use the pool time we already pay for',
    blurb: 'Fill the lanes the club books, rather than buying more.',
    weights: { utilisation: 40, served: 25, coachCover: 10, ltad: 10, timetableQuality: 10, continuity: 5 },
    test: (m, base) => {
      const booked = base.utilisation?.totalLaneHours || 0;
      return {
        met: m.assignedLaneHours <= booked,
        detail: `uses ${m.assignedLaneHours} of the ${booked} lane-hours the club books`
      };
    }
  },
  {
    key: 'newwater',
    label: 'Work out what new pool time buys',
    blurb: 'Add candidate slots and see what they unlock. Rewards using the extra water well.',
    weights: { served: 35, utilisation: 30, coachCover: 10, ltad: 10, timetableQuality: 10, continuity: 5 },
    test: (m, base) => {
      const booked = base.utilisation?.totalLaneHours || 0;
      const extra = +(m.availableLaneHours - booked).toFixed(1);
      return {
        met: extra > 0 && m.utilisationPct >= 70,
        detail: extra > 0
          ? `${extra} lane-hours of new water, ${m.utilisationPct}% of it used`
          : 'no new water in this model yet — add candidate slots on Pool Slots'
      };
    }
  },
  {
    key: 'coaching',
    label: 'Fit the coaches we have',
    blurb: 'Keep the week staffable with the current roster.',
    weights: { coachCover: 40, served: 25, utilisation: 10, ltad: 10, timetableQuality: 10, continuity: 5 },
    test: m => {
      if (!m.coach || m.coach.coveragePct === null) {
        return { met: false, detail: 'no coach roster entered yet — add it on the Coaches tab' };
      }
      return {
        met: m.coach.gapHours <= 0,
        detail: m.coach.gapHours > 0
          ? `${m.coach.gapHours} coach-hours a week uncovered`
          : 'every session is covered by the roster'
      };
    }
  },
  {
    key: 'ltad',
    label: 'Train the right volume for each age',
    blurb: 'Move squads closer to the training volume their age group should be doing.',
    weights: { ltad: 40, served: 25, utilisation: 10, coachCover: 10, timetableQuality: 10, continuity: 5 },
    test: m => ({
      met: m.ltadCompliancePct >= 70,
      detail: `LTAD fit ${m.ltadCompliancePct} out of 100 across competitive squads`
    })
  },
  {
    key: 'settled',
    label: 'Change as little as possible',
    blurb: 'Keep the timetable and squads people know. Useful as the option to beat.',
    weights: { continuity: 40, served: 25, coachCover: 10, utilisation: 10, ltad: 10, timetableQuality: 5 },
    test: m => ({
      met: (m.subScores?.continuity ?? 0) >= 80,
      detail: `${Math.round(m.subScores?.continuity ?? 0)}% of sessions stay where they are`
    })
  }
];

/** Average the weights of the chosen goals, so several can be pursued at once. */
export function weightsForGoals(keys) {
  const chosen = GOALS.filter(g => (keys || []).includes(g.key));
  if (!chosen.length) return null;

  const totals = {};
  chosen.forEach(g => {
    Object.entries(g.weights).forEach(([k, v]) => { totals[k] = (totals[k] || 0) + v; });
  });
  Object.keys(totals).forEach(k => { totals[k] = Math.round(totals[k] / chosen.length); });
  return totals;
}

/** Did the finished model deliver what it was asked for? */
export function scoreGoals(keys, metrics, baseline) {
  if (!metrics || !baseline) return [];
  return GOALS.filter(g => (keys || []).includes(g.key)).map(g => {
    const r = g.test(metrics, baseline);
    return { key: g.key, label: g.label, met: r.met, detail: r.detail };
  });
}
