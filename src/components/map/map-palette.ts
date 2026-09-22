/**
 * Map-specific neutrals, per appearance (#145).
 *
 * The map is intentionally exempt from the UI color tokens (see
 * docs/map-style.md): it needs its own land, subtle roads and restrained labels
 * so the route stays visually dominant. This is the only place raw map colors
 * live. Route and marker colors still come from the theme.
 *
 * The dark set is not the light one darkened by an overlay: land sits below
 * the UI ground so the map reads as a surface, roads lift gently above it, and
 * labels stay legible without competing with the route.
 */

import { useAppearance } from '@/theme';

export const lightMapPalette = {
  /** Sits a touch below the canvas so the map reads as a distinct surface. */
  land: '#F1F1EE',
  building: '#E6E7E3',
  minorRoad: '#DCDDD8',
  majorRoad: '#C4C5BF',
  label: '#6E706C',
  /**
   * Casing drawn under a route line. On light land the lime alone has too
   * little separation, so the selected route gets a dark green outline: the
   * line keeps its accent while gaining an edge against the map.
   */
  routeCasing: '#163300',
} as const;

export const darkMapPalette = {
  land: '#141612',
  building: '#1D201A',
  minorRoad: '#2A2E26',
  majorRoad: '#3A3F35',
  label: '#9AA094',
  /** On dark land the lime already separates; a light casing adds the edge. */
  routeCasing: '#0A0B08',
} as const;

export type MapColors = { [K in keyof typeof lightMapPalette]: string };

export function useMapPalette(): MapColors {
  return useAppearance() === 'dark' ? darkMapPalette : lightMapPalette;
}
