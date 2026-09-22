/**
 * Guard for the display-font clipping rule (docs/design-system.md).
 *
 * Negative tracking trims the advance of the last glyph but not its ink, so the
 * ink overhangs the measured width and clips on the right — the `0` in `5.0`.
 * `Text` compensates with trailing padding; this pins the compensation so a
 * future tracking tweak cannot silently reintroduce the clip.
 */
import { describe, expect, test } from '@jest/globals';

import { trackingSlack, typography } from '../typography';

const NEGATIVE_TRACKING_VARIANTS = [
  'metric',
  'hero',
  'display',
  'large',
  'title',
  'heading',
  'body',
] as const;

describe('display tracking never clips (design-system)', () => {
  test('every variant that carries negative tracking gets slack', () => {
    for (const variant of NEGATIVE_TRACKING_VARIANTS) {
      expect(trackingSlack(typography[variant].letterSpacing)).toBeGreaterThan(0);
    }
  });

  test('non-negative tracking needs no slack', () => {
    expect(trackingSlack(0)).toBe(0);
    expect(trackingSlack(1.1)).toBe(0);
    expect(trackingSlack(undefined)).toBe(0);
  });

  test('the slack recovers the overhang the tracking trimmed, plus a hair', () => {
    expect(trackingSlack(-2.5)).toBe(3.5);
  });
});
