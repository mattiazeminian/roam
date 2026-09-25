/**
 * Run start/finish detection (#152).
 */
import { describe, expect, test } from '@jest/globals';

import type { Coordinate } from '@/services/routing';

import { LOOP_TOLERANCE_M, runEndpoints } from '../endpoints';

/** ~1 degree of latitude is ~111 km, so this is ~11.1 m per 0.0001. */
function at(latitudeDelta: number, longitudeDelta = 0): Coordinate {
  return { latitude: 51.5 + latitudeDelta, longitude: -0.12 + longitudeDelta };
}

describe('runEndpoints', () => {
  test('is null without a track', () => {
    expect(runEndpoints([])).toBeNull();
    expect(runEndpoints([at(0)])).toBeNull();
  });

  test('takes the first and last fixes as start and finish', () => {
    const start = at(0);
    const finish = at(0.01);
    const endpoints = runEndpoints([start, at(0.005), finish]);
    expect(endpoints?.start).toEqual(start);
    expect(endpoints?.finish).toEqual(finish);
    expect(endpoints?.loop).toBe(false);
  });

  test('collapses a loop whose ends are within GPS drift', () => {
    const endpoints = runEndpoints([at(0), at(0.01), at(0.0001)]);
    expect(endpoints?.loop).toBe(true);
  });

  test('uses the loop tolerance as the boundary', () => {
    // A touch more than the tolerance apart is a point-to-point run.
    const delta = (LOOP_TOLERANCE_M + 5) / 111_320;
    expect(runEndpoints([at(0), at(delta)])?.loop).toBe(false);
  });
});
