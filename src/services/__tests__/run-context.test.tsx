/**
 * Subscription-lifecycle tests for issue #8.
 *
 * `run-session.test.ts` covers the pure tracking math; this file covers what
 * only the live `RunProvider` can be responsible for — that GPS updates flow
 * through exactly one subscription at a time, that stopping actually removes
 * it, and that a subscription's own late callback cannot corrupt a run that
 * has since moved on. `expo-location` is mocked so these run without a
 * device; behaviour is asserted through the hook's observable output
 * (`distanceMeters`, `track`, `degradedSignal`, …), not through internals.
 */
import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import * as Location from 'expo-location';

import { RunProvider, useRun, type RunContextValue } from '../run-context';
import { findRoutesBetween } from '../routing';
import {
  setRunLocationSink,
  startRunLocationUpdates,
  stopRunLocationUpdates,
} from '../background-location';
import { getInProgressRun } from '../run-storage';

jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6, Balanced: 3 },
  watchPositionAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

// Recovery/checkpointing (#11) touches the real filesystem otherwise, which
// is unnecessary here — these tests exercise the live subscription, not
// persistence, and `run-storage.test.ts` already covers the storage layer.
jest.mock('../run-storage', () => ({
  checkpointRun: jest.fn(() => Promise.resolve()),
  clearInProgressRun: jest.fn(() => Promise.resolve()),
  getInProgressRun: jest.fn(() => Promise.resolve(null)),
  saveRun: jest.fn(() => Promise.resolve()),
}));

// Background delivery (#30) is a thin native bridge; its own payload handling
// is covered by `background-location.test.ts`. Here it is mocked so the run
// provider's start/stop wiring can be asserted directly.
jest.mock('../background-location', () => ({
  setRunLocationSink: jest.fn(),
  startRunLocationUpdates: jest.fn(() => Promise.resolve(true)),
  stopRunLocationUpdates: jest.fn(() => Promise.resolve()),
}));

// Rerouting (#64) calls the provider; here only the provider call is mocked so
// the run's own behaviour (track and distance untouched) can be asserted.
jest.mock('../routing', () => {
  const actual = jest.requireActual<typeof import('../routing')>('../routing');
  return { ...actual, findRoutesBetween: jest.fn() };
});

const findRoutesBetweenMock = findRoutesBetween as unknown as jest.Mock<
  (...args: unknown[]) => Promise<unknown>
>;

const setSinkMock = setRunLocationSink as unknown as jest.Mock;
const startBackgroundMock = startRunLocationUpdates as unknown as jest.Mock;
const stopBackgroundMock = stopRunLocationUpdates as unknown as jest.Mock;
const getInProgressRunMock = getInProgressRun as unknown as jest.Mock<
  () => Promise<unknown>
>;

/** The most recent non-null sink the provider registered. */
function currentSink(): ((sample: unknown) => void) | undefined {
  const sinks = setSinkMock.mock.calls
    .map((call) => call[0])
    .filter((value): value is (sample: unknown) => void => typeof value === 'function');
  return sinks[sinks.length - 1];
}

const watchPositionAsyncMock = Location.watchPositionAsync as unknown as jest.Mock<
  (...args: unknown[]) => unknown
>;

type Registration = {
  callback: (location: unknown) => void;
  errorHandler?: (reason: string) => void;
  remove: ReturnType<typeof jest.fn>;
};

let registrations: Registration[];

const ORIGIN = { latitude: 40.7484, longitude: -73.9857 };
const METERS_PER_DEGREE_LAT = 111_320;

function offsetCoord(northMeters: number, eastMeters: number) {
  return {
    latitude: ORIGIN.latitude + northMeters / METERS_PER_DEGREE_LAT,
    longitude:
      ORIGIN.longitude +
      eastMeters / (METERS_PER_DEGREE_LAT * Math.cos((ORIGIN.latitude * Math.PI) / 180)),
  };
}

function nativeLocation(coord: { latitude: number; longitude: number }, timestamp: number) {
  return {
    coords: {
      latitude: coord.latitude,
      longitude: coord.longitude,
      accuracy: 5,
      speed: null,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
    },
    timestamp,
  };
}

beforeEach(() => {
  registrations = [];
  watchPositionAsyncMock.mockReset();
  watchPositionAsyncMock.mockImplementation((...args: unknown[]) => {
    const callback = args[1] as (location: unknown) => void;
    const errorHandler = args[2] as ((reason: string) => void) | undefined;
    const remove = jest.fn();
    registrations.push({ callback, errorHandler, remove });
    return Promise.resolve({ remove });
  });
  setSinkMock.mockClear();
  startBackgroundMock.mockClear();
  stopBackgroundMock.mockClear();
  getInProgressRunMock.mockReset().mockResolvedValue(null);
});

