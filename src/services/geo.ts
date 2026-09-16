/**
 * Geographic math shared by routing, run tracking and route progress.
 *
 * Pure functions only — no React, no I/O, no provider specifics. Distances are
 * in meters unless a name says otherwise.
 */

import type { Coordinate } from './routing';

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;

export function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance. Accurate enough at running scale. */
export function haversineMeters(a: Coordinate, b: Coordinate) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of an open or closed path. */
export function pathLengthMeters(points: Coordinate[]) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += haversineMeters(points[i], points[i + 1]);
  }
  return total;
}

/** Distance from the start of the path to each vertex. */
export function cumulativeDistances(points: Coordinate[]): number[] {
  const cumulative: number[] = new Array(points.length);
  cumulative[0] = 0;
  for (let i = 1; i < points.length; i += 1) {
    cumulative[i] = cumulative[i - 1] + haversineMeters(points[i - 1], points[i]);
  }
  return cumulative;
}

/**
 * Local planar projection around `origin`, in meters. Valid over the few
 * kilometers a route spans, which keeps the segment math simple and cheap.
 */
function toLocalMeters(point: Coordinate, origin: Coordinate) {
  const x =
    (point.longitude - origin.longitude) *
    METERS_PER_DEGREE_LAT *
    Math.cos(toRadians(origin.latitude));
  const y = (point.latitude - origin.latitude) * METERS_PER_DEGREE_LAT;
  return { x, y };
}

export type PathProjection = {
  /** Index of the segment the point projects onto. */
  segmentIndex: number;
  /** Position within that segment, 0..1. */
  t: number;
  /** Perpendicular distance from the path, in meters. */
  offsetMeters: number;
  /** Distance along the path from its start, in meters. */
  alongMeters: number;
};

/**
 * Project a coordinate onto the nearest point of a path.
 *
 * `searchFrom` restricts the search to segments at or after an index. Run
 * progress passes the last known segment so a loop that passes near its own
 * start does not snap backwards to the beginning.
 */
export function projectOntoPath(
  path: Coordinate[],
  point: Coordinate,
  cumulative: number[],
  searchFrom = 0,
): PathProjection | null {
  if (path.length < 2) {
    return null;
  }

  let best: PathProjection | null = null;
  const start = Math.max(0, Math.min(searchFrom, path.length - 2));

  for (let i = start; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const origin = a;
    const local = toLocalMeters(point, origin);
    const segment = toLocalMeters(b, origin);

    const lengthSquared = segment.x ** 2 + segment.y ** 2;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (local.x * segment.x + local.y * segment.y) / lengthSquared));

    const projX = segment.x * t;
    const projY = segment.y * t;
    const offsetMeters = Math.hypot(local.x - projX, local.y - projY);

    if (!best || offsetMeters < best.offsetMeters) {
      const segmentLength = cumulative[i + 1] - cumulative[i];
      best = {
        segmentIndex: i,
        t,
        offsetMeters,
        alongMeters: cumulative[i] + segmentLength * t,
      };
    }
  }

  return best;
}

/** The portion of `path` from its start up to `alongMeters`. */
export function sliceAlongPath(
  path: Coordinate[],
  cumulative: number[],
  alongMeters: number,
): Coordinate[] {
  if (path.length < 2 || alongMeters <= 0) {
    return [];
  }
  const total = cumulative[cumulative.length - 1];
  if (alongMeters >= total) {
    return [...path];
  }

  const covered: Coordinate[] = [];
  for (let i = 0; i < path.length; i += 1) {
    if (cumulative[i] <= alongMeters) {
      covered.push(path[i]);
      continue;
    }
    // Interpolate the final partial segment so the head of the completed line
    // sits exactly at the runner's progress rather than at the last vertex.
    const previous = path[i - 1];
    const segmentLength = cumulative[i] - cumulative[i - 1];
    const t = segmentLength === 0 ? 0 : (alongMeters - cumulative[i - 1]) / segmentLength;
    covered.push({
      latitude: previous.latitude + (path[i].latitude - previous.latitude) * t,
      longitude: previous.longitude + (path[i].longitude - previous.longitude) * t,
    });
    break;
  }

  return covered;
}
