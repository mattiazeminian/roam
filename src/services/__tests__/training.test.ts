/**
 * Tests for the training model (#67).
 *
 * The model is the foundation for plans and schedules, so these pin the things
 * that would otherwise go wrong quietly: a corrupt file taking a screen down, an
 * unknown value being repaired into something the runner never planned, and
 * completion being inferred rather than recorded.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  EMPTY_TRAINING,
  WORKOUT_DESCRIPTIONS,
  WORKOUT_TYPES,
  addWorkouts,
  buildPlan,
  generateWeek,
  weekdayOf,
  createPlan,
  createWorkout,
  loadTraining,
  normalizePreferredDays,
  removeWorkout,
  saveTraining,
  setWorkoutStatus,
  summarizeProgress,
  toDateKey,
  workoutsFrom,
  workoutsOnDate,
  type PlannedWorkout,
  type TrainingPlan,
  type TrainingState,
} from '../training';

const mockFiles = new Map<string, string>();

jest.mock('expo-file-system', () => {
  class FakeFile {
    path: string;
    constructor(parent: { path: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.path;
      this.path = name === undefined ? base : `${base}/${name}`;
    }
    get uri() {
      return `file://${this.path}`;
    }
    get name() {
      return this.path.split('/').pop() as string;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    create() {
      if (!mockFiles.has(this.path)) {
        mockFiles.set(this.path, '');
      }
    }
    write(content: string) {
      mockFiles.set(this.path, content);
    }
    async text() {
      return mockFiles.get(this.path) ?? '';
    }
    delete() {
      mockFiles.delete(this.path);
    }
  }

  class FakeDirectory {
    path: string;
    constructor(parent: { path: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.path;
      this.path = name === undefined ? base : `${base}/${name}`;
    }
    get exists() {
      return true;
    }
    create() {}
  }

  return { File: FakeFile, Directory: FakeDirectory, Paths: { document: { path: 'doc' } } };
});

beforeEach(() => {
  mockFiles.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function state(overrides: Partial<TrainingState> = {}): TrainingState {
  return { ...EMPTY_TRAINING, ...overrides };
}

describe('training model (#67)', () => {
  test('a fresh install has no plan and no workouts', async () => {
    expect(await loadTraining()).toEqual(EMPTY_TRAINING);
  });

  test('every workout type has a plain-language description', () => {
    for (const type of WORKOUT_TYPES) {
      const description = WORKOUT_DESCRIPTIONS[type];
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
      // No medical or performance claims.
      expect(description.toLowerCase()).not.toMatch(/burn|calorie|fat|improve|boost|vo2/);
    }
  });

  test('createWorkout starts planned, unlinked and unannotated', () => {
    const workout = createWorkout({ date: '2026-09-21', type: 'easy', targetKm: 5, id: 'w1' });
    expect(workout).toEqual({
      id: 'w1',
      date: '2026-09-21',
      type: 'easy',
      targetKm: 5,
      status: 'planned',
      runId: null,
      note: null,
    });
  });

  test('a plan and its workouts round-trip', async () => {
    const plan = createPlan({
      goal: { kind: 'race', targetKm: 21.1, raceDate: '2026-11-01' },
      runsPerWeek: 4,
      preferredDays: [1, 3, 5, 6],
      level: 'regular',
      id: 'p1',
    });
    await saveTraining(
      state({
        plan,
        workouts: [createWorkout({ date: '2026-09-21', type: 'long', targetKm: 12, id: 'w1' })],
      }),
    );

    const loaded = await loadTraining();
    expect(loaded.plan).toMatchObject({
      id: 'p1',
      runsPerWeek: 4,
      preferredDays: [1, 3, 5, 6],
      level: 'regular',
      goal: { kind: 'race', targetKm: 21.1, raceDate: '2026-11-01' },
    });
    expect(loaded.workouts).toHaveLength(1);
    expect(loaded.workouts[0].type).toBe('long');
  });

  test('a damaged file reads as empty rather than crashing', async () => {
    mockFiles.set('doc/training.json', '{not json');
    expect(await loadTraining()).toEqual(EMPTY_TRAINING);
  });

  test('an unreadable workout is dropped, not repaired into something unplanned', async () => {
    mockFiles.set(
      'doc/training.json',
      JSON.stringify({
        plan: null,
        workouts: [
          { id: 'ok', date: '2026-09-21', type: 'easy', targetKm: 5, status: 'planned' },
          { id: 'bad-type', date: '2026-09-22', type: 'sprint', targetKm: 5 },
          { id: 'bad-date', date: 'tomorrow', type: 'easy', targetKm: 5 },
          { id: 'bad-target', date: '2026-09-23', type: 'easy', targetKm: 0 },
          { date: '2026-09-24', type: 'easy', targetKm: 5 },
        ],
      }),
    );

    const loaded = await loadTraining();
    expect(loaded.workouts.map((workout) => workout.id)).toEqual(['ok']);
  });

  test('an unknown status degrades to planned, which is the safe reading', async () => {
    mockFiles.set(
      'doc/training.json',
      JSON.stringify({
        plan: null,
        workouts: [{ id: 'w1', date: '2026-09-21', type: 'easy', targetKm: 5, status: 'abandoned' }],
      }),
    );
    expect((await loadTraining()).workouts[0].status).toBe('planned');
  });

  test('preferred days are validated, de-duplicated and sorted', () => {
    expect(normalizePreferredDays([5, 1, 1, 9, -1, 3.5, 0])).toEqual([0, 1, 5]);
    expect(normalizePreferredDays([])).toEqual([]);
  });

  test('a plan with unusable values is discarded rather than defaulted silently', async () => {
    mockFiles.set('doc/training.json', JSON.stringify({ plan: { runsPerWeek: 4 }, workouts: [] }));
    expect((await loadTraining()).plan).toBeNull();
  });

  test('runsPerWeek is clamped into a usable range', async () => {
    mockFiles.set(
      'doc/training.json',
      JSON.stringify({
        plan: { id: 'p1', runsPerWeek: 99, preferredDays: [1], level: 'regular', goal: {} },
        workouts: [],
      }),
    );
    expect((await loadTraining()).plan?.runsPerWeek).toBe(14);
  });
});

describe('training updates (#67)', () => {
  const workout = (id: string, date: string, type: 'easy' | 'long' = 'easy'): PlannedWorkout =>
    createWorkout({ id, date, type, targetKm: 5 });

  test('adding workouts ignores ids already present', () => {
    const next = addWorkouts(state({ workouts: [workout('w1', '2026-09-21')] }), [
      workout('w1', '2026-09-21'),
      workout('w2', '2026-09-22'),
    ]);
    expect(next.workouts.map((entry) => entry.id)).toEqual(['w1', 'w2']);
  });

  test('removing a workout leaves the rest alone', () => {
    const next = removeWorkout(
      state({ workouts: [workout('w1', '2026-09-21'), workout('w2', '2026-09-22')] }),
      'w1',
    );
    expect(next.workouts.map((entry) => entry.id)).toEqual(['w2']);
  });

  test('completing a workout links the run that did it', () => {
    const next = setWorkoutStatus(
      state({ workouts: [workout('w1', '2026-09-21')] }),
      'w1',
      'completed',
      'run-1',
    );
    expect(next.workouts[0]).toMatchObject({ status: 'completed', runId: 'run-1' });
  });

  test('marking a workout skipped clears any run link', () => {
    const completed = setWorkoutStatus(
      state({ workouts: [workout('w1', '2026-09-21')] }),
      'w1',
      'completed',
      'run-1',
    );
    const skipped = setWorkoutStatus(completed, 'w1', 'skipped');
    expect(skipped.workouts[0]).toMatchObject({ status: 'skipped', runId: null });
  });

  test('finds the workouts for a day, and the ones still ahead', () => {
    const current = state({
      workouts: [
        workout('w1', '2026-09-20', 'long'),
        workout('w2', '2026-09-22'),
        workout('w3', '2026-09-25'),
      ],
    });
    expect(workoutsOnDate(current, '2026-09-20').map((entry) => entry.id)).toEqual(['w1']);
    expect(workoutsFrom(current, '2026-09-22').map((entry) => entry.id)).toEqual(['w2', 'w3']);
  });

  test('summarises a window from what the workouts actually say', () => {
    const current = state({
      workouts: [
        { ...workout('w1', '2026-09-21'), targetKm: 5, status: 'completed', runId: 'r1' },
        { ...workout('w2', '2026-09-23'), targetKm: 8, status: 'skipped', runId: null },
        { ...workout('w3', '2026-09-26'), targetKm: 12, status: 'planned', runId: null },
        workout('w4', '2026-10-02'),
      ],
    });

    expect(summarizeProgress(current, '2026-09-21', '2026-09-27')).toEqual({
      planned: 3,
      completed: 1,
      skipped: 1,
      plannedKm: 25,
      completedKm: 5,
    });
  });

  test('a local date key is a calendar day, not a timestamp', () => {
    expect(toDateKey(new Date(2026, 8, 21, 23, 30))).toBe('2026-09-21');
  });
});

describe('building a plan (#69)', () => {
  const input = {
    goalKind: 'distance' as const,
    targetKm: 10,
    raceDate: null,
    runsPerWeek: 4,
    preferredDays: [5, 1, 1],
    level: 'regular' as const,
  };

  test('keeps the runner\'s choices, normalized', () => {
    const plan = buildPlan(input);
    expect(plan).toMatchObject({
      runsPerWeek: 4,
      preferredDays: [1, 5],
      level: 'regular',
      goal: { kind: 'distance', targetKm: 10, raceDate: null },
    });
  });

  test('clamps an implausible runs-per-week instead of accepting it', () => {
    expect(buildPlan({ ...input, runsPerWeek: 0 }).runsPerWeek).toBe(1);
    expect(buildPlan({ ...input, runsPerWeek: 99 }).runsPerWeek).toBe(14);
    expect(buildPlan({ ...input, runsPerWeek: 3.4 }).runsPerWeek).toBe(3);
  });

  test('drops a target that does not belong to the chosen goal', () => {
    const fitness = buildPlan({ ...input, goalKind: 'fitness' });
    expect(fitness.goal.targetKm).toBeNull();
    expect(fitness.goal.raceDate).toBeNull();
  });

  test('keeps a race date only for a race goal, and only when it is a date', () => {
    const race = buildPlan({ ...input, goalKind: 'race', raceDate: '2026-11-01' });
    expect(race.goal).toEqual({ kind: 'race', targetKm: 10, raceDate: '2026-11-01' });

    const notADate = buildPlan({ ...input, goalKind: 'race', raceDate: 'next month' });
    expect(notADate.goal.raceDate).toBeNull();

    const distance = buildPlan({ ...input, goalKind: 'distance', raceDate: '2026-11-01' });
    expect(distance.goal.raceDate).toBeNull();
  });

  test('falls back to three spread weekdays when none are chosen', () => {
    expect(buildPlan({ ...input, preferredDays: [] }).preferredDays).toEqual([2, 4, 6]);
    expect(buildPlan({ ...input, preferredDays: [9, -1] }).preferredDays).toEqual([2, 4, 6]);
  });

  test('an unusable level falls back rather than being stored', () => {
    // @ts-expect-error deliberately invalid input from a caller
    expect(buildPlan({ ...input, level: 'olympian' }).level).toBe('occasional');
  });
});

/** Shortest gap between two weekdays around the week. */
function circularGap(a: number, b: number): number {
  const delta = Math.abs(a - b) % 7;
  return Math.min(delta, 7 - delta);
}