function Harness({ onValue }: { onValue: (value: RunContextValue) => void }) {
  const value = useRun();
  onValue(value);
  return null;
}

function renderRun() {
  let latest!: RunContextValue;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <RunProvider>
        <Harness
          onValue={(v) => {
            latest = v;
          }}
        />
      </RunProvider>,
    );
  });
  return {
    get value() {
      return latest;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

/**
 * Flushes the microtask queue so `watchRunPosition`'s internal `.then` runs
 * (that's where `subscription.current` is actually assigned), then flushes
 * React synchronously to apply anything that scheduled as a result.
 *
 * Deliberately not `act(async () => { await ... })`: that combination hung
 * indefinitely in this test environment. Awaiting outside `act`, then calling
 * `act` synchronously afterward, is the safe form.
 */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  act(() => {});
}

// Every test reads state through `harness.value`, never through a destructured
// `const { value } = ...`: `value` is a live getter, and destructuring it
// freezes a one-time snapshot from whatever render had just happened. Calling
// methods off a frozen snapshot still works (start/pause/etc. are stable
// `useCallback` references that close over refs, not state), which is exactly
// what made this easy to get wrong silently — every method call kept working
// while every *property read* (distanceMeters, track, degradedSignal, status)
// silently went stale.

describe('subscription lifecycle', () => {
  test('starting a run creates exactly one subscription', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
    expect(registrations).toHaveLength(1);
    harness.unmount();
  });

  test('pausing removes the active subscription', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    const sub = registrations[0];
    expect(sub.remove).not.toHaveBeenCalled();

    act(() => harness.value.pause());
    expect(sub.remove).toHaveBeenCalledTimes(1);
    harness.unmount();
  });

  test('finishing removes the active subscription', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    const sub = registrations[0];

    act(() => harness.value.finish());
    expect(sub.remove).toHaveBeenCalledTimes(1);
    harness.unmount();
  });

  test('resuming after a pause creates a fresh subscription, not a second live one', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    act(() => harness.value.pause());
    const firstSub = registrations[0];
    expect(firstSub.remove).toHaveBeenCalledTimes(1);

    act(() => harness.value.resume());
    await flush();
    expect(registrations).toHaveLength(2);
    // Only one subscription is ever live: the first is already removed, and
    // nothing removes the second prematurely.
    expect(registrations[1].remove).not.toHaveBeenCalled();
    harness.unmount();
  });

  test('starting again without finishing tears down the previous subscription (no duplicates)', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    const firstSub = registrations[0];
    expect(firstSub.remove).not.toHaveBeenCalled();

    act(() => harness.value.start(null, 7));
    await flush();
    expect(registrations).toHaveLength(2);
    expect(firstSub.remove).toHaveBeenCalledTimes(1);
    harness.unmount();
  });

  test('unmounting the provider removes an active subscription', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    const sub = registrations[0];
    expect(sub.remove).not.toHaveBeenCalled();

    harness.unmount();
    expect(sub.remove).toHaveBeenCalledTimes(1);
  });
});

describe('state isolation between runs', () => {
  test("starting a new run does not retain the previous run's track or distance", async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    const t0 = Date.now();
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 0), t0)));
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 50), t0 + 10_000)));
    act(() => harness.value.pause()); // force a publish so the snapshot reflects the feed
    expect(harness.value.distanceMeters).toBeGreaterThan(0); // sanity: run 1 really accumulated something

    act(() => harness.value.finish());
    act(() => harness.value.discardCompleted());

    act(() => harness.value.start(null, 3));
    await flush();
    expect(harness.value.distanceMeters).toBe(0);
    expect(harness.value.track).toHaveLength(0);
    expect(harness.value.status).toBe('active');
    harness.unmount();
  });

  test('a callback from a torn-down subscription cannot write into a run started after it', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    const staleSub = registrations[0];

    act(() => harness.value.finish());
    act(() => harness.value.discardCompleted());
    act(() => harness.value.start(null, 5));
    await flush();
    const currentSub = registrations[1];
    expect(currentSub).not.toBe(staleSub);

    const t0 = Date.now();
    // The current run gets one legitimate fix.
    act(() => currentSub.callback(nativeLocation(offsetCoord(0, 0), t0)));

    // The old subscription's callback fires late — simulating a callback that
    // was already in flight when `remove()` was called, which async native
    // teardown can allow. Before the epoch guard, this closed over the same
    // `tracker` ref and would have written straight into the new run's state.
    act(() => staleSub.callback(nativeLocation(offsetCoord(0, 300), t0 + 1000)));

    act(() => harness.value.pause()); // force a publish
    expect(harness.value.track).toHaveLength(1); // only the current run's one fix
    expect(harness.value.distanceMeters).toBe(0); // a lone first fix never adds distance
    harness.unmount();
  });
});

