import type { WorkoutStep, WorkoutStepKind, WorkoutType } from './training';

/**
 * Building a run before it starts (#151).
 *
 * The launcher offers a small vocabulary — free, distance, time, intervals,
 * fartlek, tempo — and every structured kind compiles to the same flat
 * `WorkoutStep[]` the execution engine already runs. Repeats are expanded here,
 * not in the engine: `6 × (400 m work + 90 sec recovery)` becomes twelve tagged
 * steps. That keeps one execution path for plan and custom workouts, and lets
 * the preview and the in-run UI read the grouping back.
 *
 * Pure and synchronous: no React, no storage, no formatting. Values are metric
 * (kilometres, metres, seconds) so the module has nothing to do with the
 * runner's unit setting.
 */

export type RunKind = 'free' | 'distance' | 'time' | 'intervals' | 'fartlek' | 'tempo';

export const RUN_KINDS: readonly RunKind[] = [
  'free',
  'distance',
  'time',
  'intervals',
  'fartlek',
  'tempo',
] as const;

export const RUN_KIND_LABELS: Record<RunKind, string> = {
  free: 'Free run',
  distance: 'Distance',
  time: 'Time',
  intervals: 'Intervals',
  fartlek: 'Fartlek',
  tempo: 'Tempo',
};

/** The label on the Start button for a kind: "Start run", "Start Intervals", … */
export function startLabel(kind: RunKind): string {
  switch (kind) {
    case 'free':
      return 'Start run';
    case 'distance':
      return 'Start distance run';
    case 'time':
      return 'Start time run';
    case 'intervals':
      return 'Start Intervals';
    case 'fartlek':
      return 'Start Fartlek';
    case 'tempo':
      return 'Start Tempo';
  }
}

/** The planned-workout type a kind records itself as, or null for a plain run. */
export function runKindWorkoutType(kind: RunKind): WorkoutType | null {
  switch (kind) {
    case 'intervals':
      return 'intervals';
    case 'fartlek':
      return 'fartlek';
    case 'tempo':
      return 'tempo';
    default:
      return null;
  }
}

export type StepTargetSpec =
  | { kind: 'duration'; minutes: number }
  | { kind: 'distance'; km: number };

export type StructuredSpec = {
  /** 0 means no warm-up. */
  warmupMinutes: number;
  reps: number;
  work: StepTargetSpec;
  /** Used only when reps > 1. */
  recovery: StepTargetSpec;
  /** 0 means no cool-down. */
  cooldownMinutes: number;
};

export const DEFAULT_INTERVALS: StructuredSpec = {
  warmupMinutes: 10,
  reps: 6,
  work: { kind: 'distance', km: 0.4 },
  recovery: { kind: 'duration', minutes: 1.5 },
  cooldownMinutes: 10,
};

export const DEFAULT_FARTLEK: StructuredSpec = {
  warmupMinutes: 10,
  reps: 6,
  work: { kind: 'duration', minutes: 1 },
  recovery: { kind: 'duration', minutes: 2 },
  cooldownMinutes: 10,
};

export const DEFAULT_TEMPO: StructuredSpec = {
  warmupMinutes: 10,
  reps: 1,
  work: { kind: 'duration', minutes: 20 },
  recovery: { kind: 'duration', minutes: 1 },
  cooldownMinutes: 10,
};

// -- Presets: shortcuts, never restrictions -----------------------------------

export const REP_PRESETS = [4, 5, 6, 8, 10] as const;
export const WARMUP_MINUTE_PRESETS = [5, 10, 15] as const;
export const WORK_DISTANCE_KM_PRESETS = [0.2, 0.4, 0.8, 1, 1.6] as const;
export const WORK_TIME_MINUTE_PRESETS = [1, 2, 3, 5] as const;
export const RECOVERY_SECOND_PRESETS = [60, 90, 120, 180] as const;
export const RECOVERY_DISTANCE_M_PRESETS = [200, 400, 800] as const;

/** Sensible bounds, matching the execution engine's ability to run a step. */
export const LIMITS = {
  reps: { min: 1, max: 30, step: 1 },
  warmupMinutes: { min: 0, max: 30, step: 5 },
  cooldownMinutes: { min: 0, max: 30, step: 5 },
  workDistanceKm: { min: 0.1, max: 5, step: 0.1 },
  workMinutes: { min: 0.5, max: 30, step: 0.5 },
  recoverySeconds: { min: 15, max: 600, step: 15 },
  recoveryMeters: { min: 50, max: 2000, step: 50 },
} as const;

function toTarget(spec: StepTargetSpec): WorkoutStep['target'] {
  return spec.kind === 'duration'
    ? { kind: 'duration', seconds: Math.max(1, Math.round(spec.minutes * 60)) }
    : { kind: 'distance', meters: Math.max(1, Math.round(spec.km * 1000)) };
}

