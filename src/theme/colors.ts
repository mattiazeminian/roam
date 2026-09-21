/**
 * ROAM color system — adapted from docs/design.md (Wise).
 *
 * The governing rule, taken from design.md and confirmed by measurement: the
 * green is a *fill*, never a foreground. `#9fe870` on the off-white canvas is
 * 1.42:1, so any green text would be unreadable. Emphasis in type is carried by
 * Dark Green (`accentText`, 13.44:1) instead, which keeps the brand present in
 * the big numbers without putting lime on white.
 *
 * One deliberate deviation from design.md: its neutral Gray `#868685` measures
 * 3.52:1 on the canvas and fails AA for body text, so secondary copy uses Warm
 * Dark `#454745` (9.05:1) and the gray is kept for disabled states only. The
 * brief ranks accessibility above Wise fidelity.
 */

export const palette = {
  /** Near-black with a warm green undertone — design.md's primary. */
  nearBlack: '#0E0F0C',
  /** The canvas. Warm rather than pure white, so the UI does not glare. */
  offWhite: '#FBFBF9',
  white: '#FFFFFF',

  /**
   * The brand lime — a hot chartreuse, brighter and yellower than the old
   * Wise green, matching the club-poster feel (#141 follow-up). Fills only.
   */
  green: '#CDF24B',
  /** Pressed/hover lime. */
  greenPastel: '#E4FF9E',
  greenDeep: '#B6DD2B',
  /** Deep, near-black green, kept for the rare place a green ink is wanted. */
  greenDark: '#163300',
  /** Soft lime surface for badges and quiet emphasis. */
  greenMint: '#F2FCD8',

  /** Secondary text and borders. */
  warmDark: '#454745',
  /** design.md's Gray — fails AA on the canvas, so disabled states only. */
  gray: '#868685',
  /** Subtle green-tinted light surface. */
  lightSurface: '#E8EBE6',
} as const;

export type PaletteToken = keyof typeof palette;

export const colors = {
  background: palette.offWhite,
  /** Cards and grouped rows sit lighter than the canvas. */
  surface: palette.white,
  /** Sheets and anything presented above content. */
  surfaceElevated: palette.white,

  // Ring borders rather than shadows — design.md's elevation model.
  border: 'rgba(14, 15, 12, 0.12)',
  borderSubtle: 'rgba(14, 15, 12, 0.08)',
  divider: 'rgba(14, 15, 12, 0.12)',

  text: palette.nearBlack,
  textSecondary: palette.warmDark,
  /** Labels on a translucent fill, where full strength reads better. */
  textTertiary: palette.nearBlack,
  textDisabled: palette.gray,

  disabled: 'rgba(14, 15, 12, 0.06)',
  inverse: palette.white,
  inverseBackground: palette.nearBlack,

  /** Fills, selection, the active route. Never a foreground. */
  accent: palette.green,
  /**
   * What sits on top of the accent. Near-black, as the brand's own artwork
   * sets type on the lime — not a dark green.
   */
  accentForeground: palette.nearBlack,
  /**
   * Emphasis in type — the distance, a record, a live metric. Black, like the
   * brand's artwork, which keeps the numerals at maximum contrast where the
   * lime would be near-invisible on the canvas.
   */
  accentText: palette.nearBlack,
  accentPressed: palette.greenDeep,
  /** Soft green wash for badges and progress tracks. */
  accentMuted: palette.greenMint,
  selected: palette.green,
  active: palette.green,
  pressed: palette.greenPastel,

  /** Secondary controls — design.md's subtle pill, dark green at low alpha. */
  fill: 'rgba(22, 51, 0, 0.08)',
  fillPressed: 'rgba(22, 51, 0, 0.14)',

  /** Material for floating controls over the map. */
  glass: 'rgba(255, 255, 255, 0.76)',
  glassBorder: 'rgba(14, 15, 12, 0.10)',
  /** Kept minimal on purpose: depth comes from the ring, not the shadow. */
  shadow: 'rgba(14, 15, 12, 0.12)',
  scrim: 'rgba(14, 15, 12, 0.32)',
} as const;

export type ColorToken = keyof typeof colors;
export type ThemeColors = Record<ColorToken, string>;

/**
 * The brand palette, named by role (#141).
 *
 * Deliberately small. The lime is a fill and never a foreground; the dark green
 * is what sits on it and how type is emphasised. The two grounds are the warm
 * near-black (the icon tile, the splash, inverted surfaces) and the off-white
 * canvas. Everything else in `colors` is a neutral.
 */
export const brand = {
  /** Primary brand colour. Fill only. */
  primary: palette.green,
  /** What sits on the primary, and the emphasis colour in type (13.44:1). */
  onPrimary: palette.greenDark,
  /** The dark brand ground. */
  ground: palette.nearBlack,
  /** The light brand canvas. */
  canvas: palette.offWhite,
  /** Muted lime wash, for badges and progress. */
  primaryMuted: palette.greenMint,
  /** Secondary warm dark, for secondary type on the canvas. */
  secondary: palette.warmDark,
} as const;

export type BrandToken = keyof typeof brand;
