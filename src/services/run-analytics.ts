/**
 * Run history analytics (#44).
 *
 * Small, pure summaries over saved runs — totals and a recent window. Nothing
 * here is a score, a streak or a comparison against anyone else; it answers
 * only "how much have I actually run?".
 *
 * Everything takes `nowMs` explicitly so the results are deterministic and
 * testable rather than depending on the clock at import time.
 */

import type { SavedRun } from './run-session';
import { addDays, toDateKey, weekStartFor } from './training';

const DAY_MS = 86_400_000;

/** The recent window used by the overview. */
export const RECENT_WINDOW_DAYS = 30;

export type RunOverview = {
  count: number;
  totalMeters: number;
  /** Runs inside the recent window. */
  recentCount: number;
  recentMeters: number;
  recentWindowDays: number;
};

function meters(run: SavedRun): number {
  return run.distanceKm * 1000;
}

/** Totals across all saved runs, plus the last `RECENT_WINDOW_DAYS`. */
export function summarizeRuns(
  runs: SavedRun[],
  nowMs: number,
  windowDays: number = RECENT_WINDOW_DAYS,
): RunOverview {
  const cutoff = nowMs - windowDays * DAY_MS;

  let totalMeters = 0;
  let recentCount = 0;
  let recentMeters = 0;

  for (const run of runs) {
    const distance = meters(run);
    totalMeters += distance;
    if (run.startedAt >= cutoff) {
      recentCount += 1;
      recentMeters += distance;
    }
  }

  return {
    count: runs.length,
    totalMeters,
    recentCount,
    recentMeters,
    recentWindowDays: windowDays,
  };
}

export type RunPeriod = 'all' | '30d' | '90d';

export type RunPeriodOption = {
  id: RunPeriod;
  /** Short label for the filter control. */
  label: string;
  /** Null means no cutoff. */
  days: number | null;
};

export const RUN_PERIODS: readonly RunPeriodOption[] = [
  { id: 'all', label: 'All', days: null },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
];

/**
 * Runs inside the chosen period, preserving the order given (History passes
 * newest first). A run exactly on the cutoff is included — the boundary is
 * inclusive, so "30 days" never silently drops a run from 30 days ago.
 */
export function filterRunsByPeriod(
  runs: SavedRun[],
  period: RunPeriod,
  nowMs: number,
): SavedRun[] {
  const option = RUN_PERIODS.find((candidate) => candidate.id === period);
  if (!option || option.days === null) {
    return runs;
  }
  const cutoff = nowMs - option.days * DAY_MS;
  return runs.filter((run) => run.startedAt >= cutoff);
}

/**
 * Distance a single shoe has covered, from the runs attributed to it (#112).
 *
 * A plain sum of recorded distance — never an estimate, and a shoe with no
 * attributed runs is zero, not a number borrowed from somewhere else.
 */
export function shoeMileageMeters(shoeId: string, runs: SavedRun[]): number {
  let total = 0;
  for (const run of runs) {
    if (run.shoeId === shoeId) {
      total += run.distanceKm * 1000;
    }
  }
  return total;
}

/**
 * Consecutive calendar weeks, ending with the current one, that contain at
 * least one recorded run.
 *
 * The current week not having a run yet does not break a streak — it simply
 * has not extended it. This is a plain count of what happened, not a game: no
 * badges, no "don't break it" copy, and it is derived from recorded runs only.
 */
export function weeklyRunStreak(runs: SavedRun[], todayKey: string): number {
  if (runs.length === 0) {
    return 0;
  }

  const weeksWithRuns = new Set(
    runs.map((run) => weekStartFor(toDateKey(new Date(run.startedAt)))),
  );

  let week = weekStartFor(todayKey);
  if (!weeksWithRuns.has(week)) {
    week = addDays(week, -7);
  }

  let streak = 0;
  while (weeksWithRuns.has(week)) {
    streak += 1;
    week = addDays(week, -7);
  }
  return streak;
}

/**
 * How close in distance another run must be to count as comparable. A window
 * that widens with the run's own distance, with a floor, so a 5 km run is not
 * compared against a 20 km one and a 1 km run is not compared against nothing.
 */
const COMPARABLE_DISTANCE_FRACTION = 0.25;
const COMPARABLE_MIN_WINDOW_METERS = 1000;

/** Only the most recent few comparable runs are averaged. */
const COMPARABLE_MAX_RUNS = 5;

export type RecentComparison = {
  /** How many earlier runs the comparison is against. */
  comparedCount: number;
  /** This run's pace minus the comparable average, min/km. Negative is faster. */
  paceDeltaMinPerKm: number | null;
  /** This run's distance minus the comparable average, km. */
  distanceDeltaKm: number;
};

/**
 * A light comparison of one run against the runner's own recent, similar runs
 * (#42).
 *
 * Returns null when there is nothing comparable — absence is shown as nothing,
 * never as a comparison against a fabricated or global baseline. `runs` is
 * expected newest-first; only the most recent comparable few are used.
 */
