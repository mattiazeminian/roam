import { describe, expect, test } from '@jest/globals';

import {
  advanceWorkoutExecution,
  createWorkoutExecutionState,
  currentWorkoutStep,
  stepsForWorkout,
  workoutStepProgress,
  workoutStepRemaining,
} from '../workout-execution';
import { createWorkout, type WorkoutStep } from '../training';

const steps: WorkoutStep[] = [
  { id: 'warmup', kind: 'warmup', label: 'Warm up', target: { kind: 'duration', seconds: 60 } },
  { id: 'work', kind: 'work', label: 'Fast', target: { kind: 'distance', meters: 400 } },
];

describe('workout execution (#148)', () => {
  test('a duration step completes against its own elapsed time, not the run total', () => {
    const twoDurations: WorkoutStep[] = [
      { id: 'warmup', kind: 'warmup', label: 'Warm up', target: { kind: 'duration', seconds: 60 } },
      { id: 'work', kind: 'work', label: 'Work', target: { kind: 'duration', seconds: 120 } },
    ];
    const afterWarmup = advanceWorkoutExecution(
      twoDurations,
      createWorkoutExecutionState(),
      60,
      0,
    );
    expect(afterWarmup).toMatchObject({ stepIndex: 1, stepStartSeconds: 60, completed: false });

    // 119s is only 59s into the work step — not done.
    expect(advanceWorkoutExecution(twoDurations, afterWarmup, 119, 0)).toBe(afterWarmup);
    // 180s is 120s into the work step — done.
    expect(advanceWorkoutExecution(twoDurations, afterWarmup, 180, 0).completed).toBe(true);
  });

  test('a distance step completes against distance since the step began', () => {
    const onlyWork: WorkoutStep[] = [
      { id: 'work', kind: 'work', label: 'Work', target: { kind: 'distance', meters: 400 } },
    ];
    const state = createWorkoutExecutionState();
    expect(advanceWorkoutExecution(onlyWork, state, 0, 399)).toBe(state);
    expect(advanceWorkoutExecution(onlyWork, state, 0, 400).completed).toBe(true);
  });

  test('mixed steps carry the running totals into the next step', () => {
    const afterWarmup = advanceWorkoutExecution(steps, createWorkoutExecutionState(), 60, 0);
    expect(afterWarmup).toMatchObject({ stepIndex: 1, stepStartSeconds: 60, stepStartMeters: 0 });
    // The work step is distance-based, so time since it began is irrelevant.
    expect(advanceWorkoutExecution(steps, afterWarmup, 90, 400).completed).toBe(true);
  });

  test('a jump past a step begins the next one from the current totals, inventing nothing', () => {
    // The warm up is passed; the work step starts now, so it still needs its
    // full distance rather than counting ground covered before it began.
    const state = advanceWorkoutExecution(steps, createWorkoutExecutionState(), 300, 500);
    expect(state).toMatchObject({ stepIndex: 1, stepStartSeconds: 300, stepStartMeters: 500 });
    expect(state.completed).toBe(false);
  });

  test('an unchanged tick returns the same reference', () => {
    const state = createWorkoutExecutionState();
    expect(advanceWorkoutExecution(steps, state, 10, 0)).toBe(state);
  });

  test('reports the current step, its progress and its remaining target', () => {
    const afterWarmup = advanceWorkoutExecution(steps, createWorkoutExecutionState(), 60, 0);
    const current = currentWorkoutStep(steps, afterWarmup);
    expect(current?.id).toBe('work');
    expect(workoutStepProgress(current as WorkoutStep, afterWarmup, 60, 200)).toBeCloseTo(0.5, 5);
    expect(workoutStepRemaining(current as WorkoutStep, afterWarmup, 60, 200)).toBe(200);
  });

  test('no steps means no current step', () => {
    expect(currentWorkoutStep([], createWorkoutExecutionState())).toBeNull();
  });
});

describe('stepsForWorkout (#148)', () => {
  const easy = createWorkout({ id: 'w1', date: '2026-01-01', type: 'easy', targetKm: 5 });
  const tempo = createWorkout({ id: 'w2', date: '2026-01-01', type: 'tempo', targetKm: 8 });

  test('a plain run is a single work step at its own distance', () => {
    const built = stepsForWorkout(easy);
    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({ kind: 'work', target: { kind: 'distance', meters: 5000 } });
  });

  test('a structured run gets warm up, work and cool down by distance', () => {
    const built = stepsForWorkout(tempo);
    expect(built.map((step) => step.kind)).toEqual(['warmup', 'work', 'cooldown']);
    expect(built[0].target).toEqual({ kind: 'distance', meters: 1600 });
    expect(built[1].target).toEqual({ kind: 'distance', meters: 4800 });
    expect(built[2].target).toEqual({ kind: 'distance', meters: 1600 });
  });

  test('a timed run gets duration steps', () => {
    const built = stepsForWorkout(tempo, 3000);
    expect(built[0].target).toEqual({ kind: 'duration', seconds: 600 });
    expect(built[1].target).toEqual({ kind: 'duration', seconds: 1800 });
    expect(built[2].target).toEqual({ kind: 'duration', seconds: 600 });
  });

  test('a workout that carries its own steps uses them verbatim', () => {
    const custom = createWorkout({
      id: 'w3',
      date: '2026-01-01',
      type: 'intervals',
      targetKm: 6,
      steps: [
        { id: 's1', kind: 'work', label: 'Rep', target: { kind: 'distance', meters: 800 } },
      ],
    });
    expect(stepsForWorkout(custom)).toEqual(custom.steps);
  });
});
