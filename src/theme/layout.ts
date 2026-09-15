/**
 * Layout constants for floating controls and the native-glass tab bar.
 */
export const layout = {
  /** Horizontal inset for floating controls. */
  floatingInset: 16,
  /** Height of the floating tab bar, excluding its bottom margin. */
  tabBarHeight: 56,
  /** Gap between the tab bar and the safe-area bottom. */
  tabBarMargin: 8,
  /** Space screens must leave below floating content when the tab bar is present. */
  tabBarClearance: 64,
  /** Standard control height / minimum touch target. */
  controlHeight: 52,
} as const;
