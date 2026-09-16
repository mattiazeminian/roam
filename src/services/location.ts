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
 * High-fidelity position updates for an active run.
 *
 * Uses `BestForNavigation` and a 1 m distance filter so the track follows the
 * runner closely; the caller is responsible for rejecting noisy fixes and for
 * throttling anything it pushes into React state.
 */
export function watchRunPosition(
  onSample: (sample: LocationSample) => void,
  onError?: (error: unknown) => void,
): LocationSubscription {
  let subscription: Location.LocationSubscription | null = null;
  let removed = false;

  void Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 1,
      timeInterval: 1000,
    },
    (location) => onSample(toSample(location)),
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
