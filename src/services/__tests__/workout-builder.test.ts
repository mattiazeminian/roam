/**
 * Tests for the run builder (#151).
 *
 * The builder is what turns a runner's choices into the flat step list the
 * execution engine already runs. These pin the two things most likely to be
 * wrong: the repeat expansion, and the honesty of the summary.
 */
import { describe, expect, test } from '@jest/globals';

import {
  compileStructured,
  defaultSpec,
  runKindWorkoutType,
  startLabel,
  summarizeSteps,
  type StructuredSpec,
} from '../workout-builder';

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
      repeatGroupId: 'main',
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
