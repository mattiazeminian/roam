/**
 * Tests for the GPS tracking math added/fixed in issue #8.
 *
 * `applySample` is pure and synchronous (see the header comment on
 * run-session.ts), so every scenario here is expressed as a sequence of
 * `LocationSample`s folded through it — no mocking, no timers, no React.
 */
import { describe, expect, test } from '@jest/globals';

import {
  applySample,
  createTrackerState,
  preparePlannedRoute,
  trackerStateFromCheckpoint,
  type PlannedRoute,
  type SavedRun,
  type TrackerState,
} from '../run-session';
import type { LocationSample } from '../location';

/** A base point in Manhattan; offsets below are small enough to stay planar. */
const ORIGIN = { latitude: 40.7484, longitude: -73.9857 };
const METERS_PER_DEGREE_LAT = 111_320;

/** A point `north`/`east` meters from ORIGIN. */
function offset(northMeters: number, eastMeters: number) {
  return {
    latitude: ORIGIN.latitude + northMeters / METERS_PER_DEGREE_LAT,
    longitude:
      ORIGIN.longitude +
      eastMeters / (METERS_PER_DEGREE_LAT * Math.cos((ORIGIN.latitude * Math.PI) / 180)),
  };
}

const BASE_TIME = 1_700_000_000_000;

function sample(overrides: Partial<LocationSample> = {}): LocationSample {
  return {
    coordinate: ORIGIN,
    accuracyMeters: 5,
    timestamp: BASE_TIME,
    speedMetersPerSecond: null,
    ...overrides,
  };
}

/** Feeds a sequence of samples through `applySample`, in order. */
function feed(samples: LocationSample[], start: TrackerState = createTrackerState()) {
  return samples.reduce((state, s) => applySample(state, s, null, s.timestamp + 1), start);
}

describe('first valid location', () => {
  test('establishes the starting point without adding distance', () => {
    const state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    expect(state.coordinates).toEqual([offset(0, 0)]);
    expect(state.distanceMeters).toBe(0);
    expect(state.lastSample?.timestamp).toBe(BASE_TIME);
  });
});

describe('distance accumulation', () => {
  test('a second valid location adds real distance', () => {
    const state = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 20), timestamp: BASE_TIME + 5000 }),
    ]);
    expect(state.coordinates).toHaveLength(2);
    expect(state.distanceMeters).toBeCloseTo(20, 0);
  });

  test('multiple points accumulate incrementally, not from the original start', () => {
    const state = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 20), timestamp: BASE_TIME + 5_000 }),
      sample({ coordinate: offset(0, 50), timestamp: BASE_TIME + 12_000 }),
      sample({ coordinate: offset(0, 100), timestamp: BASE_TIME + 25_000 }),
    ]);
    // 20 + 30 + 50 = 100m, not haversine(start, last) which would also be 100
    // here by construction — use a non-collinear point to actually prove it's
    // incremental rather than start-to-last.
    expect(state.distanceMeters).toBeCloseTo(100, 0);
    expect(state.coordinates).toHaveLength(4);

    const bent = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 30), timestamp: BASE_TIME + 6_000 }),
      sample({ coordinate: offset(40, 30), timestamp: BASE_TIME + 14_000 }),
    ]);
    // Straight-line start-to-end would be 50m (3-4-5 triangle); the actual
    // incremental path is 30 + 40 = 70m. Distance must reflect the path,
    // not a shortcut back to the original starting point.
    expect(bent.distanceMeters).toBeCloseTo(70, 0);
  });

  test('no single call double-counts: one sample, one push, one addition', () => {
    let state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    state = applySample(
      state,
      sample({ coordinate: offset(0, 20), timestamp: BASE_TIME + 5000 }),
      null,
      BASE_TIME + 5001,
    );
    expect(state.coordinates).toHaveLength(2);
    expect(state.distanceMeters).toBeCloseTo(20, 0);
  });
});

