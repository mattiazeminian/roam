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
 * Soft iOS geometry. Small controls and buttons use `small`, floating surfaces
 * use `medium`/`large`, and `pill` is reserved for genuinely round controls.
 */
export const radii = {
  none: 0,
  small: 16,
  medium: 20,
  large: 28,
  pill: 999,
} as const;

export type BorderWidthToken = keyof typeof borderWidths;
export type RadiusToken = keyof typeof radii;
