/**
 * Tests for the route generation behavior added in issue #7: seed variation
 * (routes must not be identical between searches), the distance correction
 * applied before asking ORS, tolerance/ranking of the actual returned
 * distance, and the adaptive second pass when the first batch misses.
 *
 * `findRoutes` reads its API key from `process.env` once, at module load
 * time, so tests that need a specific key state load a fresh module instance
 * via `loadRouting()` rather than relying on a shared import.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

type RoutingModule = typeof import('../routing');

function loadRouting(apiKey: string | undefined): RoutingModule {
  jest.resetModules();
  if (apiKey === undefined) {
    delete process.env.EXPO_PUBLIC_ORS_API_KEY;
  } else {
    process.env.EXPO_PUBLIC_ORS_API_KEY = apiKey;
  }
  // Fresh require per call: routing.ts reads the env var at module scope, so
  // a static top-level import would only ever see whichever key was set
  // first, across every test in the file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../routing') as RoutingModule;
}

const ORIGIN = { latitude: 40.7484, longitude: -73.9857 };

/**
 * A real ORS `extra_info` payload, captured from a live foot-walking round trip
 * in Manhattan (~3.35 km). Codes are ORS's own: waytype 7 = Footway, 3 =
 * Street, 4 = Path; surface 4 = Concrete and 3 = Asphalt (sealed), 0 = Unknown,
 * 10 = Gravel. It exists so the taxonomy is tested against what the API
 * actually returns rather than an invented shape (#14).
 */
const ORS_EXTRAS = {
  waytype: {
    summary: [
      { value: 7, distance: 3315, amount: 98.91 },
      { value: 3, distance: 29.8, amount: 0.89 },
      { value: 4, distance: 6.8, amount: 0.2 },
    ],
  },
  surface: {
    summary: [
      { value: 4, distance: 1839.8, amount: 54.89 },
      { value: 0, distance: 964.1, amount: 28.76 },
      { value: 3, distance: 310.5, amount: 9.26 },
      { value: 10, distance: 218.4, amount: 6.52 },
    ],
  },
};

