import { Platform, type TextStyle } from 'react-native';

/**
 * Roam uses the native system typeface. No custom font dependency.
 */
export const fontFamilies = {
  sans: Platform.select({ ios: 'system-ui', default: undefined }),
  /**
   * The display face: a heavy condensed grotesque, matching the brand's
   * all-caps artwork. iOS ships it, so it costs no asset or dependency.
   */
  display: Platform.select({ ios: 'HelveticaNeue-CondensedBlack', default: undefined }),
  mono: Platform.select({ ios: 'ui-monospace', default: 'monospace' }),
} as const;

type TypeToken = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'textTransform'
>;

/**
 * A deliberately small scale.
 *
 * Roam is a product about numbers — distance, time, pace — so the scale is
 * built around them: a display tier for the value the runner reads at a
 * glance, and a quiet `micro` label that names it. Everything else stays out
 * of the way. Large sizes carry negative tracking so they read as one shape
 * rather than as loose digits.
 */
export const typography = {
  /** The single number a screen is about: distance while running. */
  metric: {
    fontFamily: fontFamilies.display,
    fontSize: 64,
    // Helvetica Neue Condensed Black's ascent + descent is ~1.17em. A line box
    // tighter than that clips the glyphs, so every display tier keeps slack.
    lineHeight: 76,
    fontWeight: '700',
    letterSpacing: -2.5,
  },
  hero: {
    fontFamily: fontFamilies.display,
    fontSize: 56,
    lineHeight: 66,
    fontWeight: '700',
    letterSpacing: -2,
  },
  /** Secondary metrics sitting under a `metric`: time, pace. */
  display: {
    fontFamily: fontFamilies.display,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1,
  },
  large: {
    fontFamily: fontFamilies.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  heading: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0,
  },
  /**
   * The only uppercase in the product: the small label naming a value. Tracked
   * out because uppercase at this size needs the air to stay readable.
   */
  micro: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TypeToken>;

export type TypographyVariant = keyof typeof typography;

/**
 * Tabular figures keep distance, time and pace columns aligned, and stop a
 * running clock from shifting width as the digits change.
 */
export const tabularFigures: TextStyle = {
  fontVariant: ['tabular-nums'],
};

/**
 * The trailing room a negative-tracking line needs so its last glyph cannot
 * clip on the right. Tracking trims the *advance* of the final character but not
 * its ink, so the ink overhangs the measured width; `Text` gives it back as
 * `paddingRight`. Zero for non-negative tracking, so this is safe to apply
 * everywhere. See docs/design-system.md.
 */
export function trackingSlack(letterSpacing: number | undefined): number {
  return typeof letterSpacing === 'number' && letterSpacing < 0 ? -letterSpacing + 1 : 0;
}
