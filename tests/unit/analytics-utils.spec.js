import { test, expect } from '@playwright/test';
import {
  timeToSeconds, normalizeName, generateNameAliases, getPreferredName,
  normalizeEvent, getWeekKey, toLocalISO, isGalaDate, getSessionDuration,
  isShutdownDate, isExemptDate,
} from '../../lib/analytics-utils.js';

test.describe('timeToSeconds', () => {
  test('parses M:SS.hh', () => expect(timeToSeconds('1:02.34')).toBeCloseTo(62.34, 2));
  test('parses SS.hh', () => expect(timeToSeconds('28.75')).toBeCloseTo(28.75, 2));
  test('strips junk characters', () => expect(timeToSeconds(' 1:02.34* ')).toBeCloseTo(62.34, 2));
  test('returns 0 for empty/null/non-string', () => {
    expect(timeToSeconds('')).toBe(0);
    expect(timeToSeconds(null)).toBe(0);
    expect(timeToSeconds(62.3)).toBe(0);
  });
});

test.describe('normalizeName', () => {
  test('"Last, First" equals "First Last"', () => {
    expect(normalizeName('Day, William')).toBe(normalizeName('William Day'));
  });
  test('parenthetical alias removed', () => {
    expect(normalizeName('Leong Chiu (James) Wong')).toBe(normalizeName('Leong Chiu Wong'));
  });
  test('accents stripped, case-insensitive', () => {
    expect(normalizeName('José García')).toBe(normalizeName('jose garcia'));
  });
  test('word order irrelevant (sorted)', () => {
    expect(normalizeName('William Day')).toBe(normalizeName('Day William'));
  });
  test('empty input', () => expect(normalizeName(null)).toBe(''));
});

test.describe('generateNameAliases', () => {
  test('includes known_as and legal first name variants', () => {
    // KNOWN BUG (lib/analytics-utils.js:53-54): for "First Last" names the
    // lastName fallback grabs the WHOLE full_name, producing "Will William Day"
    // instead of "Will Day" — alias matching never works for SCM-format names.
    test.fail();
    const aliases = generateNameAliases({ full_name: 'William Day', known_as: 'Will', legal_first_name: 'William' });
    expect(aliases).toContain(normalizeName('William Day'));
    expect(aliases).toContain(normalizeName('Will Day'));
  });
  test('null swimmer -> empty array', () => expect(generateNameAliases(null)).toEqual([]));
});

test.describe('getPreferredName', () => {
  test('uses known_as with last name', () => {
    expect(getPreferredName({ full_name: 'William Day', known_as: 'Will' })).toBe('Will Day');
  });
  test('handles "Last, First" full_name', () => {
    expect(getPreferredName({ full_name: 'Day, William', known_as: 'Will' })).toBe('Will Day');
  });
  test('falls back to full_name', () => {
    expect(getPreferredName({ full_name: 'William Day' })).toBe('William Day');
  });
});

test.describe('normalizeEvent', () => {
  test('strokes abbreviate consistently', () => {
    expect(normalizeEvent('100m Freestyle')).toBe(normalizeEvent('100 Free'));
    expect(normalizeEvent('50m Butterfly')).toBe(normalizeEvent('50 Fly'));
    expect(normalizeEvent('200m Individual Medley')).toBe(normalizeEvent('200 IM'));
  });
  test('event prefixes and age ranges stripped', () => {
    expect(normalizeEvent('Event 12 Boys 100m Freestyle')).toBe(normalizeEvent('100 Free'));
    expect(normalizeEvent('Girls 12-13 50m Backstroke')).toBe(normalizeEvent('50 Back'));
  });
  test('"N Year Olds" stripped', () => {
    expect(normalizeEvent('9 Year Olds 50m Breaststroke')).toBe(normalizeEvent('50 Breast'));
  });
  test('course markers stripped', () => {
    expect(normalizeEvent('100m Freestyle LC')).toBe(normalizeEvent('100 Free'));
  });
});

