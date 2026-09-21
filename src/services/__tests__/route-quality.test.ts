/**
 * Tests for the backtracking metric (#53).
 *
 * These use synthetic tracks in metres so the expected ratio is obvious: a
 * perfect out-and-back should read about 0.5 (half of it retraces the other
 * half), a true loop about 0, and a small spur a small number.
 */
import { describe, expect, test } from '@jest/globals';

import {
  analyzeRoute,
  backtracking,
  loopShape,
  scoreRoute,
  turnDensity,
  type RouteQualityMetrics,
} from '../route-quality';
import type { Coordinate } from '../routing';

const ORIGIN = { latitude: 40.7484, longitude: -73.9857 };
const METERS_PER_DEGREE_LAT = 111_320;

function offset(northMeters: number, eastMeters: number): Coordinate {
  return {
    latitude: ORIGIN.latitude + northMeters / METERS_PER_DEGREE_LAT,
    longitude:
      ORIGIN.longitude +
      eastMeters /
        (METERS_PER_DEGREE_LAT * Math.cos((ORIGIN.latitude * Math.PI) / 180)),
  };
}

describe('backtracking (#53)', () => {
  test('is zero for a route with no usable track', () => {
    expect(backtracking([])).toEqual({ meters: 0, ratio: 0 });
    expect(backtracking([offset(0, 0)])).toEqual({ meters: 0, ratio: 0 });
  });

  test('is zero for a one-way straight line', () => {
    const result = backtracking([offset(0, 0), offset(0, 1000)]);
    expect(result.ratio).toBeLessThan(0.05);
  });

  test('reads about 0.5 for a perfect out-and-back', () => {
    const result = backtracking([offset(0, 0), offset(0, 1000), offset(0, 0)]);
    expect(result.ratio).toBeGreaterThan(0.4);
    expect(result.ratio).toBeLessThan(0.6);
    expect(result.meters).toBeGreaterThan(400);
  });

  test('is near zero for a square loop that never retraces', () => {
    const result = backtracking([
      offset(0, 0),
      offset(0, 500),
      offset(500, 500),
      offset(500, 0),
      offset(0, 0),
    ]);
    expect(result.ratio).toBeLessThan(0.1);
  });

  test('is near zero for a triangular loop with a diagonal return', () => {
    const result = backtracking([
      offset(0, 0),
      offset(0, 1000),
      offset(1000, 1000),
      offset(0, 0),
    ]);
    expect(result.ratio).toBeLessThan(0.15);
  });

  test('reports only the retraced part when a long route doubles back briefly', () => {
    // 2000 m out, then 100 m back: the retrace is a small share of the route.
    const result = backtracking([offset(0, 0), offset(0, 2000), offset(0, 1900)]);
    expect(result.ratio).toBeGreaterThan(0);
    expect(result.ratio).toBeLessThan(0.1);
  });

  test('does not count a same-direction leg as backtracking', () => {
    // North, a short step east, north again: a stair. The two north legs run
    // the same way and must not be treated as a retrace.
    const result = backtracking([
      offset(0, 0),
      offset(0, 1000),
      offset(8, 1000),
      offset(8, 2000),
    ]);
    expect(result.ratio).toBeLessThan(0.05);
  });
});

describe('turnDensity (#54)', () => {
  test('is zero for a straight line', () => {
    // Add a mid-point so there is something to simplify.
    expect(turnDensity([offset(0, 0), offset(0, 500), offset(0, 1000)])).toEqual({
      turns: 0,
      perKm: 0,
    });
  });

  test('is zero for too few points', () => {
    expect(turnDensity([offset(0, 0), offset(0, 1000)])).toEqual({ turns: 0, perKm: 0 });
    expect(turnDensity([])).toEqual({ turns: 0, perKm: 0 });
  });

  test('counts a single right-angle turn', () => {
    const result = turnDensity([offset(0, 0), offset(0, 1000), offset(1000, 1000)]);
    expect(result.turns).toBe(1);
    expect(result.perKm).toBeCloseTo(0.5, 1); // 1 turn over 2 km
  });

  test('counts every corner of a closed square loop, including the junction', () => {
    const result = turnDensity([
      offset(0, 0),
      offset(0, 500),
      offset(500, 500),
      offset(500, 0),
      offset(0, 0),
    ]);
    expect(result.turns).toBe(4);
    expect(result.perKm).toBeCloseTo(2, 1); // 4 turns over 2 km
  });

  test('does not mistake a gradual curve for turns', () => {
    // A wide arc sampled densely: many small heading changes, no sharp corner.
    const radius = 800;
    const arc: Coordinate[] = [];
    for (let step = 0; step <= 40; step += 1) {
      const angle = (step / 40) * (Math.PI / 2);
      arc.push(offset(Math.sin(angle) * radius, (1 - Math.cos(angle)) * radius));
    }
    expect(turnDensity(arc).turns).toBeLessThanOrEqual(1);
  });

  test('normalises by length so a longer route with the same corners scores lower', () => {
    const shortL = turnDensity([offset(0, 0), offset(0, 500), offset(500, 500)]);
    const longL = turnDensity([offset(0, 0), offset(0, 5000), offset(5000, 5000)]);
    expect(shortL.turns).toBe(1);
    expect(longL.turns).toBe(1);
    expect(longL.perKm).toBeLessThan(shortL.perKm);
  });
});

