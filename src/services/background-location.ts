/**
 * Background location for an active run (#30).
 *
 * `watchPositionAsync` (see `location.ts`) only delivers while the app is in
 * the foreground, so a runner who pockets the phone would stop being tracked
 * the moment the screen locks. This module adds the OS-level background
 * updates that keep delivering, and forwards each fix into exactly the same
 * tracker pipeline as a foreground one.
 *
 * It deliberately does NOT replace the foreground watch. Both run during a
 * run, and the tracker already de-duplicates them: `applySample` in
 * `run-session.ts` rejects any fix whose timestamp is not strictly after the
 * last accepted one, so the same location arriving from both sources counts
 * once, and nothing about the existing foreground behaviour changes if
 * background delivery is unavailable or declined.
 *
 * Scope note: this enables the iOS background mode. Android background
 * location needs its own permission flow (the Android 11+ settings detour) and
 * is not enabled here; `startRunLocationUpdates` fails soft there, leaving the
 * run foreground-tracked rather than broken.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { toSample, type LocationSample } from './location';

/** Registered with the OS; must match the name used to start the updates. */
export const RUN_LOCATION_TASK = 'roam-run-location';

type SampleSink = (sample: LocationSample) => void;

let sink: SampleSink | null = null;

/** The live run's sink, or null when no run is active. */
export function setRunLocationSink(next: SampleSink | null): void {
  sink = next;
}

function isLocationObject(value: unknown): value is Location.LocationObject {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const coords = (value as { coords?: { latitude?: unknown; longitude?: unknown } }).coords;
  if (typeof coords !== 'object' || coords === null) {
    return false;
  }
  return Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude);
}

/**
 * Pure: turns a task payload into samples and forwards them to `target`.
 *
 * Split out from the task executor so the payload handling (which is the part
 * that can be wrong) is testable without the native modules. Malformed entries
 * are skipped rather than thrown on — a bad payload must not kill the task.
 * Returns how many usable fixes were forwarded.
 */
export function forwardTaskLocations(data: unknown, target: SampleSink | null): number {
  if (!target) {
    return 0;
  }
  const locations = (data as { locations?: unknown } | null)?.locations;
  if (!Array.isArray(locations)) {
    return 0;
  }
  let forwarded = 0;
  for (const candidate of locations) {
    if (!isLocationObject(candidate)) {
      continue;
    }
    target(toSample(candidate));
    forwarded += 1;
  }
  return forwarded;
}

// Must be defined in the global scope of the bundle: when the OS wakes the app
// in the background no React tree is mounted, so this cannot live inside a
// component or an effect.
TaskManager.defineTask(RUN_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }
  forwardTaskLocations(data, sink);
});

/**
 * Options for the background updates.
 *
 * `Fitness` lets iOS tune the hardware for running rather than automotive
 * navigation; the indicator is shown because a run that is still recording
 * while the app is hidden is exactly the case the runner should be able to see.
 */
const BACKGROUND_TASK_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 1,
  timeInterval: 1000,
  activityType: Location.ActivityType.Fitness,
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
};

/**
 * Asks for "Always". Only ever called when a run starts — never at launch — so
 * the prompt is tied to the action that needs it. Returns false when declined.
 */
export async function requestBackgroundPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Starts OS background updates if permitted. Never throws and never rejects:
 * an unavailable or denied background mode must not take the run down, because
 * foreground tracking is still working. Returns whether updates started.
 */
export async function startRunLocationUpdates(): Promise<boolean> {
  try {
    if (!(await requestBackgroundPermission())) {
      return false;
    }
    if (await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK)) {
      return true;
    }
    await Location.startLocationUpdatesAsync(RUN_LOCATION_TASK, BACKGROUND_TASK_OPTIONS);
    return true;
  } catch {
    return false;
  }
}

/** Stops background updates. Safe to call when none are running. */
export async function stopRunLocationUpdates(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(RUN_LOCATION_TASK);
    }
  } catch {
    // Nothing to stop, or the module is unavailable — either way the run is
    // already being torn down.
  }
}
