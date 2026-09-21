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
  baselineKmFromRuns,
  buildPlan,
  deriveWorkoutOutcome,
  evaluateProgression,
  generateBlock,
  generateWeek,
  goalProgress,
  longDistanceFor,
  recommendNextWorkout,
  weekdayOf,
  createPlan,
  createWorkout,
  loadTraining,
  normalizePreferredDays,
  removeWorkout,
  replacePlannedWorkouts,
  saveTraining,
  setWorkoutStatus,
  summarizeProgress,
  toDateKey,
  weeklyAdherence,
  workoutsFrom,
  workoutsOnDate,
  type PlannedWorkout,
  type TrainingGoal,
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

describe('editing a plan (#70)', () => {
  test('replaces only the days ahead that are still planned', () => {
    const before = createWorkout({ id: 'before', date: '2026-09-19', type: 'easy', targetKm: 5 });
    const done = {
      ...createWorkout({ id: 'done', date: '2026-09-21', type: 'easy', targetKm: 5 }),
      status: 'completed' as const,
      runId: 'run-1',
    };
    const ahead = createWorkout({ id: 'ahead', date: '2026-09-23', type: 'easy', targetKm: 5 });
    const current: TrainingState = { plan: null, workouts: [before, done, ahead] };

    const regenerated = [
      createWorkout({ id: 'ahead', date: '2026-09-23', type: 'long', targetKm: 10 }),
    ];
    const next = replacePlannedWorkouts(current, regenerated, '2026-09-21');

    // The past is history; a completed day is a fact. Only the planned future moves.
    expect(next.workouts.map((w) => w.id).sort()).toEqual(['ahead', 'before', 'done']);
    expect(next.workouts.find((w) => w.id === 'ahead')?.type).toBe('long');
    expect(next.workouts.find((w) => w.id === 'ahead')?.targetKm).toBe(10);
    expect(next.workouts.find((w) => w.id === 'done')).toMatchObject({
      status: 'completed',
      runId: 'run-1',
    });
  });
});

describe('generateBlock (#74)', () => {
  const plan = createPlan({
    id: 'block',
    goal: { kind: 'fitness', targetKm: null, raceDate: null },
    runsPerWeek: 3,
    preferredDays: [2, 4, 6],
    level: 'regular',
    weeks: 8,
  });
  const start = '2026-01-05';

  test('schedules the whole block, not just one week', () => {
    const block = generateBlock(plan, start);
    expect(block.workouts).toHaveLength(24); // 8 weeks x 3 sessions
  });

  test('volume rises across the block', () => {
    const longs = generateBlock(plan, start).workouts.filter((w) => w.type === 'long');
    expect(longs).toHaveLength(8);
    expect(longs[7].targetKm).toBeGreaterThan(longs[0].targetKm);
  });

  test('every fourth week is a lighter one', () => {
    const longs = generateBlock(plan, start).workouts.filter((w) => w.type === 'long');
    expect(longs[3].targetKm).toBeLessThan(longs[2].targetKm);
  });

  test('ids stay plan-scoped and unique, so regeneration never duplicates', () => {
    const ids = generateBlock(plan, start).workouts.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('plan-block-'))).toBe(true);
  });

  test('a plan without an explicit length still gets a block', () => {
    const legacy = { ...plan, weeks: undefined };
    // 8 weeks default x 3 sessions.
    expect(generateBlock(legacy, start).workouts).toHaveLength(24);
  });
});

describe('baseline from runs (Rule 3)', () => {
  const run = (km: number) => ({ distanceKm: km });

  test('is the median of the last ten runs, not the mean', () => {
    // One very long run must not drag the baseline up.
    const runs = [run(5), run(5), run(5), run(5), run(30)];
    expect(baselineKmFromRuns(runs)).toBe(5);
  });

  test('averages the two middle values for an even count', () => {
    expect(baselineKmFromRuns([run(4), run(5), run(6), run(7)])).toBeCloseTo(5.5, 5);
  });

  test('only the most recent sample is used', () => {
    const runs = [run(4), run(4), run(4), run(20), run(20)];
    expect(baselineKmFromRuns(runs, 3)).toBe(4);
  });

  test('null when there is no usable history', () => {
    expect(baselineKmFromRuns([])).toBeNull();
    expect(baselineKmFromRuns([run(0), run(-1), run(Number.NaN)])).toBeNull();
  });
});

