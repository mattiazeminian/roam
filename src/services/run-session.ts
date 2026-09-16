/**
 * Run session model and tracking math.
 *
 * Pure and synchronous: no React, no GPS subscription, no storage. The live
 * session provider feeds samples in and renders the state this module returns,
 * which keeps the noise filtering and progress rules testable on their own.
 */

import { bearingDegrees, cumulativeDistances, haversineMeters, projectOntoPath } from './geo';
import type { LocationSample } from './location';
import { isValidCoordinate, type Coordinate, type RouteCandidate } from './routing';

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
 * in urban canyons, and trusting them inflates distance badly. A fix with no
 * reported accuracy at all is treated the same way — unknown error is not
 * safer than known-bad error, and the caller (this module) is the one place
 * responsible for not trusting noisy fixes.
 */
const MAX_ACCURACY_METERS = 25;

/** Movement below this is treated as jitter rather than progress. */
const MIN_MOVEMENT_METERS = 4;

/** ~45 km/h. Anything faster is a GPS jump, not a runner. */
const MAX_SPEED_METERS_PER_SECOND = 12.5;

/**
 * A fix older than this is treated as stale, not current position. iOS
 * commonly answers the *first* callback after starting a watch with its last
 * cached location rather than a fresh read — sometimes minutes old — and
 * accepting that as the run's starting point (or a mid-run position) would
 * silently place the runner somewhere they are not. 15s is tight enough to
 * catch a genuinely cached fix while leaving generous slack for normal
 * dispatch delay on a fix that really is current.
 */
const MAX_SAMPLE_AGE_MS = 15_000;

/** How far off the planned route a fix may be and still count as progress. */
const ROUTE_CORRIDOR_METERS = 40;

/** Pace is meaningless over a very short distance, so it is withheld until here. */
const MIN_DISTANCE_FOR_PACE_METERS = 50;

/**
 * Fraction of the planned distance that must already be covered before a
 * return to the start can suggest completion. High enough that a runner
 * merely passing near the start early in a loop route never triggers it.
 */
const MIN_COMPLETION_PROGRESS_FRACTION = 0.8;

/** "Back at the start" radius, widened by the fix's own reported accuracy. */
const COMPLETION_BASE_RADIUS_METERS = 20;

/**
 * Consecutive qualifying fixes required before suggesting completion, so one
 * stray point near the start — a GPS bounce, a road crossing — cannot
 * trigger it on its own.
 */
const COMPLETION_CONFIRM_FIXES = 3;

/**
 * Consecutive fixes outside the route corridor required before raising an
 * off-route state, so a single stray point off the corridor does not flash
 * the signal on and off. Clearing is immediate on the other hand — a runner
 * back on the corridor should see the signal go away right away, not linger.
 */
const OFF_ROUTE_CONFIRM_FIXES = 3;

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
  /** Consecutive qualifying fixes near the start once progress is far enough along. */
  nearStartStreak: number;
  /** True once a return to the start has been confirmed across several fixes. */
  completionSuggested: boolean;
  /** Consecutive fixes outside the route corridor. */
  offRouteStreak: number;
  /** True once several consecutive fixes have landed outside the corridor. */
  offRoute: boolean;
  /** Perpendicular distance from the route, in meters. 0 when on it or there is no route. */
  distanceToRouteMeters: number;
  /** Compass bearing back to the route, or null when on it or there is no route. */
  directionToRouteDegrees: number | null;
};

export function createTrackerState(): TrackerState {
  return {
    coordinates: [],
    distanceMeters: 0,
    progressMeters: 0,
    segmentIndex: 0,
    lastSample: null,
    degradedSignal: false,
    nearStartStreak: 0,
    completionSuggested: false,
    offRouteStreak: 0,
    offRoute: false,
    distanceToRouteMeters: 0,
    directionToRouteDegrees: null,
  };
}

/**
 * Rebuilds tracker state from a persisted checkpoint after a process kill.
 *
 * `lastSample` is intentionally left null, the same way a resume-from-pause
 * works: the next accepted fix re-seeds the track instead of computing a
 * bogus distance/speed across however long the app was closed. Route
 * progress is not restored either — projecting the whole track onto the
 * route from scratch isn't worth it here, and it self-heals within the next
 * few accepted fixes since it only ever moves forward.
 */
