/**
 * The training model (#67).
 *
 * A plan, the workouts it schedules, and what actually happened to them. This
 * is the foundation the rest of the training system builds on, so it is a data
 * module: no UI, no scheduling rules, no recommendations.
 *
 * Two deliberate decisions:
 *
 * - **Workout types carry no medical or performance claims.** They describe the
 *   kind of running, not a physiological effect. "Tempo" is "a sustained,
 *   comfortably hard effort", not "improves your lactate threshold".
 * - **Nothing is inferred.** A workout is `completed` only because something
 *   marked it so, and `runId` is the recorded run that did — never a guess
 *   derived from comparing distance and time.
 */

import { Directory, File, Paths } from 'expo-file-system';

const TRAINING_FILE = 'training.json';

export type WorkoutType = 'easy' | 'recovery' | 'long' | 'tempo' | 'intervals' | 'short';

export const WORKOUT_TYPES: readonly WorkoutType[] = [
  'easy',
  'recovery',
  'long',
  'tempo',
  'intervals',
  'short',
] as const;

/**
 * Plain-language descriptions of what each kind of run *is*. Deliberately no
 * claims about what it does for the runner.
 */
export const WORKOUT_DESCRIPTIONS: Record<WorkoutType, string> = {
  easy: 'A comfortable run at a pace you could hold a conversation at.',
  recovery: 'A short, gentle run to move without adding strain.',
  long: 'The longest run of the week, at an easy pace.',
  tempo: 'A sustained, comfortably hard effort in the middle of the run.',
  intervals: 'Short faster efforts separated by easier running.',
  short: 'A brief run, shorter than your usual.',
};

export type TrainingLevel = 'new' | 'occasional' | 'regular' | 'experienced';

export const TRAINING_LEVELS: readonly TrainingLevel[] = [
  'new',
  'occasional',
  'regular',
  'experienced',
] as const;

export type TrainingGoalKind = 'fitness' | 'distance' | 'race';

export type TrainingGoal = {
  kind: TrainingGoalKind;
  /** Target distance in kilometres, for a distance or race goal. */
  targetKm: number | null;
  /** Local calendar day (`yyyy-mm-dd`) for a race goal, else null. */
  raceDate: string | null;
};

/**
 * A plan is a *shape*, not a schedule: how often the runner wants to run and on
 * which days. Turning that into dated workouts is the schedule's job.
 */
export type TrainingPlan = {
  id: string;
  /** Epoch milliseconds. */
  createdAt: number;
  goal: TrainingGoal;
  /** Runs per week, 1–14. */
  runsPerWeek: number;
  /** Preferred weekdays, 0 = Sunday … 6 = Saturday. */
  preferredDays: number[];
  level: TrainingLevel;
};

export type WorkoutStatus = 'planned' | 'completed' | 'skipped' | 'modified';

export const WORKOUT_STATUSES: readonly WorkoutStatus[] = [
  'planned',
  'completed',
  'skipped',
  'modified',
] as const;

export type PlannedWorkout = {
  id: string;
  /** Local calendar day, `yyyy-mm-dd`. Not a timestamp: a workout belongs to a day. */
  date: string;
  type: WorkoutType;
  /** Target distance in kilometres. */
  targetKm: number;
  status: WorkoutStatus;
  /** The recorded run that completed this workout, when there is one. */
  runId: string | null;
  note: string | null;
};

export type TrainingState = {
  plan: TrainingPlan | null;
  workouts: PlannedWorkout[];
};

export const EMPTY_TRAINING: TrainingState = { plan: null, workouts: [] };

// -- Predicates -------------------------------------------------------------

export function isWorkoutType(value: unknown): value is WorkoutType {
  return typeof value === 'string' && (WORKOUT_TYPES as readonly string[]).includes(value);
}

export function isWorkoutStatus(value: unknown): value is WorkoutStatus {
  return typeof value === 'string' && (WORKOUT_STATUSES as readonly string[]).includes(value);
}

export function isTrainingLevel(value: unknown): value is TrainingLevel {
  return typeof value === 'string' && (TRAINING_LEVELS as readonly string[]).includes(value);
}

/** `yyyy-mm-dd` for a local calendar day. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// -- Construction -----------------------------------------------------------

let idCounter = 0;

/** Ids are only required to be unique within a device's own data. */
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createWorkout(input: {
  date: string;
  type: WorkoutType;
  targetKm: number;
  id?: string;
}): PlannedWorkout {
  return {
    id: input.id ?? nextId('workout'),
    date: input.date,
    type: input.type,
    targetKm: input.targetKm,
    status: 'planned',
    runId: null,
    note: null,
  };
}

export function createPlan(input: {
  goal: TrainingGoal;
  runsPerWeek: number;
  preferredDays: number[];
  level: TrainingLevel;
  id?: string;
}): TrainingPlan {
  return {
    id: input.id ?? nextId('plan'),
    createdAt: Date.now(),
    goal: input.goal,
    runsPerWeek: input.runsPerWeek,
    preferredDays: normalizePreferredDays(input.preferredDays),
    level: input.level,
  };
}

/** Valid weekdays only, unique, ascending. Anything else is discarded. */
export function normalizePreferredDays(days: readonly number[]): number[] {
  if (!Array.isArray(days)) {
    return [];
  }
  const valid = days.filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6,
  );
  return [...new Set(valid)].sort((a, b) => a - b);
}

// -- Queries ----------------------------------------------------------------