test.describe('getWeekKey', () => {
  test('maps any weekday to its Monday', () => {
    // 2026-07-08 is a Wednesday; week starts Monday 2026-07-06
    expect(getWeekKey('2026-07-08')).toBe('W-2026-07-06');
    expect(getWeekKey('2026-07-06')).toBe('W-2026-07-06');
    expect(getWeekKey('2026-07-12')).toBe('W-2026-07-06'); // Sunday belongs to preceding Monday
  });
  test('no UTC backshift on date strings', () => {
    expect(getWeekKey('2026-01-05')).toBe('W-2026-01-05'); // a Monday stays its own Monday
  });
});

test.describe('toLocalISO', () => {
  test('passes through YYYY-MM-DD strings untouched', () => {
    expect(toLocalISO('2026-07-08')).toBe('2026-07-08');
    expect(toLocalISO('2026-07-08T23:30:00Z')).toBe('2026-07-08');
  });
  test('formats Date objects in local time', () => {
    expect(toLocalISO(new Date(2026, 6, 8))).toBe('2026-07-08');
  });
  test('empty input', () => expect(toLocalISO(null)).toBe(''));
});

test.describe('isGalaDate', () => {
  const results = [
    { swimmer_id: 's1', date: '2026-05-10', meets: null },
    { swimmer_id: 's2', date: '2026-05-01', meets: { date: '2026-05-01', end_date: '2026-05-03' } },
  ];
  test('single-day result matches its date only', () => {
    expect(isGalaDate('2026-05-10', 's1', results)).toBe(true);
    expect(isGalaDate('2026-05-11', 's1', results)).toBe(false);
  });
  test('multi-day meet matches whole range', () => {
    expect(isGalaDate('2026-05-02', 's2', results)).toBe(true);
    expect(isGalaDate('2026-05-04', 's2', results)).toBe(false);
  });
  test('other swimmer does not match', () => {
    expect(isGalaDate('2026-05-10', 's2', results)).toBe(false);
  });
});

test.describe('getSessionDuration', () => {
  test('start/end times', () => {
    expect(getSessionDuration({ start_time: '18:00', end_time: '19:30', name: 'x' })).toBeCloseTo(1.5, 2);
  });
  test('hours in name', () => {
    expect(getSessionDuration({ name: 'Gold (2 hours)' })).toBe(2);
  });
  test('minutes in name', () => {
    expect(getSessionDuration({ name: 'Sprint (45 min)' })).toBeCloseTo(0.75, 2);
  });
  test('time range in name', () => {
    expect(getSessionDuration({ name: 'Evening 19:00 - 21:00' })).toBeCloseTo(2, 2);
  });
  test('fallback default 1.5h', () => {
    expect(getSessionDuration({ name: 'Mystery session' })).toBe(1.5);
  });
});

test.describe('isShutdownDate / isExemptDate', () => {
  const exemptions = [
    { name: 'Club-wide', start_date: '2026-08-25', end_date: '2026-08-31', type: 'exempt', squad_id: null },
    { name: 'Squad only', start_date: '2026-09-01', end_date: '2026-09-07', type: 'exempt', squad_id: 'squad-A' },
  ];
  test('date inside club-wide range matches', () => {
    expect(isShutdownDate('2026-08-27', exemptions)?.name).toBe('Club-wide');
    expect(isExemptDate('2026-08-27', exemptions)).toBe(true);
  });
  test('date outside all ranges does not match', () => {
    expect(isShutdownDate('2026-08-24', exemptions)).toBeNull();
  });
  test('squad-specific exemption only applies to that squad', () => {
    expect(isShutdownDate('2026-09-03', exemptions, 'squad-A')?.name).toBe('Squad only');
    expect(isShutdownDate('2026-09-03', exemptions, 'squad-B')).toBeNull();
  });
});