export function trackerStateFromCheckpoint(run: SavedRun): TrackerState {
  return {
    ...createTrackerState(),
    coordinates: run.coordinates,
    distanceMeters: run.distanceKm * 1000,
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
 * Whether this fix should extend, break, or leave alone the "back at the
 * start" streak. Uses the runner's current position directly rather than
 * requiring accepted movement, since a runner who has stopped right at the
 * finish produces fixes the jitter filter would otherwise never hand to
 * completion detection.
 */
function evaluateCompletion(
  state: TrackerState,
  sample: LocationSample,
  planned: PlannedRoute | null,
): Pick<TrackerState, 'nearStartStreak' | 'completionSuggested'> {
  if (state.completionSuggested) {
    return { nearStartStreak: state.nearStartStreak, completionSuggested: true };
  }
  if (!planned || planned.totalMeters <= 0) {
    return { nearStartStreak: 0, completionSuggested: false };
  }
  if (state.progressMeters / planned.totalMeters < MIN_COMPLETION_PROGRESS_FRACTION) {
    return { nearStartStreak: 0, completionSuggested: false };
  }
  const radius = COMPLETION_BASE_RADIUS_METERS + (sample.accuracyMeters ?? 0);
  if (haversineMeters(planned.path[0], sample.coordinate) > radius) {
    return { nearStartStreak: 0, completionSuggested: false };
  }
  const nearStartStreak = state.nearStartStreak + 1;
  return { nearStartStreak, completionSuggested: nearStartStreak >= COMPLETION_CONFIRM_FIXES };
}

/**
 * Whether this fix is on or off the route corridor, and how far/which way
 * back to it. Like completion detection, this runs on the runner's raw
 * position rather than requiring accepted movement, so a stopped runner who
 * has wandered off the corridor still shows an off-route signal.
 *
 * Never touches `progressMeters` — deviation must not inflate distance or
 * move progress; `projectProgress` already holds it while off corridor.
 */
function evaluateOffRoute(
  state: TrackerState,
  sample: LocationSample,
  planned: PlannedRoute | null,
): Pick<TrackerState, 'offRouteStreak' | 'offRoute' | 'distanceToRouteMeters' | 'directionToRouteDegrees'> {
  if (!planned) {
    return { offRouteStreak: 0, offRoute: false, distanceToRouteMeters: 0, directionToRouteDegrees: null };
  }

  const projection = projectOntoPath(planned.path, sample.coordinate, planned.cumulative, state.segmentIndex);
  if (!projection) {
    return {
      offRouteStreak: state.offRouteStreak,
      offRoute: state.offRoute,
      distanceToRouteMeters: state.distanceToRouteMeters,
      directionToRouteDegrees: state.directionToRouteDegrees,
    };
  }

  if (projection.offsetMeters <= ROUTE_CORRIDOR_METERS) {
    // Back on the corridor clears the signal immediately, not gradually.
    return { offRouteStreak: 0, offRoute: false, distanceToRouteMeters: projection.offsetMeters, directionToRouteDegrees: null };
  }

  const a = planned.path[projection.segmentIndex];
  const b = planned.path[projection.segmentIndex + 1];
  const nearestPoint = {
    latitude: a.latitude + (b.latitude - a.latitude) * projection.t,
    longitude: a.longitude + (b.longitude - a.longitude) * projection.t,
  };

  const offRouteStreak = state.offRouteStreak + 1;
  return {
    offRouteStreak,
    offRoute: offRouteStreak >= OFF_ROUTE_CONFIRM_FIXES,
    distanceToRouteMeters: projection.offsetMeters,
    directionToRouteDegrees: bearingDegrees(sample.coordinate, nearestPoint),
  };
}

/**
 * Fold one GPS sample into the tracker state.
 *
 * Returns a new state, or the same reference when the sample was rejected —
 * callers can use identity to skip a re-render.
 *
 * `nowMs` defaults to the real clock; tests pass an explicit value so
 * staleness checks stay deterministic like the rest of this module.
 */
export function applySample(
  state: TrackerState,
  sample: LocationSample,
  planned: PlannedRoute | null,
  nowMs: number = Date.now(),
): TrackerState {
  if (!isValidCoordinate(sample.coordinate)) {
    // A malformed fix must never reach the math below: NaN propagates
    // silently through addition rather than throwing, so one bad coordinate
    // would poison every distance calculation for the rest of the run.
    return state;
  }

  if (nowMs - sample.timestamp > MAX_SAMPLE_AGE_MS) {
    // Stale/cached fix — see MAX_SAMPLE_AGE_MS. Not an accuracy problem, so
    // it does not touch degradedSignal.
    return state;
  }

  if (sample.accuracyMeters === null || sample.accuracyMeters > MAX_ACCURACY_METERS) {
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
      ...evaluateCompletion(state, sample, planned),
      ...evaluateOffRoute(state, sample, planned),
    };
  }

  if (sample.timestamp <= previous.timestamp) {
    // Out-of-order delivery: the OS can occasionally deliver a fix whose
    // timestamp is not after the last one. This used to be handled by
    // clamping elapsed time to zero, which then skipped the speed check below
    // entirely (that check only ran `if (elapsedSeconds > 0)`) — silently
    // letting a fix of any size through unfiltered. Rejecting outright closes
    // that gap, and also protects the "first fix after returning from the
    // background" case: if that fix's timestamp is older than the last one
    // seen before backgrounding, it is exactly this scenario. An untrustworthy
    // fix like this must not extend the completion streak either.
    return state;
  }

  const moved = haversineMeters(previous.coordinate, sample.coordinate);
  if (moved < MIN_MOVEMENT_METERS) {
    // A stopped runner produces exactly this: fixes too close together to
    // register as movement. Completion and off-route still need to see
    // them — both are about position, not motion.
    const completion = evaluateCompletion(state, sample, planned);
    const offRoute = evaluateOffRoute(state, sample, planned);
    if (
      !state.degradedSignal &&
      completion.nearStartStreak === state.nearStartStreak &&
      completion.completionSuggested === state.completionSuggested &&
      offRoute.offRouteStreak === state.offRouteStreak &&
      offRoute.offRoute === state.offRoute
    ) {
      return state;
    }
    return { ...state, degradedSignal: false, ...completion, ...offRoute };
  }

  // sample.timestamp > previous.timestamp is now guaranteed, so elapsedSeconds
  // is always positive here — no separate zero-guard needed.
  const elapsedSeconds = (sample.timestamp - previous.timestamp) / 1000;
  if (moved / elapsedSeconds > MAX_SPEED_METERS_PER_SECOND) {
    // A GPS jump is not trustworthy enough to extend the completion streak.
    return state;
  }

  return {
    ...state,
    coordinates: [...state.coordinates, sample.coordinate],
    distanceMeters: state.distanceMeters + moved,
    lastSample: sample,
    degradedSignal: false,
    ...projectProgress(state, sample.coordinate, planned),
    ...evaluateCompletion(state, sample, planned),
    ...evaluateOffRoute(state, sample, planned),
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

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** `45°` → `"NE"`. One of 8 points — precise enough for a glance while running. */
export function compassDirection(degrees: number): string {
  const index = Math.round(degrees / 45) % 8;
  return COMPASS_POINTS[index];
}

/**
 * A run must be at least this long to hold any pace record. `averagePaceMinPerKm`
 * is already null below `MIN_DISTANCE_FOR_PACE_METERS` (50 m), but 50 m is far
 * too short to call a "best": a 200 m jog would win on pace alone. 1 km is the
 * shortest thing a runner would recognise as a run rather than a warm-up.
 */
const MIN_RECORD_DISTANCE_KM = 1;

/** Distance-scoped bests: the run itself has to reach the threshold to count. */
const FIVE_K_KM = 5;
const TEN_K_KM = 10;

export type RunRecords = {
  /** The longest run by recorded distance. */
  longest: SavedRun | null;
  /** The best (lowest) average pace of any run at least `MIN_RECORD_DISTANCE_KM` long. */
  fastest: SavedRun | null;
  /** The best average pace of any run of at least 5 km. */
  fastest5k: SavedRun | null;
  /** The best average pace of any run of at least 10 km. */
  fastest10k: SavedRun | null;
};

/**
 * Records derived from saved runs.
 *
 * Only what the stored data actually supports. `SavedRun` keeps distance,
 * duration and average pace, but the track is bare coordinates with no
 * per-point timestamps — so a true "fastest 5 km" split (the time taken to
 * cover the first 5 km of a longer run) cannot be computed without inventing
 * data. The distance-scoped records are therefore *scoped* bests: the best
 * average pace of any run that was itself at least that long, which is a
 * weaker but honest claim. Documented so the label is not read as a split.
 *
 * A record is null when no run qualifies — never a placeholder.
 */
export function computeRecords(runs: SavedRun[]): RunRecords {
  let longest: SavedRun | null = null;
  let fastest: SavedRun | null = null;
  let fastest5k: SavedRun | null = null;
  let fastest10k: SavedRun | null = null;

  const beats = (candidate: SavedRun, current: SavedRun | null): boolean => {
    const pace = candidate.averagePaceMinPerKm;
    if (pace === null) {
      return false;
    }
    return current === null || pace < (current.averagePaceMinPerKm ?? Infinity);
  };

  for (const run of runs) {
    if (run.distanceKm > 0 && (!longest || run.distanceKm > longest.distanceKm)) {
      longest = run;
    }
    if (run.distanceKm >= MIN_RECORD_DISTANCE_KM && beats(run, fastest)) {
      fastest = run;
    }
    if (run.distanceKm >= FIVE_K_KM && beats(run, fastest5k)) {
      fastest5k = run;
    }
    if (run.distanceKm >= TEN_K_KM && beats(run, fastest10k)) {
      fastest10k = run;
    }
  }

  return { longest, fastest, fastest5k, fastest10k };
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
