import type { WorkoutStep, WorkoutStepKind, WorkoutType } from './training';
import type { SavedRun } from './run-session';

/**
 * Building a run before it starts (#151).
 *
 * The launcher offers a small vocabulary — free, distance, time, intervals,
 * fartlek, tempo — and every structured kind compiles to the same flat
 * `WorkoutStep[]` the execution engine already runs. Repeats are expanded here,
 * not in the engine: a set of `6 × (400 m work + 90 sec recovery)` becomes
 * twelve tagged steps. A workout can hold several sets (4 × 400 m then 3 ×
 * 800 m), each tagged with its own group so the preview and the in-run UI can
 * say "rep 3 of 6" for the set being run.
 *
 * Pure and synchronous: no React, no storage, no formatting. Values are metric
 * (kilometres, metres, seconds) so the module has nothing to do with the
 * runner's unit setting.
 */

export type RunKind = 'free' | 'distance' | 'time' | 'intervals' | 'fartlek' | 'tempo';
export type StructuredKind = 'intervals' | 'fartlek' | 'tempo';

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

/** One repeated block: `reps × (work + recovery)`. */
export type SetSpec = {
  reps: number;
  work: StepTargetSpec;
  recovery: StepTargetSpec;
};

/** The authoring model: a warm-up, one or more sets, and a cool-down. */
export type WorkoutPlan = {
  /** 0 means no warm-up. */
  warmupMinutes: number;
  sets: SetSpec[];
  /** 0 means no cool-down. */
  cooldownMinutes: number;
};

/**
 * A single-set spec, kept for the plan generator's simple case and for callers
 * that predate multiple sets. Compiles to a one-set plan.
 */
