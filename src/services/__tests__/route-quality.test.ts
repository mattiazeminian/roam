/**
 * Tests for the backtracking metric (#53).
 *
 * These use synthetic tracks in metres so the expected ratio is obvious: a
 * perfect out-and-back should read about 0.5 (half of it retraces the other
 * half), a true loop about 0, and a small spur a small number.
 */
import { describe, expect, test } from '@jest/globals';

import { backtracking, turnDensity } from '../route-quality';
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
