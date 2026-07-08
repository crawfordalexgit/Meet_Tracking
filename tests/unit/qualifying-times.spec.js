import { test, expect } from '@playwright/test';
import { getBenchmarks, getKentBenchmark, getCategoryBenchmark, getBenchmarkTable } from '../../lib/qualifying-times.js';

test.describe('getBenchmarks', () => {
  test('returns numeric SC/LC auto+cons times for a standard lookup', () => {
    const bm = getBenchmarks(13, 'M', '100 Free', 'COUNTY');
    expect(bm).not.toBeNull();
    for (const k of ['autoSC', 'autoLC', 'consSC', 'consLC']) {
      expect(bm[k]).toBeGreaterThan(0);
    }
  });
  test('age clamped: 9-year-old uses minimum age standards, 25 uses 17', () => {
    expect(getBenchmarks(9, 'F', '50 Free', 'COUNTY')).toEqual(getBenchmarks(11, 'F', '50 Free', 'COUNTY'));
    expect(getBenchmarks(25, 'F', '50 Free', 'COUNTY')).toEqual(getBenchmarks(17, 'F', '50 Free', 'COUNTY'));
  });
  test('REGIONAL minimum age is 12', () => {
    expect(getBenchmarks(10, 'M', '100 Free', 'REGIONAL')).toEqual(getBenchmarks(12, 'M', '100 Free', 'REGIONAL'));
  });
  test('gender defaults to F for unknown strings', () => {
    expect(getBenchmarks(13, 'X', '100 Free')).toEqual(getBenchmarks(13, 'F', '100 Free'));
  });
  test('unknown event returns null', () => {
    expect(getBenchmarks(13, 'M', '100 Doggy Paddle')).toBeNull();
  });
  test('faster standard at older age (sanity of data)', () => {
    const b12 = getBenchmarks(12, 'M', '100 Free', 'COUNTY');
    const b16 = getBenchmarks(16, 'M', '100 Free', 'COUNTY');
    expect(b16.autoSC).toBeLessThan(b12.autoSC);
  });
});

test.describe('getKentBenchmark', () => {
  test('young/missing age returns floor of 250', () => {
    expect(getKentBenchmark(9, 'M', '100 Free')).toBe(250);
    expect(getKentBenchmark(null, 'M', '100 Free')).toBe(250);
  });
  test('valid lookup returns positive points', () => {
    expect(getKentBenchmark(13, 'F', '100 Free')).toBeGreaterThan(0);
  });
});

test.describe('getCategoryBenchmark', () => {
  test('stroke keyword produces averaged points', () => {
    expect(getCategoryBenchmark(13, 'M', 'Free')).toBeGreaterThan(0);
  });
  test('full event name with digits normalizes', () => {
    expect(getCategoryBenchmark(13, 'M', '100m Freestyle')).toBeGreaterThan(0);
  });
});

test.describe('getBenchmarkTable', () => {
  test('returns rows for valid gender/level', () => {
    const table = getBenchmarkTable('M', 'COUNTY');
    expect(table.length).toBeGreaterThan(0);
    expect(table[0]).toHaveProperty('event');
  });
  test('unknown level returns empty array', () => {
    expect(getBenchmarkTable('M', 'GALACTIC')).toEqual([]);
  });
});
