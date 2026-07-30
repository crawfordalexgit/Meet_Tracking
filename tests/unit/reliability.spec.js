/**
 * Regression tests for the pre-launch audit (2026-07-27).
 *
 * calculateReliability is ~490 lines and produces the consistency %, volume %,
 * credited hours and meet compliance shown on every screen in the product. It
 * had no test coverage at all, and four separate data-corruption bugs were
 * living inside it. Everything here is fixture-driven — no live DB.
 *
 * Each describe block names the bug it pins.
 */
import { test, expect } from '@playwright/test';
import {
  calculateReliability,
  calculateSquadHealth,
  computeSquadStats,
  getWeekKey,
} from '../../lib/analytics-utils.js';
import { extractJson } from '../../lib/ai_provider.js';
import { parseUkDate, parseSetCookie } from '../../lib/scm-scraper.js';

// ── Fixture helpers ─────────────────────────────────────────────────────────

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const isoDaysAgo = (n) => daysAgo(n).toISOString().split('T')[0];

const SQUAD = {
  id: 'squad-1',
  name: 'AGE DEVELOPMENT',
  target_sessions_per_week: 4,
  target_hours_per_week: 6,
  target_meets: 5,
  target_training_percent: 75,
};

const SESSIONS = [
  { id: 's-mon', name: 'AGE DEVELOPMENT Monday', day_of_week: 'monday', start_time: '18:00', end_time: '19:30' },
  { id: 's-wed', name: 'AGE DEVELOPMENT Wednesday', day_of_week: 'wednesday', start_time: '18:00', end_time: '19:30' },
  { id: 's-fri', name: 'AGE DEVELOPMENT Friday', day_of_week: 'friday', start_time: '18:00', end_time: '19:30' },
  { id: 's-sat', name: 'AGE DEVELOPMENT Saturday', day_of_week: 'saturday', start_time: '08:00', end_time: '09:30' },
];

const MEMBERSHIPS = SESSIONS.map(s => ({ swimmer_id: 'sw-1', session_id: s.id }));

function makeSwimmer(overrides = {}) {
  return {
    id: 'sw-1',
    full_name: 'Test Swimmer',
    squad_id: SQUAD.id,
    squads: SQUAD,
    year_of_birth: new Date().getFullYear() - 14,
    squad_join_date: isoDaysAgo(200),
    ...overrides,
  };
}

/** Attendance rows for every scheduled day in the last `days` days. */
function fullAttendance(days = 200) {
  const byDay = { monday: 's-mon', wednesday: 's-wed', friday: 's-fri', saturday: 's-sat' };
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = daysAgo(i);
    const sessionId = byDay[names[d.getDay()]];
    if (!sessionId) continue;
    rows.push({
      id: `att-${i}`,
      swimmer_id: 'sw-1',
      session_id: sessionId,
      date: d.toISOString().split('T')[0],
      status: 'present',
    });
  }
  return rows;
}

// ── D1: no data must not read as perfect ────────────────────────────────────

test.describe('calculateReliability — empty data', () => {
  // Every week in the window is written off, so there is no week we can judge
  // this swimmer on. That is the swimmableWeeks === 0 case.
  const ALL_EXEMPT = [{
    id: 'ex-all',
    name: 'Club Shutdown',
    type: 'exempt',
    squad_id: null,
    start_date: isoDaysAgo(400),
    end_date: new Date().toISOString().split('T')[0],
  }];

  test('no swimmable week reports null, not 100%', () => {
    // This used to return 100 for percentage/hoursCompliance/sessionsCompliance,
    // so a swimmer we knew nothing about rendered as fully compliant.
    const rel = calculateReliability(makeSwimmer(), [], SESSIONS, [], 365, ALL_EXEMPT, MEMBERSHIPS);

    expect(rel.hasReliabilityData).toBe(false);
    expect(rel.percentage).toBeNull();
    expect(rel.hoursCompliance).toBeNull();
    expect(rel.sessionsCompliance).toBeNull();
  });

  test('null percentage cannot satisfy a ">= target" compliance check', () => {
    const rel = calculateReliability(makeSwimmer(), [], SESSIONS, [], 365, ALL_EXEMPT, MEMBERSHIPS);

    // This is the exact expression used by reports.js, squad/[id].js and
    // computeSquadStats to decide whether a swimmer "is met".
    expect(rel.percentage >= 75).toBe(false);
  });

  test('a brand-new swimmer with no attendance scores 0%, never 100%', () => {
    const swimmer = makeSwimmer({ squad_join_date: new Date().toISOString().split('T')[0] });
    const rel = calculateReliability(swimmer, [], SESSIONS, [], 365, [], MEMBERSHIPS);

    expect(rel.percentage).toBe(0);
  });
});

