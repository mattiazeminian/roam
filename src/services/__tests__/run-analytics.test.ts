/**
 * Tests for run history analytics (#44).
 *
 * The point of these summaries is trust: totals must count every saved run, and
 * the recent window must not silently drop a run on the boundary. `nowMs` is
 * always passed explicitly so nothing depends on the wall clock.
 */
import { describe, expect, test } from '@jest/globals';

import {
  compareRunToRecent,
  paceTrend,
  RECENT_WINDOW_DAYS,
  shoeMileageMeters,
  weekDayBuckets,
  weeklyDistanceSeries,
  weeklyRunStreak,
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

describe('weeklyRunStreak (#114)', () => {
  // 2026-09-23 is a Wednesday, so its week runs Sunday 20th → Saturday 26th.
  const TODAY = '2026-09-23';
  const TODAY_MS = new Date(2026, 8, 23, 12).getTime();

  function runAt(daysAgo: number, id: string): SavedRun {
    return { ...run(0, 5, id), startedAt: TODAY_MS - daysAgo * DAY_MS };
  }

  test('is zero with no runs', () => {
    expect(weeklyRunStreak([], TODAY)).toBe(0);
  });

  test('counts consecutive weeks that contain a run', () => {
    expect(weeklyRunStreak([runAt(0, 'this'), runAt(7, 'last')], TODAY)).toBe(2);
  });

  test('a gap ends the streak', () => {
    // This week and two weeks ago, but nothing last week.
    expect(weeklyRunStreak([runAt(0, 'this'), runAt(14, 'older')], TODAY)).toBe(1);
  });

  test('a week with no run yet does not break an existing streak', () => {
    // Nothing this week, but the last two weeks were run.
    expect(weeklyRunStreak([runAt(7, 'last'), runAt(14, 'older')], TODAY)).toBe(2);
  });
});

describe('weekDayBuckets (#114)', () => {
  const WEEK_START = '2026-09-20';
  const WEEK_MS = new Date(2026, 8, 20, 9).getTime();

  test('is seven days, most of them empty', () => {
    expect(weekDayBuckets([], WEEK_START)).toHaveLength(7);
    expect(weekDayBuckets([], WEEK_START).every((day) => day.meters === 0)).toBe(true);
  });

  test('adds runs to the day they happened, and ignores other weeks', () => {
    const runs = [
      { ...run(0, 5, 'tue'), startedAt: WEEK_MS },
      { ...run(0, 3, 'tue2'), startedAt: WEEK_MS + 3600_000 },
      { ...run(0, 8, 'sat'), startedAt: WEEK_MS + 4 * 86_400_000 },
      { ...run(0, 9, 'last-week'), startedAt: WEEK_MS - 7 * 86_400_000 },
    ];
    const buckets = weekDayBuckets(runs, WEEK_START);
    expect(buckets[0].meters).toBeCloseTo(8000, 0); // Sunday
    expect(buckets[4].meters).toBeCloseTo(8000, 0); // Thursday (index 4)
    expect(buckets.reduce((total, day) => total + day.meters, 0)).toBeCloseTo(16000, 0);
  });
});

describe('shoeMileageMeters (#112)', () => {
  test('sums only the runs attributed to a shoe, and is zero for the rest', () => {
    const runs = [
      { ...run(0, 5, 'a'), shoeId: 'shoe-1' },
      { ...run(1, 3.5, 'b'), shoeId: 'shoe-1' },
      { ...run(2, 8, 'c'), shoeId: 'shoe-2' },
      run(3, 10, 'd'),
    ];
    expect(shoeMileageMeters('shoe-1', runs)).toBeCloseTo(8500, 0);
    expect(shoeMileageMeters('shoe-2', runs)).toBeCloseTo(8000, 0);
    expect(shoeMileageMeters('shoe-none', runs)).toBe(0);
    expect(shoeMileageMeters('shoe-1', [])).toBe(0);
  });
});

describe('compareRunToRecent (#42)', () => {
  function withPace(base: SavedRun, pace: number): SavedRun {
    return { ...base, averagePaceMinPerKm: pace };
  }

  test('returns null when there is nothing comparable', () => {
    const target = run(0, 5, 'target');
    const others = [run(1, 21, 'long'), run(2, 0.5, 'short')];
    expect(compareRunToRecent(target, others)).toBeNull();
  });

  test('compares only against runs within the distance window', () => {
    const target = run(0, 5, 'target');
    const others = [
      withPace(run(1, 5.2, 'near'), 6.5),
      withPace(run(2, 21, 'far'), 5),
    ];
    const comparison = compareRunToRecent(target, others);
    expect(comparison?.comparedCount).toBe(1);
    // Target pace 6 vs comparable 6.5 → 0.5 min/km faster (negative).
    expect(comparison?.paceDeltaMinPerKm).toBeCloseTo(-0.5, 3);
  });

  test('never includes the run itself', () => {
    const target = run(0, 5, 'target');
    const comparison = compareRunToRecent(target, [target]);
    expect(comparison).toBeNull();
  });

  test('withholds a pace delta when the run has no usable pace', () => {
    const target = { ...run(0, 5, 'target'), averagePaceMinPerKm: null };
    const others = [withPace(run(1, 5.2, 'near'), 6.5)];
    const comparison = compareRunToRecent(target, others);
    expect(comparison?.paceDeltaMinPerKm).toBeNull();
    expect(comparison?.distanceDeltaKm).toBeCloseTo(5 - 5.2, 3);
  });

  test('uses at most the five most recent comparable runs', () => {
    const target = run(0, 5, 'target');
    const others = Array.from({ length: 8 }, (_, i) => withPace(run(i + 1, 5, `r${i}`), 6));
    expect(compareRunToRecent(target, others)?.comparedCount).toBe(5);
  });
});

describe('weeklyDistanceSeries (#101)', () => {
  test('returns one zeroed point per week, oldest first', () => {
    const series = weeklyDistanceSeries([], NOW, 4);
    expect(series).toHaveLength(4);
    expect(series.every((point) => point.meters === 0 && point.count === 0)).toBe(true);
    // Oldest first: each week start is seven days after the previous.
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i].weekStart > series[i - 1].weekStart).toBe(true);
    }
  });

  test('buckets runs into the week they started in', () => {
    const series = weeklyDistanceSeries([run(0, 5, 'a'), run(1, 3, 'b'), run(20, 4, 'c')], NOW, 4);
    // All three fall inside the four-week window (NOW is a Tuesday).
    const total = series.reduce((sum, point) => sum + point.meters, 0);
    expect(total).toBeCloseTo(12_000, 0);
    // Today and yesterday are the same week.
    const current = series[series.length - 1];
    expect(current.count).toBe(2);
    expect(current.meters).toBeCloseTo(8000, 0);

    // A run outside the window is excluded entirely.
    const short = weeklyDistanceSeries([run(0, 5, 'a'), run(40, 9, 'old')], NOW, 4);
    expect(short.reduce((sum, point) => sum + point.meters, 0)).toBeCloseTo(5000, 0);
  });
});

