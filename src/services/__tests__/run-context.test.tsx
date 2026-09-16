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
