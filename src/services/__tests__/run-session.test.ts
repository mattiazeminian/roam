/**
 * Tests for the GPS tracking math added/fixed in issues #8–#11.
 *
 * `applySample` is pure and synchronous (see the header comment on
 * run-session.ts), so every scenario here is expressed as a sequence of
 * `LocationSample`s folded through it — no mocking, no timers, no React.
 */
import { describe, expect, test } from '@jest/globals';

import {
  applySample,
  computeRecords,
  createTrackerState,
  currentPaceMinPerKm,
  fastestSplit,
  formatShortDistance,
  preparePlannedRoute,
  splitsFor,
  trackerStateFromCheckpoint,
  type PlannedRoute,
  type RecentFix,
  type SavedRun,
  type TrackerState,
} from '../run-session';
import { haversineMeters } from '../geo';
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

describe('route deviation (#9)', () => {
  // A straight south-to-north path: projection onto it is unambiguous
  // (nothing retraces itself), so an east/west offset is exactly the
  // perpendicular distance from the route.
  const planned = preparePlannedRoute({
    id: 'straight',
    distanceKm: 1,
    estimatedMinutes: 10,
    geometry: [offset(0, 0), offset(1000, 0)],
    characteristics: [],
  }) as PlannedRoute;

  function feedWithRoute(samples: LocationSample[]) {
    let state = createTrackerState();
    for (const s of samples) {
      state = applySample(state, s, planned, s.timestamp + 1);
    }
    return state;
  }

  test('a single fix outside the corridor does not raise the signal', () => {
    const state = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(100, 0), timestamp: BASE_TIME + 20_000 }),
      sample({ coordinate: offset(100, 100), timestamp: BASE_TIME + 40_000 }),
    ]);
    expect(state.offRoute).toBe(false);
    expect(state.distanceToRouteMeters).toBeCloseTo(100, 0);
  });

  test('three consecutive fixes outside the corridor raise it, and returning clears it immediately', () => {
    const offline = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(100, 0), timestamp: BASE_TIME + 20_000 }),
      sample({ coordinate: offset(100, 100), timestamp: BASE_TIME + 40_000 }), // streak 1
      sample({ coordinate: offset(140, 100), timestamp: BASE_TIME + 60_000 }), // streak 2
      sample({ coordinate: offset(180, 100), timestamp: BASE_TIME + 80_000 }), // streak 3
    ]);
    expect(offline.offRoute).toBe(true);
    expect(offline.distanceToRouteMeters).toBeCloseTo(100, 0);
    // The runner is 100m east of the route, so the way back is due west (270°).
    expect(offline.directionToRouteDegrees).toBeCloseTo(270, 0);

    const back = applySample(
      offline,
      sample({ coordinate: offset(220, 0), timestamp: BASE_TIME + 100_000 }),
      planned,
      BASE_TIME + 100_001,
    );
    // Clears on the first fix back inside the corridor, not gradually.
    expect(back.offRoute).toBe(false);
    expect(back.directionToRouteDegrees).toBeNull();
  });

  test('the bearing points back toward the route from whichever side the runner is on', () => {
    const west = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(100, 0), timestamp: BASE_TIME + 20_000 }),
      sample({ coordinate: offset(100, -100), timestamp: BASE_TIME + 40_000 }),
    ]);
    // West of the route: the route is to the east.
    expect(west.directionToRouteDegrees).toBeCloseTo(90, 0);
  });

  test('deviation holds route progress instead of advancing or resetting it', () => {
    const onRoute = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(100, 0), timestamp: BASE_TIME + 20_000 }),
    ]);
    expect(onRoute.progressMeters).toBeCloseTo(100, 0);

    const wandering = feedWithRoute([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(100, 0), timestamp: BASE_TIME + 20_000 }),
      sample({ coordinate: offset(100, 100), timestamp: BASE_TIME + 40_000 }),
      sample({ coordinate: offset(140, 100), timestamp: BASE_TIME + 60_000 }),
      sample({ coordinate: offset(180, 100), timestamp: BASE_TIME + 80_000 }),
    ]);
    // Held at the last on-corridor projection — never advanced by off-route
    // movement, and never reset to zero.
    expect(wandering.progressMeters).toBeCloseTo(100, 0);
    // The real movement still counts as distance; it is progress that is held.
    expect(wandering.distanceMeters).toBeGreaterThan(onRoute.distanceMeters);
    expect(wandering.offRoute).toBe(true);
  });

  test('with no planned route there is no off-route signal', () => {
    const state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    expect(state.offRoute).toBe(false);
    expect(state.distanceToRouteMeters).toBe(0);
    expect(state.directionToRouteDegrees).toBeNull();
  });
});

