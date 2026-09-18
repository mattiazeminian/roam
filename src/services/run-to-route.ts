/**
 * Turning a completed run into a saved route (#110).
 *
 * A route-less run leaves behind a GPS track that is, in practice, a route the
 * runner has just discovered. This is what lets them keep it.
 *
 * The geometry is the recorded track, kept **as it was run**. A loop already
 * closes on its own; forcing it closed for a point-to-point run would invent a
 * segment nobody ran. No path attributes are attached either — a recorded track
 * carries no waytype or surface data, and guessing any would be fabrication.
 */

import type { RouteCandidate } from './routing';
import type { SavedRun } from './run-session';

/** The route a run would become, or null when there is nothing to save. */
export function routeFromRun(run: SavedRun): RouteCandidate | null {
  if (run.coordinates.length < 2) {
    return null;
  }

  return {
    id: `route-from-${run.id}`,
    distanceKm: run.distanceKm,
    estimatedMinutes: Math.max(1, Math.round(run.durationSeconds / 60)),
    geometry: run.coordinates,
    // Factual and modest: it is a route, recorded, with nothing claimed about
    // its surfaces.
    characteristics: ['Recorded route'],
  };
}
