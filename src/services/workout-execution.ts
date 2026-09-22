import { WORKOUT_LABELS, type PlannedWorkout, type WorkoutStep, type WorkoutStepKind } from './training';

/**
 * Running a structured workout (#148 phase running).
 *
 * A workout is a sequence of steps — a warm up, the work, a cool down — each
 * with a target of its own. Progress through them is derived from the two
 * monotonic totals the run already has (active seconds and distance), so it is
 * pause-safe (active seconds exclude pauses) and needs no timer of its own.
 *
 * The state records when the current step began; a step completes against its
 * *own* elapsed time or distance, never the run total, which is what makes a
 * warm up followed by a longer work interval behave correctly.
 */
export type WorkoutExecutionState = {
  stepIndex: number;
  /** Active seconds when the current step began. */
  stepStartSeconds: number;
  /** Distance in meters when the current step began. */
  stepStartMeters: number;
  completed: boolean;
};

export function createWorkoutExecutionState(): WorkoutExecutionState {
  return { stepIndex: 0, stepStartSeconds: 0, stepStartMeters: 0, completed: false };
}

function stepElapsed(
  step: WorkoutStep,
  state: WorkoutExecutionState,
  activeSeconds: number,
  distanceMeters: number,
): number {
  return step.target.kind === 'duration'
    ? activeSeconds - state.stepStartSeconds
    : distanceMeters - state.stepStartMeters;
}

function stepTarget(step: WorkoutStep): number {
  return step.target.kind === 'duration' ? step.target.seconds : step.target.meters;
}

/**
 * Fold the current totals into the execution state. Returns the same reference
 * when nothing changed, so callers can skip a re-render. Several steps can
 * complete in one tick (a long GPS gap, or a short step passed between
 * publishes); each new step begins from the totals at that moment.
 */
export function advanceWorkoutExecution(
  steps: readonly WorkoutStep[],
  state: WorkoutExecutionState,
  activeSeconds: number,
  distanceMeters: number,
): WorkoutExecutionState {
  if (state.completed || steps.length === 0) {
    return state;
  }

  let stepIndex = state.stepIndex;
  let stepStartSeconds = state.stepStartSeconds;
  let stepStartMeters = state.stepStartMeters;
  let advanced = false;

  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    const elapsed = step.target.kind === 'duration'
      ? activeSeconds - stepStartSeconds
      : distanceMeters - stepStartMeters;
    if (elapsed < stepTarget(step)) {
      break;
    }
    advanced = true;
    stepIndex += 1;
    stepStartSeconds = activeSeconds;
    stepStartMeters = distanceMeters;
  }

  if (!advanced) {
    return state;
  }
  if (stepIndex >= steps.length) {
    return {
      stepIndex: steps.length - 1,
      stepStartSeconds,
      stepStartMeters,
      completed: true,
    };
  }
  return { stepIndex, stepStartSeconds, stepStartMeters, completed: false };
}

/** The step being run, or null when there are none. */
export function currentWorkoutStep(
  steps: readonly WorkoutStep[],
  state: WorkoutExecutionState,
): WorkoutStep | null {
  if (steps.length === 0) {
    return null;
  }
  return steps[Math.min(state.stepIndex, steps.length - 1)] ?? null;
}

/** How far through the current step the runner is, 0–1. */
export function workoutStepProgress(
  step: WorkoutStep,
  state: WorkoutExecutionState,
  activeSeconds: number,
  distanceMeters: number,
): number {
  const target = stepTarget(step);
  if (!(target > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0, stepElapsed(step, state, activeSeconds, distanceMeters) / target));
}

/** Remaining seconds or meters in the current step, floored at zero. */
export function workoutStepRemaining(
  step: WorkoutStep,
  state: WorkoutExecutionState,
  activeSeconds: number,
  distanceMeters: number,
): number {
  return Math.max(0, stepTarget(step) - stepElapsed(step, state, activeSeconds, distanceMeters));
}

export const WORKOUT_STEP_LABELS: Record<WorkoutStepKind, string> = {
  warmup: 'Warm up',
  work: 'Work',
  recovery: 'Recover',
  cooldown: 'Cool down',
};

/** Warm up and cool down each take this share of a structured workout. */
const WARMUP_FRACTION = 0.2;
const COOLDOWN_FRACTION = 0.2;

/**
 * The steps a workout is run as.
 *
 * A workout that carries its own steps uses them verbatim. Otherwise the
 * structure is derived deterministically from its type: tempo, intervals and
 * fartlek get a warm up, the work, and a cool down; every other kind is a
 * single work step. Distances are the workout's own target, split by the
 * documented fractions — no rep counts or paces are invented.
 */
export function stepsForWorkout(workout: PlannedWorkout, durationSeconds = 0): WorkoutStep[] {
  if (workout.steps && workout.steps.length > 0) {
    return workout.steps;
  }

  const byDuration = durationSeconds > 0;
  const totalDistance = Math.round(workout.targetKm * 1000);

  const step = (kind: WorkoutStepKind, label: string, fraction: number): WorkoutStep => ({
    id: `${workout.id}-${kind}`,
    kind,
    label,
    target: byDuration
      ? { kind: 'duration', seconds: Math.max(1, Math.round(durationSeconds * fraction)) }
      : { kind: 'distance', meters: Math.max(1, Math.round(totalDistance * fraction)) },
  });

  const structured =
    workout.type === 'tempo' || workout.type === 'intervals' || workout.type === 'fartlek';

  if (!structured) {
    return [step('work', WORKOUT_LABELS[workout.type], 1)];
  }

  const workFraction = 1 - WARMUP_FRACTION - COOLDOWN_FRACTION;
  return [
    step('warmup', 'Warm up', WARMUP_FRACTION),
    step('work', WORKOUT_LABELS[workout.type], workFraction),
    step('cooldown', 'Cool down', COOLDOWN_FRACTION),
  ];
}
