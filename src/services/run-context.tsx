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
import type { LocationSample } from './location';
import { setRunLocationSink, startRunLocationUpdates, stopRunLocationUpdates } from './background-location';
import { findRoutesBetween, RoutingError, type Coordinate, type RouteCandidate } from './routing';
import {
  applySample,
  createTrackerState,
  currentPaceMinPerKm,
  paceMinPerKm,
  preparePlannedRoute,
  trackerStateFromCheckpoint,
  type PlannedRoute,
  type SavedRun,
  type TrackerState,
} from './run-session';
import { checkpointRun, clearInProgressRun, getInProgressRun, saveRun } from './run-storage';
import { canTransition, type RunSessionStatus } from './run-state';
import type { WorkoutStep, WorkoutType } from './training';
import {
  advanceWorkoutExecution,
  createWorkoutExecutionState,
  currentWorkoutStep,
  workoutStepProgress,
  workoutStepRemaining,
} from './workout-execution';

export type { RunSessionStatus } from './run-state';

/**
 * The snapshot the UI renders. Published on a timer rather than per GPS fix, so
 * the number of re-renders is bounded by the clock and not by how chatty the
 * location provider happens to be.
 */
export type RunSnapshot = {
  distanceMeters: number;
  activeSeconds: number;
  paceMinPerKm: number | null;
  /** Pace over the last ~30s, or null when it cannot be trusted. */
  currentPaceMinPerKm: number | null;
  /** The runner's recorded track. */
  track: Coordinate[];
  /** Distance covered along the planned route, in meters. */
  progressMeters: number;
  /** True while fixes are too imprecise to trust. */
  degradedSignal: boolean;
  /** True while the runner has stopped long enough that the clock is held (#38). */
  autoPaused: boolean;
  /** The structured step being run, or null for an unstructured run (#148). */
  workoutStep: WorkoutStep | null;
  /** Persisted/derived steps for the current workout. */
  workoutSteps: WorkoutStep[];
  /** How far through the current step, 0–1. */
  workoutStepProgress: number;
  /** Seconds or meters left in the current step. */
  workoutStepRemaining: number;
  /** True once every step of a structured workout has been passed. */
  workoutStepsComplete: boolean;
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
  targetDurationSeconds: number;
  /** The planned workout this run was started from, when there was one. */
  plannedWorkoutId: string | null;
  /** The kind of run the runner chose on Record, when they chose one. */
  workoutType: WorkoutType | null;
  /** True while an explicit reroute is being calculated. */
  rerouting: boolean;
  /** The last reroute failure, if any, for the runner to read. */
  rerouteError: string | null;
  /** Set once a run is finished, until it is saved or discarded. */
  completedRun: SavedRun | null;
  start: (
    route: RouteCandidate | null,
    targetKm: number,
    plannedWorkoutId?: string | null,
    workoutType?: WorkoutType | null,
    targetDurationSeconds?: number,
    steps?: readonly WorkoutStep[],
  ) => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  saveCompleted: () => Promise<void>;
  discardCompleted: () => void;
  /** Dismisses a completion suggestion without ending the run. */
  dismissCompletionSuggestion: () => void;
  /**
   * Explicitly route the runner back to the planned route (#64). Never
   * automatic, and never touches the recorded track or distance.
   */
  reroute: () => Promise<void>;
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
  currentPaceMinPerKm: null,
  track: [],
  progressMeters: 0,
  degradedSignal: false,
  autoPaused: false,
  workoutStep: null,
  workoutSteps: [],
  workoutStepProgress: 0,
  workoutStepRemaining: 0,
  workoutStepsComplete: false,
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
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(0);
  const [plannedWorkoutId, setPlannedWorkoutId] = useState<string | null>(null);
  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(null);
  const [workoutSteps, setWorkoutSteps] = useState<WorkoutStep[]>([]);
  const [snapshot, setSnapshot] = useState<RunSnapshot>(EMPTY_SNAPSHOT);
  const [completedRun, setCompletedRun] = useState<SavedRun | null>(null);
  const [recoverable, setRecoverable] = useState<SavedRun | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [rerouteError, setRerouteError] = useState<string | null>(null);

  // Everything below is mutated by GPS callbacks and must not trigger renders.
  const tracker = useRef<TrackerState>(createTrackerState());
  const planned = useRef<PlannedRoute | null>(null);
  const subscription = useRef<location.LocationSubscription | null>(null);
  const startedAt = useRef(0);
  const pausedTotalMs = useRef(0);
  const pausedAt = useRef<number | null>(null);
  /** Total time held by auto-pause (#38), excluded from active seconds. */
  const autoPausedTotalMs = useRef(0);
  /** When the current auto-pause began, or null when the runner is moving. */
  const autoPausedAt = useRef<number | null>(null);
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
  /** Phase execution for a structured workout (#148). Mutated by publish, not renders. */
  const workoutExecution = useRef(createWorkoutExecutionState());

  const stopWatching = useCallback(() => {
    trackingEpoch.current += 1;
    subscription.current?.remove();
    subscription.current = null;
    // Background delivery is torn down with the foreground watch: nothing
    // should be tracking once the run is paused or finished (#30).
    setRunLocationSink(null);
    void stopRunLocationUpdates();
  }, []);

  const startWatching = useCallback(() => {
    stopWatching();
    const epoch = trackingEpoch.current;
    trackingError.current = false;

    // One acceptance path for both sources. `applySample` rejects a fix whose
    // timestamp is not newer than the last accepted one, so the same location
    // arriving from the foreground watch and the background task counts once.
    const accept = (sample: LocationSample) => {
      if (epoch !== trackingEpoch.current) {
        return;
      }
      const next = applySample(tracker.current, sample, planned.current);
      if (next !== tracker.current) {
        tracker.current = next;
      }
    };

    subscription.current = location.watchRunPosition(accept, () => {
      if (epoch !== trackingEpoch.current) {
        return;
      }
      // Never lose the session over a watch failure — surface it through
      // the existing "weak signal" UI instead of a new error state.
      trackingError.current = true;
    });

    // Background updates run alongside the foreground watch, so a locked
    // screen keeps recording. Failure is deliberately silent: the run is
    // still tracked in the foreground.
    setRunLocationSink(accept);
    void startRunLocationUpdates();
  }, [stopWatching]);

  const activeSecondsNow = useCallback(() => {
    if (startedAt.current === 0) {
      return 0;
    }
    const heldSoFar =
      pausedTotalMs.current +
      autoPausedTotalMs.current +
      (pausedAt.current === null ? 0 : Date.now() - pausedAt.current) +
      (autoPausedAt.current === null ? 0 : Date.now() - autoPausedAt.current);
    return Math.max(0, (Date.now() - startedAt.current - heldSoFar) / 1000);
  }, []);

  const publish = useCallback(() => {
    const state = tracker.current;
    // Auto-pause (#38): hold the clock while the tracker reports the runner
    // stationary. The hysteresis lives in the tracker, so a slow stride never
    // trips it; here it only decides when to start and stop holding time.
    if (state.stationary) {
      if (autoPausedAt.current === null) {
        autoPausedAt.current = Date.now();
      }
    } else if (autoPausedAt.current !== null) {
      autoPausedTotalMs.current += Date.now() - autoPausedAt.current;
      autoPausedAt.current = null;
    }
    const seconds = activeSecondsNow();
    // Advance the workout phase from the same monotonic totals, so it pauses
    // with the clock and needs no timer of its own (#148).
    if (workoutSteps.length > 0) {
      workoutExecution.current = advanceWorkoutExecution(
        workoutSteps,
        workoutExecution.current,
        seconds,
        state.distanceMeters,
      );
    }
    const step = currentWorkoutStep(workoutSteps, workoutExecution.current);
    setSnapshot({
      workoutStep: step,
      workoutSteps,
      workoutStepProgress: step
        ? workoutStepProgress(step, workoutExecution.current, seconds, state.distanceMeters)
        : 0,
      workoutStepRemaining: step
        ? workoutStepRemaining(step, workoutExecution.current, seconds, state.distanceMeters)
        : 0,
      workoutStepsComplete: workoutExecution.current.completed,
      distanceMeters: state.distanceMeters,
      activeSeconds: seconds,
      paceMinPerKm: paceMinPerKm(state.distanceMeters, seconds),
      currentPaceMinPerKm: currentPaceMinPerKm(state.recent, Date.now()),
      track: state.coordinates,
      progressMeters: state.progressMeters,
      degradedSignal: state.degradedSignal || trackingError.current,
      autoPaused: autoPausedAt.current !== null,
      position: state.lastSample?.coordinate ?? null,
      completionSuggested: state.completionSuggested,
      offRoute: state.offRoute,
      distanceToRouteMeters: state.distanceToRouteMeters,
      directionToRouteDegrees: state.directionToRouteDegrees,
    });
  }, [activeSecondsNow, workoutSteps]);

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
      targetDurationSeconds: targetDurationSeconds || undefined,
      distanceKm: state.distanceMeters / 1000,
      durationSeconds: seconds,
      averagePaceMinPerKm: paceMinPerKm(state.distanceMeters, seconds),
      coordinates: state.coordinates,
      timestamps: state.timestamps,
      status: pausedAt.current === null ? 'active' : 'paused',
      plannedWorkoutId: plannedWorkoutId ?? undefined,
      workoutType: workoutType ?? undefined,
      steps: workoutSteps.length > 0 ? workoutSteps : undefined,
    });
  }, [activeSecondsNow, plannedWorkoutId, route, targetDurationSeconds, targetKm, workoutType, workoutSteps]);

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
    (
      nextRoute: RouteCandidate | null,
      nextTargetKm: number,
      nextPlannedWorkoutId: string | null = null,
      nextWorkoutType: WorkoutType | null = null,
      nextTargetDurationSeconds = 0,
      nextSteps: readonly WorkoutStep[] = [],
    ) => {
      if (!canTransition(status, 'start')) {
        // Unreachable today — `start` is legal from every state — but kept
        // so this callback consults the same table as every other one
        // rather than being the one exception by omission.
        return;
      }
      tracker.current = createTrackerState();
      planned.current = preparePlannedRoute(nextRoute);
      startedAt.current = Date.now();
      pausedTotalMs.current = 0;
      pausedAt.current = null;
      autoPausedTotalMs.current = 0;
      autoPausedAt.current = null;

      checkpointTick.current = 0;
      setRoute(nextRoute);
      setTargetKm(nextTargetKm);
      setTargetDurationSeconds(nextTargetDurationSeconds);
      setPlannedWorkoutId(nextPlannedWorkoutId);
      setWorkoutType(nextWorkoutType);
      setWorkoutSteps([...nextSteps]);
      workoutExecution.current = createWorkoutExecutionState();
      setCompletedRun(null);
      setRecoverable(null);
      setSnapshot(EMPTY_SNAPSHOT);
      setStatus('active');
      startWatching();
    },
    [startWatching, status],
  );

  const pause = useCallback(() => {
    if (!canTransition(status, 'pause')) {
      return;
    }
    // A manual pause wins over auto-pause: fold whatever auto-pause had held
    // into the total and clear it, so the two never double-count.
    if (autoPausedAt.current !== null) {
      autoPausedTotalMs.current += Date.now() - autoPausedAt.current;
      autoPausedAt.current = null;
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
    if (!canTransition(status, 'resume')) {
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
    if (!canTransition(status, 'finish')) {
      // Without this guard, calling finish() from `idle` (no run started)
      // used to fabricate a zero-distance completed run, and calling it
      // twice would silently overwrite the first result.
      return;
    }
    stopWatching();
    if (autoPausedAt.current !== null) {
      autoPausedTotalMs.current += Date.now() - autoPausedAt.current;
      autoPausedAt.current = null;
    }
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
      targetDurationSeconds: targetDurationSeconds || undefined,
      distanceKm: state.distanceMeters / 1000,
      durationSeconds: seconds,
      averagePaceMinPerKm: paceMinPerKm(state.distanceMeters, seconds),
      coordinates: state.coordinates,
      timestamps: state.timestamps,
      status: 'finished',
      plannedWorkoutId: plannedWorkoutId ?? undefined,
      workoutType: workoutType ?? undefined,
      steps: workoutSteps.length > 0 ? workoutSteps : undefined,
    });
  }, [activeSecondsNow, plannedWorkoutId, publish, route, status, stopWatching, targetDurationSeconds, targetKm, workoutType, workoutSteps]);

  const reset = useCallback(() => {
    tracker.current = createTrackerState();
    planned.current = null;
    startedAt.current = 0;
    pausedTotalMs.current = 0;
    pausedAt.current = null;
    autoPausedTotalMs.current = 0;
    autoPausedAt.current = null;
    setSnapshot(EMPTY_SNAPSHOT);
    setRoute(null);
    setTargetKm(0);
    setTargetDurationSeconds(0);
    setPlannedWorkoutId(null);
    setWorkoutType(null);
    setWorkoutSteps([]);
    workoutExecution.current = createWorkoutExecutionState();
    setCompletedRun(null);
    setRerouting(false);
    setRerouteError(null);
    setStatus('idle');
  }, []);

  const saveCompleted = useCallback(async () => {
    if (!canTransition(status, 'saveCompleted')) {
      return;
    }
    if (completedRun) {
      await saveRun(completedRun);
    }
    reset();
  }, [completedRun, reset, status]);

  const discardCompleted = useCallback(() => {
    if (!canTransition(status, 'discardCompleted')) {
      return;
    }
    reset();
  }, [reset, status]);

  const resumeRecovered = useCallback(() => {
    if (!recoverable || !canTransition(status, 'resumeRecovered')) {
      // The status guard matters even though `recoverable` is only ever set
      // from `idle` today: without it, a stale recovery offer resolved late
      // (e.g. the runner tapped Resume after already starting a fresh run
      // some other way) would silently overwrite a session already live.
      return;
    }
    const run = recoverable;
    tracker.current = trackerStateFromCheckpoint(run);
    planned.current = preparePlannedRoute(run.route);
    startedAt.current = Date.now() - run.durationSeconds * 1000;
    pausedTotalMs.current = 0;
    pausedAt.current = null;
    autoPausedTotalMs.current = 0;
    autoPausedAt.current = null;
    checkpointTick.current = 0;

    setRoute(run.route);
    setTargetKm(run.targetDistanceKm);
    setTargetDurationSeconds(run.targetDurationSeconds ?? 0);
    setPlannedWorkoutId(run.plannedWorkoutId ?? null);
    setWorkoutType(run.workoutType ?? null);
    // A recovered run keeps its phases (#151). The execution state is not
    // persisted, but it is a pure fold of the monotonic totals, so replaying
    // the steps from zero reconstructs which step the runner is actually in —
    // no invented position.
    const recoveredSteps = run.steps ?? [];
    setWorkoutSteps(recoveredSteps);
    const recoveredExecution = advanceWorkoutExecution(
      recoveredSteps,
      createWorkoutExecutionState(),
      run.durationSeconds,
      tracker.current.distanceMeters,
    );
    workoutExecution.current = recoveredExecution;
    const recoveredStep = currentWorkoutStep(recoveredSteps, recoveredExecution);
    setCompletedRun(null);
    setSnapshot({
      distanceMeters: tracker.current.distanceMeters,
      activeSeconds: run.durationSeconds,
      paceMinPerKm: paceMinPerKm(tracker.current.distanceMeters, run.durationSeconds),
      currentPaceMinPerKm: null,
      track: tracker.current.coordinates,
      progressMeters: 0,
      workoutStep: recoveredStep,
      workoutSteps: recoveredSteps,
      workoutStepProgress: recoveredStep
        ? workoutStepProgress(recoveredStep, recoveredExecution, run.durationSeconds, tracker.current.distanceMeters)
        : 0,
      workoutStepRemaining: recoveredStep
        ? workoutStepRemaining(recoveredStep, recoveredExecution, run.durationSeconds, tracker.current.distanceMeters)
        : 0,
      workoutStepsComplete: recoveredExecution.completed,
      degradedSignal: false,
      autoPaused: false,
      position: tracker.current.coordinates.at(-1) ?? null,
      completionSuggested: false,
      offRoute: false,
      distanceToRouteMeters: 0,
      directionToRouteDegrees: null,
    });
    setStatus('active');
    setRecoverable(null);
    startWatching();
  }, [recoverable, startWatching, status]);

  const discardRecovered = useCallback(() => {
    if (!canTransition(status, 'discardRecovered')) {
      // Unreachable today — legal from every state — kept for the same
      // reason as `start`'s check above.
      return;
    }
    setRecoverable(null);
    void clearInProgressRun();
  }, [status]);

  const dismissCompletionSuggestion = useCallback(() => {
    tracker.current = { ...tracker.current, nearStartStreak: 0, completionSuggested: false };
    publish();
  }, [publish]);

  /**
   * Route the runner back to the planned route (#64).
   *
   * Explicit only: nothing calls this automatically. It asks for a one-way
   * route from the runner's current position to the planned route's end (a
   * loop's start, or a one-way's finish) and adopts it as the new plan. The
   * tracker — and so the recorded track, distance and elapsed time — is left
   * untouched; only the reference route and the off-route progress reset.
   */
  const reroute = useCallback(async () => {
    const currentRoute = route;
    const position =
      tracker.current.lastSample?.coordinate ?? tracker.current.coordinates.at(-1) ?? null;
    if (!currentRoute || !position || (status !== 'active' && status !== 'paused')) {
      return;
    }

    setRerouting(true);
    setRerouteError(null);
    try {
      const target = currentRoute.finish ?? currentRoute.geometry[0];
      const remainingKm = Math.max(
        1,
        targetKm > 0 ? targetKm - tracker.current.distanceMeters / 1000 : 1,
      );
      const candidates = await findRoutesBetween({
        origin: position,
        finish: target,
        targetKm: remainingKm,
      });
      const next = candidates[0];
      if (!next) {
        setRerouteError('No way back to your route was found.');
        return;
      }

      planned.current = preparePlannedRoute(next);
      // A new reference route means the old progress/off-route readings no
      // longer describe anything. The track and distance are untouched.
      tracker.current = {
        ...tracker.current,
        progressMeters: 0,
        segmentIndex: 0,
        offRoute: false,
        offRouteStreak: 0,
        distanceToRouteMeters: 0,
        directionToRouteDegrees: null,
        nearStartStreak: 0,
        completionSuggested: false,
      };
      setRoute(next);
      publish();
    } catch (error) {
      setRerouteError(
        error instanceof RoutingError ? error.message : 'Could not find a way back to your route.',
      );
    } finally {
      setRerouting(false);
    }
  }, [publish, route, status, targetKm]);

  const value = useMemo<RunContextValue>(
    () => ({
      ...snapshot,
      status,
      route,
      targetKm,
      targetDurationSeconds,
      plannedWorkoutId,
      workoutType,
      workoutSteps,
      rerouting,
      rerouteError,
      completedRun,
      start,
      pause,
      resume,
      finish,
      saveCompleted,
      discardCompleted,
      dismissCompletionSuggestion,
      reroute,
      recoverable,
      resumeRecovered,
      discardRecovered,
    }),
    [
      snapshot,
      status,
      route,
      targetKm,
      targetDurationSeconds,
      plannedWorkoutId,
      workoutType,
      workoutSteps,
      rerouting,
      rerouteError,
      completedRun,
      start,
      pause,
      resume,
      finish,
      saveCompleted,
      discardCompleted,
      dismissCompletionSuggestion,
      reroute,
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
