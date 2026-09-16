/**
 * Map-specific neutrals.
 *
 * The map is intentionally exempt from the UI color tokens (see
 * docs/map-style.md): it needs its own land, subtle roads and restrained labels
 * so the route stays visually dominant. This is the only place raw map colors
 * live. Route and marker colors still come from the theme.
 *
 * Land sits a touch above the page ground so the map reads as a surface rather
 * than as a hole in the screen, and roads stay quiet enough that an accented route
 * drawn over them is never in competition.
 */
export const mapPalette = {
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

export type MapColors = typeof mapPalette;

export function useMapPalette(): MapColors {
  return mapPalette;
}