const REPEAT_GROUP = 'main';

function step(
  id: string,
  kind: WorkoutStepKind,
  label: string,
  target: WorkoutStep['target'],
  grouping?: { repIndex: number; repCount: number },
): WorkoutStep {
  return {
    id,
    kind,
    label,
    target,
    ...(grouping
      ? { repeatGroupId: REPEAT_GROUP, repIndex: grouping.repIndex, repCount: grouping.repCount }
      : {}),
  };
}

/** The work/recovery labels for each structured kind, in runner language. */
function labelsFor(kind: 'intervals' | 'fartlek' | 'tempo'): { work: string; recovery: string } {
  switch (kind) {
    case 'fartlek':
      return { work: 'Fast', recovery: 'Easy' };
    case 'tempo':
      return { work: 'Tempo', recovery: 'Recovery' };
    case 'intervals':
    default:
      return { work: 'Run', recovery: 'Recovery' };
  }
}

/**
 * Compile a structured spec into the flat step list the engine runs.
 *
 * Order: warm-up (if any), the repeat block (each rep = work + recovery), then
 * cool-down (if any). Tempo is a single-rep block with no recovery, so it is
 * warm-up → work → cool-down.
 */
export function compileStructured(
  kind: 'intervals' | 'fartlek' | 'tempo',
  spec: StructuredSpec,
): WorkoutStep[] {
  const labels = labelsFor(kind);
  const reps = Math.max(1, Math.round(spec.reps));
  const steps: WorkoutStep[] = [];

  if (spec.warmupMinutes > 0) {
    steps.push(step(`${kind}-warmup`, 'warmup', 'Warm up', toTarget({ kind: 'duration', minutes: spec.warmupMinutes })));
  }

  const repeated = reps > 1;
  for (let rep = 1; rep <= reps; rep += 1) {
    steps.push(
      step(`${kind}-work-${rep}`, 'work', labels.work, toTarget(spec.work), repeated ? { repIndex: rep, repCount: reps } : undefined),
    );
    if (repeated) {
      steps.push(
        step(`${kind}-recovery-${rep}`, 'recovery', labels.recovery, toTarget(spec.recovery), { repIndex: rep, repCount: reps }),
      );
    }
  }

  if (spec.cooldownMinutes > 0) {
    steps.push(step(`${kind}-cooldown`, 'cooldown', 'Cool down', toTarget({ kind: 'duration', minutes: spec.cooldownMinutes })));
  }

  return steps;
}

export type WorkoutSummary = {
  /** Reps in the repeated block, when there is one. */
  reps: number | null;
  /** Total distance of the work steps, when they are distance-based. */
  fastDistanceMeters: number | null;
  /** Total distance across every distance-based step. */
  totalDistanceMeters: number | null;
  /** Total duration when every step is time-based; null when any is distance-based. */
  totalDurationSeconds: number | null;
};

/**
 * What can be said truthfully about a step list. A total duration is only
 * reported when every step is time-based; a total distance only from the
 * distance steps that exist. Nothing is inferred from pace.
 */
export function summarizeSteps(steps: readonly WorkoutStep[]): WorkoutSummary {
  if (steps.length === 0) {
    return { reps: null, fastDistanceMeters: null, totalDistanceMeters: null, totalDurationSeconds: null };
  }

  let allDuration = true;
  let totalDurationSeconds = 0;
  let totalDistanceMeters = 0;
  let fastDistanceMeters = 0;
  let hasDistance = false;
  let hasFastDistance = false;
  let reps: number | null = null;

  for (const entry of steps) {
    if (entry.target.kind === 'duration') {
      totalDurationSeconds += entry.target.seconds;
    } else {
      allDuration = false;
      hasDistance = true;
      totalDistanceMeters += entry.target.meters;
      if (entry.kind === 'work') {
        hasFastDistance = true;
        fastDistanceMeters += entry.target.meters;
      }
    }
    if (reps === null && entry.repeatGroupId && entry.repCount) {
      reps = entry.repCount;
    }
  }

  return {
    reps,
    fastDistanceMeters: hasFastDistance ? fastDistanceMeters : null,
    totalDistanceMeters: hasDistance ? totalDistanceMeters : null,
    totalDurationSeconds: allDuration ? totalDurationSeconds : null,
  };
}

/** The work target's kind for a structured kind, for the builder's default UI. */
export function defaultSpec(kind: 'intervals' | 'fartlek' | 'tempo'): StructuredSpec {
  switch (kind) {
    case 'fartlek':
      return { ...DEFAULT_FARTLEK };
    case 'tempo':
      return { ...DEFAULT_TEMPO };
    case 'intervals':
    default:
      return { ...DEFAULT_INTERVALS };
  }
}
