/**
 * Roam color system. The tokens here are the source of truth; docs/design.md
 * (the Wise analysis the first palette was derived from) is historical and is
 * not followed. docs/design-system.md names the roles and the rules.
 *
 * The governing rule, confirmed by measurement: the green is a *fill*, never a
 * foreground. `#CDF24B` on the off-white canvas is 1.42:1, so any green text
 * would be unreadable. Emphasis in type is carried by near-black (`accentText`)
 * instead, which keeps the brand present in the big numbers without putting
 * lime on white.
 *
 * The neutral Gray `#868685` measures 3.52:1 on the canvas and fails AA for
 * body text, so secondary copy uses Warm Dark `#454745` (9.05:1) and the gray
 * is kept for disabled states only.
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

export const lightColors = {
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

  /**
   * Destructive actions only — delete, discard, remove. Not a brand accent,
   * and never used for decoration or state other than destruction.
   */
  danger: '#B3261E',
  disabled: 'rgba(14, 15, 12, 0.06)',
  /** The quietest neutral fill — an inert inset, a skeleton. */
  fillSubtle: 'rgba(14, 15, 12, 0.04)',
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
  /** The inactive track of a progress control sitting on the accent fill. */
  accentTrack: 'rgba(22, 51, 0, 0.16)',
  /** Soft green wash for badges and progress tracks. */
  accentMuted: palette.greenMint,
  selected: palette.green,
  active: palette.green,
  pressed: palette.greenPastel,

  /** Secondary controls — design.md's subtle pill, dark green at low alpha. */
  fill: 'rgba(22, 51, 0, 0.08)',
  fillPressed: 'rgba(22, 51, 0, 0.14)',

  /** Inactive progress track and resting marks (e.g. a rest day). */
  track: 'rgba(14, 15, 12, 0.10)',
  /** Material for floating controls over the map. */
  glass: 'rgba(255, 255, 255, 0.76)',
  glassBorder: 'rgba(14, 15, 12, 0.10)',
  /** A translucent readout floating over the map. */
  overlay: 'rgba(255, 255, 255, 0.92)',
  /** Kept minimal on purpose: depth comes from the ring, not the shadow. */
  shadow: 'rgba(14, 15, 12, 0.12)',
  scrim: 'rgba(14, 15, 12, 0.32)',
} as const;

export type ColorToken = keyof typeof lightColors;
export type ThemeColors = Record<ColorToken, string>;

/** Retained for the share card, which is always the light brand treatment. */
export const colors = lightColors;

/**
 * The dark appearance (#145).
 *
 * Same semantic keys as the light set, so every screen that reads a token
 * adapts with no per-screen conditional. Deliberately not pure black and white:
 * the ground is the brand near-black, surfaces lift a step above it for
 * hierarchy, and text sits at a softer off-white. The lime accent is kept — it
 * is high-contrast on the dark ground, so emphasis in type can use it directly.
 */
export const darkColors: ThemeColors = {
  background: palette.nearBlack,
  surface: '#191B16',
  surfaceElevated: '#23261F',

  border: 'rgba(255, 255, 255, 0.16)',
  borderSubtle: 'rgba(255, 255, 255, 0.10)',
  divider: 'rgba(255, 255, 255, 0.14)',

  text: '#F2F3EF',
  textSecondary: '#A9AEA4',
  textTertiary: '#F2F3EF',
  textDisabled: '#6B6F66',

  danger: '#FF6B61',
  disabled: 'rgba(255, 255, 255, 0.08)',
  fillSubtle: 'rgba(255, 255, 255, 0.04)',
  inverse: palette.nearBlack,
  inverseBackground: '#F2F3EF',

  accent: palette.green,
  accentForeground: palette.nearBlack,
  /** On the dark ground the lime itself is legible as emphasis in type. */
  accentText: palette.green,
  accentPressed: palette.greenDeep,
  accentTrack: 'rgba(0, 0, 0, 0.28)',
  accentMuted: 'rgba(205, 242, 75, 0.16)',
  selected: palette.green,
  active: palette.green,
  pressed: palette.greenPastel,

  fill: 'rgba(255, 255, 255, 0.08)',
  fillPressed: 'rgba(255, 255, 255, 0.14)',

  track: 'rgba(255, 255, 255, 0.12)',
  glass: 'rgba(24, 26, 22, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.14)',
  overlay: 'rgba(24, 26, 22, 0.92)',
  shadow: 'rgba(0, 0, 0, 0.45)',
  scrim: 'rgba(0, 0, 0, 0.55)',
};

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
