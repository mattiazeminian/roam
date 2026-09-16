/**
 * Run session model and tracking math.
 *
 * Pure and synchronous: no React, no GPS subscription, no storage. The live
 * session provider feeds samples in and renders the state this module returns,
 * which keeps the noise filtering and progress rules testable on their own.
 */

import { cumulativeDistances, haversineMeters, projectOntoPath } from './geo';
import type { LocationSample } from './location';
import type { Coordinate, RouteCandidate } from './routing';

export type RunStatus = 'active' | 'paused' | 'finished';

export type SavedRun = {
  id: string;
  /** Epoch milliseconds. */
  startedAt: number;
  /** Epoch milliseconds, set when the run is finished. */
  endedAt: number;
  /** The planned route, kept so History can redraw it. */
  route: RouteCandidate | null;
  targetDistanceKm: number;
  /** Distance actually covered, from the GPS track. */
  distanceKm: number;
  /** Active seconds, excluding time spent paused. */
  durationSeconds: number;
  /** Minutes per kilometer over the whole run, or null below a usable distance. */
  averagePaceMinPerKm: number | null;
  /** The recorded GPS track. */
  coordinates: Coordinate[];
  status: RunStatus;
};

/**
 * Fixes less precise than this are dropped. iOS reports large radii indoors and
 * in urban canyons, and trusting them inflates distance badly.
 */
const MAX_ACCURACY_METERS = 25;

/** Movement below this is treated as jitter rather than progress. */
const MIN_MOVEMENT_METERS = 4;

/** ~45 km/h. Anything faster is a GPS jump, not a runner. */
const MAX_SPEED_METERS_PER_SECOND = 12.5;

/** How far off the planned route a fix may be and still count as progress. */
const ROUTE_CORRIDOR_METERS = 40;

/** Pace is meaningless over a very short distance, so it is withheld until here. */
const MIN_DISTANCE_FOR_PACE_METERS = 50;

export type TrackerState = {
  /** Accepted GPS track, in order. */
  coordinates: Coordinate[];
  /** Distance accumulated from accepted samples, in meters. */
  distanceMeters: number;
  /** Distance along the planned route, in meters. Monotonic. */
  progressMeters: number;
  /** Last matched segment, so progress cannot snap backwards on a loop. */
  segmentIndex: number;
  /** The last sample accepted into the track. */
  lastSample: LocationSample | null;
  /** True when the most recent fix was rejected for poor accuracy. */
  degradedSignal: boolean;
};

export function createTrackerState(): TrackerState {
  return {
    coordinates: [],
    distanceMeters: 0,
    progressMeters: 0,
    segmentIndex: 0,
    lastSample: null,
    degradedSignal: false,
  };
}

/** Precomputed planned-route data, so projection does not redo this per sample. */
export type PlannedRoute = {
  path: Coordinate[];
  cumulative: number[];
  totalMeters: number;
};

export function preparePlannedRoute(route: RouteCandidate | null): PlannedRoute | null {
  if (!route || route.geometry.length < 2) {
    return null;
  }
  const cumulative = cumulativeDistances(route.geometry);
  return {
    path: route.geometry,
    cumulative,
    totalMeters: cumulative[cumulative.length - 1],
  };
}

/**
 * Fold one GPS sample into the tracker state.
 *
 * Returns a new state, or the same reference when the sample was rejected —
 * callers can use identity to skip a re-render.
 */
export function applySample(
  state: TrackerState,
  sample: LocationSample,
  planned: PlannedRoute | null,
): TrackerState {
  if (sample.accuracyMeters !== null && sample.accuracyMeters > MAX_ACCURACY_METERS) {
    // Surface the degraded signal rather than silently pretending to track.
    return state.degradedSignal ? state : { ...state, degradedSignal: true };
  }

  const previous = state.lastSample;

  // No previous sample means either the first fix of the run or the first fix
  // after a pause. Either way the point joins the track without contributing
  // distance, so time spent paused never inflates the total.
  if (!previous) {
    return {
      ...state,
      coordinates: [...state.coordinates, sample.coordinate],
      lastSample: sample,
      degradedSignal: false,
      ...projectProgress(state, sample.coordinate, planned),
    };
  }

  const moved = haversineMeters(previous.coordinate, sample.coordinate);
  if (moved < MIN_MOVEMENT_METERS) {
    return state.degradedSignal ? { ...state, degradedSignal: false } : state;
  }

  const elapsedSeconds = Math.max(0, (sample.timestamp - previous.timestamp) / 1000);
  if (elapsedSeconds > 0 && moved / elapsedSeconds > MAX_SPEED_METERS_PER_SECOND) {
    return state;
  }

  return {
    ...state,
    coordinates: [...state.coordinates, sample.coordinate],
    distanceMeters: state.distanceMeters + moved,
    lastSample: sample,
    degradedSignal: false,
    ...projectProgress(state, sample.coordinate, planned),
  };
}

