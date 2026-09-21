/**
 * Every word the planner uses, defined once.
 *
 * The planner grew nine tabs and invented a vocabulary as it went. "Utilisation"
 * ended up naming two different numbers on two different tabs. The pair of
 * figures that matter most at this club — swimmers booked into a session against
 * swimmers who actually turn up — appeared under five different names across
 * seven surfaces. "Curfew", "youth-time penalty" and "time guide" were three
 * names for one idea. None of it was wrong; it was just never decided.
 *
 * That is survivable for the head coach, who knows what each screen means. It is
 * not survivable for a club committee member reading it once before a vote.
 *
 * So this file holds one entry per concept: the canonical name, a sentence a
 * volunteer can read, and the names it retires. Components, the comparison
 * table, the spreadsheet export and the glossary panel all import from here, so
 * a term cannot be renamed on one surface and not another.
 *
 * The unit tests enforce what prose cannot: no two concepts share a name, no
 * retired name creeps back as a canonical one, and no definition explains a term
 * using another piece of jargon unless it says so in `uses`.
 *
 * Code identifiers are deliberately untouched. `utilisationPct`, `curfewPenalty`
 * and `occupancyPct` still mean exactly what they meant to the solver, the API
 * and the tests. Only what the reader sees has changed.
 */

/**
 * One concept, one name, one sentence.
 *
 * - `term`    the canonical label. The only name this concept is shown under.
 * - `unit`    what the figure is counted in, where that is not obvious.
 * - `short`   the hover-card sentence. Plain English, no jargon, under 200 chars.
 * - `long`    optional second sentence: why it matters, or what to watch for.
 * - `field`   the metric or baseline field it comes from, for whoever reads this
 *             next wondering which number is meant.
 * - `alsoKnownAs`  names this replaces. Kept so the test can prove they stay dead.
 * - `uses`    other glossary keys whose terms legitimately appear in `short`.
 */