describe('watch errors', () => {
  test('a watch error mid-run is surfaced as degraded signal without losing the session', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    const sub = registrations[0];
    expect(sub.errorHandler).toBeDefined();

    const t0 = Date.now();
    act(() => sub.callback(nativeLocation(offsetCoord(0, 0), t0)));
    act(() => sub.callback(nativeLocation(offsetCoord(0, 50), t0 + 10_000)));

    // Simulate a runtime failure, e.g. permission revoked mid-run.
    act(() => sub.errorHandler?.('kCLErrorDenied'));

    act(() => harness.value.pause()); // force a publish
    expect(harness.value.degradedSignal).toBe(true);
    expect(harness.value.distanceMeters).toBeGreaterThan(0); // accumulated distance is preserved
    expect(harness.value.status).toBe('paused'); // the session itself is not lost
    harness.unmount();
  });

  test("a fresh start clears a previous run's watch-error flag", async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    act(() => registrations[0].errorHandler?.('kCLErrorDenied'));
    act(() => harness.value.pause());
    expect(harness.value.degradedSignal).toBe(true);

    act(() => harness.value.finish());
    act(() => harness.value.discardCompleted());
    act(() => harness.value.start(null, 5));
    await flush();
    expect(harness.value.degradedSignal).toBe(false);
    harness.unmount();
  });
});

describe('completion suggestion (#10)', () => {
  test('a return to the start after covering the route is surfaced through the context, and dismissing clears it', async () => {
    const route = {
      id: 'loop',
      distanceKm: 2,
      estimatedMinutes: 20,
      geometry: [
        offsetCoord(0, 0),
        offsetCoord(0, 500),
        offsetCoord(500, 500),
        offsetCoord(500, 0),
        offsetCoord(0, 0),
      ],
      characteristics: [],
    };
    const harness = renderRun();
    act(() => harness.value.start(route, 2));
    await flush();
    const t0 = Date.now();
    const feed = [
      [offsetCoord(0, 0), t0],
      [offsetCoord(0, 500), t0 + 100_000],
      [offsetCoord(500, 500), t0 + 200_000],
      [offsetCoord(500, 0), t0 + 300_000],
      [offsetCoord(400, 0), t0 + 320_000],
      [offsetCoord(20, 0), t0 + 400_000],
      [offsetCoord(15, 0), t0 + 410_000],
      [offsetCoord(10, 0), t0 + 420_000],
      [offsetCoord(8, 0), t0 + 430_000],
    ] as const;
    for (const [coord, ts] of feed) {
      act(() => registrations[0].callback(nativeLocation(coord, ts)));
    }
    act(() => harness.value.pause()); // force a publish
    expect(harness.value.completionSuggested).toBe(true);

    act(() => harness.value.dismissCompletionSuggestion());
    expect(harness.value.completionSuggested).toBe(false);
    harness.unmount();
  });
});

describe('background delivery (#30)', () => {
  test('starting a run registers a sink and starts background updates', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    expect(startBackgroundMock).toHaveBeenCalledTimes(1);
    expect(typeof currentSink()).toBe('function');
    harness.unmount();
  });

  test('pausing stops background updates and clears the sink', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    act(() => harness.value.pause());
    expect(stopBackgroundMock).toHaveBeenCalled();
    expect(setSinkMock).toHaveBeenLastCalledWith(null);
    harness.unmount();
  });

  test('finishing stops background updates and clears the sink', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    act(() => harness.value.finish());
    expect(stopBackgroundMock).toHaveBeenCalled();
    expect(setSinkMock).toHaveBeenLastCalledWith(null);
    harness.unmount();
  });

  test('a fix delivered through the background sink is tracked like a foreground one', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();
    const sink = currentSink();
    expect(sink).toBeDefined();

    const t0 = Date.now();
    act(() =>
      sink?.({
        coordinate: offsetCoord(0, 0),
        accuracyMeters: 5,
        timestamp: t0,
        speedMetersPerSecond: null,
      }),
    );
    act(() =>
      sink?.({
        coordinate: offsetCoord(0, 50),
        accuracyMeters: 5,
        timestamp: t0 + 10_000,
        speedMetersPerSecond: null,
      }),
    );

    act(() => harness.value.pause()); // force a publish
    expect(harness.value.distanceMeters).toBeGreaterThan(0);
    harness.unmount();
  });
});