describe('loopShape (#58)', () => {
  test('returns neutral defaults for too few points', () => {
    expect(loopShape([])).toEqual({ compactness: 0, elongation: 1, selfIntersections: 0 });
    expect(loopShape([offset(0, 0), offset(0, 100)])).toEqual({
      compactness: 0,
      elongation: 1,
      selfIntersections: 0,
    });
  });

  test('scores a square as compact and round', () => {
    const result = loopShape([
      offset(0, 0),
      offset(0, 500),
      offset(500, 500),
      offset(500, 0),
      offset(0, 0),
    ]);
    // π/4 ≈ 0.785 is the exact Polsby–Popper value for a square.
    expect(result.compactness).toBeGreaterThan(0.7);
    expect(result.compactness).toBeLessThan(0.85);
    expect(result.elongation).toBeGreaterThan(0.7);
    expect(result.elongation).toBeLessThan(1.4);
    expect(result.selfIntersections).toBe(0);
  });

  test('scores a long thin rectangle as poorly compact and elongated', () => {
    const result = loopShape([
      offset(0, 0),
      offset(0, 1000),
      offset(200, 1000),
      offset(200, 0),
      offset(0, 0),
    ]);
    expect(result.compactness).toBeLessThan(0.5);
    expect(result.elongation).toBeGreaterThan(4);
  });

  test('counts a self-crossing figure-eight', () => {
    const result = loopShape([
      offset(0, 0),
      offset(1000, 1000),
      offset(1000, 0),
      offset(0, 1000),
      offset(0, 0),
    ]);
    expect(result.selfIntersections).toBeGreaterThanOrEqual(1);
  });

  test('gives a straight line almost no compactness', () => {
    const result = loopShape([offset(0, 0), offset(0, 500), offset(0, 1000)]);
    expect(result.compactness).toBeLessThan(0.05);
  });
});

function metrics(overrides: Partial<RouteQualityMetrics> = {}): RouteQualityMetrics {
  return {
    backtracking: { meters: 0, ratio: 0 },
    turniness: { turns: 0, perKm: 0 },
    shape: { compactness: 0.785, elongation: 1, selfIntersections: 0 },
    ...overrides,
  };
}

