/**
 * Tests for route identity (#18).
 *
 * Identity has to be stable for one route and different for another — this is
 * what makes saving the same loop twice an overwrite instead of a duplicate.
 */
import { describe, expect, test } from '@jest/globals';

import { routeIdentity } from '../route-identity';
import type { Coordinate, RouteCandidate } from '../routing';

const START: Coordinate = { latitude: 40.748412, longitude: -73.985678 };
const MID: Coordinate = { latitude: 40.750011, longitude: -73.980023 };

function route(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    id: 'route-1',
    distanceKm: 5,
    estimatedMinutes: 30,
    geometry: [START, MID, START],
    characteristics: [],
    ...overrides,
  };
}

/** What `route-storage.ts` does before writing — the identity must survive it. */
function round5(coordinate: Coordinate): Coordinate {
  const factor = 1e5;
  return {
    latitude: Math.round(coordinate.latitude * factor) / factor,
    longitude: Math.round(coordinate.longitude * factor) / factor,
  };
}

describe('routeIdentity', () => {
  test('is stable for the same route', () => {
    expect(routeIdentity(route())).toBe(routeIdentity(route()));
  });

  test('survives the rounding applied when a route is stored and read back', () => {
    const stored = route({ geometry: route().geometry.map(round5) });
    expect(routeIdentity(stored)).toBe(routeIdentity(route()));
  });

  test('changes when the start point moves', () => {
    const moved = route({
      geometry: [{ latitude: 40.749, longitude: -73.985678 }, MID, START],
    });
    expect(routeIdentity(moved)).not.toBe(routeIdentity(route()));
  });

  test('changes when the distance bucket changes', () => {
    expect(routeIdentity(route({ distanceKm: 6 }))).not.toBe(routeIdentity(route()));
  });

  test('changes when the shape changes', () => {
    const bent = route({
      geometry: [START, { latitude: 40.76, longitude: -73.98 }, START],
    });
    expect(routeIdentity(bent)).not.toBe(routeIdentity(route()));
  });

  test('is stable for a long geometry', () => {
    const geometry = Array.from({ length: 100 }, (_, index) => ({
      latitude: 40.748 + index * 0.0001,
      longitude: -73.985 + index * 0.0001,
    }));
    expect(routeIdentity(route({ geometry }))).toBe(routeIdentity(route({ geometry })));
  });
});