export function workoutsOnDate(state: TrainingState, date: string): PlannedWorkout[] {
  return state.workouts.filter((workout) => workout.date === date);
}

/** Workouts on or after `fromDate`, earliest first. */
export function workoutsFrom(state: TrainingState, fromDate: string): PlannedWorkout[] {
  return state.workouts
    .filter((workout) => workout.date >= fromDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type PlanProgress = {
  planned: number;
  completed: number;
  skipped: number;
  /** Kilometres planned across the window. */
  plannedKm: number;
  /** Kilometres actually completed across the window. */
  completedKm: number;
};

/** Counts for a window, derived only from what the workouts actually say. */
export function summarizeProgress(
  state: TrainingState,
  fromDate: string,
  toDate: string,
): PlanProgress {
  const inWindow = state.workouts.filter(
    (workout) => workout.date >= fromDate && workout.date <= toDate,
  );

  return {
    planned: inWindow.length,
    completed: inWindow.filter((workout) => workout.status === 'completed').length,
    skipped: inWindow.filter((workout) => workout.status === 'skipped').length,
    plannedKm: inWindow.reduce((total, workout) => total + workout.targetKm, 0),
    completedKm: inWindow
      .filter((workout) => workout.status === 'completed')
      .reduce((total, workout) => total + workout.targetKm, 0),
  };
}

// -- Updates ----------------------------------------------------------------

export function addWorkouts(
  state: TrainingState,
  workouts: readonly PlannedWorkout[],
): TrainingState {
  const known = new Set(state.workouts.map((workout) => workout.id));
  const added = workouts.filter((workout) => !known.has(workout.id));
  return { ...state, workouts: [...state.workouts, ...added] };
}

export function removeWorkout(state: TrainingState, id: string): TrainingState {
  return { ...state, workouts: state.workouts.filter((workout) => workout.id !== id) };
}

/**
 * Move a workout's status. Completing it may link the recorded run that did it;
 * any other status clears that link, because the workout is no longer fulfilled.
 */
export function setWorkoutStatus(
  state: TrainingState,
  id: string,
  status: WorkoutStatus,
  runId: string | null = null,
): TrainingState {
  return {
    ...state,
    workouts: state.workouts.map((workout) =>
      workout.id === id
        ? { ...workout, status, runId: status === 'completed' ? runId : null }
        : workout,
    ),
  };
}

// -- Persistence ------------------------------------------------------------

function trainingFile(): File {
  return new File(Paths.document, TRAINING_FILE);
}

function parseGoal(value: unknown): TrainingGoal {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<TrainingGoal>;
  const kind: TrainingGoalKind =
    raw.kind === 'distance' || raw.kind === 'race' ? raw.kind : 'fitness';

  return {
    kind,
    targetKm:
      kind !== 'fitness' && Number.isFinite(raw.targetKm) && (raw.targetKm as number) > 0
        ? (raw.targetKm as number)
        : null,
    raceDate: kind === 'race' && isDateKey(raw.raceDate) ? raw.raceDate : null,
  };
}

function parsePlan(value: unknown): TrainingPlan | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Partial<TrainingPlan>;
  if (typeof raw.id !== 'string') {
    return null;
  }
  const runsPerWeek = Number.isFinite(raw.runsPerWeek)
    ? Math.min(14, Math.max(1, Math.round(raw.runsPerWeek as number)))
    : 3;

  return {
    id: raw.id,
    createdAt: Number.isFinite(raw.createdAt) ? (raw.createdAt as number) : 0,
    goal: parseGoal(raw.goal),
    runsPerWeek,
    preferredDays: normalizePreferredDays(raw.preferredDays ?? []),
    level: isTrainingLevel(raw.level) ? raw.level : 'occasional',
  };
}

/**
 * A workout that cannot be read is dropped rather than repaired into something
 * the runner never planned. An unknown status degrades to `planned`, which is
 * the safe reading: it is still to be done.
 */
function parseWorkout(value: unknown): PlannedWorkout | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Partial<PlannedWorkout>;
  if (typeof raw.id !== 'string' || !isDateKey(raw.date) || !isWorkoutType(raw.type)) {
    return null;
  }
  if (!Number.isFinite(raw.targetKm) || (raw.targetKm as number) <= 0) {
    return null;
  }

  return {
    id: raw.id,
    date: raw.date,
    type: raw.type,
    targetKm: raw.targetKm as number,
    status: isWorkoutStatus(raw.status) ? raw.status : 'planned',
    runId: typeof raw.runId === 'string' ? raw.runId : null,
    note: typeof raw.note === 'string' ? raw.note : null,
  };
}

function parseTraining(value: unknown): TrainingState {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_TRAINING;
  }
  const raw = value as Partial<TrainingState>;
  const workouts = Array.isArray(raw.workouts)
    ? raw.workouts
        .map(parseWorkout)
        .filter((workout): workout is PlannedWorkout => workout !== null)
    : [];

  return { plan: parsePlan(raw.plan), workouts };
}

export async function loadTraining(): Promise<TrainingState> {
  const file = trainingFile();
  if (!file.exists) {
    return EMPTY_TRAINING;
  }
  try {
    return parseTraining(JSON.parse(await file.text()));
  } catch {
    // A damaged file must not take the training screens down with it.
    return EMPTY_TRAINING;
  }
}

export async function saveTraining(state: TrainingState): Promise<void> {
  const directory = new Directory(Paths.document);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  const file = trainingFile();
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(state));
}