describe('route-less run (#33)', () => {
  test('start(null, 0) begins a valid active run with tracking, distance, time and pace, exactly like a route-based run', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 0));
    await flush();

    // 1. A valid active run.
    expect(harness.value.status).toBe('active');
    expect(harness.value.route).toBeNull();
    // 2. Location tracking started — a subscription was created.
    expect(registrations).toHaveLength(1);

    const t0 = Date.now();
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 0), t0)));
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 100), t0 + 20_000)));
    // `activeSeconds` is derived from the real wall clock (`Date.now()`), not
    // the fixture timestamps above — a real delay guarantees it has actually
    // advanced before publishing, rather than racing whatever millisecond the
    // synchronous work above happened to land on.
    await new Promise((resolve) => setTimeout(resolve, 10));
    act(() => harness.value.pause()); // force a publish

    // 3. Distance accumulates normally.
    expect(harness.value.distanceMeters).toBeCloseTo(100, 0);
    // 4. Time and pace work normally.
    expect(harness.value.activeSeconds).toBeGreaterThan(0);
    expect(harness.value.paceMinPerKm).not.toBeNull();
    // 5. The actual GPS path is recorded.
    expect(harness.value.track).toEqual([offsetCoord(0, 0), offsetCoord(0, 100)]);
    harness.unmount();
  });

  test('deviation and completion never activate for a route-less run, no matter how far or long it runs', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 0));
    await flush();

    const t0 = Date.now();
    // A long, winding sequence of fixes — the kind of movement that would
    // trigger completion (a return to "the start") or deviation (leaving
    // a corridor) if a route were planned.
    const points: [number, number][] = [
      [0, 0],
      [0, 200],
      [150, 250],
      [150, 20],
      [10, 10],
      [0, 5],
    ];
    points.forEach(([n, e], index) => {
      act(() => registrations[0].callback(nativeLocation(offsetCoord(n, e), t0 + index * 60_000)));
    });
    act(() => harness.value.pause()); // force a publish

    expect(harness.value.distanceMeters).toBeGreaterThan(0); // sanity: it actually ran
    expect(harness.value.progressMeters).toBe(0);
    expect(harness.value.completionSuggested).toBe(false);
    expect(harness.value.offRoute).toBe(false);
    expect(harness.value.distanceToRouteMeters).toBe(0);
    expect(harness.value.directionToRouteDegrees).toBeNull();
    harness.unmount();
  });

  test('a route-less run finishes normally into a completed run with route: null', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 0));
    await flush();

    const t0 = Date.now();
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 0), t0)));
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 80), t0 + 15_000)));

    act(() => harness.value.finish());

    // 8. The run can finish normally.
    expect(harness.value.status).toBe('finished');
    expect(harness.value.completedRun).not.toBeNull();
    expect(harness.value.completedRun?.route).toBeNull();
    expect(harness.value.completedRun?.distanceKm).toBeGreaterThan(0);
    expect(harness.value.completedRun?.status).toBe('finished');
    harness.unmount();
  });
});

