/**
 * Tests for the run builder (#151).
 *
 * The builder is what turns a runner's choices into the flat step list the
 * execution engine already runs. These pin the two things most likely to be
 * wrong: the repeat expansion, and the honesty of the summary.
 */
import { describe, expect, test } from '@jest/globals';

import {
  compilePlan,
  compileStructured,
  defaultPlan,
  defaultSpec,
  planFromSteps,
  recentWorkoutTemplates,
  runKindWorkoutType,
  startLabel,
  summarizeSteps,
  type StructuredSpec,
  type WorkoutPlan,
} from '../workout-builder';
import type { SavedRun } from '../run-session';

const intervals: StructuredSpec = {
  warmupMinutes: 10,
  reps: 6,
  work: { kind: 'distance', km: 0.4 },
  recovery: { kind: 'duration', minutes: 1.5 },
  cooldownMinutes: 10,
};

describe('compileStructured (#151)', () => {
  test('expands a repeat block into flat, tagged steps', () => {
    const steps = compileStructured('intervals', intervals);

    // warm-up + 6 × (work + recovery) + cool-down
    expect(steps).toHaveLength(1 + 6 * 2 + 1);

    expect(steps[0]).toMatchObject({ kind: 'warmup', target: { kind: 'duration', seconds: 600 } });

    const firstWork = steps[1];
    expect(firstWork).toMatchObject({
      kind: 'work',
      label: 'Run',
      target: { kind: 'distance', meters: 400 },
      repIndex: 1,
      repCount: 6,
      repeatGroupId: 'set-0',
    });

    const firstRecovery = steps[2];
    expect(firstRecovery).toMatchObject({
      kind: 'recovery',
      label: 'Recovery',
      target: { kind: 'duration', seconds: 90 },
      repIndex: 1,
      repCount: 6,
    });

    const lastWork = steps[steps.length - 3];
    expect(lastWork).toMatchObject({ kind: 'work', repIndex: 6, repCount: 6 });

    expect(steps[steps.length - 1]).toMatchObject({
      kind: 'cooldown',
      target: { kind: 'duration', seconds: 600 },
    });
  });

  test('uses plain runner language for fartlek', () => {
    const steps = compileStructured('fartlek', defaultSpec('fartlek'));
    expect(steps[1]).toMatchObject({ kind: 'work', label: 'Fast' });
    expect(steps[2]).toMatchObject({ kind: 'recovery', label: 'Easy' });
  });

  test('tempo is a single work block with no recovery', () => {
    const steps = compileStructured('tempo', defaultSpec('tempo'));
    expect(steps.map((entry) => entry.kind)).toEqual(['warmup', 'work', 'cooldown']);
    expect(steps[1].label).toBe('Tempo');
    expect(steps[1].repeatGroupId).toBeUndefined();
  });

  test('omits a warm-up or cool-down set to none', () => {
    const steps = compileStructured('tempo', { ...defaultSpec('tempo'), warmupMinutes: 0, cooldownMinutes: 0 });
    expect(steps.map((entry) => entry.kind)).toEqual(['work']);
  });

  test('a single rep has no repeat grouping', () => {
    const steps = compileStructured('intervals', { ...intervals, reps: 1 });
    expect(steps.map((entry) => entry.kind)).toEqual(['warmup', 'work', 'cooldown']);
    expect(steps[1].repeatGroupId).toBeUndefined();
  });
});

describe('summarizeSteps (#151)', () => {
  test('reports reps and fast distance, and no invented duration', () => {
    const summary = summarizeSteps(compileStructured('intervals', intervals));
    expect(summary.reps).toBe(6);
    expect(summary.fastDistanceMeters).toBe(2400);
    expect(summary.totalDistanceMeters).toBe(2400);
    // Warm-up and cool-down are time-based, so a total duration is not derivable.
    expect(summary.totalDurationSeconds).toBeNull();
  });

  test('reports a total duration when every step is time-based', () => {
    const summary = summarizeSteps(compileStructured('fartlek', defaultSpec('fartlek')));
    // 10 min warm-up + 6 × (1 min + 2 min) + 10 min cool-down
    expect(summary.totalDurationSeconds).toBe((10 + 6 * 3 + 10) * 60);
    expect(summary.fastDistanceMeters).toBeNull();
    expect(summary.totalDistanceMeters).toBeNull();
  });

  test('an empty step list says nothing', () => {
    expect(summarizeSteps([])).toEqual({
      reps: null,
      fastDistanceMeters: null,
      totalDistanceMeters: null,
      totalDurationSeconds: null,
    });
  });
});

