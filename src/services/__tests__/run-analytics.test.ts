/**
 * Tests for run history analytics (#44).
 *
 * The point of these summaries is trust: totals must count every saved run, and
 * the recent window must not silently drop a run on the boundary. `nowMs` is
 * always passed explicitly so nothing depends on the wall clock.
 */
import { describe, expect, test } from '@jest/globals';

import {
  RECENT_WINDOW_DAYS,
  filterRunsByPeriod,
  summarizeRuns,
} from '../run-analytics';
import type { SavedRun } from '../run-session';

const DAY_MS = 86_400_000;
const NOW = 1_700_000_000_000;

function run(daysAgo: number, distanceKm: number, id = `run-${daysAgo}-${distanceKm}`): SavedRun {
  return {
    id,
    startedAt: NOW - daysAgo * DAY_MS,
    endedAt: NOW - daysAgo * DAY_MS + 1_800_000,
    route: null,
    targetDistanceKm: distanceKm,
    distanceKm,
    durationSeconds: 1800,
    averagePaceMinPerKm: 6,
    coordinates: [],
    status: 'finished',
  };
}

describe('summarizeRuns (#44)', () => {
  const runs = [
    run(0, 5, 'a'),
    run(29, 3, 'b'),
    run(30, 4, 'c'), // exactly on the cutoff — included
    run(31, 10, 'd'),
    run(100, 8, 'e'),
  ];

  test('totals every saved run', () => {
    const overview = summarizeRuns(runs, NOW);
    expect(overview.count).toBe(5);
    expect(overview.totalMeters).toBeCloseTo(30_000, 0);
  });

  test('counts the recent window inclusively at the boundary', () => {
    const overview = summarizeRuns(runs, NOW);
    expect(overview.recentCount).toBe(3); // a, b, c
    expect(overview.recentMeters).toBeCloseTo(12_000, 0);
    expect(overview.recentWindowDays).toBe(RECENT_WINDOW_DAYS);
  });

  test('is all zeros for no runs', () => {
    expect(summarizeRuns([], NOW)).toMatchObject({
      count: 0,
      totalMeters: 0,
      recentCount: 0,
      recentMeters: 0,
    });
  });

  test('does not count a run before the cutoff as recent', () => {
    const overview = summarizeRuns([run(31, 10, 'old')], NOW);
    expect(overview.count).toBe(1);
    expect(overview.recentCount).toBe(0);
    expect(overview.totalMeters).toBeCloseTo(10_000, 0);
  });
});

describe('filterRunsByPeriod (#44)', () => {
  const runs = [run(0, 5, 'a'), run(29, 3, 'b'), run(30, 4, 'c'), run(31, 10, 'd'), run(100, 8, 'e')];

  test('all returns every run, in order', () => {
    expect(filterRunsByPeriod(runs, 'all', NOW).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  test('30 days keeps the boundary run', () => {
    expect(filterRunsByPeriod(runs, '30d', NOW).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  test('90 days keeps more but not everything', () => {
    expect(filterRunsByPeriod(runs, '90d', NOW).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  test('a period with no qualifying runs is empty, not an error', () => {
    expect(filterRunsByPeriod([run(200, 5, 'ancient')], '30d', NOW)).toEqual([]);
  });
});