/** A minimal, valid ORS round-trip response with a given summary distance. */
function orsFixture(distanceM: number, ascentM = 12, extras?: unknown) {
  const pointCount = 12;
  const coordinates: [number, number][] = [];
  for (let i = 0; i < pointCount; i += 1) {
    const angle = (i / pointCount) * Math.PI * 2;
    coordinates.push([
      ORIGIN.longitude + Math.cos(angle) * 0.01,
      ORIGIN.latitude + Math.sin(angle) * 0.01,
    ]);
  }
  coordinates.push(coordinates[0]);
  return {
    features: [
      {
        geometry: { coordinates },
        properties: {
          summary: { distance: distanceM, duration: distanceM * 0.9 },
          ascent: ascentM,
          ...(extras === undefined ? {} : { extras }),
        },
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('correctionFactorFor', () => {
  test('applies the ≤4 km tier', () => {
    const { correctionFactorFor } = loadRouting('test-key');
    expect(correctionFactorFor(3)).toBeCloseTo(0.9);
    expect(correctionFactorFor(4)).toBeCloseTo(0.9);
  });

  test('applies the 4–7 km tier', () => {
    const { correctionFactorFor } = loadRouting('test-key');
    expect(correctionFactorFor(5)).toBeCloseTo(0.92);
    expect(correctionFactorFor(7)).toBeCloseTo(0.92);
  });

  test('applies the >7 km tier', () => {
    const { correctionFactorFor } = loadRouting('test-key');
    expect(correctionFactorFor(10)).toBeCloseTo(0.85);
    expect(correctionFactorFor(42)).toBeCloseTo(0.85);
  });
});

describe('toleranceMetersFor / isWithinTolerance', () => {
  test('uses the relative tolerance once 15% exceeds the absolute floor', () => {
    const { toleranceMetersFor } = loadRouting('test-key');
    expect(toleranceMetersFor(10_000)).toBeCloseTo(1500);
  });

  test('uses the absolute floor for short targets', () => {
    const { toleranceMetersFor } = loadRouting('test-key');
    expect(toleranceMetersFor(1000)).toBe(500);
  });

  test('respects the computed band', () => {
    const { isWithinTolerance } = loadRouting('test-key');
    expect(isWithinTolerance(5300, 5000)).toBe(true);
    expect(isWithinTolerance(5800, 5000)).toBe(false);
  });
});

describe('isWithinHardTolerance', () => {
  test('rejects a result roughly double the target — the reported bug', () => {
    const { isWithinHardTolerance } = loadRouting('test-key');
    // The literal report: 3 km requested, 5.8/6.1/6.4 km returned.
    expect(isWithinHardTolerance(5800, 3000)).toBe(false);
    expect(isWithinHardTolerance(6100, 3000)).toBe(false);
    expect(isWithinHardTolerance(6400, 3000)).toBe(false);
  });

  test('rejects a catastrophic outlier', () => {
    const { isWithinHardTolerance } = loadRouting('test-key');
    // Measured live: a 7 km request came back as 724 km.
    expect(isWithinHardTolerance(724_000, 7000)).toBe(false);
  });

  test('accepts an honest miss that the soft tolerance would still flag', () => {
    const { isWithinHardTolerance, isWithinTolerance } = loadRouting('test-key');
    // 20% over: not a great match, but recognisably the same request.
    expect(isWithinTolerance(6000, 5000)).toBe(false);
    expect(isWithinHardTolerance(6000, 5000)).toBe(true);
  });

  test('is wider than the soft tolerance at every target used here', () => {
    const { toleranceMetersFor, isWithinHardTolerance } = loadRouting('test-key');
    for (const targetKm of [1, 3, 5, 7, 10, 20]) {
      const targetM = targetKm * 1000;
      const soft = toleranceMetersFor(targetM);
      // Anything on the edge of the hard band must not be treated as a soft
      // match — the two must not overlap in a way that skips the "Closest
      // available" label.
      expect(isWithinHardTolerance(targetM + soft, targetM)).toBe(true);
    }
  });
});

describe('rankByCloseness', () => {
  test('orders by absolute distance to target', () => {
    const { rankByCloseness } = loadRouting('test-key');
    const input = [{ distanceM: 7000 }, { distanceM: 5000 }, { distanceM: 4700 }];
    expect(rankByCloseness(input, 5000).map((c) => c.distanceM)).toEqual([5000, 4700, 7000]);
  });

  test('does not mutate the input array', () => {
    const { rankByCloseness } = loadRouting('test-key');
    const input = [{ distanceM: 7000 }, { distanceM: 5000 }];
    const copy = [...input];
    rankByCloseness(input, 5000);
    expect(input).toEqual(copy);
  });
});

describe('randomVariants', () => {
  test('returns the requested count with distinct point counts', () => {
    const { randomVariants } = loadRouting('test-key');
    const variants = randomVariants(3);
    expect(variants).toHaveLength(3);
    expect(new Set(variants.map((v) => v.points)).size).toBe(3);
  });

  test('point counts stay within the bounded range', () => {
    const { randomVariants } = loadRouting('test-key');
    // The full range has 4 values ([4,5,6,7] — 8 was cut after measurement,
    // see the comment on POINT_COUNT_RANGE); requesting more than that would
    // silently return fewer than asked, so this asks for exactly the range size.
    for (const variant of randomVariants(4)) {
      expect(variant.points).toBeGreaterThanOrEqual(4);
      expect(variant.points).toBeLessThanOrEqual(7);
    }
  });

  test('seeds are positive integers', () => {
    const { randomVariants } = loadRouting('test-key');
    for (const variant of randomVariants(3)) {
      expect(Number.isInteger(variant.seed)).toBe(true);
      expect(variant.seed).toBeGreaterThan(0);
    }
  });
});

describe('findRoutes', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('throws missing-key when no API key is configured, without calling out', async () => {
    const { findRoutes } = loadRouting(undefined);
    await expect(findRoutes({ origin: ORIGIN, targetKm: 5 })).rejects.toMatchObject({
      code: 'missing-key',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('sends the corrected length, not the raw target, to ORS', async () => {
    const { findRoutes, correctionFactorFor } = loadRouting('test-key');
    fetchMock.mockResolvedValue(jsonResponse(orsFixture(5000)) as never);

    await findRoutes({ origin: ORIGIN, targetKm: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const expectedLength = Math.round(5000 * correctionFactorFor(5));
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.options.round_trip.length).toBe(expectedLength);
    }
  });

  test('seeds vary between separate searches', async () => {
    const { findRoutes } = loadRouting('test-key');
    fetchMock.mockResolvedValue(jsonResponse(orsFixture(5000)) as never);

    await findRoutes({ origin: ORIGIN, targetKm: 5 });
    const firstSeeds = fetchMock.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).options.round_trip.seed,
    );

    fetchMock.mockClear();
    await findRoutes({ origin: ORIGIN, targetKm: 5 });
    const secondSeeds = fetchMock.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).options.round_trip.seed,
    );

    expect(firstSeeds).not.toEqual(secondSeeds);
  });

  test('ranks candidates by closeness to target, not request order', async () => {
    const { findRoutes } = loadRouting('test-key');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orsFixture(7000)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(5000)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(5300)) as never);

    const routes = await findRoutes({ origin: ORIGIN, targetKm: 5 });

    expect(routes.map((r) => r.distanceKm)).toEqual([5, 5.3, 7]);
    expect(routes[0].id).toBe('route-1');
  });

  test('does not trigger a second pass when at least one candidate is within tolerance', async () => {
    const { findRoutes } = loadRouting('test-key');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orsFixture(5100)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(7000)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(7500)) as never);

    await findRoutes({ origin: ORIGIN, targetKm: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('triggers one adaptive request when every first-pass candidate is hard-safe but misses soft tolerance', async () => {
    const { findRoutes } = loadRouting('test-key');
    // All three land inside the hard band (2.5km) but outside the soft one
    // (750m) — the case the adaptive nudge exists for.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orsFixture(6000)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(6200)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(6400)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(5100)) as never);

    const routes = await findRoutes({ origin: ORIGIN, targetKm: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(routes[0].distanceKm).toBe(5.1);
    expect(routes).toHaveLength(3);
    expect(routes.every((r) => !r.characteristics.includes('Closest available'))).toBe(true);
  });

  test('rejects candidates roughly double the target rather than presenting them as "closest available" — the reported bug', async () => {
    const { findRoutes } = loadRouting('test-key');
    // The literal report: 3 km requested, first pass returns 5.8/6.1/6.4 km.
    // None of these may ever reach the runner, no matter how "close" they are
    // to each other — a bounded retry must be issued instead of accepting them.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orsFixture(5800)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(6100)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(6400)) as never)
      // Retry batch: genuinely close candidates.
      .mockResolvedValueOnce(jsonResponse(orsFixture(3100)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(3300)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(2900)) as never);

    const routes = await findRoutes({ origin: ORIGIN, targetKm: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    const distances = routes.map((r) => r.distanceKm);
    expect(distances).not.toContain(5.8);
    expect(distances).not.toContain(6.1);
    expect(distances).not.toContain(6.4);
    expect(distances.sort()).toEqual([2.9, 3.1, 3.3]);
  });

  test('throws no-close-route when even the retry produces nothing usable', async () => {
    const { findRoutes } = loadRouting('test-key');
    // Six requests, every single one wildly off target — first pass and the
    // retry both fail to produce anything within the hard ceiling.
    fetchMock.mockResolvedValue(jsonResponse(orsFixture(9500)) as never);

    await expect(findRoutes({ origin: ORIGIN, targetKm: 5 })).rejects.toMatchObject({
      code: 'no-close-route',
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  test('an adaptive result that is itself catastrophic is discarded, not used', async () => {
    const { findRoutes } = loadRouting('test-key');
    // First pass: all hard-safe but outside soft tolerance, so the adaptive
    // path fires. The adaptive request itself then comes back catastrophic —
    // it must be sanity-checked exactly like any other result.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orsFixture(6000)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(6200)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(6400)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(724_000)) as never);

    const routes = await findRoutes({ origin: ORIGIN, targetKm: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(routes.map((r) => r.distanceKm)).not.toContain(724);
    // Falls back to the (still soft-tolerance-missing) first-pass results.
    expect(routes).toHaveLength(3);
    expect(routes.every((r) => r.characteristics.includes('Closest available'))).toBe(true);
  });

  test('labels candidates "Closest available" when the recovered set still misses soft tolerance', async () => {
    const { findRoutes } = loadRouting('test-key');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orsFixture(6000)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(6200)) as never)
      .mockResolvedValueOnce(jsonResponse(orsFixture(6400)) as never)
      // Adaptive attempt also misses soft tolerance, but is at least hard-safe.
      .mockResolvedValueOnce(jsonResponse(orsFixture(5900)) as never);

    const routes = await findRoutes({ origin: ORIGIN, targetKm: 5 });

    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => r.characteristics.includes('Closest available'))).toBe(true);
  });

  test('does not label candidates when the target was actually matched', async () => {
    const { findRoutes } = loadRouting('test-key');
    fetchMock.mockResolvedValue(jsonResponse(orsFixture(5100)) as never);

    const routes = await findRoutes({ origin: ORIGIN, targetKm: 5 });

    expect(routes.every((r) => !r.characteristics.includes('Closest available'))).toBe(true);
  });

  test('uses the actual generated distance, never the requested target', async () => {
    const { findRoutes } = loadRouting('test-key');
    // Within tolerance, so no second pass complicates which distance is used.
    fetchMock.mockResolvedValue(jsonResponse(orsFixture(5300)) as never);

    const routes = await findRoutes({ origin: ORIGIN, targetKm: 5 });
    expect(routes.every((r) => r.distanceKm === 5.3)).toBe(true);
  });

  test('malformed ORS response (no features) yields no-routes, not a crash', async () => {
    const { findRoutes } = loadRouting('test-key');
    fetchMock.mockResolvedValue(jsonResponse({ features: [] }) as never);

    await expect(findRoutes({ origin: ORIGIN, targetKm: 5 })).rejects.toMatchObject({
      code: 'no-routes',
    });
  });

  test('a rate-limited response surfaces as rate-limit, not a generic failure', async () => {
    const { findRoutes } = loadRouting('test-key');
    fetchMock.mockResolvedValue(jsonResponse({}, 429) as never);

    await expect(findRoutes({ origin: ORIGIN, targetKm: 5 })).rejects.toMatchObject({
      code: 'rate-limit',
    });
  });

  test('a real captured ORS quota-exceeded response fails cleanly, not as a crash', async () => {
    // Captured live during this issue's investigation: ORS's daily quota
    // returns HTTP 403 with a flat `{"error": "..."}` string body — a
    // different shape from the GeoJSON error object elsewhere in this file.
    const quotaExceeded = require('../__tests__/fixtures/ors-quota-exceeded.json');
    const { findRoutes } = loadRouting('test-key');
    fetchMock.mockResolvedValue(jsonResponse(quotaExceeded, 403) as never);

    // 403 is classified alongside 401 as `auth` today — not a perfectly
    // labelled cause, but it fails explicitly rather than being misread as a
    // usable (empty) route response.
    await expect(findRoutes({ origin: ORIGIN, targetKm: 5 })).rejects.toMatchObject({
      code: 'auth',
    });
  });

  test('a network failure surfaces as network, not a generic failure', async () => {
    const { findRoutes } = loadRouting('test-key');
    fetchMock.mockRejectedValue(new Error('offline') as never);

    await expect(findRoutes({ origin: ORIGIN, targetKm: 5 })).rejects.toMatchObject({
      code: 'network',
    });
  });

  test('rejects an invalid origin without calling out', async () => {
    const { findRoutes } = loadRouting('test-key');
    await expect(
      findRoutes({ origin: { latitude: 999, longitude: 0 }, targetKm: 5 }),
    ).rejects.toMatchObject({ code: 'invalid-origin' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('path attributes (#14)', () => {
  test('derives footway and road percentages from the waytype summary', () => {
    const { pathAttributesFromExtras } = loadRouting('test-key');
    const attributes = pathAttributesFromExtras(ORS_EXTRAS);
    expect(attributes.footwayPercent).toBe(99); // 98.91 + 0.2, rounded
    expect(attributes.roadPercent).toBe(1); // 0.89, rounded
  });

  test('counts only recognised unsealed surfaces as unpaved', () => {
    const { pathAttributesFromExtras } = loadRouting('test-key');
    // 6.52% gravel; concrete/asphalt/unknown are sealed or unknown, not unpaved.
    expect(pathAttributesFromExtras(ORS_EXTRAS).unpavedPercent).toBe(7);
  });

  test('reports unknown, not zero, when a dimension has no readable summary', () => {
    const { pathAttributesFromExtras } = loadRouting('test-key');
    expect(pathAttributesFromExtras(undefined).unpavedPercent).toBeNull();
    expect(pathAttributesFromExtras({}).footwayPercent).toBeNull();
    expect(pathAttributesFromExtras({ waytype: { summary: [] } }).footwayPercent).toBeNull();
    expect(
      pathAttributesFromExtras({ waytype: { summary: ORS_EXTRAS.waytype.summary } }).unpavedPercent,
    ).toBeNull();
  });

  test('ignores malformed summary entries rather than throwing', () => {
    const { pathAttributesFromExtras } = loadRouting('test-key');
    const attributes = pathAttributesFromExtras({
      waytype: { summary: [{ value: 'x', amount: 10 }, { value: 7, amount: Number.NaN }, null] },
    });
    expect(attributes.footwayPercent).toBeNull();
  });

  test('labels a route that is mostly on footways', () => {
    const { characteristicLabelsFor } = loadRouting('test-key');
    expect(
      characteristicLabelsFor({ footwayPercent: 99, roadPercent: 1, unpavedPercent: 0 }),
    ).toEqual(['Mostly footways & paths']);
  });

  test('flags road exposure and unpaved sections without combining them into a score', () => {
    const { characteristicLabelsFor } = loadRouting('test-key');
    const labels = characteristicLabelsFor({
      footwayPercent: 60,
      roadPercent: 25,
      unpavedPercent: 40,
    });
    expect(labels).toContain('Some main-road sections');
    expect(labels).toContain('Partly unpaved');
    expect(labels).not.toContain('Mostly footways & paths');
  });

  test('claims nothing when data is present but below every threshold', () => {
    const { characteristicLabelsFor } = loadRouting('test-key');
    expect(
      characteristicLabelsFor({ footwayPercent: 50, roadPercent: 5, unpavedPercent: 0 }),
    ).toEqual([]);
  });

  test('says unknown — not "none" — when no path data was returned', () => {
    const { characteristicLabelsFor } = loadRouting('test-key');
    expect(
      characteristicLabelsFor({ footwayPercent: null, roadPercent: null, unpavedPercent: null }),
    ).toEqual(['Path surface unknown']);
  });

  test('carries attributes through to the candidate and its labels', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(jsonResponse(orsFixture(5000, 12, ORS_EXTRAS)) as never);

    const { findRoutes } = loadRouting('test-key');
    const routes = await findRoutes({ origin: ORIGIN, targetKm: 5 });

    expect(routes[0].attributes?.footwayPercent).toBe(99);
    expect(routes[0].characteristics).toContain('Mostly footways & paths');
  });
});