export const TERMS = {
  /* ---- Water ---------------------------------------------------------- */

  laneHour: {
    term: 'Lane-hour',
    unit: 'lanes × hours',
    short: 'One lane of a pool, held for one hour. Six lanes for two hours is twelve of them.',
    long: 'It is how pool time is bought, and how every measure of water on this page is counted.',
    field: null,
    alsoKnownAs: [],
    uses: []
  },
  poolTimeOnOffer: {
    term: 'Pool time this plan can use',
    unit: 'lane-hours a week',
    short: 'The water a squad could be put into, whether or not this plan ends up using it.',
    long: 'Less than the club books in total, and deliberately so: Learn to Swim and anything else already committed is left out, because a restructure cannot reallocate it. Add candidate sessions and this goes up.',
    field: 'metrics.availableLaneHours',
    alsoKnownAs: ['Lane-hours available', 'Pool time on offer'],
    uses: []
  },
  poolTimeOccupied: {
    term: 'Pool time squads occupy',
    unit: 'lane-hours a week',
    short: 'The water this plan actually puts a squad into.',
    long: 'Always the smaller of the two. The gap is water the plan could not find a use for.',
    field: 'metrics.assignedLaneHours',
    alsoKnownAs: ['Lane-hours used'],
    uses: []
  },
  waterUsed: {
    term: 'Water used',
    unit: '%',
    short: 'Of all the water this plan has to work with, the share it puts a squad into.',
    long: 'Low means the plan is holding water nothing trains in. It does not say whether the lanes are full — that is a different question.',
    field: 'metrics.utilisationPct',
    alsoKnownAs: ['Pool utilisation', 'Utilisation', 'Water booked'],
    uses: []
  },
  lanesFilled: {
    term: 'Lanes filled',
    unit: '%',
    short: 'Of the swimmer-sized room this plan creates, the share it expects to fill.',
    long: 'The companion question to how much water is used: the lanes can all be busy and still be half empty.',
    field: 'metrics.occupancyPct',
    alsoKnownAs: ['Lane occupancy', 'Occupancy'],
    uses: []
  },
  placesBooked: {
    term: 'Places booked',
    unit: '%',
    short: 'Across the sessions the club runs today, the share of room that swimmers are signed up to.',
    long: 'Taken from the club record, not from registers.',
    field: 'baseline.utilisation.occupancyPct',
    alsoKnownAs: ['Occupancy, on paper'],
    uses: []
  },
  placesFilled: {
    term: 'Places filled',
    unit: '%',
    short: 'Across the sessions the club runs today, the share of room with a swimmer really in it.',
    long: 'Taken from the registers of the last thirteen weeks. At this club it runs far below the booked figure.',
    field: 'baseline.utilisation.actualOccupancyPct',
    alsoKnownAs: ['Occupancy, in the water', '% of capacity'],
    uses: []
  },

  /* ---- Booked against attended ---------------------------------------- */

  booked: {
    term: 'Booked',
    unit: 'swimmers',
    short: 'Swimmers signed up to a session on the club record.',
    long: 'What the timetable says should be there.',
    field: 'session.rosterCount',
    alsoKnownAs: ['Allocated', 'Roster', 'On paper', 'Alloc'],
    uses: []
  },
  attending: {
    term: 'Attending',
    unit: 'swimmers',
    short: 'Swimmers really in the water — the average head count from the registers of the last thirteen weeks.',
    long: 'Where no register has ever been taken this is blank, which is missing information rather than an empty session.',
    field: 'session.attendance.avgPresent',
    alsoKnownAs: ['Actual', 'Actually attending', 'In the water'],
    uses: []
  },
  turnUpRate: {
    term: 'Turn-up rate',
    unit: '%',
    short: 'Of the swimmers booked into a session, the share who are attending.',
    long: 'A low rate means water is being held for swimmers who are not coming. This club\'s measured rate is well under a half.',
    field: 'session.attendance.ofBookedPct',
    alsoKnownAs: ['Turn-up', 'Show rate', '% of those allocated'],
    uses: ['booked', 'attending']
  },
  assumedTurnUpRate: {
    term: 'Assumed turn-up rate',
    unit: 'a share of 1',
    short: 'The turn-up rate this plan assumes when working out how big a squad can be.',
    long: 'Set it to 1 to guarantee every swimmer a place on every session. Set it to the measured rate to plan for a typical week instead.',
    field: 'policy.showRate',
    alsoKnownAs: ['Assumed turnout rate', 'showRate'],
    uses: ['turnUpRate']
  },

  /* ---- Squads and training -------------------------------------------- */

  place: {
    term: 'Place',
    unit: 'swimmers',
    short: 'Room for one swimmer in the water: lanes multiplied by how many that squad puts in a lane.',
    long: null,
    field: null,
    alsoKnownAs: [],
    uses: []
  },
  swimmerSession: {
    term: 'Swimmer-session',
    unit: 'swimmers × sessions',
    short: 'One swimmer attending once. A squad of thirty owing four a week needs a hundred and twenty.',
    long: 'The unit a squad\'s weekly need is counted in.',
    field: 'metrics.swimmerSessionsRequired',
    alsoKnownAs: [],
    uses: ['attending']
  },
  fullTrainingWeek: {
    term: 'Full training week',
    unit: null,
    short: 'A squad has one when there is enough room across the week for every swimmer to do every session the squad is set.',
    long: 'The plainest test of whether a plan works. Either the water is there or it is not.',
    field: 'metrics.squadsMeetingRequirement',
    alsoKnownAs: ['Requirement met'],
    uses: []
  },
  shortBy: {
    term: 'Short by',
    unit: 'places a week',
    short: 'How much room a squad is missing across the week, counted as one place per swimmer per session.',
    long: 'Shown beside a squad that does not get its full training week.',
    field: 'bySquad[].placesShortfall',
    alsoKnownAs: ['SHORT n'],
    uses: ['place']
  },
  offered: {
    term: 'Offered',
    unit: 'sessions and hours a week',
    short: 'What the club runs for a squad — the sessions it books and staffs.',
    long: 'Often more than each swimmer owes, because the squad is spread across a choice of nights.',
    field: 'squad.sessionsOfferedPerWeek',
    alsoKnownAs: [],
    uses: []
  },
  target: {
    term: 'Target',
    unit: 'sessions and hours a week',
    short: 'What each swimmer in a squad is supposed to do each week.',
    long: null,
    field: 'squad.targetSessionsPerWeek',
    alsoKnownAs: [],
    uses: []
  },
  volumeGuide: {
    term: 'Training volume guide',
    unit: 'hours a week',
    short: 'The weekly hours the sport\'s long-term athlete development guidance suggests for a given age.',
    long: 'This club\'s own targets sit below it by design, so read the gap as context for a conversation about volume, never as a failure.',
    field: 'bySquad[].ltadBand',
    alsoKnownAs: ['LTAD', 'LTAD band'],
    uses: []
  },
  volumeFit: {
    term: 'Volume fit',
    unit: '0-100',
    short: 'How close a squad\'s weekly hours sit to its training volume guide.',
    long: 'A squad whose ages span three development stages cannot score well here however it is timetabled — that is itself an argument for splitting it.',
    field: 'metrics.ltadCompliancePct',
    alsoKnownAs: ['LTAD fit'],
    uses: ['volumeGuide']
  },
  swimmingAge: {
    term: 'Swimming age',
    unit: 'years',
    short: 'The age a swimmer reaches by 31 December. Squads and championship age groups are built on it.',
    long: null,
    field: null,
    alsoKnownAs: [],
    uses: []
  },
  ageRangeMost: {
    term: 'Age range most of a squad sits in',
    unit: 'years',
    short: 'The band holding the middle four fifths of a squad, ignoring one or two outliers.',
    long: 'Used instead of youngest-to-oldest so a single older swimmer does not stretch a squad\'s band and its training volume with it.',
    field: 'squad.p10Age / squad.p90Age',
    alsoKnownAs: ['p10-p90'],
    uses: []
  },
  exemptSwimmer: {
    term: 'Exempt',
    unit: 'swimmers',
    short: 'A swimmer marked exempt from the club\'s performance measures, under Settings, and so left out of a squad\'s working size.',
    long: 'Usually long-term injury or absence. The dashboard and squad statistics count squads the same way, so a squad reading "23 +2 exempt" has 25 on its books. If an exempt swimmer is still in the water, add them back on Squad Design — the plan sizes lanes on the counted figure.',
    field: 'squad.memberCount - squad.activeNonExemptCount',
    alsoKnownAs: [],
    uses: []
  },
  nonCompetitive: {
    term: 'Non-competitive',
    unit: null,
    short: 'A squad that does not train toward competition, such as masters or a lessons group.',
    long: 'Always carried through a restructure untouched, and left out of the training volume averages.',
    field: 'squad.competitive',
    alsoKnownAs: ['Off-ramp'],
    uses: []
  },

  /* ---- Time of day ----------------------------------------------------- */

  ageTimeGuide: {
    term: 'Age time guide',
    unit: null,
    short: 'The latest a squad should finish and the earliest it should start, judged by its youngest swimmer.',
    long: 'A guide, not a wall. A session outside it is still scheduled, and flagged, so you can see the cost of the compromise rather than have the option hidden.',
    field: 'policy.timeWindows',
    alsoKnownAs: ['Curfew', 'School-night curfew'],
    uses: []
  },
  timeGuidePenalty: {
    term: 'Time-guide penalty',
    unit: 'points',
    short: 'How far outside the age time guide a plan puts its squads, counted in proportion to the minutes. Lower is better.',
    long: null,
    field: 'metrics.totalCurfewPenalty',
    alsoKnownAs: ['Youth-time penalty', 'Curfew penalty'],
    uses: ['ageTimeGuide']
  },

  /* ---- How a plan scores ---------------------------------------------- */

  squadCount: {
    term: 'Squads in the plan',
    unit: 'squads',
    short: 'How many squads this structure proposes, which need not match how many the club runs today.',
    long: 'Fewer, larger squads share water more efficiently; more, narrower ones train closer to each age\'s needs. That trade is most of what a restructure decides.',
    field: 'metrics.squadCount',
    alsoKnownAs: [],
    uses: []
  },
  fitScore: {
    term: 'Fit score',
    unit: '0-100',
    short: 'A weighted blend of the six measures below, using the weights you set under Assumptions.',
    long: 'It decides which plan the search prefers when it has a choice. It is not a verdict on whether a plan is any good — the figures above it are.',
    field: 'metrics.total',
    alsoKnownAs: ['Overall score', 'Total score'],
    uses: []
  },
  sessionsThatStayPut: {
    term: 'Sessions that stay put',
    unit: '%',
    short: 'The share of a plan\'s sessions landing on water the club already books.',
    long: 'A plan that rewrites the whole week is far harder to adopt than one scoring slightly lower that adds to it.',
    field: 'metrics.subScores.continuity',
    alsoKnownAs: ['Continuity', 'Continuity with today'],
    uses: []
  },
  timetableQuality: {
    term: 'Timetable quality',
    unit: '0-100',
    short: 'Starts at a hundred and loses points for sessions outside the age time guide, missing weekend sessions, and squads that could not be fully placed.',
    long: null,
    field: 'metrics.subScores.timetableQuality',
    alsoKnownAs: [],
    uses: ['ageTimeGuide']
  },
  swimmersCovered: {
    term: 'Swimmers the water covers',
    unit: 'swimmers',
    short: 'How many swimmers the lanes this plan allocates can hold across the week.',
    long: null,
    field: 'metrics.swimmersServed',
    alsoKnownAs: ['Swimmers served', 'Served'],
    uses: []
  },
  roomForMore: {
    term: 'Room for more',
    unit: 'swimmers',
    short: 'How many more swimmers a squad could take before its water runs out, at the volume that squad is set.',
    long: 'The other side of a shortfall. A squad training four times a week needs four places for every swimmer, so room for ten more means forty spare places across the week.',
    field: 'bySquad[].roomForMore',
    alsoKnownAs: ['Spare capacity', 'Headroom'],
    uses: []
  },
  swimmersNotCovered: {
    term: 'Swimmers not covered',
    unit: 'swimmers',
    short: 'Swimmers expected in the club beyond what this plan\'s lanes can hold.',
    long: 'Includes any growth you have assumed, so it answers "who would we turn away".',
    field: 'metrics.unservedDemand',
    alsoKnownAs: ['Unserved demand', 'Not accommodated'],
    uses: []
  },

  /* ---- Coaching -------------------------------------------------------- */

  coachHour: {
    term: 'Coach-hour',
    unit: 'coaches × hours',
    short: 'One coach on poolside for one hour.',
    long: null,
    field: 'metrics.coach.requiredCoachHours',
    alsoKnownAs: [],
    uses: []
  },
  coachHoursShort: {
    term: 'Coach-hours short',
    unit: 'coach-hours a week',
    short: 'The staffing this plan needs each week that the roster cannot cover.',
    long: 'Reported, never fatal — an empty roster gives a plan with gaps, not no plan at all.',
    field: 'metrics.coach.gapHours',
    alsoKnownAs: ['Gap hours', 'Short by hours'],
    uses: []
  },
  coachesAtOnce: {
    term: 'Coaches needed at once',
    unit: 'coaches',
    short: 'The most coaches standing on poolside at the same moment anywhere in the club.',
    long: 'Whether a week is staffable at all, as distinct from whether the hours add up across it.',
    field: 'metrics.coach.peakConcurrent',
    alsoKnownAs: ['Peak at once', 'Peak coaches at once', 'Peak concurrent'],
    uses: []
  },
  lanesAtOnce: {
    term: 'Lanes needed at once',
    unit: 'lanes',
    short: 'The most lanes in use at the same moment at one venue.',
    long: 'What that pool has to be able to physically provide.',
    field: null,
    alsoKnownAs: ['Lanes at once, peak'],
    uses: []
  },

  /* ---- Pool slots ------------------------------------------------------ */

  alreadyBooked: {
    term: 'Already booked',
    unit: null,
    short: 'Water the club holds today.',
    long: 'Keeping these where they are is most of what makes a plan adoptable.',
    field: "slot.source === 'existing'",
    alsoKnownAs: ['Existing'],
    uses: []
  },
  beingConsidered: {
    term: 'Being considered',
    unit: null,
    short: 'Water you are modelling taking. Not held, not paid for, not yours yet.',
    long: null,
    field: "slot.source === 'candidate'",
    alsoKnownAs: ['Candidate'],
    uses: []
  },
  timetableDrift: {
    term: 'Timetable drift',
    unit: null,
    short: 'The club\'s real timetable has changed since this plan took its copy of it.',
    long: 'A plan keeps its own copy on purpose — that is what makes it a what-if. This just tells you the two have parted company.',
    field: null,
    alsoKnownAs: [],
    uses: []
  }
};

