import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import * as location from './location';
import type { Coordinate, RouteCandidate } from './routing';
import {
  applySample,
  createTrackerState,
  paceMinPerKm,
  preparePlannedRoute,
  trackerStateFromCheckpoint,
  type PlannedRoute,
  type RunStatus,
  type SavedRun,
  type TrackerState,
} from './run-session';
import { checkpointRun, clearInProgressRun, getInProgressRun, saveRun } from './run-storage';

export type RunSessionStatus = 'idle' | RunStatus;

/**
 * The snapshot the UI renders. Published on a timer rather than per GPS fix, so
 * the number of re-renders is bounded by the clock and not by how chatty the
 * location provider happens to be.
 */
export type RunSnapshot = {
  distanceMeters: number;
  activeSeconds: number;
  paceMinPerKm: number | null;
  /** The runner's recorded track. */
  track: Coordinate[];
  /** Distance covered along the planned route, in meters. */
  progressMeters: number;
  /** True while fixes are too imprecise to trust. */
  degradedSignal: boolean;
  /** Latest accepted position, for the map marker. */
  position: Coordinate | null;
  /** True once the runner has covered most of the route and returned to the start. */
  completionSuggested: boolean;
  /** True once several consecutive fixes have landed outside the route corridor. */
  offRoute: boolean;
  /** Perpendicular distance from the route, in meters. */
  distanceToRouteMeters: number;
  /** Compass bearing back to the route, or null when on it or there is no route. */
  directionToRouteDegrees: number | null;
};

export type RunContextValue = RunSnapshot & {
  status: RunSessionStatus;
  route: RouteCandidate | null;
  targetKm: number;
  /** Set once a run is finished, until it is saved or discarded. */
  completedRun: SavedRun | null;
  start: (route: RouteCandidate | null, targetKm: number) => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  saveCompleted: () => Promise<void>;
  discardCompleted: () => void;
  /** Dismisses a completion suggestion without ending the run. */
  dismissCompletionSuggestion: () => void;
  /** A run that was active/paused when the app last stopped running, if any. */
  recoverable: SavedRun | null;
  resumeRecovered: () => void;
  discardRecovered: () => void;
};

const RunContext = createContext<RunContextValue | null>(null);

/** How often the snapshot is published. Matches the 1-second clock. */
const PUBLISH_INTERVAL_MS = 1000;

/**
 * Checkpoint every Nth publish tick (~10s at the 1s publish interval) rather
 * than every tick, so a mid-run crash loses at most a few seconds of progress
 * without writing to disk once a second for the whole run.
 */
const CHECKPOINT_EVERY_N_PUBLISHES = 10;

const EMPTY_SNAPSHOT: RunSnapshot = {
  distanceMeters: 0,
  activeSeconds: 0,
  paceMinPerKm: null,
  track: [],
  progressMeters: 0,
  degradedSignal: false,
  position: null,
  completionSuggested: false,
  offRoute: false,
  distanceToRouteMeters: 0,
  directionToRouteDegrees: null,
};

