import { test, expect } from '@playwright/test';
import {
  SUGGESTED_TERM_EXCLUSIONS, toDateKey, daysInclusive, normaliseExclusions,
  isExcluded, partitionByTerm, exclusionsInWindow, termSpanOf, describeBasis
} from '../../lib/term-dates.js';

const SUMMER = { from: '2026-07-20', to: '2026-08-30', label: 'Summer holidays' };
const EASTER = { from: '2026-03-30', to: '2026-04-17', label: 'Easter holidays' };

test.describe('reading a date', () => {
  test('takes the date off a timestamp and refuses anything else', () => {
    expect(toDateKey('2026-07-21')).toBe('2026-07-21');
    expect(toDateKey('2026-07-21T19:00:00Z')).toBe('2026-07-21');
    expect(toDateKey('21/07/2026')).toBeNull();
    expect(toDateKey(null)).toBeNull();
    expect(toDateKey('')).toBeNull();
  });

  test('counts days with both ends included', () => {
    // A holiday from Monday to Friday is five days off, not four. Getting this
    // wrong shortens every holiday by a day and quietly lets one back in.
    expect(daysInclusive('2026-02-16', '2026-02-20')).toBe(5);
    expect(daysInclusive('2026-02-16', '2026-02-16')).toBe(1);
    expect(daysInclusive('2026-02-20', '2026-02-16')).toBe(-3);
  });
});

test.describe('normalising what the club recorded', () => {
  test('drops a range that ends before it starts rather than swapping it', () => {
    // A swap would hide a typo that moves every attendance figure on the page.
    const out = normaliseExclusions([{ from: '2026-08-30', to: '2026-07-20' }]);
    expect(out).toEqual([]);
  });

  test('drops unparseable dates and keeps the rest in date order', () => {
    const out = normaliseExclusions([SUMMER, { from: 'soon', to: 'later' }, EASTER]);
    expect(out.map(r => r.from)).toEqual(['2026-03-30', '2026-07-20']);
  });

  test('a range with no label still gets one', () => {
    expect(normaliseExclusions([{ from: '2026-07-20', to: '2026-07-21' }])[0].label)
      .toBe('School holiday');
  });

  test('survives junk without throwing', () => {
    expect(normaliseExclusions(null)).toEqual([]);
    expect(normaliseExclusions('summer')).toEqual([]);
    expect(normaliseExclusions([null, undefined, 42])).toEqual([]);
  });
});

test.describe('deciding whether a date counts', () => {
  test('both ends of a holiday are inside it', () => {
    expect(isExcluded('2026-07-20', [SUMMER])).toBe(true);
    expect(isExcluded('2026-08-30', [SUMMER])).toBe(true);
    expect(isExcluded('2026-07-19', [SUMMER])).toBe(false);
    expect(isExcluded('2026-08-31', [SUMMER])).toBe(false);
  });

  test('splits registers into term and holiday, keeping both', () => {
    // The holiday side is not waste: "66% in term against 51% in the holidays"
    // is the finding, and it needs both halves.
    const rows = [
      { date: '2026-09-14' }, { date: '2026-08-10' },
      { date: '2026-04-06' }, { date: '2026-09-07' }
    ];
    const { term, holiday } = partitionByTerm(rows, [SUMMER, EASTER]);
    expect(term.map(r => r.date)).toEqual(['2026-09-14', '2026-09-07']);
    expect(holiday.map(r => r.date)).toEqual(['2026-08-10', '2026-04-06']);
  });

  test('a row with no usable date counts as term rather than vanishing', () => {
    const { term, holiday } = partitionByTerm([{ date: null }], [SUMMER]);
    expect(term).toHaveLength(1);
    expect(holiday).toHaveLength(0);
  });
});

