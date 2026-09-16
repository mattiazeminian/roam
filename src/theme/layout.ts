/**
 * Layout system.
 *
 * Screens and components reference these rather than literals, so a spacing or
 * sizing decision is made once. The only numbers that belong in a component are
 * ones dictated by a specific native control.
 */
export const layout = {
  /**
   * Horizontal margin for page content and for controls floating over the map.
   * Both use the same value so a floating panel lines up with list content on
   * the screen behind it.
   */
  screenMargin: 16,

  /** Primary controls: buttons and anything of equal weight. */
  controlHeight: 52,
  /** Secondary controls sitting inside a surface, e.g. distance presets. */
  controlHeightCompact: 44,
  /** Circular controls: map buttons and the distance steppers. */
  controlSizeCircular: 48,

  /** Minimum iOS touch target. Nothing tappable may be smaller. */
  minTouchTarget: 44,

  /** SF Symbol sizes. `icon` is the default for floating map controls. */
  iconSize: 20,
  iconSizeSmall: 16,

  /** Small status dots (location, GPS signal). */
  indicatorSize: 8,

  /** Approximate height of the native tab bar, excluding its bottom margin. */
  tabBarHeight: 56,
  /** Gap between the tab bar and the safe-area bottom. */
  tabBarMargin: 8,
  /** Space screens must leave below floating content when the tab bar is present. */
  tabBarClearance: 68,

  /** Height of an inline map preview on a summary or detail screen. */
  mapPreviewHeight: 280,
} as const;
