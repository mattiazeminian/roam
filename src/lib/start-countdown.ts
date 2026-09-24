/**
 * The timing contract for the pre-run countdown (#153).
 *
 * Kept apart from the component so the sequence and the moments it fires at are
 * plain data a test can assert on, without rendering anything. The component
 * owns presentation only; this owns *when* the run may start.
 */

import type { StartCountdownSeconds } from '@/services/settings';

/** One second per numeral. */
export const COUNTDOWN_STEP_MS = 1000;
/** The beat `GO` holds before the run actually begins. */
export const COUNTDOWN_GO_HOLD_MS = 550;

/**
 * A countdown of `seconds` counts every whole second down to one, then shows
 * `GO`. Zero is not a countdown at all: the run starts immediately, so the
 * sequence is empty rather than a lone `GO`.
 */
export function countdownSequence(seconds: StartCountdownSeconds): string[] {
  if (seconds <= 0) {
    return [];
  }
  const numerals = Array.from({ length: seconds }, (_, index) => String(seconds - index));
  return [...numerals, 'GO'];
}

/**
 * How long the whole takeover lasts from the first numeral to the run start.
 * The run is *not* running for any of it: countdown time never reaches elapsed
 * duration, distance or a workout phase.
 */
export function countdownDurationMs(seconds: StartCountdownSeconds): number {
  if (seconds <= 0) {
    return 0;
  }
  // Every numeral holds a full step, and GO holds its own beat.
  return seconds * COUNTDOWN_STEP_MS + COUNTDOWN_GO_HOLD_MS;
}

/** Whether starting a run should be deferred by a countdown at all. */
export function shouldCountdown(seconds: StartCountdownSeconds): boolean {
  return seconds > 0;
}
