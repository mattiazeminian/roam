/**
 * The pre-run countdown contract (#153).
 *
 * The countdown exists so GPS can settle before the run's clock starts. These
 * tests pin down that countdown time never becomes run time, that `Off` starts
 * immediately, and that every configured duration produces the expected
 * sequence.
 */
import { describe, expect, test } from '@jest/globals';

import {
  COUNTDOWN_GO_HOLD_MS,
  COUNTDOWN_STEP_MS,
  countdownDurationMs,
  countdownSequence,
  shouldCountdown,
} from '../start-countdown';

describe('countdownSequence', () => {
  test('counts down each whole second, then GO', () => {
    expect(countdownSequence(3)).toEqual(['3', '2', '1', 'GO']);
    expect(countdownSequence(6)).toEqual(['6', '5', '4', '3', '2', '1', 'GO']);
    expect(countdownSequence(9)).toEqual(['9', '8', '7', '6', '5', '4', '3', '2', '1', 'GO']);
  });

  test('Off is not a countdown at all', () => {
    expect(countdownSequence(0)).toEqual([]);
  });
});

describe('countdownDurationMs', () => {
  test('is a full step per numeral plus the GO hold', () => {
    expect(countdownDurationMs(3)).toBe(3 * COUNTDOWN_STEP_MS + COUNTDOWN_GO_HOLD_MS);
    expect(countdownDurationMs(6)).toBe(6 * COUNTDOWN_STEP_MS + COUNTDOWN_GO_HOLD_MS);
    expect(countdownDurationMs(9)).toBe(9 * COUNTDOWN_STEP_MS + COUNTDOWN_GO_HOLD_MS);
  });

  test('Off adds no delay before the run starts', () => {
    expect(countdownDurationMs(0)).toBe(0);
  });
});

describe('shouldCountdown', () => {
  test('is true for every configured duration and false when Off', () => {
    expect(shouldCountdown(0)).toBe(false);
    expect(shouldCountdown(3)).toBe(true);
    expect(shouldCountdown(6)).toBe(true);
    expect(shouldCountdown(9)).toBe(true);
  });
});
