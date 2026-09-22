import { describe, expect, test } from '@jest/globals';

import { remainingDurationSeconds, runExecutionMode } from '../run-execution';

describe('run execution presentation', () => {
  test('keeps free runs free when no target exists', () => {
    expect(runExecutionMode(null, 0, 0)).toBe('free');
  });

  test('keeps explicit timed runs time-first', () => {
    expect(runExecutionMode(null, 1800, 6)).toBe('time');
    expect(remainingDurationSeconds(1800, 11.4)).toBe(1789);
  });

  test('uses distance execution for supported planned workouts without phases', () => {
    expect(runExecutionMode('fartlek', 0, 5)).toBe('distance');
    expect(runExecutionMode('long', 0, 16)).toBe('distance');
  });
});