describe('invalid coordinates', () => {
  test('NaN coordinates are rejected and cannot poison future distance', () => {
    const seeded = feed([sample({ coordinate: offset(0, 0), timestamp: BASE_TIME })]);
    const afterBad = applySample(
      seeded,
      sample({ coordinate: { latitude: NaN, longitude: NaN }, timestamp: BASE_TIME + 5000 }),
      null,
      BASE_TIME + 5001,
    );
    expect(afterBad).toBe(seeded); // identity unchanged: fully rejected
    expect(afterBad.distanceMeters).toBe(0);
    expect(Number.isFinite(afterBad.distanceMeters)).toBe(true);

    // And a real fix afterwards must still work normally — one bad sample
    // must not leave any lingering NaN in the state.
    const after = applySample(
      afterBad,
      sample({ coordinate: offset(0, 20), timestamp: BASE_TIME + 10_000 }),
      null,
      BASE_TIME + 10_001,
    );
    expect(after.distanceMeters).toBeCloseTo(20, 0);
  });

  test('out-of-range coordinates are rejected', () => {
    const state = applySample(
      createTrackerState(),
      sample({ coordinate: { latitude: 999, longitude: 0 }, timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    expect(state.coordinates).toHaveLength(0);
  });
});

describe('accuracy filtering', () => {
  test('a fix worse than the accuracy ceiling is rejected and flags degraded signal', () => {
    const state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), accuracyMeters: 80, timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    expect(state.coordinates).toHaveLength(0);
    expect(state.degradedSignal).toBe(true);
  });

  test('a fix with no reported accuracy is treated as untrustworthy, not free-pass trusted', () => {
    const state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), accuracyMeters: null, timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    expect(state.coordinates).toHaveLength(0);
    expect(state.degradedSignal).toBe(true);
  });

  test('a good fix after a poor one clears the degraded flag', () => {
    let state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), accuracyMeters: 80, timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    expect(state.degradedSignal).toBe(true);
    state = applySample(
      state,
      sample({ coordinate: offset(0, 0), accuracyMeters: 5, timestamp: BASE_TIME + 1000 }),
      null,
      BASE_TIME + 1001,
    );
    expect(state.degradedSignal).toBe(false);
  });
});

describe('stale fixes', () => {
  test('a fix far older than "now" is rejected — the cached-first-fix case', () => {
    // iOS commonly answers the first watch callback with a stale cached
    // location. Simulate one 60s old arriving as if it were current.
    const state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      null,
      BASE_TIME + 60_000,
    );
    expect(state.coordinates).toHaveLength(0);
    expect(state.lastSample).toBeNull();
  });

  test('a fix within the freshness window is accepted', () => {
    const state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      null,
      BASE_TIME + 2000,
    );
    expect(state.coordinates).toHaveLength(1);
  });
});

