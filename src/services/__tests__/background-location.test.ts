/**
 * Tests for the background-location payload handling (#30).
 *
 * The native task registration and the OS permission flow cannot be exercised
 * without a device, but the part that can be wrong — turning a TaskManager
 * payload into valid `LocationSample`s — is pure and covered here.
 */
import { describe, expect, jest, test } from '@jest/globals';

import { forwardTaskLocations } from '../background-location';
import type { LocationSample } from '../location';

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
// `location.ts` builds its run options at module load, so the enums it reads
// must exist on the mock.
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6, Balanced: 3 },
  ActivityType: { Fitness: 3 },
}));

function nativeLocation(latitude: number, longitude: number, timestamp: number) {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 5,
      speed: 3,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
    },
    timestamp,
  };
}

describe('forwardTaskLocations (#30)', () => {
  test('forwards each location to the sink and reports how many', () => {
    const received: LocationSample[] = [];
    const data = {
      locations: [nativeLocation(40.748, -73.985, 1_000), nativeLocation(40.749, -73.985, 2_000)],
    };

    const count = forwardTaskLocations(data, (sample) => received.push(sample));

    expect(count).toBe(2);
    expect(received).toHaveLength(2);
    expect(received[0].coordinate).toEqual({ latitude: 40.748, longitude: -73.985 });
    expect(received[0].timestamp).toBe(1_000);
    expect(received[0].accuracyMeters).toBe(5);
    expect(received[0].speedMetersPerSecond).toBe(3);
  });

  test('skips malformed entries rather than throwing', () => {
    const received: LocationSample[] = [];
    const data = {
      locations: [
        null,
        { coords: null },
        { coords: { latitude: Number.NaN, longitude: 0 } },
        { coords: { latitude: 40.748, longitude: -73.985 } },
      ],
    };

    const count = forwardTaskLocations(data, (sample) => received.push(sample));

    expect(count).toBe(1);
    expect(received).toHaveLength(1);
  });

  test('does nothing when there is no active run sink', () => {
    const data = { locations: [nativeLocation(40.748, -73.985, 1_000)] };
    expect(forwardTaskLocations(data, null)).toBe(0);
  });

  test('does nothing when the payload has no locations array', () => {
    const received: LocationSample[] = [];
    const sink = (sample: LocationSample) => received.push(sample);
    expect(forwardTaskLocations(undefined, sink)).toBe(0);
    expect(forwardTaskLocations({}, sink)).toBe(0);
    expect(forwardTaskLocations({ locations: 'nope' }, sink)).toBe(0);
    expect(received).toHaveLength(0);
  });
});
