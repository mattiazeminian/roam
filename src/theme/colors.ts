/**
 * ROAM color system.
 *
 * The interface is monochrome. The only chromatic surface in the product is the
 * map, which is treated separately (see docs/map-style.md).
 */

export const palette = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#6B6B6B',
  grayLight: '#E5E5E5',
  grayLighter: '#F2F2F2',
  grayMid: '#A3A3A3',
  grayDark: '#1A1A1A',
  grayElevated: '#1C1C1E',
  grayBorder: '#333333',
  /** ROAM lime — the single accent. Used as a fill, never as small text. */
  lime: '#B7FF00',
  limeDeep: '#A3E600',
  limeBright: '#C9FF3D',
} as const;

export type PaletteToken = keyof typeof palette;

/**
 * Semantic tokens. Components should reference these, never `palette` directly.
 */
export const colors = {
  light: {
    background: palette.white,
    surface: palette.grayLighter,
    border: palette.black,
    borderSubtle: palette.grayLight,
    divider: palette.grayLight,
    text: palette.black,
    textSecondary: palette.gray,
    textDisabled: palette.grayMid,
    disabled: palette.grayLight,
    inverse: palette.white,
    inverseBackground: palette.black,
    // Accent semantics. Lime is a fill/marker/route color; pair it with
    // `accentForeground` (black) so text on lime always meets contrast.
    accent: palette.lime,
    accentForeground: palette.black,
    accentMuted: 'rgba(183, 255, 0, 0.18)',
    selected: palette.lime,
    active: palette.lime,
    pressed: palette.limeDeep,
    // Surfaces and materials for floating controls.
    surfaceElevated: palette.white,
    // Translucent control fills (iOS system-fill style) so controls sit on
    // glass without looking like opaque stickers.
    fill: 'rgba(120, 120, 128, 0.12)',
    fillPressed: 'rgba(120, 120, 128, 0.20)',
    // Fallback material when the native Liquid Glass API is unavailable.
    glass: 'rgba(255, 255, 255, 0.72)',
    glassBorder: 'rgba(0, 0, 0, 0.06)',
    shadow: 'rgba(0, 0, 0, 0.12)',
  },
  dark: {
    background: palette.black,
    surface: palette.grayDark,
    border: palette.white,
    borderSubtle: palette.grayBorder,
    divider: palette.grayBorder,
    text: palette.white,
    // Dark mode uses lighter tonal variants, not inverted values, so secondary
    // text (8.3:1) and dividers stay legible on black. See docs/design-system.md.
    textSecondary: palette.grayMid,
    textDisabled: palette.gray,
    disabled: palette.grayDark,
    inverse: palette.black,
    inverseBackground: palette.white,
    accent: palette.lime,
    accentForeground: palette.black,
    accentMuted: 'rgba(183, 255, 0, 0.22)',
    selected: palette.lime,
    active: palette.lime,
    pressed: palette.limeBright,
    surfaceElevated: palette.grayElevated,
    fill: 'rgba(120, 120, 128, 0.24)',
    fillPressed: 'rgba(120, 120, 128, 0.36)',
    glass: 'rgba(28, 28, 30, 0.62)',
    glassBorder: 'rgba(255, 255, 255, 0.10)',
    shadow: 'rgba(0, 0, 0, 0.5)',
  },
} as const;

export type ColorToken = keyof typeof colors.light;
export type ThemeColors = Record<ColorToken, string>;
export type ColorSchemeName = keyof typeof colors;