test.describe('what a window actually covers', () => {
  test('names only the holidays that fall inside it, clipped to its edges', () => {
    const bites = exclusionsInWindow([SUMMER, EASTER], '2026-08-01', '2026-09-21');
    expect(bites).toHaveLength(1);
    expect(bites[0].from).toBe('2026-08-01');
    expect(bites[0].to).toBe('2026-08-30');
    expect(bites[0].days).toBe(30);
  });

  test('a holiday wholly outside the window is not named', () => {
    expect(exclusionsInWindow([EASTER], '2026-06-23', '2026-09-21')).toEqual([]);
  });

  test('term days are the window less its holidays', () => {
    const span = termSpanOf([SUMMER], '2026-06-23', '2026-09-21');
    expect(span.totalDays).toBe(91);
    expect(span.holidayDays).toBe(42);
    expect(span.termDays).toBe(49);
    expect(span.termWeeks).toBe(7);
  });

  test('overlapping holidays are removed once, not twice', () => {
    // Two ranges recorded over the same fortnight must not delete it twice and
    // leave the term shorter than it is.
    const span = termSpanOf([
      { from: '2026-07-20', to: '2026-08-30', label: 'Summer' },
      { from: '2026-08-03', to: '2026-08-16', label: 'Summer, entered twice' }
    ], '2026-06-23', '2026-09-21');
    expect(span.holidayDays).toBe(42);
    expect(span.termDays).toBe(49);
  });

  test('a window with no exclusions is all term', () => {
    const span = termSpanOf([], '2026-08-24', '2026-09-21');
    expect(span.holidayDays).toBe(0);
    expect(span.termDays).toBe(29);
  });
});

test.describe('saying what was measured', () => {
  test('names every holiday it removed, so the reader can check', () => {
    const s = describeBasis({
      days: 90, termOnly: true, exclusions: [SUMMER],
      from: '2026-06-23', to: '2026-09-21'
    });
    expect(s).toContain('term weeks only');
    expect(s).toContain('7 term weeks');
    expect(s).toContain('Summer holidays (2026-07-20 to 2026-08-30)');
  });

  test('says so plainly when holidays are included', () => {
    const s = describeBasis({
      days: 90, termOnly: false, exclusions: [SUMMER],
      from: '2026-06-23', to: '2026-09-21'
    });
    expect(s).toContain('including school holidays');
    expect(s).not.toContain('term weeks only');
  });

  test('a window clear of holidays says that rather than going silent', () => {
    const s = describeBasis({
      days: 30, termOnly: true, exclusions: [EASTER],
      from: '2026-08-31', to: '2026-09-21'
    });
    expect(s).toContain('No school holidays fall in this window');
  });
});

test.describe('the suggested calendar', () => {
  test('is valid, in order, and non-overlapping', () => {
    const norm = normaliseExclusions(SUGGESTED_TERM_EXCLUSIONS);
    expect(norm).toHaveLength(SUGGESTED_TERM_EXCLUSIONS.length);
    for (let i = 1; i < norm.length; i++) {
      expect(norm[i].from > norm[i - 1].to).toBe(true);
    }
  });

  test('every range is labelled, because the report names them', () => {
    SUGGESTED_TERM_EXCLUSIONS.forEach(r => {
      expect(r.label).toBeTruthy();
      expect(r.label).not.toBe('School holiday');
    });
  });
});

test.describe('nothing is lost by excluding a week', () => {
  test('every row lands on exactly one side, none dropped or duplicated', () => {
    // The guarantee the club is relying on: setting a holiday aside must never
    // be able to lose a register. A split that drops rows would quietly shrink
    // the evidence base while every figure still looked plausible.
    const rows = [];
    for (let d = 1; d <= 28; d++) {
      rows.push({ date: `2026-07-${String(d).padStart(2, '0')}`, status: 'present' });
      rows.push({ date: `2026-08-${String(d).padStart(2, '0')}`, status: 'absent' });
    }
    const { term, holiday } = partitionByTerm(rows, [SUMMER]);
    expect(term.length + holiday.length).toBe(rows.length);
    const seen = new Set([...term, ...holiday]);
    expect(seen.size).toBe(rows.length);
  });

  test('a date on the boundary belongs to the holiday, not to both', () => {
    const rows = [{ date: '2026-07-20' }, { date: '2026-08-30' }, { date: '2026-08-31' }];
    const { term, holiday } = partitionByTerm(rows, [SUMMER]);
    expect(holiday.map(r => r.date)).toEqual(['2026-07-20', '2026-08-30']);
    expect(term.map(r => r.date)).toEqual(['2026-08-31']);
  });

  test('removing a holiday puts its weeks straight back', () => {
    // What the club asked for: delete the range, and those registers count
    // again — no re-sync, because the rows were never touched.
    const rows = [{ date: '2026-08-10' }, { date: '2026-09-14' }];
    expect(partitionByTerm(rows, [SUMMER]).term).toHaveLength(1);
    expect(partitionByTerm(rows, []).term).toHaveLength(2);
  });
});
