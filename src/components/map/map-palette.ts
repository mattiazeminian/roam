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
  land: '#000000',
  building: '#141414',
  minorRoad: '#242424',
  majorRoad: '#3A3A3C',
  label: 'rgba(235, 235, 245, 0.60)',
} as const;

export type MapColors = typeof mapPalette;

export function useMapPalette(): MapColors {
  return mapPalette;
}