/**
 * Display order, grouped. Drives the glossary panel and the printed appendix.
 */
export const GLOSSARY = [
  {
    group: 'Pool time',
    keys: ['laneHour', 'poolTimeOnOffer', 'poolTimeOccupied', 'waterUsed', 'lanesFilled',
      'placesBooked', 'placesFilled', 'lanesAtOnce']
  },
  {
    group: 'Who turns up',
    keys: ['booked', 'attending', 'turnUpRate', 'assumedTurnUpRate']
  },
  {
    group: 'Squads and training',
    keys: ['place', 'swimmerSession', 'fullTrainingWeek', 'shortBy', 'offered', 'target',
      'volumeGuide', 'volumeFit', 'swimmingAge', 'ageRangeMost', 'exemptSwimmer', 'nonCompetitive']
  },
  {
    group: 'Session times',
    keys: ['ageTimeGuide', 'timeGuidePenalty']
  },
  {
    group: 'How a plan is scored',
    keys: ['fitScore', 'swimmersCovered', 'swimmersNotCovered', 'roomForMore', 'squadCount', 'sessionsThatStayPut',
      'timetableQuality']
  },
  {
    group: 'Coaching',
    keys: ['coachHour', 'coachHoursShort', 'coachesAtOnce']
  },
  {
    group: 'Pool slots',
    keys: ['alreadyBooked', 'beingConsidered', 'timetableDrift']
  }
];

