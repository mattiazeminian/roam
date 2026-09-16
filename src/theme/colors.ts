/**
 * ROAM color system.
 *
 * ROAM is a dark product. That is an identity decision, not a preference: the
 * accent is a bright warm hue, so on white it reads around 2.3:1 and could only
 * ever be a fill. On black it reaches ~9:1, which lets it carry live data as
 * *text* — the distance while running, the selected route, the primary action.
 * The dark ground is what makes the accent usable, and it lets the map recede
 * so the route reads first.
 */

export const palette = {
  /** True black. On OLED this is the ground Apple's own dark mode uses, and it
   *  is what lets the map and the accent read as the only light in the screen. */
  black: '#000000',
  white: '#FFFFFF',

  /** iOS systemGray6 / systemGray5 in dark: the two elevation steps above black. */
  elevated: '#1C1C1E',
  elevatedHigh: '#2C2C2E',

  /**
   * ROAM orange — the single accent. Paired only with black foreground.
   *
   * Claude's warm orange family, pushed brighter so it still reads as neon on
   * a black ground: the brand terracotta `#D97757` only reaches 6.73:1 against
   * black, while this holds 8.95:1 — enough to carry live data as text rather
   * than being limited to fills.
   */
  orange: '#FF8A3D',
  orangeDeep: '#E8722A',
  orangeBright: '#FFA766',
} as const;

export type PaletteToken = keyof typeof palette;

/**
 * Semantic tokens. Components reference these, never `palette` directly.
 */
export const colors = {
  background: palette.black,
  /** Cards and list surfaces sitting on the page. */
  surface: palette.elevated,
  /** Sheets and anything that floats above content. */
  surfaceElevated: palette.elevatedHigh,

  // iOS separator colors rather than flat white alphas, which go chalky on
  // true black.
  border: 'rgba(84, 84, 88, 0.90)',
  borderSubtle: 'rgba(84, 84, 88, 0.60)',
  divider: 'rgba(84, 84, 88, 0.60)',

  // Apple's dark label ramp: pure white primary, then tinted alphas.
  text: palette.white,
  textSecondary: 'rgba(235, 235, 245, 0.60)',
  textDisabled: 'rgba(235, 235, 245, 0.30)',
  /** Labels sitting on a translucent fill, where secondary would miss AA. */
  textTertiary: 'rgba(235, 235, 245, 0.85)',

  disabled: 'rgba(120, 120, 128, 0.18)',
  inverse: palette.black,
  inverseBackground: palette.white,

  // The accent is a fill, a line or a data value — never a foreground on a
  // light surface. `accentForeground` is what sits on top of it.
  accent: palette.orange,
  accentForeground: palette.black,
  accentPressed: palette.orangeDeep,
  /** Low-alpha accent for progress tracks and selection washes. */
  accentMuted: 'rgba(255, 138, 61, 0.16)',
  selected: palette.orange,
  active: palette.orange,
  pressed: palette.orangeBright,

  /** iOS systemFill / secondarySystemFill in dark. */
  fill: 'rgba(120, 120, 128, 0.24)',
  fillPressed: 'rgba(120, 120, 128, 0.36)',

  /** Fallback material when the native Liquid Glass API is unavailable. */
  glass: 'rgba(28, 28, 30, 0.78)',
  glassBorder: 'rgba(84, 84, 88, 0.60)',
  shadow: 'rgba(0, 0, 0, 0.8)',
  /** Darkens the map beneath floating content so text stays legible. */
  scrim: 'rgba(0, 0, 0, 0.55)',
} as const;

export type ColorToken = keyof typeof colors;
export type ThemeColors = Record<ColorToken, string>;
