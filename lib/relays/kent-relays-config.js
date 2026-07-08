/**
 * Kent County Relays 2026 — meet configuration.
 *
 * Everything the team-picker needs about the meet is data, not code:
 * the 24-event grid, age bands, category rules and the official programme
 * event numbers all live here so the optimiser and UI stay generic.
 *
 * Source of truth: 2026 Kent Team Champs Conditions + Programme (Sat 12 Sep
 * 2026, London Aquatics Centre, short course). Key rules encoded below:
 *   - Age is taken as at 31 Dec 2026  → age = 2026 − year_of_birth (cond 3.7)
 *   - A swimmer is eligible for their own band and every OLDER band up to Open
 *     (cond 3.16.1)
 *   - Mixed = exactly 2 male + 2 female (cond 3.3)
 *   - Entry time = sum of members' 50m PBs for their leg (cond 5.2)
 *   - 30 teams per event cap; A-teams selected first by time, then B/C by lot
 *     (cond 3.8) — so B/C teams are lottery-vulnerable.
 */

export const MEET = {
  code: 'KT26',
  name: 'Kent County Relays 2026',
  venue: 'London Aquatics Centre',
  date: '2026-09-12',
  closes: '2026-08-31',
  course: 'S',            // short course — matches swimmer_pbs.course
  courseLabel: 'Short course',
  ageAsAt: '31 Dec 2026',
  ageYear: 2026,          // age = ageYear − year_of_birth
  feePerTeam: 12,         // £ per team per event (cond 2.2)
  maxTeamsPerEvent: 30,   // cond 3.8
  finalsPlaces: 10,       // fastest 10 make the final (cond 3.9)
};

export const AGE_BANDS = [
  { key: '11U', label: '11/under', maxAge: 11 },
  { key: '13U', label: '13/under', maxAge: 13 },
  { key: '15U', label: '15/under', maxAge: 15 },
  { key: 'OPEN', label: 'Open', maxAge: 999 },
];

export const CATEGORIES = [
  { key: 'F', label: 'Female', composition: '4F' },
  { key: 'M', label: 'Open/Male', composition: '4M' }, // male pool by default; allowAnyGender relaxes
  { key: 'X', label: 'Mixed', composition: '2M2F' },   // exactly 2 male + 2 female
];

export const MEDLEY_LEGS = ['Back', 'Breast', 'Fly', 'Free'];
export const FREE_LEGS = ['Free', 'Free', 'Free', 'Free'];

export const RELAYS = [
  { key: 'MEDLEY', label: '4×50m Medley', short: 'Medley', legs: MEDLEY_LEGS },
  { key: 'FREE', label: '4×50m Free', short: 'Free', legs: FREE_LEGS },
];

/** Stroke leg → the 50m event whose PB feeds that leg's split. */
export const LEG_EVENT = {
  Back: '50 Back',
  Breast: '50 Breast',
  Fly: '50 Fly',
  Free: '50 Free',
};

/** All four 50m events the picker needs a PB for. */
export const REQUIRED_EVENTS = ['50 Free', '50 Back', '50 Breast', '50 Fly'];

/**
 * Official programme heat event numbers, keyed by `${band}-${cat}-${relay}`.
 * Finals are heat number + 12 (session 1) / + 12 (session 2). Used to order and
 * label the declaration + print sheet exactly as the meet runs.
 */
export const PROGRAMME_NO = {
  // Session 1 — heats 101–112
  '11U-F-MEDLEY': 101, '11U-M-FREE': 102, '15U-F-MEDLEY': 103, '15U-M-FREE': 104,
  '13U-F-MEDLEY': 105, '13U-M-FREE': 106, 'OPEN-F-MEDLEY': 107, 'OPEN-M-FREE': 108,
  '11U-X-MEDLEY': 109, '15U-X-MEDLEY': 110, '13U-X-MEDLEY': 111, 'OPEN-X-MEDLEY': 112,
  // Session 2 — heats 201–212
  '11U-F-FREE': 201, '11U-M-MEDLEY': 202, '15U-F-FREE': 203, '15U-M-MEDLEY': 204,
  '13U-F-FREE': 205, '13U-M-MEDLEY': 206, 'OPEN-F-FREE': 207, 'OPEN-M-MEDLEY': 208,
  '11U-X-FREE': 209, '15U-X-FREE': 210, '13U-X-FREE': 211, 'OPEN-X-FREE': 212,
};

export function eventKey(bandKey, catKey, relayKey) {
  return `${bandKey}-${catKey}-${relayKey}`;
}

/** Fun display names for the teams within an event (A→Sharks, B→Dolphins…). */
export const TEAM_NAMES = ['Sharks', 'Dolphins', 'Barracudas', 'Stingrays', 'Orcas', 'Marlins'];

export function teamName(letter) {
  const i = (letter || '').charCodeAt(0) - 65;
  return TEAM_NAMES[i] || `Team ${letter}`;
}

/** The 24 relay events, in programme order. */
export function relayEvents() {
  const out = [];
  for (const band of AGE_BANDS) {
    for (const relay of RELAYS) {
      for (const cat of CATEGORIES) {
        const key = eventKey(band.key, cat.key, relay.key);
        out.push({
          key,
          band,
          cat,
          relay,
          programmeNo: PROGRAMME_NO[key] || null,
          label: `${band.label} ${cat.label} ${relay.label}`,
        });
      }
    }
  }
  return out.sort((a, b) => (a.programmeNo || 999) - (b.programmeNo || 999));
}

/** Seconds → "M:SS.hh" or "SS.hh". */
export function formatTime(secs) {
  if (secs == null || !isFinite(secs) || secs <= 0) return '—';
  const mins = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2).padStart(5, '0');
  return mins > 0 ? `${mins}:${s}` : (secs % 60).toFixed(2);
}