/**
 * Progress along the planned route from the runner's position.
 *
 * Never derived from elapsed time. Progress only moves forward, and only when
 * the runner is actually near the line, so drifting off-route holds the
 * completed portion instead of jumping it around.
 */
function projectProgress(
  state: TrackerState,
  coordinate: Coordinate,
  planned: PlannedRoute | null,
): Pick<TrackerState, 'progressMeters' | 'segmentIndex'> {
  if (!planned) {
    return { progressMeters: state.progressMeters, segmentIndex: state.segmentIndex };
  }

  const projection = projectOntoPath(
    planned.path,
    coordinate,
    planned.cumulative,
    state.segmentIndex,
  );

  if (!projection || projection.offsetMeters > ROUTE_CORRIDOR_METERS) {
    return { progressMeters: state.progressMeters, segmentIndex: state.segmentIndex };
  }

  if (projection.alongMeters <= state.progressMeters) {
    return { progressMeters: state.progressMeters, segmentIndex: state.segmentIndex };
  }

  return {
    progressMeters: projection.alongMeters,
    segmentIndex: projection.segmentIndex,
  };
}

/** Minutes per kilometer, or null when the distance is too short to be useful. */
export function paceMinPerKm(distanceMeters: number, activeSeconds: number): number | null {
  if (distanceMeters < MIN_DISTANCE_FOR_PACE_METERS || activeSeconds <= 0) {
    return null;
  }
  return activeSeconds / 60 / (distanceMeters / 1000);
}

/** `5.24` — two decimals, the convention runners expect for distance. */
export function formatDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

/** `31:42`, or `1:04:18` once the run passes an hour. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** `6'03"` — the standard pace notation. Returns `--'--"` when unavailable. */
export function formatPace(minPerKm: number | null): string {
  if (minPerKm === null || !Number.isFinite(minPerKm) || minPerKm <= 0) {
    return `--'--"`;
  }
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  // Rounding 59.6s up must carry into the minutes rather than render 6'60".
  const carried = seconds === 60 ? { m: minutes + 1, s: 0 } : { m: minutes, s: seconds };
  return `${carried.m}'${carried.s.toString().padStart(2, '0')}"`;
}

export type RunRecords = {
  /** The longest run by recorded distance. */
  longest: SavedRun | null;
  /** The best (lowest) average pace. */
  fastest: SavedRun | null;
};

/**
 * Records derived from saved runs.
 *
 * Only what the stored data actually supports — no records that would need
 * splits, heart rate or elevation series ROAM does not record.
 */
export function computeRecords(runs: SavedRun[]): RunRecords {
  let longest: SavedRun | null = null;
  let fastest: SavedRun | null = null;

  for (const run of runs) {
    if (run.distanceKm > 0 && (!longest || run.distanceKm > longest.distanceKm)) {
      longest = run;
    }
    // A pace from a near-zero distance is noise, so those runs cannot hold the
    // record; `averagePaceMinPerKm` is already null below the usable threshold.
    const pace = run.averagePaceMinPerKm;
    if (pace !== null && (!fastest || pace < (fastest.averagePaceMinPerKm ?? Infinity))) {
      fastest = run;
    }
  }

  return { longest, fastest };
}

/** `Tue 15 Sep · 07:42` — the format History rows use. */
export function formatRunDate(epochMs: number): string {
  const date = new Date(epochMs);
  const day = date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** Spoken form for VoiceOver, where `6'03"/km` would be read as punctuation. */
export function paceAccessibilityLabel(minPerKm: number | null): string {
  if (minPerKm === null || !Number.isFinite(minPerKm) || minPerKm <= 0) {
    return 'Pace not available yet';
  }
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  const carried = seconds === 60 ? { m: minutes + 1, s: 0 } : { m: minutes, s: seconds };
  return `${carried.m} minutes ${carried.s} seconds per kilometer`;
}