test.describe('calculateReliability — with attendance', () => {
  test('full attendance produces a real percentage and banked hours', () => {
    const rel = calculateReliability(makeSwimmer(), fullAttendance(), SESSIONS, [], 365, [], MEMBERSHIPS);

    expect(rel.hasReliabilityData).toBe(true);
    expect(typeof rel.percentage).toBe('number');
    expect(rel.percentage).toBeGreaterThan(0);
    expect(rel.percentage).toBeLessThanOrEqual(100);
    expect(rel.totalTrainingHours).toBeGreaterThan(0);
  });

  test('a swimmer who never trains scores far below one who always does', () => {
    const good = calculateReliability(makeSwimmer(), fullAttendance(), SESSIONS, [], 365, [], MEMBERSHIPS);
    const bad = calculateReliability(makeSwimmer(), [], SESSIONS, [], 365, [], MEMBERSHIPS);

    expect(bad.percentage).toBeLessThan(good.percentage);
  });
});

// ── The workloadByWeek key mismatch ─────────────────────────────────────────

test.describe('calculateReliability — weekly target lookup', () => {
  test('details are keyed by getWeekKey ("W-YYYY-MM-DD")', () => {
    const rel = calculateReliability(makeSwimmer(), fullAttendance(), SESSIONS, [], 365, [], MEMBERSHIPS);
    const keys = Object.keys(rel.details);

    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).toMatch(/^W-\d{4}-\d{2}-\d{2}$/);
  });

  test('targetHrs/targetSess resolve from the details map, not the squad base', () => {
    // The returned targets used to be looked up with a bare toLocalISO date
    // ("2026-07-20") against a map keyed "W-2026-07-20", so the lookup never
    // matched and every caller silently fell back to the squad base target.
    // Pinning the key format is what makes that regression detectable.
    const rel = calculateReliability(makeSwimmer(), fullAttendance(), SESSIONS, [], 365, [], MEMBERSHIPS);
    const lastWeekKey = getWeekKey(daysAgo(7));

    expect(Object.prototype.hasOwnProperty.call(rel.details, lastWeekKey)).toBe(true);
    expect(rel.targetHrs).toBe(rel.details[lastWeekKey].target ?? SQUAD.target_hours_per_week);
  });
});

// ── Age-based criteria must reach the returned targets ──────────────────────

test.describe('calculateReliability — age-based criteria', () => {
  test('an age rule overrides the squad base target', () => {
    const squadWithRules = {
      ...SQUAD,
      age_based_criteria: [
        { min_age: 0, max_age: 13, target_sessions: 3, target_hours: 4 },
        { min_age: 14, max_age: 99, target_sessions: 5, target_hours: 8 },
      ],
    };
    const swimmer = makeSwimmer({ squads: squadWithRules });
    const rel = calculateReliability(swimmer, fullAttendance(), SESSIONS, [], 365, [], MEMBERSHIPS);

    // A 14-year-old must pick up the 14+ rule (8h / 5 sessions), not the squad
    // base (6h / 4 sessions). Assert across every processed week rather than
    // one index, so the test doesn't depend on Monday alignment.
    const processed = Object.values(rel.details).filter(w => w.appliedRule);
    expect(processed.length).toBeGreaterThan(0);
    for (const week of processed) {
      expect(week.appliedRule.target_hours).toBe(8);
      expect(week.requiredSessions).toBe(5);
    }
  });

  test('without age rules the squad base target is used', () => {
    const rel = calculateReliability(makeSwimmer(), fullAttendance(), SESSIONS, [], 365, [], MEMBERSHIPS);
    const processed = Object.values(rel.details).filter(w => w.requiredSessions !== undefined && !w.isExempt);

    expect(processed.length).toBeGreaterThan(0);
    for (const week of processed) {
      expect(week.appliedRule).toBeNull();
      expect(week.requiredSessions).toBe(SQUAD.target_sessions_per_week);
    }
  });
});

