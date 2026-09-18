/**
 * Tests for turning a run into a saved route (#110).
 *
 * The risk here is inventing something: closing a point-to-point track into a
 * fake loop, or attaching surface data a recording does not have.
 */
import { describe, expect, test } from '@jest/globals';

import { routeIdentity } from '../route-identity';
import type { SavedRun } from '../run-session';
import { routeFromRun } from '../run-to-route';

function run(overrides: Partial<SavedRun> = {}): SavedRun {
  return {
    id: 'run-1',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_001_800_000,
    route: null,
    targetDistanceKm: 0,
    distanceKm: 5.2,
    durationSeconds: 1_800,
    averagePaceMinPerKm: 5.77,
    coordinates: [
      { latitude: 40.7484, longitude: -73.9857 },
      { latitude: 40.7495, longitude: -73.9849 },
      { latitude: 40.7501, longitude: -73.9841 },
    ],
    timestamps: [1_700_000_000_000, 1_700_000_600_000, 1_700_001_200_000],
    status: 'finished',
    ...overrides,
  };
}

describe('routeFromRun (#110)', () => {
  test('is null when the run recorded no usable track', () => {
    expect(routeFromRun(run({ coordinates: [] }))).toBeNull();
    expect(routeFromRun(run({ coordinates: [{ latitude: 1, longitude: 2 }] }))).toBeNull();
  });

  test('keeps the recorded track exactly, without closing it into a fake loop', () => {
    const route = routeFromRun(run());
    expect(route?.geometry).toEqual(run().coordinates);
    expect(route?.geometry[0]).not.toEqual(route?.geometry[route.geometry.length - 1]);
  });

  test('carries the distance and the actual duration, not a pace estimate', () => {
    const route = routeFromRun(run());
    expect(route?.distanceKm).toBe(5.2);
    expect(route?.estimatedMinutes).toBe(30); // 1800 s recorded
  });

  test('claims nothing about surfaces', () => {
    const route = routeFromRun(run());
    expect(route?.characteristics).toEqual(['Recorded route']);
    expect(route?.attributes).toBeUndefined();
  });

  test('has a stable identity, so saving the same track twice does not duplicate', () => {
    const first = routeFromRun(run());
    const second = routeFromRun(run());
    expect(routeIdentity(first!)).toBe(routeIdentity(second!));
  });
});