describe('personal records (#12)', () => {
  function savedRun(overrides: Partial<SavedRun> = {}): SavedRun {
    return {
      id: 'run-1',
      startedAt: BASE_TIME,
      endedAt: BASE_TIME + 1_800_000,
      route: null,
      targetDistanceKm: 5,
      distanceKm: 5,
      durationSeconds: 1800,
      averagePaceMinPerKm: 6,
      coordinates: [],
      status: 'finished',
      ...overrides,
    };
  }

  test('every record is null when there are no runs', () => {
    expect(computeRecords([])).toEqual({
      longest: null,
      fastest: null,
      fastest5k: null,
      fastest10k: null,
    });
  });

  test('longest is the greatest distance and ignores zero-distance runs', () => {
    const short = savedRun({ id: 'short', distanceKm: 3 });
    const long = savedRun({ id: 'long', distanceKm: 8 });
    const empty = savedRun({ id: 'empty', distanceKm: 0, averagePaceMinPerKm: null });
    expect(computeRecords([short, long, empty]).longest?.id).toBe('long');
  });

  test('fastest ignores runs shorter than the record minimum, so a 200m jog cannot hold it', () => {
    const jog = savedRun({ id: 'jog', distanceKm: 0.2, averagePaceMinPerKm: 3 });
    const slower = savedRun({ id: 'slower', distanceKm: 3, averagePaceMinPerKm: 6 });
    const faster = savedRun({ id: 'faster', distanceKm: 2, averagePaceMinPerKm: 5 });
    const records = computeRecords([jog, slower, faster]);
    expect(records.fastest?.id).toBe('faster');
    expect(records.fastest?.distanceKm).toBeGreaterThanOrEqual(1);
  });

  test('a faster short run wins the overall best but not the 5 km best', () => {
    const short = savedRun({ id: 'short', distanceKm: 3, averagePaceMinPerKm: 5 });
    const long = savedRun({ id: 'long', distanceKm: 6, averagePaceMinPerKm: 6 });
    const records = computeRecords([short, long]);
    expect(records.fastest?.id).toBe('short');
    expect(records.fastest5k?.id).toBe('long');
    expect(records.fastest10k).toBeNull();
  });

  test('distance-scoped bests require the run itself to reach the threshold', () => {
    const five = savedRun({ id: 'five', distanceKm: 5, averagePaceMinPerKm: 6 });
    const nine = savedRun({ id: 'nine', distanceKm: 9, averagePaceMinPerKm: 5.5 });
    const ten = savedRun({ id: 'ten', distanceKm: 10, averagePaceMinPerKm: 6.5 });
    const records = computeRecords([five, nine, ten]);
    expect(records.fastest5k?.id).toBe('nine');
    expect(records.fastest10k?.id).toBe('ten');
    expect(records.longest?.id).toBe('ten');
  });

  test('a run with no usable pace can still be the longest but holds no pace record', () => {
    const unpaceable = savedRun({
      id: 'slow-gps',
      distanceKm: 12,
      averagePaceMinPerKm: null,
    });
    const records = computeRecords([unpaceable]);
    expect(records.longest?.id).toBe('slow-gps');
    expect(records.fastest).toBeNull();
    expect(records.fastest5k).toBeNull();
    expect(records.fastest10k).toBeNull();
  });
});

