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
    lineHeight: 66,
    fontWeight: '700',
    letterSpacing: -2.5,
  },
  hero: {
    fontFamily: fontFamilies.display,
    fontSize: 56,
    lineHeight: 58,
    fontWeight: '700',
    letterSpacing: -2,
  },
  /** Secondary metrics sitting under a `metric`: time, pace. */
  display: {
    fontFamily: fontFamilies.display,
    fontSize: 34,
    lineHeight: 38,
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
