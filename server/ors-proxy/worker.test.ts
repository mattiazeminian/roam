import { describe, expect, test } from '@jest/globals';

import { isValidRouteRequest } from './worker';

describe('isValidRouteRequest', () => {
  test('accepts a valid loop request', () => {
    expect(
      isValidRouteRequest({
        coordinates: [[12.4924, 41.8902]],
        options: { round_trip: { length: 5000, points: 3, seed: 42 } },
      }),
    ).toBe(true);
  });

  test('accepts an explicit route through valid coordinates', () => {
    expect(
      isValidRouteRequest({
        coordinates: [
          [12.4924, 41.8902],
          [12.4964, 41.9028],
        ],
      }),
    ).toBe(true);
  });

  test('rejects malformed, out-of-range, or excessive coordinate lists', () => {
    expect(isValidRouteRequest({ coordinates: [[200, 41.8902]] })).toBe(false);
    expect(isValidRouteRequest({ coordinates: 'not coordinates' })).toBe(false);
    expect(
      isValidRouteRequest({ coordinates: Array.from({ length: 9 }, () => [12.4924, 41.8902]) }),
    ).toBe(false);
  });
});