describe('timed track and splits (#32)', () => {
  test('every accepted point gets a fix time, index-aligned with the track', () => {
    const state = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 20), timestamp: BASE_TIME + 5_000 }),
      sample({ coordinate: offset(0, 50), timestamp: BASE_TIME + 12_000 }),
    ]);
    expect(state.timestamps).toEqual([BASE_TIME, BASE_TIME + 5_000, BASE_TIME + 12_000]);
    expect(state.timestamps).toHaveLength(state.coordinates.length);
  });

  test('a rejected fix adds neither a coordinate nor a time', () => {
    const state = applySample(
      createTrackerState(),
      sample({ coordinate: offset(0, 0), accuracyMeters: 90, timestamp: BASE_TIME }),
      null,
      BASE_TIME + 1,
    );
    expect(state.timestamps).toHaveLength(0);
  });

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
      timestamps: [BASE_TIME, BASE_TIME + 10_000, BASE_TIME + 20_000],
      status: 'active',
      ...overrides,
    };
  }

  test('checkpoint restore keeps times that line up with the track', () => {
    const run = checkpoint();
    const state = trackerStateFromCheckpoint(run);
    expect(state.timestamps).toEqual(run.timestamps);
  });

  test('checkpoint restore marks times unknown when absent, staying aligned', () => {
    const legacy = checkpoint();
    delete legacy.timestamps;
    const state = trackerStateFromCheckpoint(legacy);
    expect(state.timestamps).toEqual([null, null, null]);
    expect(state.timestamps).toHaveLength(state.coordinates.length);
  });

  test('checkpoint restore marks times unknown when the counts do not match', () => {
    const mismatched = trackerStateFromCheckpoint(checkpoint({ timestamps: [BASE_TIME] }));
    expect(mismatched.timestamps).toEqual([null, null, null]);
  });

  // A straight 6 km track, with the second half run faster than the first.
  // The window is 2.5 km — comfortably inside the segment grid, so the
  // measured distance of each 1 km segment (a hair under 1000 m on this
  // projection) cannot tip the window onto an extra segment.
  const positions = [0, 1000, 2000, 3000, 4000, 5000, 6000];
  const track = positions.map((meters) => offset(0, meters));
  const secondsAt = [0, 100, 200, 300, 380, 460, 540];
  const times = secondsAt.map((seconds) => BASE_TIME + seconds * 1000);
  const WINDOW_METERS = 2500;

  test('fastestSplit finds the fastest window covering the distance', () => {
    const split = fastestSplit(track, times, WINDOW_METERS);
    // 3→6 km takes 240 s; every other window that spans the distance is slower.
    expect(split?.durationSeconds).toBe(240);
    expect(split?.distanceMeters).toBeGreaterThanOrEqual(WINDOW_METERS);
  });

  test('fastestSplit returns null when the track is shorter than the window', () => {
    expect(fastestSplit(track, times, 10_000)).toBeNull();
  });

  test('fastestSplit returns null for a track saved before times existed', () => {
    expect(fastestSplit(track, track.map(() => null), WINDOW_METERS)).toBeNull();
  });

  test('fastestSplit skips windows whose endpoints have unknown times', () => {
    const withGap: (number | null)[] = [...times];
    withGap[4] = null;
    // The winning window (3→6 km) does not touch index 4, so it still wins.
    expect(fastestSplit(track, withGap, WINDOW_METERS)?.durationSeconds).toBe(240);
  });
});

