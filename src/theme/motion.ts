/**
 * Motion tokens. Short, soft and native-feeling — state changes only, no bounce
 * or decorative animation.
 */
export const motion = {
  /** Scale applied to a control while it is pressed. */
  pressScale: 0.97,
  pressInDuration: 90,
  pressOutDuration: 150,
  /** Subtle, high-damping settle for press release. No visible bounce. */
  pressSpring: { damping: 28, stiffness: 320, mass: 0.8 },
  /** General UI transitions. */
  fastDuration: 150,
  mediumDuration: 260,
  /** Route draw-in. */
  routeDrawDuration: 720,
  routeStaggerDuration: 140,
} as const;
