/**
 * Route quality evaluation harness (#61).
 *
 * The point of this file is to make route-quality changes *measurable*. It
 * scores a fixed set of real provider responses captured across three places of
 * different character, so a change that improves one case and wrecks another is
 * visible instead of being an opinion.
 *
 * Two kinds of assertion:
 *
 * 1. **Baseline** — the recorded metrics for each fixture. Tightening one is how
 *    an improvement gets locked in; loosening one needs a written reason.
 * 2. **Gate** — an absolute floor no fixture may fall below. This is what makes
 *    CI fail when quality drops.
 *
 * Everything runs offline against stored JSON, so it costs no provider quota
 * and cannot flake on the network.
 */
import { describe, expect, test } from '@jest/globals';

import { analyzeRoute, formatMetrics } from '../route-quality';
import type { Coordinate } from '../routing';

type Fixture = {
  summary?: { distance?: number };
  extras?: unknown;
  coordinates: [number, number][];
};

// Captured from the live ORS foot-walking API (5 km round trip, fixed seed),
// then trimmed to summary, extras and rounded geometry.
const manhattan = require('./fixtures/ors/manhattan.json') as Fixture;
const london = require('./fixtures/ors/london.json') as Fixture;
const rural = require('./fixtures/ors/rural.json') as Fixture;

const FIXTURES: Record<string, Fixture> = { manhattan, london, rural };

type Baseline = {
  backtrackRatio: number;
  turnsPerKm: number;
  compactness: number;
  elongation: number;
  selfIntersections: number;
};

/**
 * Recorded on 2026-09-18 against the fixtures in this directory. These are
 * descriptions of what the provider actually returns — not targets.
 */
const BASELINE: Record<string, Baseline> = {
  manhattan: {
    backtrackRatio: 0,
    turnsPerKm: 4.61,
    compactness: 0.572,
    elongation: 1.59,
    selfIntersections: 0,
  },
  london: {
    backtrackRatio: 0,
    turnsPerKm: 5.29,
    compactness: 0.368,
    elongation: 1.86,
    selfIntersections: 0,
  },
  rural: {
    backtrackRatio: 0.0046,
    turnsPerKm: 5.74,
    compactness: 0.495,
    elongation: 1.64,
    selfIntersections: 0,
  },
};

/**
 * The floor every fixture must clear. Deliberately loose relative to the
 * baseline so ordinary variation does not fail the build, but tight enough that
 * a real regression — a route that doubles back, a zig-zag, or a route that
 * stops being a loop — trips it.
 */
const GATE = {
  maxBacktrackRatio: 0.15,
  maxTurnsPerKm: 8,
  minCompactness: 0.3,
};

function trackOf(fixture: Fixture): Coordinate[] {
  return fixture.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
}

describe('route quality fixtures (#61)', () => {
  test('the fixture set is present and usable', () => {
    for (const fixture of Object.values(FIXTURES)) {
      expect(fixture.coordinates.length).toBeGreaterThan(100);
      expect(fixture.summary?.distance).toBeGreaterThan(0);
    }
  });

  test('reports the current quality of every fixture', () => {
    const lines = Object.entries(FIXTURES).map(([name, fixture]) =>
      formatMetrics(name, analyzeRoute(trackOf(fixture))),
    );
    // Printed so a run shows the current picture, not just pass/fail.
    console.log(`\nRoute quality:\n${lines.join('\n')}`);
    expect(lines).toHaveLength(Object.keys(FIXTURES).length);
  });

  test('matches the recorded baseline', () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      const metrics = analyzeRoute(trackOf(fixture));
      const baseline = BASELINE[name];
      expect(metrics.backtracking.ratio).toBeCloseTo(baseline.backtrackRatio, 2);
      expect(metrics.turniness.perKm).toBeCloseTo(baseline.turnsPerKm, 1);
      expect(metrics.shape.compactness).toBeCloseTo(baseline.compactness, 2);
      expect(metrics.shape.elongation).toBeCloseTo(baseline.elongation, 1);
      expect(metrics.shape.selfIntersections).toBe(baseline.selfIntersections);
    }
  });

  test('passes the quality gate', () => {
    for (const fixture of Object.values(FIXTURES)) {
      const metrics = analyzeRoute(trackOf(fixture));
      expect(metrics.backtracking.ratio).toBeLessThanOrEqual(GATE.maxBacktrackRatio);
      expect(metrics.turniness.perKm).toBeLessThanOrEqual(GATE.maxTurnsPerKm);
      // A loop that encloses almost nothing is not a loop.
      expect(metrics.shape.compactness).toBeGreaterThanOrEqual(GATE.minCompactness);
      expect(metrics.shape.selfIntersections).toBe(0);
    }
  });

  test('is deterministic', () => {
    for (const fixture of Object.values(FIXTURES)) {
      expect(analyzeRoute(trackOf(fixture))).toEqual(analyzeRoute(trackOf(fixture)));
    }
  });
});