export type StructuredSpec = {
  warmupMinutes: number;
  reps: number;
  work: StepTargetSpec;
  recovery: StepTargetSpec;
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

function specFromTarget(target: WorkoutStep['target']): StepTargetSpec {
  return target.kind === 'duration'
    ? { kind: 'duration', minutes: target.seconds / 60 }
    : { kind: 'distance', km: target.meters / 1000 };
}

function step(
  id: string,
  kind: WorkoutStepKind,
  label: string,
  target: WorkoutStep['target'],
  grouping?: { repeatGroupId: string; repIndex: number; repCount: number },
): WorkoutStep {
  return { id, kind, label, target, ...(grouping ?? {}) };
}

/** The work/recovery labels for each structured kind, in runner language. */
function labelsFor(kind: StructuredKind): { work: string; recovery: string } {
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
 * Compile an authoring plan into the flat step list the engine runs.
 *
 * Order: warm-up (if any), each set (each rep = work + recovery), then
 * cool-down (if any). A set is tagged only when there is more than one set or
 * more than one rep, so a plain tempo stays a single untagged work step.
 */
export function compilePlan(kind: StructuredKind, plan: WorkoutPlan): WorkoutStep[] {
  const labels = labelsFor(kind);
  const steps: WorkoutStep[] = [];

  if (plan.warmupMinutes > 0) {
    steps.push(
      step(`${kind}-warmup`, 'warmup', 'Warm up', toTarget({ kind: 'duration', minutes: plan.warmupMinutes })),
    );
  }

  const tag = plan.sets.length > 1 || plan.sets.some((set) => set.reps > 1);
  plan.sets.forEach((set, setIndex) => {
    const reps = Math.max(1, Math.round(set.reps));
    const repeated = reps > 1;
    const group = `set-${setIndex}`;
    for (let rep = 1; rep <= reps; rep += 1) {
      steps.push(
        step(
          `${kind}-s${setIndex}-work-${rep}`,
          'work',
          labels.work,
          toTarget(set.work),
          tag ? { repeatGroupId: group, repIndex: rep, repCount: reps } : undefined,
        ),
      );
      if (repeated) {
        steps.push(
          step(
            `${kind}-s${setIndex}-recovery-${rep}`,
            'recovery',
            labels.recovery,
            toTarget(set.recovery),
            tag ? { repeatGroupId: group, repIndex: rep, repCount: reps } : undefined,
          ),
        );
      }
    }
  });

  if (plan.cooldownMinutes > 0) {
    steps.push(
      step(`${kind}-cooldown`, 'cooldown', 'Cool down', toTarget({ kind: 'duration', minutes: plan.cooldownMinutes })),
    );
  }

  return steps;
}

/** A one-set plan from a single-set spec. */
export function planFromSpec(spec: StructuredSpec): WorkoutPlan {
  return {
    warmupMinutes: spec.warmupMinutes,
    sets: [{ reps: spec.reps, work: spec.work, recovery: spec.recovery }],
    cooldownMinutes: spec.cooldownMinutes,
  };
}

/** Compile a single-set spec. Kept for the plan generator and older callers. */
export function compileStructured(kind: StructuredKind, spec: StructuredSpec): WorkoutStep[] {
  return compilePlan(kind, planFromSpec(spec));
}

/**
 * Reconstruct an authoring plan from a flat step list, so a recent workout can
 * be repeated. Returns null when the steps are not a recognisable plan.
 */
export function planFromSteps(steps: readonly WorkoutStep[]): WorkoutPlan | null {
  if (steps.length === 0) {
    return null;
  }

  let body = steps;
  let warmupMinutes = 0;
  let cooldownMinutes = 0;

  const first = body[0];
  if (first.kind === 'warmup' && first.target.kind === 'duration') {
    warmupMinutes = first.target.seconds / 60;
    body = body.slice(1);
  }
  const last = body[body.length - 1];
  if (last && last.kind === 'cooldown' && last.target.kind === 'duration') {
    cooldownMinutes = last.target.seconds / 60;
    body = body.slice(0, -1);
  }

  const sets: SetSpec[] = [];
  let currentGroup: string | null | undefined;
  let work: StepTargetSpec | null = null;
  let recovery: StepTargetSpec | null = null;
  let reps = 1;

  const flush = () => {
    if (work) {
      sets.push({ reps, work, recovery: recovery ?? { kind: 'duration', minutes: 1 } });
    }
  };

  for (const entry of body) {
    const group = entry.repeatGroupId ?? null;
    if (group !== currentGroup) {
      flush();
      currentGroup = group;
      work = null;
      recovery = null;
      reps = 1;
    }
    if (entry.kind === 'work') {
      work = specFromTarget(entry.target);
      reps = entry.repCount ?? 1;
    } else if (entry.kind === 'recovery') {
      recovery = specFromTarget(entry.target);
    }
  }
  flush();

  if (sets.length === 0) {
    return null;
  }
  return { warmupMinutes, sets, cooldownMinutes };
}

export type WorkoutSummary = {
  /** Total reps across every repeated set, when there is one. */
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
  const groups = new Map<string, number>();

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
    if (entry.repeatGroupId && entry.repCount) {
      groups.set(entry.repeatGroupId, entry.repCount);
    }
  }

  const totalReps = groups.size > 0 ? [...groups.values()].reduce((sum, value) => sum + value, 0) : null;

  return {
    reps: totalReps,
    fastDistanceMeters: hasFastDistance ? fastDistanceMeters : null,
    totalDistanceMeters: hasDistance ? totalDistanceMeters : null,
    totalDurationSeconds: allDuration ? totalDurationSeconds : null,
  };
}

/** The default authoring plan for a structured kind. */
export function defaultPlan(kind: StructuredKind): WorkoutPlan {
  switch (kind) {
    case 'fartlek':
      return planFromSpec(DEFAULT_FARTLEK);
    case 'tempo':
      return planFromSpec(DEFAULT_TEMPO);
    case 'intervals':
    default:
      return planFromSpec(DEFAULT_INTERVALS);
  }
}

/** Kept for callers that want a single-set default spec. */
export function defaultSpec(kind: StructuredKind): StructuredSpec {
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

/** A stable identity for a structured workout, for de-duplicating recents. */
export function workoutSignature(kind: StructuredKind, plan: WorkoutPlan): string {
  return JSON.stringify([kind, plan]);
}

export type RecentWorkout = {
  /** Stable identity of the structure, for keys and de-duplication. */
  key: string;
  kind: StructuredKind;
  plan: WorkoutPlan;
  /** When it was last run. */
  startedAt: number;
};

/**
 * The most recent distinct structured workouts, newest first, for quick repeat
 * (#151). Derived from saved runs' own steps; a run with no steps is skipped.
 */
export function recentWorkoutTemplates(runs: readonly SavedRun[], limit = 3): RecentWorkout[] {
  const seen = new Set<string>();
  const result: RecentWorkout[] = [];

  for (const run of runs) {
    const kind = run.workoutType;
    if (!run.steps || (kind !== 'intervals' && kind !== 'fartlek' && kind !== 'tempo')) {
      continue;
    }
    const plan = planFromSteps(run.steps);
    if (!plan) {
      continue;
    }
    const key = workoutSignature(kind, plan);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ key, kind, plan, startedAt: run.startedAt });
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}
