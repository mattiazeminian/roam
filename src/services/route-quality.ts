/**
 * Route quality metrics (#53) — geometry only.
 *
 * These are derived from the polyline itself, so they cost nothing extra and
 * work for any route the provider returns. They are deliberately approximate
 * and explainable rather than clever: a metric nobody can reason about cannot
 * be trusted in a ranking.
 *
 * Backtracking is the first of them: how much of the route runs back over
 * ground it has already covered in the opposite direction. That is the most
 * common reason a generated loop "looks wrong" to a runner — straight out and
 * straight back, or an out-and-back bolted onto the end of a loop.
 */

import { bearingDegrees, haversineMeters } from './geo';
import type { Coordinate } from './routing';

/** The track is resampled to this spacing before analysis, so the result does
 *  not depend on how densely the provider happened to return points. */
const RESAMPLE_SPACING_M = 15;

/** Two opposite-direction segments closer than this are treated as the same
 *  piece of ground. Generous enough for the two sides of a street. */
const OVERLAP_TOLERANCE_M = 12;

/** How close to directly opposite two headings must be to count as a retrace. */
const OPPOSITE_HEADING_DEGREES = 120;

export type Backtracking = {
  /** Metres of the route that retrace ground already covered. */
  meters: number;
  /** `meters` as a fraction of the route (0–1). */
  ratio: number;
};

const NONE: Backtracking = { meters: 0, ratio: 0 };

/** Smallest absolute angle between two compass bearings, in degrees. */
function headingDifference(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

/**
 * Points spaced evenly by distance along the track. Interpolates within the
 * original segments, so the result reflects the real path rather than the
 * provider's point density.
 */
function resample(track: Coordinate[], spacingM: number): Coordinate[] {
  if (track.length < 2) {
    return track;
  }

  const cumulative: number[] = [0];
  for (let index = 1; index < track.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineMeters(track[index - 1], track[index]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) {
    return [track[0]];
  }

  const steps = Math.max(1, Math.floor(total / spacingM));
  const points: Coordinate[] = [];
  let segment = 0;

  for (let step = 0; step <= steps; step += 1) {
    const target = step * spacingM;
    while (segment < cumulative.length - 2 && cumulative[segment + 1] < target) {
      segment += 1;
    }
    const start = cumulative[segment];
    const end = cumulative[segment + 1];
    const segmentLength = end - start || 1;
    const t = Math.min(1, Math.max(0, (target - start) / segmentLength));
    const a = track[segment];
    const b = track[segment + 1];
    points.push({
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    });
  }

  return points;
}

/**
 * How much of the route retraces earlier ground in the opposite direction.
 *
 * Method: resample to a fixed spacing, then walk the segments in order. A
 * segment is counted as backtracking if an *earlier* segment is close to it
 * (midpoints within `OVERLAP_TOLERANCE_M`) and runs roughly the other way
 * (`OPPOSITE_HEADING_DEGREES`). Each segment is counted at most once.
 *
 * A perfect out-and-back therefore scores ~0.5 — half its length retraces the
 * other half — which is the intuitive reading.
 *
 * Limitation, stated rather than hidden: two segments overlapping in the *same*
 * direction (a path doubled back along a divided road) are not counted, and the
 * two sides of a wide street beyond the tolerance are not either. It detects
 * retracing, not every possible overlap.
 */
export function backtracking(track: Coordinate[]): Backtracking {
  if (track.length < 2) {
    return NONE;
  }

  const points = resample(track, RESAMPLE_SPACING_M);
  if (points.length < 2) {
    return NONE;
  }

  const count = points.length - 1;
  const midpoints: Coordinate[] = [];
  const headings: number[] = [];
  const lengths: number[] = [];
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = haversineMeters(a, b);
    lengths.push(length);
    total += length;
    headings.push(bearingDegrees(a, b));
    midpoints.push({
      latitude: (a.latitude + b.latitude) / 2,
      longitude: (a.longitude + b.longitude) / 2,
    });
  }

  const counted = new Array<boolean>(count).fill(false);

  for (let index = 0; index < count; index += 1) {
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (headingDifference(headings[index], headings[earlier]) < OPPOSITE_HEADING_DEGREES) {
        continue;
      }
      if (haversineMeters(midpoints[index], midpoints[earlier]) > OVERLAP_TOLERANCE_M) {
        continue;
      }
      counted[index] = true;
      break;
    }
  }

  let meters = 0;
  for (let index = 0; index < count; index += 1) {
    if (counted[index]) {
      meters += lengths[index];
    }
  }

  return { meters, ratio: total > 0 ? meters / total : 0 };
}