describe('state machine guards (#35)', () => {
  test('finish() from idle is a no-op — it used to fabricate a zero-distance completed run', async () => {
    const harness = renderRun();
    act(() => harness.value.finish());
    expect(harness.value.status).toBe('idle');
    expect(harness.value.completedRun).toBeNull();
    harness.unmount();
  });

  test('finish() called a second time does not overwrite the first result', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 0));
    await flush();
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 0), Date.now())));
    act(() => harness.value.finish());
    const firstResult = harness.value.completedRun;
    expect(firstResult).not.toBeNull();

    act(() => harness.value.finish());
    expect(harness.value.completedRun).toBe(firstResult); // same object: untouched
    harness.unmount();
  });

  test('pause()/resume() from an illegal state are no-ops, not corrupting the session', async () => {
    const harness = renderRun();
    // pause() before any run started.
    act(() => harness.value.pause());
    expect(harness.value.status).toBe('idle');
    // resume() while idle.
    act(() => harness.value.resume());
    expect(harness.value.status).toBe('idle');

    act(() => harness.value.start(null, 0));
    await flush();
    // resume() while already active.
    act(() => harness.value.resume());
    expect(harness.value.status).toBe('active');
    harness.unmount();
  });

  test('saveCompleted()/discardCompleted() cannot abort a live run', async () => {
    const harness = renderRun();
    act(() => harness.value.start(null, 0));
    await flush();
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 0), Date.now())));

    act(() => harness.value.discardCompleted());
    // Before the guard, this unconditionally reset the provider to idle —
    // the exact "silently corrupts a live run" failure mode #35 closes.
    expect(harness.value.status).toBe('active');

    await act(async () => {
      await harness.value.saveCompleted();
    });
    expect(harness.value.status).toBe('active');
    harness.unmount();
  });

  test('resumeRecovered() cannot clobber an already-active session, even if the recovery check resolves late', async () => {
    // A real race: the mount effect's `getInProgressRun()` is still pending
    // when the runner starts a fresh run some other way, then resolves
    // afterwards and sets `recoverable` while a session is already live —
    // Home stays mounted underneath /run in a stack navigator, so its
    // "offer to resume" effect can still fire.
    let resolveCheckpoint!: (value: unknown) => void;
    getInProgressRunMock.mockReset().mockImplementation(
      () => new Promise((resolve) => { resolveCheckpoint = resolve; }),
    );

    const harness = renderRun();
    act(() => harness.value.start(null, 0));
    await flush();
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 0), Date.now())));
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 60), Date.now() + 10_000)));
    act(() => harness.value.pause()); // force a publish
    const distanceBeforeRace = harness.value.distanceMeters;
    expect(distanceBeforeRace).toBeGreaterThan(0);

    // The stale check finally resolves, now that a session is already live.
    await act(async () => {
      resolveCheckpoint({
        id: 'run-stale',
        startedAt: 1,
        endedAt: 2,
        route: null,
        targetDistanceKm: 0,
        distanceKm: 9,
        durationSeconds: 999,
        averagePaceMinPerKm: null,
        coordinates: [],
        status: 'active',
      });
    });
    expect(harness.value.recoverable).not.toBeNull(); // it was set...

    act(() => harness.value.resumeRecovered());
    // ...but resolving it must not overwrite the live session.
    expect(harness.value.status).toBe('paused');
    expect(harness.value.distanceMeters).toBe(distanceBeforeRace);
    harness.unmount();
  });
});

describe('reroute (#64)', () => {
  const planned = {
    id: 'planned',
    distanceKm: 3,
    estimatedMinutes: 20,
    geometry: [
      offsetCoord(0, 0),
      offsetCoord(0, 50),
      offsetCoord(50, 50),
      offsetCoord(50, 0),
      offsetCoord(0, 0),
    ],
    characteristics: [],
  };

  test('adopts a new plan without touching the recorded track or distance', async () => {
    findRoutesBetweenMock.mockReset();
    findRoutesBetweenMock.mockResolvedValue([
      {
        id: 'way-back',
        distanceKm: 1.1,
        estimatedMinutes: 7,
        geometry: [offsetCoord(60, 0), offsetCoord(30, 0), offsetCoord(0, 0)],
        characteristics: [],
        finish: offsetCoord(0, 0),
      },
    ]);

    const harness = renderRun();
    act(() => harness.value.start(planned, 3));
    await flush();

    const t0 = Date.now();
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 0), t0)));
    act(() => registrations[0].callback(nativeLocation(offsetCoord(0, 60), t0 + 10_000)));
    act(() => harness.value.pause()); // force a publish

    const distanceBefore = harness.value.distanceMeters;
    const trackBefore = harness.value.track.length;
    expect(distanceBefore).toBeGreaterThan(0);

    await act(async () => {
      await harness.value.reroute();
    });

    expect(findRoutesBetweenMock).toHaveBeenCalledTimes(1);
    expect(harness.value.route?.id).toBe('way-back');
    // The recorded run is the truth; rerouting only swaps the reference route.
    expect(harness.value.distanceMeters).toBe(distanceBefore);
    expect(harness.value.track).toHaveLength(trackBefore);
    harness.unmount();
  });

  test('does nothing, and calls no provider, without a route to rejoin', async () => {
    findRoutesBetweenMock.mockReset();
    const harness = renderRun();
    act(() => harness.value.start(null, 5));
    await flush();

    await act(async () => {
      await harness.value.reroute();
    });

    expect(findRoutesBetweenMock).not.toHaveBeenCalled();
    harness.unmount();
  });
});
