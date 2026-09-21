/**
 * The club as it stands, with the arithmetic shown.
 *
 * The planner could already say "Gold Development has room for 5 more". Nobody
 * should believe that on trust, and a committee reading it certainly should not:
 * a bare number invites the question "how do you know" and has no answer.
 *
 * So every figure here arrives with its working — 36 swimmers each set 4
 * sessions is 144 places needed; its sessions provide 167 at 8 to a lane; the
 * difference is room for 5 more. Somebody can check that on the back of an
 * envelope, and disagree with an input rather than with the tool.
 *
 * Pure: it reads a baseline and returns structured facts and sentences. Nothing
 * here queries anything, and no language model is involved — the write-up that
 * follows quotes these figures rather than working any of them out.
 */

/** One decimal place, no trailing zero. */
function n1(v) {
  const x = Math.round((Number(v) || 0) * 10) / 10;
  return Number.isInteger(x) ? x : +x.toFixed(1);
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * How a squad's room for more swimmers is arrived at.
 *
 * Stated in the club's own terms: a swimmer owing four sessions needs four
 * places, so the water divides by what each swimmer owes rather than by the
 * number of sessions the club happens to run.
 */
function squadWorking(sq) {
  const owed = sq.targetSessionsPerWeek;
  const needed = sq.swimmerSessionsRequired;
  const have = sq.weeklyPlaces;

  const basis = `${plural(sq.activeNonExemptCount, 'swimmer', 'swimmers')} each set ${plural(owed, 'session', 'sessions')} a week means ${needed} places are needed across the week.`;
  const supply = `Its ${plural(sq.ownSessionCount, 'session', 'sessions')} provide ${have} places at ${sq.swimmersPerLane} to a lane.`;

  if (have >= needed) {
    const spare = have - needed;
    return `${basis} ${supply} That leaves ${plural(spare, 'place', 'places')} spare, which at ${plural(owed, 'session', 'sessions')} each is room for ${plural(sq.roomForMore, 'more swimmer', 'more swimmers')}.`;
  }
  return `${basis} ${supply} That is ${plural(needed - have, 'place', 'places')} short, so ${plural(Math.ceil((needed - have) / owed), 'swimmer', 'swimmers')} could not train the full week if everyone came.`;
}

/**
 * How many registers a session needs before its attendance is quotable.
 *
 * Two registers is an anecdote. A short window straight after a sync can leave a
 * session with one or two, and a percentage off that reads exactly like a
 * percentage off twenty — which is how a briefing came to tell a committee that
 * NAR was "genuinely full" on a Tuesday showing 104% from two registers, while
 * the same session over a longer window sat at 77% from nine.
 */
const MIN_REGISTERS = 3;

/**
 * Whether the shortfall is real or only on paper.
 *
 * A squad's requirement assumes every swimmer attends every session. This club's
 * registers show barely half do, so a squad can read short while its busiest
 * session is half empty. Saying so is the difference between "buy more water"
 * and "look at your attendance".
 *
 * Only said where the busiest session has enough registers to mean it, and only
 * where there is real room — a squad whose sessions are full is short in the
 * water, not on paper, and must not be told otherwise.
 */
function attendanceReadOn(sq, busiest, thinRegisters) {
  if (sq.requirementMet) return null;
  if (!busiest || busiest.attending === null) {
    // Nothing cleared the register floor. Whether that is because no register
    // exists at all or because there are only one or two makes the difference
    // between "wait for more data" and "there is nothing to wait for".
    if (thinRegisters > 0) {
      return `Its attendance cannot be read yet: the busiest session has only ${plural(thinRegisters, 'register', 'registers')} in this window.`;
    }
    return null;
  }
  const roomAtBusiest = busiest.places - busiest.attending;
  if (roomAtBusiest <= 0) {
    return `This is not only on paper: its busiest session, ${busiest.name}, already draws ${n1(busiest.attending)} swimmers into ${busiest.places} places across ${plural(busiest.registers, 'register', 'registers')}.`;
  }
  return `On the registers this is a shortfall on paper: its busiest session, ${busiest.name}, draws ${n1(busiest.attending)} swimmers into ${busiest.places} places across ${plural(busiest.registers, 'register', 'registers')}.`;
}

/**
 * Build the as-is report.
 *
 * Returns { window, water, attendance, squads, headline, caveats } — figures and
 * sentences, ready either to render or to hand to a write-up.
 */
export function buildAsIsReport(baseline) {
  if (!baseline || !baseline.utilisation) return null;

  const u = baseline.utilisation;
  const sessions = (baseline.sessions || []).filter(s => s.isActive);
  const windowDays = baseline.windows?.attendanceDays ?? 91;
  const capabilityDays = baseline.windows?.capabilityDays ?? 365;

  const withTarget = (baseline.squads || []).filter(s => s.targetSessionsPerWeek > 0);
  const noTarget = (baseline.squads || []).filter(s => s.targetSessionsPerWeek === 0);

  const squads = withTarget.map(sq => {
    const mine = sessions.filter(s => s.squadIdFromName === sq.id);
    const busiest = mine
      .filter(s => s.attendance && s.attendance.avgPresent !== null
        && s.attendance.registers >= MIN_REGISTERS)
      .sort((a, b) => (b.attendance.avgPresent || 0) - (a.attendance.avgPresent || 0))[0] || null;

    return {
      name: sq.name,
      swimmers: sq.activeNonExemptCount,
      exempt: sq.memberCount - sq.activeNonExemptCount,
      targetSessionsPerWeek: sq.targetSessionsPerWeek,
      targetHoursPerWeek: sq.targetHoursPerWeek,
      hoursOffered: sq.currentWeeklyHours,
      swimmersPerLane: sq.swimmersPerLane,
      sessionsOffered: sq.ownSessionCount,
      placesAvailable: sq.weeklyPlaces,
      placesNeeded: sq.swimmerSessionsRequired,
      placesShortfall: sq.placesShortfall,
      roomForMore: sq.roomForMore,
      requirementMet: sq.requirementMet,
      laneHours: sq.currentLaneHours,
      ageRange: sq.p10Age === null ? null : `${sq.p10Age}-${sq.p90Age}`,
      busiestSession: busiest ? {
        name: busiest.name,
        day: busiest.day,
        time: busiest.startTime && busiest.endTime ? `${busiest.startTime}-${busiest.endTime}` : null,
        places: busiest.places,
        booked: busiest.rosterCount,
        registers: busiest.attendance.registers,
        attending: n1(busiest.attendance.avgPresent),
        // What the same session drew in the weeks that were set aside. Carried
        // so "we excluded the holidays" can be checked rather than believed.
        holidayRegisters: busiest.attendance.holiday?.registers ?? 0,
        holidayAttending: busiest.attendance.holiday?.avgPresent === null
          || busiest.attendance.holiday?.avgPresent === undefined
          ? null : n1(busiest.attendance.holiday.avgPresent)
      } : null,
      working: squadWorking(sq),
      attendanceNote: null
    };
  });

  // Filled in after the fact so the working and the attendance read use the
  // same busiest session.
  squads.forEach((s, i) => {
    const sq = withTarget[i];
    const thin = sessions
      .filter(x => x.squadIdFromName === sq.id && x.attendance && x.attendance.registers > 0)
      .reduce((m, x) => Math.max(m, x.attendance.registers), 0);
    s.attendanceNote = attendanceReadOn(sq, s.busiestSession, thin);
  });

  const quietest = sessions
    .filter(s => s.attendance && s.attendance.ofCapacityPct !== null && s.places > 0
      && s.attendance.registers >= MIN_REGISTERS)
    .sort((a, b) => a.attendance.ofCapacityPct - b.attendance.ofCapacityPct)
    .slice(0, 6)
    .map(s => ({
      name: s.name,
      day: s.day,
      time: s.startTime || null,
      places: s.places,
      attending: n1(s.attendance.avgPresent),
      registers: s.attendance.registers,
      filledPct: s.attendance.ofCapacityPct
    }));

  return {
    window: {
      attendanceDays: windowDays,
      attendanceWeeks: Math.round(windowDays / 7),
      capabilityDays: capabilityDays,
      sessionsWithoutRegister: u.activeSessionCount - (u.sessionsWithRegisters || 0),
      // The term basis, carried verbatim so the briefing can state what was
      // measured instead of being taken on trust. A reader who can see which
      // weeks were removed cannot be surprised by them later.
      from: baseline.windows?.from ?? null,
      to: baseline.windows?.to ?? null,
      termOnly: baseline.windows?.termOnly ?? false,
      termWeeks: baseline.windows?.termWeeks ?? null,
      holidaysExcluded: baseline.windows?.exclusions || [],
      registersUsed: baseline.windows?.registersUsed ?? null,
      registersSetAside: baseline.windows?.registersSetAside ?? 0,
      termRatePct: baseline.windows?.termRatePct ?? null,
      holidayRatePct: baseline.windows?.holidayRatePct ?? null,
      basis: baseline.windows?.basis ?? null
    },

    water: {
      laneHoursPerWeek: n1(u.totalLaneHours),
      usableBySquads: n1(u.squadLaneHours),
      reserved: n1(u.reservedLaneHours),
      activeSessions: u.activeSessionCount,
      venues: (baseline.venues || []).length,
      emptySessions: u.emptySessionCount,
      venuesOverBooked: (baseline.venueLoad || []).filter(v => v.over && v.over.length).length,
      venuesWithoutLaneCount: Array.from(new Set(
        (baseline.venueLoad || []).filter(v => v.capacity === null).map(v => v.venue)))
    },

    attendance: {
      placesBooked: u.rosterPlaces,
      placesTotal: u.totalPlaces,
      bookedPct: u.occupancyPct,
      attending: n1(u.actualAttending),
      filledPct: u.actualOccupancyPct,
      turnUpRate: u.measuredShowRate,
      quietest
    },

    squads,

    headline: {
      squadsWithFullWeek: u.squadsMeetingRequirement,
      squadsJudged: u.squadsWithTargetCount,
      roomForMore: u.roomForMore,
      squadsWithoutTarget: noTarget.map(s => ({ name: s.name, swimmers: s.activeNonExemptCount }))
    },

    caveats: (baseline.warnings || []).slice()
  };
}
