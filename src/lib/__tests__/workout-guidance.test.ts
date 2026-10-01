import { describe, expect, test } from '@jest/globals';

import { runSplitCue, workoutCompleteCue, workoutStepCue, workoutWarningCue } from '../workout-guidance';

describe('workoutStepCue', () => {
  test('describes a duration step in runner-friendly language', () => {
    expect(
      workoutStepCue({
        label: 'Warm up',
        target: { kind: 'duration', seconds: 90 },
      }),
    ).toBe('Warm up. 1 minute 30 seconds.');
  });

  test('describes a distance step and includes repeat position when present', () => {
    expect(
      workoutStepCue({
        label: 'Fast',
        target: { kind: 'distance', meters: 800 },
        repIndex: 3,
        repCount: 6,
      }),
    ).toBe('Fast. Rep 3 of 6. 800 meters.');
  });

  test('uses singular units for singular targets', () => {
    expect(
      workoutStepCue({
        label: 'Recover',
        target: { kind: 'duration', seconds: 1 },
      }),
    ).toBe('Recover. 1 second.');
  });
});

describe('workoutWarningCue', () => {
  test('gives a concise warning for a timed phase', () => {
    expect(workoutWarningCue(30)).toBe('30 seconds remaining.');
  });
});

describe('workoutCompleteCue', () => {
  test('marks the structured workout as complete', () => {
    expect(workoutCompleteCue()).toBe('Workout complete. Great work.');
  });
});

describe('runSplitCue', () => {
  test('uses the runner’s chosen unit without an unnecessary pace claim', () => {
    expect(runSplitCue(1, 'km')).toBe('1 kilometer complete.');
    expect(runSplitCue(2, 'mi')).toBe('2 miles complete.');
  });
});
