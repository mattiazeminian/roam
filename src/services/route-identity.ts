/**
 * A stable identity for a route, so the same loop can be recognised again.
 *
 * Two things need this: de-duplicating saved routes (saving the same loop twice
 * must not create two entries) and, later, tallying how often a route has been
 * run (#15). Both need identity to survive a round-trip through storage, where
 * coordinates have already been rounded — otherwise a just-saved route would
 * look different from the same route loaded back.
 *
 * The signature is deliberately coarse: the start point, a distance bucket and
 * a sampled shape. Exact geometry would make every regenerated loop unique
 * (OpenRouteService returns slightly different points each call), which is the
 * opposite of what "the same route" should mean to a runner. The trade-off is
 * that two genuinely different loops sharing a start, a distance bracket and a
 * broadly similar shape would collide; at this granularity that is unlikely,
 * and a collision only means one replaces the other rather than corrupting
 * anything.
 */

import type { Coordinate, RouteCandidate } from './routing';

/** ~11 m. Coarser than storage's 5dp, so post-rounding identities match. */
const QUANTIZE_DECIMALS = 4;

/** How many points of the shape to sample. Enough to tell loops apart. */
const SHAPE_SAMPLES = 8;

function quantize(value: number): string {
  return value.toFixed(QUANTIZE_DECIMALS);
}

function pointKey({ latitude, longitude }: Coordinate): string {
  return `${quantize(latitude)},${quantize(longitude)}`;
}

/** Evenly sampled points along the geometry, always including the last. */
function shapeSignature(geometry: Coordinate[]): string {
  if (geometry.length === 0) {
    return 'empty';
  }
  const step = Math.max(1, Math.floor(geometry.length / SHAPE_SAMPLES));
  const sampled: string[] = [];
  for (let index = 0; index < geometry.length; index += step) {
    sampled.push(pointKey(geometry[index]));
  }
  const last = geometry[geometry.length - 1];
  if (sampled[sampled.length - 1] !== pointKey(last)) {
    sampled.push(pointKey(last));
  }
  return sampled.join(';');
}

/** djb2, as base36. Not cryptographic — it only needs to be stable and short. */
function hash(input: string): string {
  let value = 5381;
  for (let index = 0; index < input.length; index += 1) {
    value = ((value << 5) + value + input.charCodeAt(index)) | 0;
  }
  return (value >>> 0).toString(36);
}

/**
 * `routeIdentity(route)` → a short, stable key.
 *
 * Rounded distance is bucketed to the nearest 100 m so a provider's minor
 * re-measurement of the same loop does not change its identity.
 */
export function routeIdentity(route: RouteCandidate): string {
  const start = route.geometry[0];
  const startKey = start ? pointKey(start) : 'none';
  const distanceBucket = Math.round(route.distanceKm * 10);
  return hash(`${startKey}|${distanceBucket}|${shapeSignature(route.geometry)}`);
}
