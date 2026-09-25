/**
 * Where a completed run began and ended (#152).
 *
 * A recorded track's first and last fixes are the start and the finish. When
 * they are the same place — a loop, within GPS drift — the map should say so
 * once instead of stacking two markers on top of each other.
 */

import { haversineMeters } from '@/services/geo';
import type { Coordinate } from '@/services/routing';

/** Two endpoints closer than this are the same place: a closed loop. */
export const LOOP_TOLERANCE_M = 25;

export type RunEndpoints = {
  start: Coordinate;
  finish: Coordinate;
  loop: boolean;
};

export function runEndpoints(points: Coordinate[]): RunEndpoints | null {
  if (points.length < 2) {
    return null;
  }
  const start = points[0];
  const finish = points[points.length - 1];
  return { start, finish, loop: haversineMeters(start, finish) < LOOP_TOLERANCE_M };
}