/**
 * How far back registers may be read for attendance.
 *
 * Lives here rather than in lib/restructure-baseline.js because that module is
 * server-only — it opens a service-role client — and the picker that offers
 * these windows runs in the browser.
 *
 * The right window moves with the calendar: ninety days across the summer break
 * averages a fortnight when the club barely ran into a term-time picture, thirty
 * days in September says what is happening now, and a year smooths both out.
 */
export const ATTENDANCE_WINDOWS = [30, 60, 90, 180, 365];
// Ninety days read in September is about five-thirteenths school holiday, and
// only 22 of the club's 50 sessions clear eight registers inside it. A hundred
// and eighty gets 47 of 50 past eight, so no quoted figure rests on a handful
// of nights — and with holiday weeks excluded it is still 16 term weeks deep.
export const DEFAULT_ATTENDANCE_DAYS = 180;

/** Clamp a requested window to one the club can actually choose. */
export function resolveAttendanceDays(requested) {
  const n = Math.round(Number(requested));
  return ATTENDANCE_WINDOWS.includes(n) ? n : DEFAULT_ATTENDANCE_DAYS;
}

/** "90 days" / "1 year", for a button. */
export function attendanceWindowLabel(days) {
  if (days >= 365) return '1 year';
  if (days >= 180) return '6 months';
  return `${days} days`;
}

