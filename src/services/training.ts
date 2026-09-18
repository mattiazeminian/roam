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

export type WorkoutType = 'easy' | 'recovery' | 'long' | 'tempo' | 'intervals' | 'fartlek' | 'short';

export const WORKOUT_TYPES: readonly WorkoutType[] = [
  'easy',
  'recovery',
  'long',
  'tempo',
  'intervals',
  'fartlek',
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
  fartlek: 'Unstructured faster efforts inside an easy run, as you feel like them.',
  short: 'A brief run, shorter than your usual.',
};

/** Short labels for the interface: "Easy run", "Long run", … */
export const WORKOUT_LABELS: Record<WorkoutType, string> = {
  easy: 'Easy run',
  recovery: 'Recovery run',
  long: 'Long run',
  tempo: 'Tempo run',
  intervals: 'Intervals',
  fartlek: 'Fartlek',
  short: 'Short run',
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

export const DEFAULT_RUNS_PER_WEEK = 3;

/**
 * Tuesday, Thursday, Saturday. The shape the week rules expect when a runner
 * does not choose: three sessions spread out, with the long run on the weekend.
 */
export const DEFAULT_PREFERRED_DAYS: readonly number[] = [2, 4, 6];

/** What a plan is created from. Every field is used; none is collected for show. */
export type PlanInput = {
  goalKind: TrainingGoalKind;
  /** Used only for `distance` and `race` goals. */
  targetKm: number | null;
  /** Used only for a `race` goal. */
  raceDate: string | null;
  runsPerWeek: number;
  preferredDays: readonly number[];
  level: TrainingLevel;
};

function positiveOrNull(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Build a plan from the runner's choices (#69).
 *
 * Normalising rather than trusting: runs per week is clamped, weekdays are
 * validated, and a target or race date that does not belong to the chosen goal
 * is dropped instead of being stored unused. An unusable level falls back to
 * `occasional`, and no chosen days fall back to the default three.
 */
export function buildPlan(input: PlanInput): TrainingPlan {
  const runsPerWeek = Number.isFinite(input.runsPerWeek)
    ? Math.min(14, Math.max(1, Math.round(input.runsPerWeek)))
    : DEFAULT_RUNS_PER_WEEK;

  const preferredDays = normalizePreferredDays([...input.preferredDays]);

  return createPlan({
    goal: {
      kind: input.goalKind,
      targetKm: input.goalKind === 'fitness' ? null : positiveOrNull(input.targetKm),
      raceDate: input.goalKind === 'race' && isDateKey(input.raceDate) ? input.raceDate : null,
    },
    runsPerWeek,
    preferredDays: preferredDays.length > 0 ? preferredDays : [...DEFAULT_PREFERRED_DAYS],
    level: isTrainingLevel(input.level) ? input.level : 'occasional',
  });
}

// -- Scheduling (#70) -------------------------------------------------------

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** 0 = Sunday … 6 = Saturday, for a `yyyy-mm-dd` key. */
export function weekdayOf(key: string): number {
  return parseDateKey(key).getDay();
}

/** The Sunday of the week containing `key`. Weekday numbering is Sunday-first. */
export function weekStartFor(key: string): string {
  return addDays(key, -weekdayOf(key));
}

/** Shortest distance between two weekdays around the week. */
function circularDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 7;
  return Math.min(delta, 7 - delta);
}

/**
 * The roles a week of `count` runs is made of, per the rules in
 * `docs/training-rules.md`. Exactly one long run (from two runs up), one hard
 * session, and a recovery run once the runner is out often enough.
 */
export function rolesForWeek(
  count: number,
  level: TrainingLevel,
  goalKind: TrainingGoalKind,
): WorkoutType[] {
  if (count <= 0) {
    return [];
  }
  // Intervals only for a goal that is about distance or a race, and only once
  // the runner is running regularly. No goal, or a new runner, gets tempo.
  const hard: WorkoutType =
    goalKind !== 'fitness' && level === 'experienced' ? 'intervals' : 'tempo';

  const table: Record<number, WorkoutType[]> = {
    1: ['easy'],
    2: ['easy', 'long'],
    3: ['easy', hard, 'long'],
    4: ['easy', 'easy', hard, 'long'],
    5: ['easy', 'recovery', hard, 'easy', 'long'],
    6: ['easy', 'recovery', hard, 'easy', 'easy', 'long'],
  };

  if (table[count]) {
    return table[count];
  }
  // Beyond six, the extra sessions are easy runs in front of the six-run week.
  return [...Array(count - 6).fill('easy' as WorkoutType), ...table[6]];
}

function longFactorFor(level: TrainingLevel): number {
  if (level === 'experienced') {
    return 1.7;
  }
  if (level === 'regular') {
    return 1.5;
  }
  return 1.3;
}

/**
 * Distances are derived from the runner's own running, never a generic table
 * (Rule 3). `baselineKm` is the runner's recent typical distance; when there is
 * no history, the plan's own target stands in, and 5 km after that.
 */
export function distanceFor(
  type: WorkoutType,
  baselineKm: number,
  level: TrainingLevel,
  ceilingKm: number | null,
): number {
  const factors: Record<WorkoutType, number> = {
    easy: 1,
    recovery: 0.5,
    short: 0.75,
    long: longFactorFor(level),
    tempo: 1.1,
    intervals: 0.8,
    fartlek: 0.9,
  };

  const raw = baselineKm * factors[type];
  const capped = ceilingKm !== null ? Math.min(raw, ceilingKm) : raw;
  // Half-kilometre steps, floored at 2 km: finer than that is false precision.
  return Math.max(2, Math.round(capped * 2) / 2);
}

export type WeekContext = {
  /** The runner's recent typical distance, or null when there is no history. */
  baselineKm: number | null;
};

export type GeneratedWeek = {
  workouts: PlannedWorkout[];
  /**
   * True when the plan asks for more runs than there are chosen days. The
   * sessions are not forced onto unchosen days; the caller can ask the runner
   * to add a day instead.
   */
  overfull: boolean;
};

/**
 * Turn a plan into dated workouts for one week (#70).
 *
 * Only the plan's chosen days are used. The long run takes the last chosen day,
 * the hard session is placed as far from it as those days allow and never
 * adjacent to it, and a recovery run follows the hard session when there is a
 * day available.
 *
 * Ids are derived from the plan and the date, so regenerating a week is
 * idempotent: `addWorkouts` ignores what is already there, which is how a
 * completed or skipped day survives a regeneration untouched.
 */
export function generateWeek(
  plan: TrainingPlan,
  weekStart: string,
  context: WeekContext = { baselineKm: null },
): GeneratedWeek {
  const days = normalizePreferredDays(plan.preferredDays);
  if (days.length === 0) {
    return { workouts: [], overfull: plan.runsPerWeek > 0 };
  }

  const overfull = plan.runsPerWeek > days.length;
  const sessionCount = Math.min(plan.runsPerWeek, days.length);
  const roles = rolesForWeek(sessionCount, plan.level, plan.goal.kind);

  const longWeekday = days[days.length - 1];
  const placed: { weekday: number; type: WorkoutType }[] = [];
  let remaining = days.filter((day) => day !== longWeekday);

  if (roles.includes('long')) {
    placed.push({ weekday: longWeekday, type: 'long' });
  }

  const hardType = roles.find((role) => role === 'tempo' || role === 'intervals');
  let hardWeekday: number | null = null;
  if (hardType) {
    const candidates = remaining.filter((day) => circularDistance(day, longWeekday) > 1);
    if (candidates.length > 0) {
      hardWeekday = [...candidates].sort(
        (a, b) => circularDistance(b, longWeekday) - circularDistance(a, longWeekday) || a - b,
      )[0];
      placed.push({ weekday: hardWeekday, type: hardType });
      remaining = remaining.filter((day) => day !== hardWeekday);
    }
  }

  const fill: WorkoutType[] = roles.filter(
    (role) => role !== 'long' && !(hardType !== undefined && role === hardType),
  );
  // A hard session that could not be placed — every chosen day sits next to the
  // long run — still happens, as an easy run rather than being silently lost.
  const fillTypes: WorkoutType[] =
    hardType && hardWeekday === null ? [...fill, 'easy'] : fill;
  while (fillTypes.length < remaining.length) {
    fillTypes.push('easy');
  }
  const fillOrdered: WorkoutType[] = fillTypes.slice(0, remaining.length);

  // Recovery belongs after the hard session, so the day following it takes that
  // role when there is one.
  if (hardWeekday !== null && fillOrdered.includes('recovery')) {
    remaining = [...remaining].sort(
      (a, b) =>
        circularDistance(a, hardWeekday as number) - circularDistance(b, hardWeekday as number) || a - b,
    );
  }

  remaining.forEach((weekday, index) => {
    placed.push({ weekday, type: fillOrdered[index] ?? 'easy' });
  });

  const baseline = context.baselineKm ?? plan.goal.targetKm ?? 5;
  const ceiling = plan.goal.kind === 'fitness' ? null : plan.goal.targetKm;

  const workouts = placed
    .map((entry) => {
      const date = addDays(weekStart, entry.weekday);
      return createWorkout({
        id: `plan-${plan.id}-${date}`,
        date,
        type: entry.type,
        targetKm: distanceFor(entry.type, baseline, plan.level, ceiling),
      });
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { workouts, overfull };
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
 * Apply a regenerated schedule without rewriting history.
 *
 * Editing a plan must change the days ahead, not the days behind: workouts
 * before `fromDate` are kept, and so is any workout a runner has already acted
 * on — completed, skipped or modified — whatever its date. Only sessions still
 * `planned` on or after `fromDate` are replaced.
 */
export function replacePlannedWorkouts(
  state: TrainingState,
  workouts: readonly PlannedWorkout[],
  fromDate: string,
): TrainingState {
  const kept = state.workouts.filter(
    (workout) => workout.date < fromDate || workout.status !== 'planned',
  );
  return addWorkouts({ ...state, workouts: kept }, workouts);
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