describe('currentPaceMinPerKm (#37)', () => {
  function fix(coordinate: ReturnType<typeof offset>, timestamp: number): RecentFix {
    return { coordinate, timestamp };
  }

  test('fewer than two fixes cannot produce a pace', () => {
    expect(currentPaceMinPerKm([], BASE_TIME)).toBeNull();
    expect(currentPaceMinPerKm([fix(offset(0, 0), BASE_TIME)], BASE_TIME)).toBeNull();
  });

  test('a stale newest fix withholds pace rather than reporting a stopped runner\'s old effort', () => {
    const recent = [fix(offset(0, 0), BASE_TIME), fix(offset(0, 100), BASE_TIME + 20_000)];
    // 16s after the newest fix — past the 15s staleness threshold.
    expect(currentPaceMinPerKm(recent, BASE_TIME + 20_000 + 16_000)).toBeNull();
  });

  test('too few fixes inside the trailing window withhold pace', () => {
    const recent = [
      fix(offset(0, 0), BASE_TIME), // 40s before "now" — outside the 30s window
      fix(offset(0, 200), BASE_TIME + 40_000),
    ];
    expect(currentPaceMinPerKm(recent, BASE_TIME + 40_000)).toBeNull();
  });

  test('a window shorter than the minimum duration withholds pace', () => {
    const recent = [
      fix(offset(0, 0), BASE_TIME),
      fix(offset(0, 50), BASE_TIME + 5_000), // 5s apart, below the 10s minimum
    ];
    expect(currentPaceMinPerKm(recent, BASE_TIME + 5_000)).toBeNull();
  });

  test('a window covering too little distance withholds pace, not a jittery number', () => {
    const recent = [
      fix(offset(0, 0), BASE_TIME),
      fix(offset(0, 10), BASE_TIME + 20_000), // 20s, but only 10m — below the 40m minimum
    ];
    expect(currentPaceMinPerKm(recent, BASE_TIME + 20_000)).toBeNull();
  });

  test('a genuine trailing window produces a real pace', () => {
    const a = offset(0, 0);
    const b = offset(0, 100);
    const recent = [fix(a, BASE_TIME), fix(b, BASE_TIME + 20_000)];
    const pace = currentPaceMinPerKm(recent, BASE_TIME + 20_000);
    const meters = haversineMeters(a, b);
    expect(pace).toBeCloseTo(20 / 60 / (meters / 1000), 5);
  });

  test('only fixes inside the trailing window count, so pace tracks recent effort, not the whole run', () => {
    const a = offset(0, 500);
    const b = offset(0, 600);
    const recent = [
      fix(offset(0, 0), BASE_TIME - 5_000), // outside the 30s window ending at `now`
      fix(a, BASE_TIME + 15_000),
      fix(b, BASE_TIME + 30_000), // 15s, well past the 10s minimum
    ];
    const now = BASE_TIME + 30_000;
    const pace = currentPaceMinPerKm(recent, now);
    const meters = haversineMeters(a, b);
    expect(pace).toBeCloseTo(15 / 60 / (meters / 1000), 5); // only the last leg counted
  });
});

describe('splitsFor (#41)', () => {
  // A straight 3.2 km track at an even 5:00/km (300 s per km).
  const positions = [0, 1000, 2000, 3000, 3200];
  const track = positions.map((meters) => offset(0, meters));
  const times = positions.map((meters) => BASE_TIME + (meters / 1000) * 300 * 1000);

  test('cuts whole-unit splits in order, then a partial', () => {
    const splits = splitsFor(track, times, 1000);
    expect(splits.map((split) => split.index)).toEqual([1, 2, 3, 4]);
    expect(splits[0].distanceMeters).toBe(1000);
    expect(splits[0].durationSeconds).toBeCloseTo(300, 0);
    expect(splits[0].paceMinPerKm).toBeCloseTo(5, 1);
    // The final partial is the remainder, not a full unit.
    expect(splits[3].distanceMeters).toBeGreaterThan(150);
    expect(splits[3].distanceMeters).toBeLessThan(250);
    expect(splits[3].paceMinPerKm).toBeCloseTo(5, 1);
  });

  test('omits a final remainder too short to be a split', () => {
    const short = [0, 1000, 1050].map((meters) => offset(0, meters));
    const shortTimes = [0, 1000, 1050].map((meters) => BASE_TIME + (meters / 1000) * 300 * 1000);
    expect(splitsFor(short, shortTimes, 1000)).toHaveLength(1);
  });

  test('withholds the splits a missing fix time borders, fabricating none', () => {
    const all = splitsFor(track, times, 1000);
    const gap: (number | null)[] = [...times];
    gap[2] = null;
    const gapped = splitsFor(track, gap, 1000);
    expect(all.length).toBeGreaterThan(gapped.length);
    expect(gapped.length).toBeGreaterThan(0);
    // Every split that survives still has a real pace — none is invented.
    expect(gapped.every((split) => split.paceMinPerKm !== null)).toBe(true);
  });

  test('returns nothing when no fix carries a time', () => {
    expect(splitsFor(track, track.map(() => null), 1000)).toEqual([]);
  });

  test('returns nothing for a single point', () => {
    expect(splitsFor([offset(0, 0)], [BASE_TIME], 1000)).toEqual([]);
  });
});