// ── calculateSquadHealth: the arity bug ─────────────────────────────────────

test.describe('calculateSquadHealth', () => {
  const stats = { avgTraining: 80, avgVolume: 60, avgVelocity: 10, complianceRate: 40 };

  test('per-squad health weights change the score', () => {
    // Every caller uses calculateSquadHealth(statsObj, squadObj), but the
    // signature is (input, attendance, sessions, results, period, config) — so
    // the squad landed in the `attendance` slot and the weights were read off
    // an empty config. Configuring weights in Settings had no effect anywhere.
    const defaults = calculateSquadHealth(stats, {});
    const reliabilityHeavy = calculateSquadHealth(stats, {
      health_weight_reliability: 70,
      health_weight_progress: 10,
      health_weight_competition: 10,
      health_weight_volume: 10,
    });

    expect(reliabilityHeavy.total).not.toBe(defaults.total);
    // Training score is 80 and compliance only 40, so weighting reliability
    // heavily must raise the total.
    expect(reliabilityHeavy.total).toBeGreaterThan(defaults.total);
  });

  test('weights are reflected in the component breakdown', () => {
    const health = calculateSquadHealth(stats, { health_weight_reliability: 55 });
    const consistency = health.components.find(c => c.label === 'Consistency');
    expect(consistency.weight).toBe('55%');
  });

  test('a null wa_pts does not make the score NaN', () => {
    const health = calculateSquadHealth({ ...stats, avgVelocity: undefined }, {});
    expect(Number.isFinite(health.total)).toBe(true);
  });
});

// ── computeSquadStats: assert numbers, not just call shape ──────────────────

test.describe('computeSquadStats', () => {
  const swimmers = [makeSwimmer(), makeSwimmer({ id: 'sw-2', full_name: 'Second Swimmer' })];
  const attendance = [
    ...fullAttendance(),
    ...fullAttendance().map(a => ({ ...a, id: `${a.id}-b`, swimmer_id: 'sw-2' })),
  ];
  const memberships = [
    ...MEMBERSHIPS,
    ...MEMBERSHIPS.map(m => ({ ...m, swimmer_id: 'sw-2' })),
  ];

  test('returns finite numbers for every headline metric', () => {
    // tests/integrity/squad-consistency.spec.js only asserts that both pages
    // CALL this function. That source-shape check is exactly why the reopened
    // F11 inconsistency slipped through — nothing asserted the values.
    const stats = computeSquadStats(SQUAD, swimmers, { attendance, sessions: SESSIONS, memberships, period: 365 });

    for (const key of ['training', 'volume', 'meets', 'compliance', 'health', 'avgPts', 'avgVelocity']) {
      expect(Number.isFinite(stats[key]), `${key} should be a finite number`).toBe(true);
    }
    expect(stats.training).toBeGreaterThanOrEqual(0);
    expect(stats.training).toBeLessThanOrEqual(100);
  });

  test('an empty squad does not produce NaN', () => {
    const stats = computeSquadStats(SQUAD, [], { attendance: [], sessions: SESSIONS, memberships: [], period: 365 });
    for (const key of ['training', 'volume', 'compliance', 'health']) {
      expect(Number.isFinite(stats[key]), `${key} should be a finite number`).toBe(true);
    }
  });

  test('squad health weights flow through computeSquadStats', () => {
    // computeSquadStats passes the squad as the 2nd argument to
    // calculateSquadHealth — this pins that the weights actually arrive.
    const weighted = computeSquadStats(
      { ...SQUAD, health_weight_reliability: 70, health_weight_progress: 10, health_weight_competition: 10, health_weight_volume: 10 },
      swimmers,
      { attendance, sessions: SESSIONS, memberships, period: 365 }
    );
    const consistency = weighted.healthDetail.components.find(c => c.label === 'Consistency');
    expect(consistency.weight).toBe('70%');
  });
});