describe('multiple sets and quick repeat (#151)', () => {
  test('compiles several sets with a distinct group per set', () => {
    const plan: WorkoutPlan = {
      warmupMinutes: 10,
      sets: [
        { reps: 4, work: { kind: 'distance', km: 0.4 }, recovery: { kind: 'duration', minutes: 1.5 } },
        { reps: 3, work: { kind: 'distance', km: 0.8 }, recovery: { kind: 'duration', minutes: 2 } },
      ],
      cooldownMinutes: 10,
    };
    const steps = compilePlan('intervals', plan);
    // warm-up + (4 × 2) + (3 × 2) + cool-down
    expect(steps).toHaveLength(1 + 8 + 6 + 1);

    const set0 = steps.filter((entry) => entry.repeatGroupId === 'set-0');
    const set1 = steps.filter((entry) => entry.repeatGroupId === 'set-1');
    expect(set0).toHaveLength(8);
    expect(set1).toHaveLength(6);
    expect(set0[0]).toMatchObject({ repIndex: 1, repCount: 4, target: { kind: 'distance', meters: 400 } });
    expect(set1[0]).toMatchObject({ repIndex: 1, repCount: 3, target: { kind: 'distance', meters: 800 } });

    expect(summarizeSteps(steps).reps).toBe(7);
    expect(summarizeSteps(steps).fastDistanceMeters).toBe(4 * 400 + 3 * 800);
  });

  test('a plan round-trips through its compiled steps', () => {
    const plan: WorkoutPlan = {
      warmupMinutes: 10,
      sets: [
        { reps: 4, work: { kind: 'distance', km: 0.4 }, recovery: { kind: 'duration', minutes: 1.5 } },
        { reps: 3, work: { kind: 'distance', km: 0.8 }, recovery: { kind: 'duration', minutes: 2 } },
      ],
      cooldownMinutes: 5,
    };
    const rebuilt = planFromSteps(compilePlan('intervals', plan));
    expect(rebuilt).not.toBeNull();
    expect(rebuilt?.warmupMinutes).toBe(10);
    expect(rebuilt?.cooldownMinutes).toBe(5);
    expect(rebuilt?.sets).toHaveLength(2);
    expect(rebuilt?.sets[0]).toMatchObject({ reps: 4, work: { kind: 'distance', km: 0.4 } });
    expect(rebuilt?.sets[1]).toMatchObject({ reps: 3, work: { kind: 'distance', km: 0.8 } });
  });

  test('reconstructs a single work block (tempo) as one set', () => {
    const rebuilt = planFromSteps(compilePlan('tempo', defaultPlan('tempo')));
    expect(rebuilt?.sets).toHaveLength(1);
    expect(rebuilt?.sets[0]).toMatchObject({ reps: 1, work: { kind: 'duration', minutes: 20 } });
  });

  test('derives recent distinct structured workouts, newest first', () => {
    const run = (id: string, startedAt: number, overrides: Partial<SavedRun>): SavedRun => ({
      id,
      startedAt,
      endedAt: startedAt + 1_000_000,
      route: null,
      targetDistanceKm: 0,
      distanceKm: 5,
      durationSeconds: 1500,
      averagePaceMinPerKm: 5,
      coordinates: [],
      status: 'finished',
      ...overrides,
    });

    const intervalSteps = compilePlan('intervals', defaultPlan('intervals'));
    const tempoSteps = compilePlan('tempo', defaultPlan('tempo'));

    const runs = [
      run('a', 300, { workoutType: 'intervals', steps: intervalSteps }),
      run('b', 200, { workoutType: 'intervals', steps: intervalSteps }),
      run('c', 100, { workoutType: 'tempo', steps: tempoSteps }),
      run('d', 50, {}),
    ];

    const recents = recentWorkoutTemplates(runs);
    expect(recents).toHaveLength(2);
    expect(recents[0].kind).toBe('intervals');
    expect(recents[1].kind).toBe('tempo');
  });
});

describe('run kind helpers (#151)', () => {
  test('maps structured kinds to a recorded workout type', () => {
    expect(runKindWorkoutType('intervals')).toBe('intervals');
    expect(runKindWorkoutType('fartlek')).toBe('fartlek');
    expect(runKindWorkoutType('tempo')).toBe('tempo');
    expect(runKindWorkoutType('free')).toBeNull();
    expect(runKindWorkoutType('distance')).toBeNull();
    expect(runKindWorkoutType('time')).toBeNull();
  });

  test('names the Start action after the kind', () => {
    expect(startLabel('free')).toBe('Start run');
    expect(startLabel('intervals')).toBe('Start Intervals');
    expect(startLabel('fartlek')).toBe('Start Fartlek');
  });
});