describe('recommendNextWorkout (Rule 5)', () => {
  const plan = createPlan({
    goal: { kind: 'fitness', targetKm: null, raceDate: null },
    runsPerWeek: 3,
    preferredDays: [2, 4, 6],
    level: 'occasional',
  });

  function stateWith(dates: { date: string; status?: PlannedWorkout['status'] }[]): TrainingState {
    return {
      plan,
      workouts: dates.map((entry, index) =>
        createWorkout({
          id: `w${index}`,
          date: entry.date,
          type: 'easy',
          targetKm: 5,
        }),
      ).map((workout, index) => ({
        ...workout,
        status: dates[index].status ?? 'planned',
      })),
    };
  }

  test('today wins, whatever its status', () => {
    const state = stateWith([{ date: '2026-01-06', status: 'completed' }]);
    const suggestion = recommendNextWorkout(state, '2026-01-06');
    expect(suggestion.kind).toBe('today');
    expect(suggestion.workout?.date).toBe('2026-01-06');
  });

  test('nothing today falls to the next scheduled workout as upcoming', () => {
    const state = stateWith([{ date: '2026-01-08' }]);
    const suggestion = recommendNextWorkout(state, '2026-01-06');
    expect(suggestion.kind).toBe('upcoming');
    expect(suggestion.workout?.date).toBe('2026-01-08');
  });

  test('a recently missed workout is offered as a catch-up when nothing is upcoming', () => {
    const state = stateWith([{ date: '2026-01-05' }]);
    const suggestion = recommendNextWorkout(state, '2026-01-06');
    expect(suggestion.kind).toBe('catch-up');
    expect(suggestion.workout?.date).toBe('2026-01-05');
  });

  test('a miss older than two days is not offered', () => {
    const state = stateWith([{ date: '2026-01-01' }]);
    expect(recommendNextWorkout(state, '2026-01-06').kind).toBe('none');
  });

  test('no plan, no workouts means no suggestion', () => {
    expect(recommendNextWorkout(EMPTY_TRAINING, '2026-01-06')).toEqual({
      kind: 'none',
      workout: null,
    });
  });
});

describe('goal progress (#75)', () => {
  const run = (km: number) => ({ distanceKm: km });
  const fitness: TrainingGoal = { kind: 'fitness', targetKm: null, raceDate: null };
  const distance: TrainingGoal = { kind: 'distance', targetKm: 10, raceDate: null };
  const race: TrainingGoal = { kind: 'race', targetKm: 21.1, raceDate: '2026-06-01' };

  test('reports the longest run, total and count from recorded runs', () => {
    const progress = goalProgress(distance, [run(5), run(8), run(3)], '2026-01-01');
    expect(progress.longestRunKm).toBe(8);
    expect(progress.totalKm).toBeCloseTo(16, 5);
    expect(progress.runCount).toBe(3);
    expect(progress.longestShare).toBeCloseTo(0.8, 5);
  });

  test('a fitness goal has no target and no share', () => {
    const progress = goalProgress(fitness, [run(5)], '2026-01-01');
    expect(progress.targetKm).toBeNull();
    expect(progress.longestShare).toBeNull();
  });

  test('a race goal reports days to the race, floored at zero', () => {
    expect(goalProgress(race, [], '2026-05-01').daysUntilRace).toBe(31);
    expect(goalProgress(race, [], '2026-06-10').daysUntilRace).toBe(0);
  });

  test('no runs means no longest run, not a zero', () => {
    const progress = goalProgress(distance, [], '2026-01-01');
    expect(progress.longestRunKm).toBeNull();
    expect(progress.longestShare).toBeNull();
    expect(progress.totalKm).toBe(0);
  });
});

describe('weekly adherence (#73)', () => {
  const plan = createPlan({
    goal: { kind: 'fitness', targetKm: null, raceDate: null },
    runsPerWeek: 2,
    preferredDays: [2, 4],
    level: 'occasional',
  });

  function weekState(): TrainingState {
    // NOW is a Tuesday (2023-11-14); the current week starts Sunday 2023-11-12.
    const entries: { date: string; status: PlannedWorkout['status'] }[] = [
      { date: '2023-11-07', status: 'completed' },
      { date: '2023-11-09', status: 'completed' },
      { date: '2023-11-14', status: 'completed' },
      { date: '2023-11-16', status: 'planned' },
    ];
    return {
      plan,
      workouts: entries.map((entry, index) => ({
        ...createWorkout({ id: `w${index}`, date: entry.date, type: 'easy', targetKm: 5 }),
        status: entry.status,
      })),
    };
  }

  test('returns one entry per week, oldest first, ending with the current week', () => {
    const weeks = weeklyAdherence(weekState(), '2023-11-14', 3);
    expect(weeks).toHaveLength(3);
    expect(weeks[weeks.length - 1].weekStart).toBe('2023-11-12');
    expect(weeks[0].weekStart).toBe('2023-10-29');
  });

  test('counts planned, completed and upcoming per week', () => {
    const weeks = weeklyAdherence(weekState(), '2023-11-14', 2);
    const current = weeks[1];
    expect(current.planned).toBe(2);
    expect(current.completed).toBe(1);
    expect(current.upcoming).toBe(1);
    const previous = weeks[0];
    expect(previous.planned).toBe(2);
    expect(previous.completed).toBe(2);
    expect(previous.upcoming).toBe(0);
  });

  test('a week with nothing is zeros, not missing', () => {
    const weeks = weeklyAdherence(weekState(), '2023-11-14', 3);
    expect(weeks[0]).toMatchObject({ planned: 0, completed: 0, skipped: 0, upcoming: 0 });
  });
});

