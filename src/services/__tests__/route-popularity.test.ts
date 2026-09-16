/**
 * Tests for route popularity signals (#15).
 *
 * The tally is the runner's own saved runs, so the tests are about counting
 * honestly: the same route accumulating, unrelated routes staying separate, and
 * a run with no plan contributing nothing.
 */
import { describe, expect, jest, test } from '@jest/globals';

import { countRunsByRoute, loadRoutePopularity, popularityLabel } from '../route-popularity';
import type { RouteCandidate } from '../routing';
import type { SavedRun } from '../run-session';
import { listRuns } from '../run-storage';

jest.mock('../run-storage', () => ({
  listRuns: jest.fn(),
}));

const listRunsMock = listRuns as unknown as jest.Mock<typeof listRuns>;

function route(id: string, north = 0): RouteCandidate {
  return {
    id,
    distanceKm: 5,
    estimatedMinutes: 30,
    geometry: [
      { latitude: 40.748 + north, longitude: -73.986 },
      { latitude: 40.752 + north, longitude: -73.981 },
      { latitude: 40.745 + north, longitude: -73.979 },
      { latitude: 40.748 + north, longitude: -73.986 },
    ],
    characteristics: ['Loop'],
  };
}

function run(routeOrNull: RouteCandidate | null, id = 'run'): SavedRun {
  return {
    id,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_600_000,
    route: routeOrNull,
    targetDistanceKm: 5,
    distanceKm: 5,
    durationSeconds: 1800,
    averagePaceMinPerKm: 6,
    coordinates: [],
    status: 'finished',
  };
}

describe('countRunsByRoute (#15)', () => {
  test('counts repeated runs of the same route together', () => {
    const loop = route('a');
    const counts = countRunsByRoute([run(loop, 'r1'), run(loop, 'r2')]);
    expect([...counts.values()]).toEqual([2]);
  });

  test('keeps different routes separate', () => {
    const counts = countRunsByRoute([run(route('a'), 'r1'), run(route('b', 0.02), 'r2')]);
    expect(counts.size).toBe(2);
    expect([...counts.values()].sort()).toEqual([1, 1]);
  });

  test('ignores runs that have no planned route', () => {
    const counts = countRunsByRoute([run(null, 'r1'), run(route('a'), 'r2')]);
    expect(counts.size).toBe(1);
    expect([...counts.values()]).toEqual([1]);
  });

  test('is empty for no runs', () => {
    expect(countRunsByRoute([]).size).toBe(0);
  });
});

describe('popularityLabel (#15)', () => {
  test('says nothing until a route has actually been repeated', () => {
    expect(popularityLabel(0)).toBeNull();
    expect(popularityLabel(1)).toBeNull();
  });

  test('names the exact count, in the runner\'s own voice', () => {
    expect(popularityLabel(2)).toBe("You've run this twice");
    expect(popularityLabel(5)).toBe("You've run this 5 times");
  });
});

describe('loadRoutePopularity (#15)', () => {
  test('tallies the saved runs it reads', async () => {
    const loop = route('a');
    listRunsMock.mockResolvedValue([
      run(loop, 'r1'),
      run(loop, 'r2'),
      run(route('b', 0.02), 'r3'),
    ]);

    const counts = await loadRoutePopularity();

    expect(counts.size).toBe(2);
    expect([...counts.values()].sort()).toEqual([1, 2]);
  });
});