describe('impossible GPS jumps', () => {
  test('a jump implying > ~45 km/h is rejected', () => {
    const seeded = feed([sample({ coordinate: offset(0, 0), timestamp: BASE_TIME })]);
    // 200m in 2s = 100 m/s — far beyond any runner.
    const state = applySample(
      seeded,
      sample({ coordinate: offset(0, 200), timestamp: BASE_TIME + 2000 }),
      null,
      BASE_TIME + 2001,
    );
    expect(state).toBe(seeded);
    expect(state.distanceMeters).toBe(0);
  });

  test('a fix with a backwards or duplicate timestamp is rejected outright', () => {
    // This is the exact gap #8 closed: clamping elapsed time to zero used to
    // skip the speed check entirely (it only ran `if (elapsedSeconds > 0)`),
    // so an out-of-order fix with a huge jump was silently accepted.
    const seeded = feed([sample({ coordinate: offset(0, 0), timestamp: BASE_TIME })]);
    const state = applySample(
      seeded,
      sample({ coordinate: offset(0, 500), timestamp: BASE_TIME - 1 }),
      null,
      BASE_TIME + 1,
    );
    expect(state).toBe(seeded);
    expect(state.distanceMeters).toBe(0);

    const equalTimestamp = applySample(
      seeded,
      sample({ coordinate: offset(0, 500), timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    expect(equalTimestamp).toBe(seeded);
  });

  test('legitimate fast movement over a real gap is still accepted', () => {
    // A genuine signal gap (e.g. briefly obstructed view of the sky): 60m in
    // 20s = 3 m/s, an ordinary running pace, must not be penalised just
    // because the previous fix is old.
    const seeded = feed([sample({ coordinate: offset(0, 0), timestamp: BASE_TIME })]);
    const state = applySample(
      seeded,
      sample({ coordinate: offset(0, 60), timestamp: BASE_TIME + 20_000 }),
      null,
      BASE_TIME + 20_001,
    );
    expect(state.distanceMeters).toBeCloseTo(60, 0);
  });
});

describe('rejected points do not contribute, and tracking recovers after them', () => {
  test('a run of good, bad, good samples only counts the good movement', () => {
    let state = createTrackerState();
    state = applySample(state, sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }), null, BASE_TIME + 1);
    state = applySample(
      state,
      sample({ coordinate: offset(0, 30), timestamp: BASE_TIME + 6000 }),
      null,
      BASE_TIME + 6001,
    ); // +30m, good
    const beforeBad = state.distanceMeters;

    // Bad accuracy — rejected.
    state = applySample(
      state,
      sample({ coordinate: offset(0, 500), accuracyMeters: 90, timestamp: BASE_TIME + 7000 }),
      null,
      BASE_TIME + 7001,
    );
    expect(state.distanceMeters).toBe(beforeBad);
    expect(state.coordinates).toHaveLength(2);

    // Movement resumes normally from the last *accepted* position.
    state = applySample(
      state,
      sample({ coordinate: offset(0, 55), timestamp: BASE_TIME + 12_000 }),
      null,
      BASE_TIME + 12_001,
    ); // +25m from offset(0,30)
    expect(state.distanceMeters).toBeCloseTo(55, 0);
    expect(state.coordinates).toHaveLength(3);
    expect(state.coordinates[2]).toEqual(offset(0, 55));
  });
});

describe('recovering a checkpointed run (#11)', () => {
  function checkpoint(overrides: Partial<SavedRun> = {}): SavedRun {
    return {
      id: 'run-1',
      startedAt: BASE_TIME,
      endedAt: BASE_TIME + 600_000,
      route: null,
      targetDistanceKm: 5,
      distanceKm: 1.2,
      durationSeconds: 480,
      averagePaceMinPerKm: 6.67,
      coordinates: [offset(0, 0), offset(0, 50), offset(0, 120)],
      status: 'active',
      ...overrides,
    };
  }

  test('restores the track and distance', () => {
    const state = trackerStateFromCheckpoint(checkpoint());
    expect(state.coordinates).toEqual([offset(0, 0), offset(0, 50), offset(0, 120)]);
    expect(state.distanceMeters).toBeCloseTo(1200, 0);
  });

  test('does not restore lastSample, so the next fix re-seeds instead of adding a bogus jump', () => {
    const state = trackerStateFromCheckpoint(checkpoint());
    expect(state.lastSample).toBeNull();

    const beforeDistance = state.distanceMeters;
    const next = applySample(
      state,
      sample({ coordinate: offset(0, 5000), timestamp: BASE_TIME + 700_000 }),
      null,
      BASE_TIME + 700_001,
    );
    // The huge jump from the checkpoint's last point never gets measured —
    // this fix just joins the track, exactly like the first fix of a run.
    expect(next.distanceMeters).toBe(beforeDistance);
    expect(next.coordinates).toHaveLength(4);
  });

  test('resets route progress, which is expected to re-derive from later fixes', () => {
    const state = trackerStateFromCheckpoint(checkpoint());
    expect(state.progressMeters).toBe(0);
    expect(state.segmentIndex).toBe(0);
  });
});

describe('completion detection (#10)', () => {
  // A rectangular loop, ~2000m round. Each leg runs a different compass
  // direction so no two segments retrace the same line — an out-and-back on
  // a single line is ambiguous for path projection (a point midway matches
  // both the outbound and return segments), which a real loop route avoids.
  const planned: PlannedRoute = preparePlannedRoute({
    id: 'loop',
    distanceKm: 2,
    estimatedMinutes: 20,
    geometry: [offset(0, 0), offset(0, 500), offset(500, 500), offset(500, 0), offset(0, 0)],
    characteristics: [],
  }) as PlannedRoute;

  function feedWithRoute(samples: LocationSample[]) {
    let state = createTrackerState();
    for (const s of samples) {
      state = applySample(state, s, planned, s.timestamp + 1);
    }
    return state;
  }

  test('returning to the start after covering the loop suggests completion', () => {
    const state = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 500), timestamp: BASE_TIME + 100_000 }), // 25%
      sample({ coordinate: offset(500, 500), timestamp: BASE_TIME + 200_000 }), // 50%
      sample({ coordinate: offset(500, 0), timestamp: BASE_TIME + 300_000 }), // 75%
      sample({ coordinate: offset(400, 0), timestamp: BASE_TIME + 320_000 }), // 80%, still far from start
      sample({ coordinate: offset(20, 0), timestamp: BASE_TIME + 400_000 }), // ~99%, near start
      sample({ coordinate: offset(15, 0), timestamp: BASE_TIME + 410_000 }), // streak 1
      sample({ coordinate: offset(10, 0), timestamp: BASE_TIME + 420_000 }), // streak 2
      sample({ coordinate: offset(8, 0), timestamp: BASE_TIME + 430_000 }), // streak 3 — suggested
    ]);
    expect(state.completionSuggested).toBe(true);
  });

  test('a single stray point near the start does not suggest completion', () => {
    const state = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 500), timestamp: BASE_TIME + 100_000 }), // 25%
      sample({ coordinate: offset(500, 500), timestamp: BASE_TIME + 200_000 }), // 50%
      sample({ coordinate: offset(500, 0), timestamp: BASE_TIME + 300_000 }), // 75%
      sample({ coordinate: offset(400, 0), timestamp: BASE_TIME + 320_000 }), // 80%
      sample({ coordinate: offset(20, 0), timestamp: BASE_TIME + 400_000 }), // near start, only one qualifying fix
    ]);
    expect(state.completionSuggested).toBe(false);
  });

  test('a mid-route pass near the start does not suggest completion', () => {
    // Never gets far enough along the route — passes near the origin early,
    // as a runner crossing their own outbound path might.
    const state = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 50), timestamp: BASE_TIME + 10_000 }), // ~2.5%
      sample({ coordinate: offset(0, 10), timestamp: BASE_TIME + 20_000 }), // back near start, still ~2.5%
      sample({ coordinate: offset(0, 5), timestamp: BASE_TIME + 30_000 }),
      sample({ coordinate: offset(0, 2), timestamp: BASE_TIME + 40_000 }),
    ]);
    expect(state.completionSuggested).toBe(false);
  });

  test('a stationary runner at the finish still triggers, even though the jitter filter would otherwise reject these fixes', () => {
    const state = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 500), timestamp: BASE_TIME + 100_000 }), // 25%
      sample({ coordinate: offset(500, 500), timestamp: BASE_TIME + 200_000 }), // 50%
      sample({ coordinate: offset(500, 0), timestamp: BASE_TIME + 300_000 }), // 75%
      sample({ coordinate: offset(400, 0), timestamp: BASE_TIME + 320_000 }), // 80%
      sample({ coordinate: offset(20, 0), timestamp: BASE_TIME + 400_000 }), // near start
      // Standing still at the finish: sub-jitter-threshold movement between fixes.
      sample({ coordinate: offset(15, 0), timestamp: BASE_TIME + 410_000 }),
      sample({ coordinate: offset(13, 0), timestamp: BASE_TIME + 420_000 }),
      sample({ coordinate: offset(14, 0), timestamp: BASE_TIME + 430_000 }),
    ]);
    expect(state.completionSuggested).toBe(true);
  });
});
