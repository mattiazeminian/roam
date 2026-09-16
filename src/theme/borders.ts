import { StyleSheet } from 'react-native';

/**
 * Border widths. Borders are used sparingly — depth now comes mostly from
 * materials and spacing, not from structural 1px boxes.
 */
export const borderWidths = {
  none: 0,
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
  thick: 2,
} as const;

/**
 * Restrained iOS geometry. Buttons and inline controls use `small`, cards use
 * `medium`, the bottom sheet uses `large` on its top corners only, and `pill`
 * is reserved for genuinely round controls — chips and circular map buttons.
 *
 * Deliberately tighter than before: large radii on large surfaces read as
 * bubbly rather than premium.
 */
export const radii = {
  none: 0,
  small: 12,
  medium: 16,
  large: 20,
  pill: 999,
} as const;

export type BorderWidthToken = keyof typeof borderWidths;
export type RadiusToken = keyof typeof radii;