describe('auto-pause hysteresis (#38)', () => {
  test('a runner moving steadily is never stationary', () => {
    const state = feed(
      [0, 1, 2, 3, 4].map((n) => sample({ coordinate: offset(0, n * 10), timestamp: BASE_TIME + n * 1000 })),
    );
    expect(state.stationary).toBe(false);
  });

  test('the first fix does not pause immediately', () => {
    const state = applySample(createTrackerState(), sample({ coordinate: offset(0, 0) }), null, BASE_TIME + 1);
    expect(state.stationary).toBe(false);
    expect(state.lastMovementAt).toBe(BASE_TIME);
  });

  test('stopping for the dwell auto-pauses', () => {
    const state = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME + 5_000 }),
      // 8s since the last movement: the dwell is reached.
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME + 8_000 }),
    ]);
    expect(state.stationary).toBe(true);
  });

  test('a few seconds of standing still is not yet a stop', () => {
    const state = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME + 4_000 }),
    ]);
    expect(state.stationary).toBe(false);
  });

  test('moving again clears the pause', () => {
    const paused = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME + 8_000 }),
    ]);
    expect(paused.stationary).toBe(true);

    const resumed = applySample(
      paused,
      sample({ coordinate: offset(0, 20), timestamp: BASE_TIME + 9_000 }),
      null,
      BASE_TIME + 9_001,
    );
    expect(resumed.stationary).toBe(false);
    expect(resumed.lastMovementAt).toBe(BASE_TIME + 9_000);
  });

  test('a slow stride that keeps moving never flaps into pause', () => {
    // Fixes hover around the movement threshold; every qualifying fix resets
    // the dwell, so the runner is never treated as stopped.
    const state = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 6), timestamp: BASE_TIME + 3_000 }),
      sample({ coordinate: offset(0, 9), timestamp: BASE_TIME + 9_000 }),
      sample({ coordinate: offset(0, 15), timestamp: BASE_TIME + 16_000 }),
    ]);
    expect(state.stationary).toBe(false);
  });

  test('jitter alone never accumulates the dwell', () => {
    // Each non-moving fix is interspersed with a real step, so the pause is
    // never reached even though most fixes are within the jitter threshold.
    const state = feed([
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME }),
      sample({ coordinate: offset(0, 0), timestamp: BASE_TIME + 5_000 }),
      sample({ coordinate: offset(0, 10), timestamp: BASE_TIME + 6_000 }),
      sample({ coordinate: offset(0, 10), timestamp: BASE_TIME + 12_000 }),
    ]);
    expect(state.stationary).toBe(false);
  });
});

describe('formatShortDistance', () => {
  test('uses metres when the runner counts in kilometres', () => {
    expect(formatShortDistance(0, 'km')).toBe('0m');
    expect(formatShortDistance(143.4, 'km')).toBe('143m');
  });

  test('uses feet, rounded to ten, when the runner counts in miles', () => {
    expect(formatShortDistance(100, 'mi')).toBe('330ft');
    // A very small distance still reads as a distance, never `0ft`.
    expect(formatShortDistance(1, 'mi')).toBe('10ft');
  });
});
