import { Platform, type TextStyle } from 'react-native';

/**
 * ROAM uses the native system typeface. No custom font dependency.
 */
export const fontFamilies = {
  sans: Platform.select({ ios: 'system-ui', default: undefined }),
  mono: Platform.select({ ios: 'ui-monospace', default: 'monospace' }),
} as const;

type TypeToken = Pick<
  TextStyle,
  'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'textTransform'
>;

/**
 * A deliberately small scale. Large sizes are tight and confident; labels and
 * captions are slightly tracked so they read as technical annotations.
 */
export const typography = {
  hero: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  display: {
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '600',
    letterSpacing: -1,
  },
  large: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    letterSpacing: -0.25,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 0.75,
  },
} as const satisfies Record<string, TypeToken>;

export type TypographyVariant = keyof typeof typography;

/**
 * Tabular figures keep distance, time and pace columns aligned.
 */
export const tabularFigures: TextStyle = {
  fontVariant: ['tabular-nums'],
};
