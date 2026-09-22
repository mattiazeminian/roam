/**
 * Sharing a completed run (#24).
 *
 * The message contains only the numbers Roam actually recorded, formatted with
 * the runner's own unit setting. There is no badge, no streak, no encouragement
 * and no implied comparison — the same restraint the summary screen keeps.
 *
 * Pace is omitted rather than shown as a placeholder when it is unavailable
 * (a very short run, or one that never moved): a recipient should not receive
 * `--'--"` as if it were a result.
 *
 * When the run had a planned route, the share carries the route link too, so a
 * recipient can run the same route (#96). A run without a plan shares only what
 * was recorded — a route is never implied.
 */

import { routeShareLink } from './route-share';
import { formatDuration, formatRunDate, type SavedRun } from './run-session';
import type { Formatters } from './settings-context';

/** The text a run share sends. Pure, so the wording is testable. */
export function runShareMessage(run: SavedRun, fmt: Formatters): string {
  const distance = `${fmt.distance(run.distanceKm * 1000)} ${fmt.unitLabel}`;
  const duration = formatDuration(run.durationSeconds);
  const date = formatRunDate(run.startedAt);

  const pace = run.averagePaceMinPerKm;
  const paceClause = pace === null ? '' : ` at ${fmt.paceWithUnit(pace)}`;

  const summary = `I ran ${distance} in ${duration}${paceClause} on ${date}.`;
  if (run.route === null) {
    return summary;
  }
  return `${summary}\n\nRun this route: ${routeShareLink(run.route)}`;
}