export function RunProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RunSessionStatus>('idle');
  const [route, setRoute] = useState<RouteCandidate | null>(null);
  const [targetKm, setTargetKm] = useState(0);
  const [snapshot, setSnapshot] = useState<RunSnapshot>(EMPTY_SNAPSHOT);
  const [completedRun, setCompletedRun] = useState<SavedRun | null>(null);
  const [recoverable, setRecoverable] = useState<SavedRun | null>(null);

  // Everything below is mutated by GPS callbacks and must not trigger renders.
  const tracker = useRef<TrackerState>(createTrackerState());
  const planned = useRef<PlannedRoute | null>(null);
  const subscription = useRef<location.LocationSubscription | null>(null);
  const startedAt = useRef(0);
  const pausedTotalMs = useRef(0);
  const pausedAt = useRef<number | null>(null);
  /**
   * Bumped every time a subscription is torn down. A sample/error callback
   * captures the epoch current at its own creation and checks it before
   * touching `tracker.current` — without this, a callback already in flight
   * when `remove()` is called (native teardown is asynchronous) could still
   * fire once more and write into a *different* run's fresh tracker state if
   * a new run had already started in the meantime.
   */
  const trackingEpoch = useRef(0);
  /** Set by `onError` (e.g. permission revoked mid-run); folded into degradedSignal. */
  const trackingError = useRef(false);
  /** Counts publish ticks so checkpointing runs every Nth tick, not every one. */
  const checkpointTick = useRef(0);

  const stopWatching = useCallback(() => {
    trackingEpoch.current += 1;
    subscription.current?.remove();
    subscription.current = null;
  }, []);

  const startWatching = useCallback(() => {
    stopWatching();
    const epoch = trackingEpoch.current;
    trackingError.current = false;
    subscription.current = location.watchRunPosition(
      (sample) => {
        if (epoch !== trackingEpoch.current) {
          return;
        }
        const next = applySample(tracker.current, sample, planned.current);
        if (next !== tracker.current) {
          tracker.current = next;
        }
      },
      () => {
        if (epoch !== trackingEpoch.current) {
          return;
        }
        // Never lose the session over a watch failure — surface it through
        // the existing "weak signal" UI instead of a new error state.
        trackingError.current = true;
      },
    );
  }, [stopWatching]);

  const activeSecondsNow = useCallback(() => {
    if (startedAt.current === 0) {
      return 0;
    }
    const pausedSoFar =
      pausedTotalMs.current + (pausedAt.current === null ? 0 : Date.now() - pausedAt.current);
    return Math.max(0, (Date.now() - startedAt.current - pausedSoFar) / 1000);
  }, []);

  const publish = useCallback(() => {
    const state = tracker.current;
    const seconds = activeSecondsNow();
    setSnapshot({
      distanceMeters: state.distanceMeters,
      activeSeconds: seconds,
      paceMinPerKm: paceMinPerKm(state.distanceMeters, seconds),
      track: state.coordinates,
      progressMeters: state.progressMeters,
      degradedSignal: state.degradedSignal || trackingError.current,
      position: state.lastSample?.coordinate ?? null,
      completionSuggested: state.completionSuggested,
      offRoute: state.offRoute,
      distanceToRouteMeters: state.distanceToRouteMeters,
      directionToRouteDegrees: state.directionToRouteDegrees,
    });
  }, [activeSecondsNow]);

  /** Persists the in-progress run so it survives a process kill. */
  const checkpoint = useCallback(() => {
    if (startedAt.current === 0) {
      return;
    }
    const state = tracker.current;
    const seconds = activeSecondsNow();
    void checkpointRun({
      id: `run-${startedAt.current}`,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      route,
      targetDistanceKm: targetKm,
      distanceKm: state.distanceMeters / 1000,
      durationSeconds: seconds,
      averagePaceMinPerKm: paceMinPerKm(state.distanceMeters, seconds),
      coordinates: state.coordinates,
      timestamps: state.timestamps,
      status: pausedAt.current === null ? 'active' : 'paused',
    });
  }, [activeSecondsNow, route, targetKm]);

  // One timer drives the clock, flushes any accumulated GPS movement, and
  // periodically checkpoints — not on every tick; see CHECKPOINT_EVERY_N_PUBLISHES.
  useEffect(() => {
    if (status !== 'active') {
      return;
    }
    const interval = setInterval(() => {
      publish();
      checkpointTick.current += 1;
      if (checkpointTick.current >= CHECKPOINT_EVERY_N_PUBLISHES) {
        checkpointTick.current = 0;
        checkpoint();
      }
    }, PUBLISH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, publish, checkpoint]);

  useEffect(() => stopWatching, [stopWatching]);

  // On launch, offer to recover a run that was active/paused when the app
  // last stopped running (killed, crashed, or backgrounded and evicted).
  useEffect(() => {
    let cancelled = false;
    void getInProgressRun().then((run) => {
      if (!cancelled && run) {
        setRecoverable(run);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(
    (nextRoute: RouteCandidate | null, nextTargetKm: number) => {
      tracker.current = createTrackerState();
      planned.current = preparePlannedRoute(nextRoute);
      startedAt.current = Date.now();
      pausedTotalMs.current = 0;
      pausedAt.current = null;

      checkpointTick.current = 0;
      setRoute(nextRoute);
      setTargetKm(nextTargetKm);
      setCompletedRun(null);
      setRecoverable(null);
      setSnapshot(EMPTY_SNAPSHOT);
      setStatus('active');
      startWatching();
    },
    [startWatching],
  );

  const pause = useCallback(() => {
    if (status !== 'active') {
      return;
    }
    pausedAt.current = Date.now();
    // Suspending the subscription is what actually stops battery drain;
    // simply ignoring callbacks would keep the GPS radio busy.
    stopWatching();
    publish();
    checkpointTick.current = 0;
    checkpoint();
    setStatus('paused');
  }, [checkpoint, publish, status, stopWatching]);

  const resume = useCallback(() => {
    if (status !== 'paused') {
      return;
    }
    if (pausedAt.current !== null) {
      pausedTotalMs.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    }
    // Drop the last fix so the jump across the paused gap is not counted as
    // distance; the next fix re-seeds the track instead.
    tracker.current = { ...tracker.current, lastSample: null };
    startWatching();
    setStatus('active');
  }, [startWatching, status]);

  const finish = useCallback(() => {
    stopWatching();
    const state = tracker.current;
    const seconds = activeSecondsNow();
    const endedAt = Date.now();

    publish();
    // The active/paused phase this checkpoint protects is over — from here
    // the run is either saved or discarded via the summary screen, not
    // silently recovered on next launch.
    void clearInProgressRun();
    setStatus('finished');
    setCompletedRun({
      id: `run-${startedAt.current}`,
      startedAt: startedAt.current,
      endedAt,
      route,
      targetDistanceKm: targetKm,
      distanceKm: state.distanceMeters / 1000,
      durationSeconds: seconds,
      averagePaceMinPerKm: paceMinPerKm(state.distanceMeters, seconds),
      coordinates: state.coordinates,
      timestamps: state.timestamps,
      status: 'finished',
    });
  }, [activeSecondsNow, publish, route, stopWatching, targetKm]);

  const reset = useCallback(() => {
    tracker.current = createTrackerState();
    planned.current = null;
    startedAt.current = 0;
    pausedTotalMs.current = 0;
    pausedAt.current = null;
    setSnapshot(EMPTY_SNAPSHOT);
    setRoute(null);
    setTargetKm(0);
    setCompletedRun(null);
    setStatus('idle');
  }, []);

  const saveCompleted = useCallback(async () => {
    if (completedRun) {
      await saveRun(completedRun);
    }
    reset();
  }, [completedRun, reset]);

  const discardCompleted = useCallback(() => {
    reset();
  }, [reset]);

  const resumeRecovered = useCallback(() => {
    if (!recoverable) {
      return;
    }
    const run = recoverable;
    tracker.current = trackerStateFromCheckpoint(run);
    planned.current = preparePlannedRoute(run.route);
    startedAt.current = Date.now() - run.durationSeconds * 1000;
    pausedTotalMs.current = 0;
    pausedAt.current = null;
    checkpointTick.current = 0;

    setRoute(run.route);
    setTargetKm(run.targetDistanceKm);
    setCompletedRun(null);
    setSnapshot({
      distanceMeters: tracker.current.distanceMeters,
      activeSeconds: run.durationSeconds,
      paceMinPerKm: paceMinPerKm(tracker.current.distanceMeters, run.durationSeconds),
      track: tracker.current.coordinates,
      progressMeters: 0,
      degradedSignal: false,
      position: tracker.current.coordinates.at(-1) ?? null,
      completionSuggested: false,
      offRoute: false,
      distanceToRouteMeters: 0,
      directionToRouteDegrees: null,
    });
    setStatus('active');
    setRecoverable(null);
    startWatching();
  }, [recoverable, startWatching]);

  const discardRecovered = useCallback(() => {
    setRecoverable(null);
    void clearInProgressRun();
  }, []);

  const dismissCompletionSuggestion = useCallback(() => {
    tracker.current = { ...tracker.current, nearStartStreak: 0, completionSuggested: false };
    publish();
  }, [publish]);

  const value = useMemo<RunContextValue>(
    () => ({
      ...snapshot,
      status,
      route,
      targetKm,
      completedRun,
      start,
      pause,
      resume,
      finish,
      saveCompleted,
      discardCompleted,
      dismissCompletionSuggestion,
      recoverable,
      resumeRecovered,
      discardRecovered,
    }),
    [
      snapshot,
      status,
      route,
      targetKm,
      completedRun,
      start,
      pause,
      resume,
      finish,
      saveCompleted,
      discardCompleted,
      dismissCompletionSuggestion,
      recoverable,
      resumeRecovered,
      discardRecovered,
    ],
  );

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun(): RunContextValue {
  const value = useContext(RunContext);
  if (!value) {
    throw new Error('useRun must be used inside <RunProvider>');
  }
  return value;
}
