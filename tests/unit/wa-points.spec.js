import { test, expect } from '@playwright/test';
import { timeToSeconds, calculateWAPoints, getNormalizedWA, BASE_TIMES_2024 } from '../../lib/wa-points.js';

test.describe('wa-points timeToSeconds', () => {
  test('parses both formats', () => {
    expect(timeToSeconds('1:02.34')).toBeCloseTo(62.34, 2);
    expect(timeToSeconds('28.75')).toBeCloseTo(28.75, 2);
  });
});

test.describe('calculateWAPoints', () => {
  test('swimming exactly the base time scores 1000', () => {
    const base = BASE_TIMES_2024.SCM.M['100 Free'];
    expect(calculateWAPoints(base, '100 Free', 'M', 'SCM')).toBe(1000);
  });
  test('slower time scores fewer points, monotonic', () => {
    const base = BASE_TIMES_2024.SCM.F['100 Free'];
    const p1 = calculateWAPoints(base * 1.1, '100 Free', 'F', 'SCM');
    const p2 = calculateWAPoints(base * 1.3, '100 Free', 'F', 'SCM');
    expect(p1).toBeGreaterThan(p2);
    expect(p1).toBeLessThan(1000);
  });
  test('event name normalization: "100m Freestyle" matches table', () => {
    const a = calculateWAPoints('60.00', '100m Freestyle', 'M', 'SCM');
    const b = calculateWAPoints('60.00', '100 Free', 'M', 'SCM');
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
  test('unknown event or course returns 0', () => {
    expect(calculateWAPoints('60.00', '100 Doggy Paddle', 'M', 'SCM')).toBe(0);
    expect(calculateWAPoints('60.00', '100 Free', 'M', 'XXX')).toBe(0);
  });
  test('invalid time returns 0', () => {
    expect(calculateWAPoints('', '100 Free', 'M', 'SCM')).toBe(0);
  });
});

test.describe('getNormalizedWA (Vorontsov smoothing)', () => {
  test('disabled -> passthrough', () => {
    expect(getNormalizedWA(500, 12, 'F', false)).toBe(500);
  });
  test('girls 10-13 reduced 10%', () => {
    expect(getNormalizedWA(500, 12, 'F', true)).toBe(450);
  });
  test('boys 12-14 boosted 10%', () => {
    expect(getNormalizedWA(500, 13, 'M', true)).toBe(550);
  });
  test('outside PHV window unchanged', () => {
    expect(getNormalizedWA(500, 16, 'F', true)).toBe(500);
    expect(getNormalizedWA(500, 10, 'M', true)).toBe(500);
  });
});