/**
 * Lane-hours as a reader should see them: one decimal place, no trailing ".0".
 *
 * The figure is stored at two precisions — the baseline keeps two decimals so
 * the arithmetic stays exact, the solver rounds to one — and rendering both raw
 * put "157.34" beside "142" on the same screen, which reads as two different
 * kinds of measurement rather than one measured to different degrees. The stored
 * values are left alone; only the display is normalised.
 */
export function hours(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return String(Number.isInteger(v) ? v : +v.toFixed(1));
}

/** The canonical label for a concept. Throws on an unknown key so a typo cannot ship a blank. */
export function label(key) {
  const entry = TERMS[key];
  if (!entry) throw new Error(`restructure-glossary: no term "${key}"`);
  return entry.term;
}

/** The whole entry, for the hover card. */
export function definition(key) {
  const entry = TERMS[key];
  if (!entry) throw new Error(`restructure-glossary: no term "${key}"`);
  return entry;
}

/**
 * The solver's LTAD verdicts, in words.
 *
 * ltadScore returns these four strings and 286 tests assert on them, so they are
 * translated here at render time rather than changed at source. "UNDERLOAD"
 * reads as a failure; "below band" reads as what it is, given the club's targets
 * sit under the guidance deliberately.
 */
export const LTAD_VERDICT_LABELS = {
  OPTIMAL: 'On band',
  UNDERLOAD: 'Below band',
  OVERLOAD: 'Above band',
  UNKNOWN: 'No band for this age range'
};

/**
 * The chips on a timetable block. These have never had a legend anywhere in the
 * app — the meaning lived only in a hover title.
 */
export const FLAG_LABELS = {
  CURFEW: {
    chip: 'LATE',
    meaning: 'Finishes outside the age time guide for its youngest swimmers.'
  },
  UNDER_CAPACITY: {
    chip: 'TIGHT',
    meaning: 'Fewer places in the water than this squad needs.'
  },
  NO_COACH: {
    chip: 'COACH',
    meaning: 'Nobody on the roster can cover this session.'
  }
};

/** EXISTING / CANDIDATE, in words a reader does not have to guess at. */
export const SLOT_SOURCE_LABELS = {
  existing: { key: 'alreadyBooked', term: TERMS.alreadyBooked.term },
  candidate: { key: 'beingConsidered', term: TERMS.beingConsidered.term }
};