describe('derived workout outcome (#72)', () => {
  const workout = { targetKm: 10 };

  test('a run at or above the completion fraction is completed', () => {
    expect(deriveWorkoutOutcome(workout, { distanceKm: 10 })).toBe('completed');
    expect(deriveWorkoutOutcome(workout, { distanceKm: 8 })).toBe('completed');
    expect(deriveWorkoutOutcome(workout, { distanceKm: 14 })).toBe('completed');
  });

  test('a short run is partial, not failed', () => {
    expect(deriveWorkoutOutcome(workout, { distanceKm: 7.9 })).toBe('partial');
    expect(deriveWorkoutOutcome(workout, { distanceKm: 1 })).toBe('partial');
  });

  test('a partial session keeps its run link, a skipped one does not', () => {
    const state: TrainingState = {
      plan: null,
      workouts: [createWorkout({ id: 'w', date: '2026-01-01', type: 'long', targetKm: 10 })],
    };
    expect(setWorkoutStatus(state, 'w', 'partial', 'run-1').workouts[0]).toMatchObject({
      status: 'partial',
      runId: 'run-1',
    });
    expect(setWorkoutStatus(state, 'w', 'skipped', 'run-1').workouts[0].runId).toBeNull();
  });
});

describe('progression (#74)', () => {
  const plan = createPlan({
    goal: { kind: 'fitness', targetKm: null, raceDate: null },
    runsPerWeek: 4,
    preferredDays: [1, 3, 5, 6],
    level: 'occasional',
  });

  // The week before the current one (NOW is Tue 2023-11-14; current week starts
  // Sun 2023-11-12, so last week is 2023-11-05 … 2023-11-11).
  function lastWeek(statuses: PlannedWorkout['status'][]): TrainingState {
    const dates = ['2023-11-05', '2023-11-07', '2023-11-09', '2023-11-11'];
    return {
      plan,
      workouts: statuses.map((status, index) => ({
        ...createWorkout({ id: `w${index}`, date: dates[index], type: 'easy', targetKm: 5 }),
        status,
      })),
    };
  }

  test('80% or more completed advances', () => {
    const result = evaluateProgression(
      lastWeek(['completed', 'completed', 'completed', 'completed']),
      '2023-11-14',
    );
    expect(result.action).toBe('advance');
    expect(result.factor).toBeGreaterThan(1);
  });

  test('about half holds', () => {
    expect(
      evaluateProgression(lastWeek(['completed', 'completed', 'planned', 'planned']), '2023-11-14').action,
    ).toBe('hold');
  });

  test('below half reduces', () => {
    expect(
      evaluateProgression(lastWeek(['completed', 'planned', 'planned', 'planned']), '2023-11-14').action,
    ).toBe('reduce');
  });

  test('two skipped sessions reduce even if the rest were done', () => {
    expect(
      evaluateProgression(lastWeek(['completed', 'completed', 'skipped', 'skipped']), '2023-11-14').action,
    ).toBe('reduce');
  });

  test('a reduce right after an advance steps back', () => {
    expect(
      evaluateProgression(lastWeek(['completed', 'planned', 'planned', 'planned']), '2023-11-14', 'advance')
        .action,
    ).toBe('step-back');
  });

  test('nothing scheduled holds', () => {
    expect(evaluateProgression({ plan, workouts: [] }, '2023-11-14').action).toBe('hold');
  });

  test('the long run is scaled by the adjust and capped by the goal (#74)', () => {
    // 5 km baseline, occasional → 1.3 × 5 = 6.5 km.
    expect(longDistanceFor(5, 'occasional', null, 1)).toBe(6.5);
    expect(longDistanceFor(5, 'occasional', null, 1.2)).toBe(8);
    // A 7 km ceiling is never exceeded.
    expect(longDistanceFor(5, 'occasional', 7, 2)).toBe(7);
  });
});