describe('generating a week (#70)', () => {
  const planFor = (overrides: Partial<TrainingPlan> = {}): TrainingPlan => ({
    ...createPlan({
      goal: { kind: 'fitness', targetKm: null, raceDate: null },
      runsPerWeek: 3,
      preferredDays: [2, 4, 6],
      level: 'occasional',
      id: 'p1',
    }),
    ...overrides,
  });

  const weekStart = '2026-09-20'; // a Sunday

  test('places sessions only on the chosen days', () => {
    const { workouts } = generateWeek(planFor(), weekStart);
    expect(workouts.map((w) => weekdayOf(w.date))).toEqual([2, 4, 6]);
  });

  test('gives the long run the last chosen day and keeps hard work away from it', () => {
    const { workouts } = generateWeek(planFor(), weekStart);
    const long = workouts.find((w) => w.type === 'long');
    expect(weekdayOf(long!.date)).toBe(6);

    const hard = workouts.filter((w) => w.type === 'tempo' || w.type === 'intervals');
    expect(hard).toHaveLength(1);
    expect(circularGap(weekdayOf(hard[0].date), 6)).toBeGreaterThan(1);
  });

  test('puts a recovery run after the hard session for a frequent runner', () => {
    const { workouts } = generateWeek(
      planFor({ runsPerWeek: 5, preferredDays: [1, 2, 3, 4, 5] }),
      weekStart,
    );
    const hard = workouts.find((w) => w.type === 'tempo' || w.type === 'intervals')!;
    const recovery = workouts.find((w) => w.type === 'recovery');
    expect(recovery).toBeDefined();
    expect(recovery!.date > hard.date).toBe(true);
  });

  test('reports an over-full week rather than using days the runner did not choose', () => {
    const { workouts, overfull } = generateWeek(
      planFor({ runsPerWeek: 5, preferredDays: [1, 3] }),
      weekStart,
    );
    expect(overfull).toBe(true);
    expect(workouts).toHaveLength(2);
    expect(workouts.every((w) => [1, 3].includes(weekdayOf(w.date)))).toBe(true);
  });

  test('a plan with no days yields nothing', () => {
    const { workouts, overfull } = generateWeek(planFor({ preferredDays: [] }), weekStart);
    expect(workouts).toEqual([]);
    expect(overfull).toBe(true);
  });

  test('derives distances from the runner\'s own baseline, capped at the goal', () => {
    const { workouts } = generateWeek(planFor({ runsPerWeek: 3, preferredDays: [2, 4, 6] }), weekStart, {
      baselineKm: 6,
    });
    const byType = Object.fromEntries(workouts.map((w) => [w.type, w.targetKm]));
    expect(byType.easy).toBe(6);
    expect(byType.long).toBe(8); // 6 × 1.3, rounded to the nearest 0.5

    const capped = generateWeek(
      planFor({
        runsPerWeek: 3,
        preferredDays: [2, 4, 6],
        level: 'experienced',
        goal: { kind: 'distance', targetKm: 8, raceDate: null },
      }),
      weekStart,
      { baselineKm: 6 },
    );
    // 6 × 1.7 would be 10.5, but the goal is 8.
    expect(capped.workouts.find((w) => w.type === 'long')!.targetKm).toBe(8);
  });

  test('uses intervals only for a distance or race goal at the experienced level', () => {
    const race = generateWeek(
      planFor({
        level: 'experienced',
        goal: { kind: 'race', targetKm: 21.1, raceDate: '2026-11-01' },
      }),
      weekStart,
    );
    expect(race.workouts.some((w) => w.type === 'intervals')).toBe(true);

    const fitness = generateWeek(planFor({ level: 'experienced' }), weekStart);
    expect(fitness.workouts.some((w) => w.type === 'intervals')).toBe(false);
  });

  test('regenerating a week is idempotent and never rewrites what happened', () => {
    const first = generateWeek(planFor(), weekStart).workouts;
    const completed = { ...first[0], status: 'completed' as const, runId: 'run-1' };
    const existing: TrainingState = { plan: planFor(), workouts: [completed] };

    const regenerated = generateWeek(planFor(), weekStart).workouts;
    const merged = addWorkouts(existing, regenerated);

    expect(merged.workouts).toHaveLength(first.length);
    expect(merged.workouts.find((w) => w.id === completed.id)).toMatchObject({
      status: 'completed',
      runId: 'run-1',
    });
  });
});
