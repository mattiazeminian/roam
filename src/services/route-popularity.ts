/**
 * Route popularity signals (#15).
 *
 * "Popular" here means one thing only: how many times *the runner themselves*
 * have finished this route. That is the only real signal that exists without a
 * backend — selections are ephemeral and saving a route is intent, not evidence
 * that anyone ran it. Labelling it as anything broader ("popular nearby", "N
 * people run this") would be inventing data, which is exactly what this feature
 * must not do.
 *
 * Counting saved runs by their planned route is what makes the cloud step
 * possible later (#22): once runs sync, the same identity keys can be tallied
 * across devices without changing this shape.
 */

import { routeIdentity } from './route-identity';
import type { SavedRun } from './run-session';
import { listRuns } from './run-storage';

/**
 * Finishing a route twice already says something a single run does not, and it
 * keeps a first-time route from being marked at all.
 */
export const MIN_RUNS_FOR_POPULARITY = 2;

export type RoutePopularity = ReadonlyMap<string, number>;

/** How many saved runs each route identity has. Runs without a plan are skipped. */
export function countRunsByRoute(runs: SavedRun[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const run of runs) {
    if (!run.route) {
      continue;
    }
    const identity = routeIdentity(run.route);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
}

/**
 * The label for a count, or null when there is nothing real to say. Wording is
 * deliberately first-person: the count is the runner's own history, and it must
 * not read as other people's activity.
 */
export function popularityLabel(count: number): string | null {
  if (count < MIN_RUNS_FOR_POPULARITY) {
    return null;
  }
  return count === 2 ? "You've run this twice" : `You've run this ${count} times`;
}

/** The runner's own tally, read from saved runs. */
export async function loadRoutePopularity(): Promise<RoutePopularity> {
  return countRunsByRoute(await listRuns());
}