describe('paceTrend (#101)', () => {
  function paced(daysAgo: number, pace: number, id: string): SavedRun {
    return { ...run(daysAgo, 5, id), averagePaceMinPerKm: pace };
  }

  test('averages the current window and the one before it', () => {
    const trend = paceTrend([paced(1, 6, 'a'), paced(2, 6, 'b'), paced(40, 7, 'c'), paced(50, 7, 'd')], NOW);
    expect(trend.currentMinPerKm).toBeCloseTo(6, 3);
    expect(trend.previousMinPerKm).toBeCloseTo(7, 3);
    expect(trend.currentCount).toBe(2);
    expect(trend.previousCount).toBe(2);
  });

  test('an absent previous window is null, never borrowed', () => {
    const trend = paceTrend([paced(1, 6, 'a')], NOW);
    expect(trend.currentMinPerKm).toBeCloseTo(6, 3);
    expect(trend.previousMinPerKm).toBeNull();
  });

  test('runs without a usable pace are excluded', () => {
    const noPace = { ...run(1, 5, 'x'), averagePaceMinPerKm: null };
    const trend = paceTrend([paced(1, 6, 'a'), noPace], NOW);
    expect(trend.currentCount).toBe(1);
    expect(trend.currentMinPerKm).toBeCloseTo(6, 3);
  });

  test('null when there is no data at all', () => {
    const trend = paceTrend([], NOW);
    expect(trend.currentMinPerKm).toBeNull();
    expect(trend.previousMinPerKm).toBeNull();
  });
});
