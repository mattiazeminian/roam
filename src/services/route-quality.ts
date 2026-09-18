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

/** A turn sharper than this counts; a gentle bend does not. */
const TURN_THRESHOLD_DEGREES = 45;

/** The polyline is simplified to this tolerance before counting corners, so a
 *  smooth curve is not mistaken for a series of turns. */
const SIMPLIFY_TOLERANCE_M = 12;

/** Two points closer than this are the same place (a closed loop's start/end). */
const CLOSED_TOLERANCE_M = 5;

export type Turniness = {
  /** Corners sharper than the threshold. */
  turns: number;
  /** Corners per kilometre, so routes of different lengths compare fairly. */
  perKm: number;
};

/**
 * Roughly how twisty a route is.
 *
 * The track is simplified first (Douglas–Peucker) so that a curve — which the
 * provider returns as many small heading changes — becomes a few straight legs;
 * only then are corners counted. A closed loop also counts the corner at the
 * start/end junction, which an open-polyline scan would miss.
 *
 * `perKm` is the comparable figure: eight turns on a 10 km route is not the
 * same route as eight turns on a 2 km one.
 */
export function turnDensity(track: Coordinate[]): Turniness {
  if (track.length < 3) {
    return { turns: 0, perKm: 0 };
  }

  let total = 0;
  for (let index = 1; index < track.length; index += 1) {
    total += haversineMeters(track[index - 1], track[index]);
  }
  if (total <= 0) {
    return { turns: 0, perKm: 0 };
  }

  const simplified = simplify(track, SIMPLIFY_TOLERANCE_M);
  const closed =
    simplified.length > 2 &&
    haversineMeters(simplified[0], simplified[simplified.length - 1]) < CLOSED_TOLERANCE_M;

  const points = closed ? simplified.slice(0, -1) : simplified;
  if (points.length < 3) {
    return { turns: 0, perKm: 0 };
  }

  let turns = 0;
  const count = closed ? points.length : points.length - 2;

  for (let index = 0; index < count; index += 1) {
    const position = closed ? index : index + 1;
    const previous = points[(position - 1 + points.length) % points.length];
    const current = points[position];
    const next = points[(position + 1) % points.length];

    const incoming = bearingDegrees(previous, current);
    const outgoing = bearingDegrees(current, next);
    if (headingDifference(incoming, outgoing) >= TURN_THRESHOLD_DEGREES) {
      turns += 1;
    }
  }

  return { turns, perKm: turns / (total / 1000) };
}

/** Perpendicular distance from `point` to segment `a`–`b`, in metres. */
function perpendicularDistanceM(point: Coordinate, a: Coordinate, b: Coordinate): number {
  const latitudeScale = 111_320;
  const longitudeScale = 111_320 * Math.cos((point.latitude * Math.PI) / 180);

  const px = (point.longitude - a.longitude) * longitudeScale;
  const py = (point.latitude - a.latitude) * latitudeScale;
  const bx = (b.longitude - a.longitude) * longitudeScale;
  const by = (b.latitude - a.latitude) * latitudeScale;

  const lengthSquared = bx * bx + by * by;
  if (lengthSquared === 0) {
    return Math.hypot(px, py);
  }
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Douglas–Peucker. Keeps the shape while dropping points within `tolerance`. */
function simplify(points: Coordinate[], tolerance: number): Coordinate[] {
  if (points.length < 3) {
    return points;
  }

  const first = points[0];
  const last = points[points.length - 1];
  let furthest = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistanceM(points[i], first, last);
    if (distance > furthest) {
      furthest = distance;
      index = i;
    }
  }

  if (furthest <= tolerance) {
    return [first, last];
  }

  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

type XY = { x: number; y: number };

/** Local equirectangular metres, good enough at the scale of one route. */
function projectToMeters(track: Coordinate[]): XY[] {
  const origin = track[0];
  const longitudeScale = 111_320 * Math.cos((origin.latitude * Math.PI) / 180);
  return track.map((point) => ({
    x: (point.longitude - origin.longitude) * longitudeScale,
    y: (point.latitude - origin.latitude) * 111_320,
  }));
}

function cross(o: XY, a: XY, b: XY): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Strict crossing: touching endpoints do not count. */
function properIntersection(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function countSelfIntersections(points: XY[]): number {
  if (points.length < 4) {
    return 0;
  }
  const lastSegment = points.length - 2;
  let crossings = 0;

  for (let i = 0; i < lastSegment; i += 1) {
    for (let j = i + 1; j <= lastSegment; j += 1) {
      // Adjacent segments share a point; the first and last are adjacent too
      // when the ring closes.
      if (j === i + 1 || (i === 0 && j === lastSegment)) {
        continue;
      }
      if (properIntersection(points[i], points[i + 1], points[j], points[j + 1])) {
        crossings += 1;
      }
    }
  }

  return crossings;
}

/** Principal-axis ratio: 1 for a circle, larger for an elongated loop. */
function elongationOf(points: XY[]): number {
  const count = points.length;
  if (count < 2) {
    return 1;
  }

  let meanX = 0;
  let meanY = 0;
  for (const point of points) {
    meanX += point.x;
    meanY += point.y;
  }
  meanX /= count;
  meanY /= count;

  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  xx /= count;
  yy /= count;
  xy /= count;

  const trace = xx + yy;
  const determinant = xx * yy - xy * xy;
  const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant));
  const major = trace / 2 + discriminant;
  const minor = trace / 2 - discriminant;

  if (major <= 0 || minor <= 0) {
    return 1;
  }
  return Math.sqrt(major / minor);
}

export type LoopShape = {
  /**
   * Polsby–Popper compactness: `4πA / P²`. 1 is a perfect circle, ~0.785 a
   * square, and near 0 for a line that encloses almost nothing.
   */
  compactness: number;
  /** Major-to-minor axis ratio of the loop's spread. 1 is round. */
  elongation: number;
  /** Times the route crosses itself. */
  selfIntersections: number;
};

/**
 * How good a *loop* the geometry is, independent of length.
 *
 * Shape is what separates a route a runner enjoys from one that merely closes:
 * a round, compact loop reads as designed, while a long thin or self-crossing
 * shape does not. Compactness is unreliable for a self-intersecting ring
 * (the shoelace area stops meaning "enclosed"); callers that care should check
 * `selfIntersections` first.
 */
export function loopShape(track: Coordinate[]): LoopShape {
  if (track.length < 3) {
    return { compactness: 0, elongation: 1, selfIntersections: 0 };
  }

  const projected = projectToMeters(track);

  let doubleArea = 0;
  for (let index = 0; index < projected.length - 1; index += 1) {
    doubleArea +=
      projected[index].x * projected[index + 1].y -
      projected[index + 1].x * projected[index].y;
  }
  const area = Math.abs(doubleArea) / 2;

  let perimeter = 0;
  for (let index = 1; index < track.length; index += 1) {
    perimeter += haversineMeters(track[index - 1], track[index]);
  }

  const compactness =
    perimeter > 0 ? Math.min(1, Math.max(0, (4 * Math.PI * area) / (perimeter * perimeter))) : 0;

  const simplified = projectToMeters(simplify(track, SIMPLIFY_TOLERANCE_M));

  return {
    compactness,
    elongation: elongationOf(projected),
    selfIntersections: countSelfIntersections(simplified),
  };
}