export function compareRunToRecent(run: SavedRun, runs: SavedRun[]): RecentComparison | null {
  const target = meters(run);
  const tolerance = Math.max(COMPARABLE_MIN_WINDOW_METERS, target * COMPARABLE_DISTANCE_FRACTION);

  const comparables = runs
    .filter((other) => other.id !== run.id)
    .filter((other) => Math.abs(meters(other) - target) <= tolerance)
    .slice(0, COMPARABLE_MAX_RUNS);

  if (comparables.length === 0) {
    return null;
  }

  const distanceAvgKm =
    comparables.reduce((sum, other) => sum + other.distanceKm, 0) / comparables.length;

  const paced = comparables.filter(
    (other): other is SavedRun & { averagePaceMinPerKm: number } =>
      other.averagePaceMinPerKm !== null,
  );
  const paceAvgMinPerKm =
    paced.length > 0
      ? paced.reduce((sum, other) => sum + other.averagePaceMinPerKm, 0) / paced.length
      : null;

  return {
    comparedCount: comparables.length,
    paceDeltaMinPerKm:
      paceAvgMinPerKm !== null && run.averagePaceMinPerKm !== null
        ? run.averagePaceMinPerKm - paceAvgMinPerKm
        : null,
    distanceDeltaKm: run.distanceKm - distanceAvgKm,
  };
}

export type WeeklyRunSummary = {
  /** The Sunday that starts the week. */
  weekStart: string;
  /** The Saturday that ends it. */
  weekEnd: string;
  runCount: number;
  meters: number;
  seconds: number;
};

/**
 * What the runner actually ran in one week (#76): sessions, distance and time,
 * derived only from recorded runs. Week boundaries are Sunday–Saturday, the
 * same as everywhere else. No calories, no load, no interpretation.
 */
export function weeklyRunSummary(runs: SavedRun[], weekStart: string): WeeklyRunSummary {
  const weekEnd = addDays(weekStart, 6);
  let runCount = 0;
  let meters = 0;
  let seconds = 0;

  for (const run of runs) {
    const day = toDateKey(new Date(run.startedAt));
    if (day < weekStart || day > weekEnd) {
      continue;
    }
    runCount += 1;
    meters += run.distanceKm * 1000;
    seconds += run.durationSeconds;
  }

  return { weekStart, weekEnd, runCount, meters, seconds };
}

export type WeekPoint = {
  /** The Sunday that starts the week. */
  weekStart: string;
  meters: number;
  seconds: number;
  count: number;
};

/**
 * Distance and time per week over the last `weeks` weeks, oldest first (#101,
 * #117). Weeks with nothing are zeroes, not gaps, so a chart can show a rest
 * week as a rest week. Derived from recorded runs only.
 */
export function weeklyDistanceSeries(
  runs: SavedRun[],
  nowMs: number,
  weeks = 8,
): WeekPoint[] {
  const currentWeek = weekStartFor(toDateKey(new Date(nowMs)));
  const points: WeekPoint[] = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    points.push({ weekStart: addDays(currentWeek, -7 * index), meters: 0, seconds: 0, count: 0 });
  }
  const byWeek = new Map(points.map((point, index) => [point.weekStart, index]));

  for (const run of runs) {
    const index = byWeek.get(weekStartFor(toDateKey(new Date(run.startedAt))));
    if (index === undefined) {
      continue;
    }
    points[index].meters += run.distanceKm * 1000;
    points[index].seconds += run.durationSeconds;
    points[index].count += 1;
  }

  return points;
}

export type PaceTrend = {
  /** Average pace over the current window, or null when there is no usable data. */
  currentMinPerKm: number | null;
  /** Average pace over the window before it, or null. */
  previousMinPerKm: number | null;
  currentCount: number;
  previousCount: number;
  windowDays: number;
};

/**
 * Average pace over the last window versus the one before it (#101).
 *
 * A plain average of recorded paces; runs without a usable pace are excluded,
 * and an absent window stays null rather than borrowing a number. No
 * performance claim is made — the caller decides how to state the difference.
 */
export function paceTrend(
  runs: SavedRun[],
  nowMs: number,
  windowDays = RECENT_WINDOW_DAYS,
): PaceTrend {
  const currentCutoff = nowMs - windowDays * DAY_MS;
  const previousCutoff = currentCutoff - windowDays * DAY_MS;

  const paced = runs.filter(
    (run): run is SavedRun & { averagePaceMinPerKm: number } => run.averagePaceMinPerKm !== null,
  );
  const average = (list: (SavedRun & { averagePaceMinPerKm: number })[]) =>
    list.length > 0
      ? list.reduce((sum, run) => sum + run.averagePaceMinPerKm, 0) / list.length
      : null;

  const current = paced.filter((run) => run.startedAt >= currentCutoff);
  const previous = paced.filter(
    (run) => run.startedAt >= previousCutoff && run.startedAt < currentCutoff,
  );

  return {
    currentMinPerKm: average(current),
    previousMinPerKm: average(previous),
    currentCount: current.length,
    previousCount: previous.length,
    windowDays,
  };
}

export type DayBucket = {
  date: string;
  meters: number;
  seconds: number;
};

/**
 * One bucket per day of a week, from recorded runs only.
 *
 * This is what a week actually looked like, day by day — the shape Strava and
 * Nike Run Club both lead with. Days with nothing are zeroes rather than
 * missing, so a chart can show a rest day as a rest day.
 */
export function weekDayBuckets(runs: SavedRun[], weekStart: string): DayBucket[] {
  const buckets: DayBucket[] = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(weekStart, index),
    meters: 0,
    seconds: 0,
  }));
  const byDate = new Map(buckets.map((bucket, index) => [bucket.date, index]));

  for (const run of runs) {
    const index = byDate.get(toDateKey(new Date(run.startedAt)));
    if (index === undefined) {
      continue;
    }
    buckets[index].meters += run.distanceKm * 1000;
    buckets[index].seconds += run.durationSeconds;
  }

  return buckets;
}