describe('scoreRoute (#52)', () => {
  const TARGET = 5000;
  const TOLERANCE = 750;

  test('scores a clean, on-target loop near the top', () => {
    const score = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE);
    expect(score.components.distance).toBeCloseTo(1, 3);
    expect(score.components.backtracking).toBeCloseTo(1, 3);
    expect(score.components.turns).toBeCloseTo(1, 3);
    expect(score.components.shape).toBeCloseTo(0.785, 3);
    expect(score.total).toBeGreaterThan(0.9);
    expect(score.total).toBeLessThanOrEqual(1);
  });

  test('drops the distance component to zero at the tolerance edge', () => {
    expect(scoreRoute(metrics(), TARGET + TOLERANCE, TARGET, TOLERANCE).components.distance).toBe(0);
    expect(scoreRoute(metrics(), TARGET + TOLERANCE / 2, TARGET, TOLERANCE).components.distance).toBeCloseTo(0.5, 3);
  });

  test('zeroes a component at its documented limit', () => {
    expect(scoreRoute(metrics({ backtracking: { meters: 1200, ratio: 0.25 } }), TARGET, TARGET, TOLERANCE).components.backtracking).toBe(0);
    expect(scoreRoute(metrics({ turniness: { turns: 60, perKm: 12 } }), TARGET, TARGET, TOLERANCE).components.turns).toBe(0);
    expect(scoreRoute(metrics({ shape: { compactness: 0.785, elongation: 3, selfIntersections: 0 } }), TARGET, TARGET, TOLERANCE).components.shape).toBe(0);
  });

  test('penalises self-intersections', () => {
    const clean = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE).components.shape;
    const crossing = scoreRoute(
      metrics({ shape: { compactness: 0.785, elongation: 1, selfIntersections: 1 } }),
      TARGET,
      TARGET,
      TOLERANCE,
    ).components.shape;
    expect(crossing).toBeLessThan(clean);
  });

  test('is monotonic in backtracking', () => {
    const some = scoreRoute(metrics({ backtracking: { meters: 250, ratio: 0.05 } }), TARGET, TARGET, TOLERANCE);
    const more = scoreRoute(metrics({ backtracking: { meters: 500, ratio: 0.1 } }), TARGET, TARGET, TOLERANCE);
    expect(more.total).toBeLessThan(some.total);
  });

  test('a clean loop beats an equal-distance route that doubles back', () => {
    const clean = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE);
    const doublesBack = scoreRoute(metrics({ backtracking: { meters: 2500, ratio: 0.5 } }), TARGET, TARGET, TOLERANCE);
    expect(doublesBack.total).toBeLessThan(clean.total);
  });

  test('every component stays within 0–1 for extreme inputs', () => {
    const extreme = scoreRoute(
      metrics({
        backtracking: { meters: 9999, ratio: 5 },
        turniness: { turns: 999, perKm: 99 },
        shape: { compactness: 5, elongation: 99, selfIntersections: 9 },
      }),
      TARGET,
      0,
      TOLERANCE,
    );
    for (const value of Object.values(extreme.components)) {
      if (value === null) {
        continue;
      }
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(extreme.total).toBeGreaterThanOrEqual(0);
    expect(extreme.total).toBeLessThanOrEqual(1);
  });

  test('prefers footways over roads when path data is available (#55)', () => {
    const footway = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      footwayPercent: 95,
      roadPercent: 5,
    });
    const road = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      footwayPercent: 20,
      roadPercent: 80,
    });
    expect(footway.components.pedestrian).toBeGreaterThan(road.components.pedestrian ?? 0);
    expect(footway.total).toBeGreaterThan(road.total);
  });

  test('drops the pedestrian component — and renormalises — when no path data exists', () => {
    const withData = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      footwayPercent: 0,
      roadPercent: 100,
    });
    const withoutData = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE);
    expect(withoutData.components.pedestrian).toBeNull();
    // Absent data must not be scored as bad: a route with no path data should
    // not lose to one known to be all road.
    expect(withoutData.total).toBeGreaterThan(withData.total);
  });

  test('treats a single unknown dimension as neutral, not as bad', () => {
    const neutral = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      footwayPercent: null,
      roadPercent: null,
    });
    expect(neutral.components.pedestrian).toBeNull();

    const partlyKnown = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      footwayPercent: 100,
      roadPercent: null,
    });
    expect(partlyKnown.components.pedestrian).toBeCloseTo(0.5, 3);
  });

  test('ranks a high major-road exposure route below a low-exposure one (#56)', () => {
    const base = { footwayPercent: 60, roadPercent: 40 };
    const quiet = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      ...base,
      majorRoadPercent: 5,
    });
    const exposed = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      ...base,
      majorRoadPercent: 35,
    });
    expect(quiet.components.majorRoad).toBeGreaterThan(exposed.components.majorRoad ?? 0);
    expect(quiet.total).toBeGreaterThan(exposed.total);
  });

  test('scores the major-road component zero at or above the ceiling (#56)', () => {
    const score = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      footwayPercent: 50,
      roadPercent: 50,
      majorRoadPercent: 40,
    });
    expect(score.components.majorRoad).toBe(0);
  });

  test('drops the major-road component when the provider gave no waytype data (#56)', () => {
    const unknown = scoreRoute(metrics(), TARGET, TARGET, TOLERANCE, {
      footwayPercent: 60,
      roadPercent: 40,
      majorRoadPercent: null,
    });
    expect(unknown.components.majorRoad).toBeNull();
  });

  test('prefers a flatter route of the same length (#60)', () => {
    const flat = scoreRoute(metrics(), 5000, 5000, TOLERANCE, undefined, 20);
    const hilly = scoreRoute(metrics(), 5000, 5000, TOLERANCE, undefined, 150);
    expect(flat.components.elevation).toBeGreaterThan(hilly.components.elevation ?? 0);
    expect(flat.total).toBeGreaterThan(hilly.total);
  });

  test('scores the elevation component zero at or above 40 m/km (#60)', () => {
    const score = scoreRoute(metrics(), 5000, 5000, TOLERANCE, undefined, 200);
    expect(score.components.elevation).toBe(0);
  });

  test('drops the elevation component when no ascent is known (#60)', () => {
    const unknown = scoreRoute(metrics(), 5000, 5000, TOLERANCE, undefined, undefined);
    expect(unknown.components.elevation).toBeNull();
  });

  test('the harness metrics feed it directly', () => {
    const track = [
      offset(0, 0),
      offset(0, 500),
      offset(500, 500),
      offset(500, 0),
      offset(0, 0),
    ];
    const score = scoreRoute(analyzeRoute(track), 2000, 2000, 300);
    expect(score.total).toBeGreaterThan(0.5);
  });
});