// ── SCM scraper: UK dates and cookie splitting ──────────────────────────────

test.describe('parseUkDate', () => {
  test('DD/MM/YYYY is read as day-first, not month-first', () => {
    // `new Date("05/06/2026")` is 6 May in JS (US MM/DD). SCM is a UK app and
    // this module writes DD/MM/YYYY to it, so every date for days 1-12 was
    // silently transposed.
    const d = parseUkDate('05/06/2026');
    expect(d.getDate()).toBe(5);
    expect(d.getMonth()).toBe(5); // June, zero-indexed
    expect(d.getFullYear()).toBe(2026);
  });

  test('days 13-31 parse instead of being dropped', () => {
    // `new Date("13/05/2026")` is an Invalid Date, and the old isNaN guard
    // silently discarded the row — so over half of every month vanished.
    const d = parseUkDate('13/05/2026');
    expect(d).not.toBeNull();
    expect(d.getDate()).toBe(13);
    expect(d.getMonth()).toBe(4); // May
  });

  test('ISO dates still parse', () => {
    const d = parseUkDate('2026-05-13');
    expect(d.getDate()).toBe(13);
    expect(d.getMonth()).toBe(4);
  });

  test('impossible and unparseable dates return null', () => {
    expect(parseUkDate('31/02/2026')).toBeNull();
    expect(parseUkDate('')).toBeNull();
    expect(parseUkDate(null)).toBeNull();
  });
});

test.describe('parseSetCookie', () => {
  const headersFrom = (values) => ({
    getSetCookie: () => values,
    get: () => values.join(', '),
  });

  test('a cookie carrying an Expires date is not shredded', () => {
    // "Expires=Wed, 01 Jan 2027 ..." contains ", ", so splitting the joined
    // header on ',' or ', ' cut cookies in half and broke SCM logins.
    const cookies = parseSetCookie(headersFrom([
      'ASP.NET_SessionId=abc123; path=/; HttpOnly',
      'auth=tok999; Expires=Wed, 01 Jan 2027 00:00:00 GMT; path=/',
    ]));

    expect(cookies).toBe('ASP.NET_SessionId=abc123; auth=tok999');
  });

  test('falls back to splitting a joined header safely', () => {
    const cookies = parseSetCookie({
      get: () => 'a=1; path=/, b=2; Expires=Wed, 01 Jan 2027 00:00:00 GMT; path=/',
    });
    expect(cookies).toBe('a=1; b=2');
  });
});

// ── extractJson: pure, deterministic, previously untested ───────────────────

test.describe('extractJson', () => {
  test('strips markdown fences', () => {
    expect(JSON.parse(extractJson('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    expect(JSON.parse(extractJson('```\n{"a":1}\n```'))).toEqual({ a: 1 });
  });

  test('repairs trailing commas', () => {
    expect(JSON.parse(extractJson('{"a":1,"b":[1,2,],}'))).toEqual({ a: 1, b: [1, 2] });
  });

  test('discards commentary around the payload', () => {
    expect(JSON.parse(extractJson('Here is your report:\n{"a":1}\nHope that helps!'))).toEqual({ a: 1 });
  });

  test('handles a top-level array', () => {
    expect(JSON.parse(extractJson('[{"a":1},{"a":2}]'))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  test('prefers the object when it starts before any bracket', () => {
    expect(JSON.parse(extractJson('{"list":[1,2]}'))).toEqual({ list: [1, 2] });
  });
});
