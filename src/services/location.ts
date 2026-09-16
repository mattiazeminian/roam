/**
 * Location service.
 *
 * The single abstraction over `expo-location` for the whole app. Screens and the
 * map never call `expo-location` directly. This module holds no UI and no routing
 * logic — it only deals with foreground permissions and coordinates.
 */

import * as Location from 'expo-location';

import type { Coordinate } from './routing';

export type LocationPermission = 'undetermined' | 'granted' | 'denied';

export type LocationSubscription = {
  remove: () => void;
};

/**
 * A position fix with the metadata run tracking needs. `accuracyMeters` is the
 * radius of horizontal uncertainty reported by the OS — tracking uses it to
 * discard fixes too noisy to be trusted, so it must not be dropped here.
 */
export type LocationSample = {
  coordinate: Coordinate;
  /** Horizontal accuracy radius in meters, or null when the OS omits it. */
  accuracyMeters: number | null;
  /** Fix time in epoch milliseconds, from the OS rather than the device clock. */
  timestamp: number;
  /** Instantaneous speed in m/s when reported, otherwise null. */
  speedMetersPerSecond: number | null;
};

export function toCoordinate(location: Location.LocationObject): Coordinate {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

export function toSample(location: Location.LocationObject): LocationSample {
  const { accuracy, speed } = location.coords;
  return {
    coordinate: toCoordinate(location),
    accuracyMeters: typeof accuracy === 'number' && accuracy >= 0 ? accuracy : null,
    timestamp: location.timestamp,
    speedMetersPerSecond: typeof speed === 'number' && speed >= 0 ? speed : null,
  };
}

/** Current foreground permission, without ever prompting. */
export async function getForegroundPermission(): Promise<LocationPermission> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status;
}

/**
 * Request foreground permission. iOS only shows the system dialog when the
 * status is `undetermined`; once denied this resolves to `denied` without
 * showing anything again, so it is safe to call repeatedly.
 */
export async function requestForegroundPermission(): Promise<LocationPermission> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status;
}

/** A single foreground fix. */
export async function getCurrentCoordinate(): Promise<Coordinate> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return toCoordinate(location);
}

/** Foreground position updates. Returns a subscription that must be removed. */
export function watchCoordinate(
  onUpdate: (coordinate: Coordinate) => void,
  onError?: (error: unknown) => void,
): LocationSubscription {
  let subscription: Location.LocationSubscription | null = null;
  let removed = false;

  void Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
    (location) => onUpdate(toCoordinate(location)),
  )
    .then((created) => {
      if (removed) {
        created.remove();
      } else {
        subscription = created;
      }
    })
    .catch((error: unknown) => onError?.(error));

  return {
    remove: () => {
      removed = true;
      subscription?.remove();
    },
  };
}

/**
 * Options for tracking an active run.
 *
 * Foreground-only by design: no background location mode is requested here,
 * so delivery pauses when the app is backgrounded and resumes on return
 * (`applySample` in `run-session.ts` is what makes that resumption safe rather
 * than corrupting distance). Adding background delivery is issue #30's job —
 * this constant, and `watchRunPosition` accepting an `onError` callback, are
 * the seam it should extend rather than a foreground/background split that
 * has to be invented later.
 */
const RUN_TRACKING_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 1,
  timeInterval: 1000,
};

/**
 * High-fidelity position updates for an active run.
 *
 * The caller is responsible for rejecting noisy fixes (see `applySample`) and
 * for throttling anything it pushes into React state. `onError` fires on a
 * native failure — most importantly a permission revoked mid-run — so the
 * caller can surface that rather than silently going quiet.
 */
export function watchRunPosition(
  onSample: (sample: LocationSample) => void,
  onError?: (error: unknown) => void,
): LocationSubscription {
  let subscription: Location.LocationSubscription | null = null;
  let removed = false;

  // `watchPositionAsync` reports failure two different ways, and one call
  // site swallowing either used to mean a permission revoked mid-run went
  // completely unnoticed: the returned promise rejects only for a failure
  // during setup (e.g. permission already missing when the watch is
  // started), while a failure *after* the subscription is already active
  // (e.g. permission revoked while running) is reported to the third
  // `errorHandler` argument instead — it does not reject the promise, which
  // already resolved when tracking began. Both are wired to `onError` here.
  void Location.watchPositionAsync(
    RUN_TRACKING_OPTIONS,
    (location) => onSample(toSample(location)),
    (reason) => onError?.(reason),
  )
    .then((created) => {
      if (removed) {
        created.remove();
      } else {
        subscription = created;
      }
    })
    .catch((error: unknown) => onError?.(error));

  return {
    remove: () => {
      removed = true;
      subscription?.remove();
    },
  };
}
