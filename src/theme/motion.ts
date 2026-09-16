/**
 * ROAM's motion language.
 *
 * Four roles, not ten styles. Every animation in the app should be able to say
 * which of these it is; if it cannot, it is decoration and should be removed.
 *
 *   micro      — a control acknowledging a touch. Fast, barely perceptible.
 *   state      — something changing what it means (selected, paused, ready).
 *   transition — one region of the screen replacing another. Directional.
 *   trace      — a route drawing itself. Slow and continuous, because it is
 *                depicting distance rather than reacting to an input.
 *
 * Durations are the only timing values in the codebase; components must not
 * introduce their own.
 */
export const motion = {
  /** Scale applied to a control while it is pressed. */
  pressScale: 0.97,
  pressInDuration: 90,
  pressOutDuration: 150,
  /** Subtle, high-damping settle for press release. No visible bounce. */
  pressSpring: { damping: 28, stiffness: 320, mass: 0.8 },

  /** micro — acknowledgement, cancels, small fades. */
  microDuration: 160,
  /** state — a value or selection changing. */
  fastDuration: 150,
  /** transition — screens and regions. */
  mediumDuration: 260,

  /** trace — a route drawing itself, and the stagger between routes. */
  routeDrawDuration: 720,
  routeStaggerDuration: 140,
  /**
   * The search pulse breathing while routes are being found. Long on purpose:
   * it reads as a slow sweep of the area rather than a spinner.
   */
  searchPulseDuration: 1500,
} as const;
