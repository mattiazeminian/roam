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
