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
  land: '#F2F2EF',
  /** Water is a neutral, never blue: land and water stay near-identical. */
  water: '#EDEDE9',
  /** Parks are a neutral green tint, not a colour block. */
  park: '#ECEDE7',
  building: '#E7E8E4',
  minorRoad: '#E0E1DC',
  majorRoad: '#CFD0CA',
  motorway: '#C4C5BF',
  label: '#777972',
  /** The halo a label sits in, so it stays legible over roads and water. */
  labelHalo: '#F2F2EF',
  routeSecondary: '#8C9189',
  routeActive: '#B9F52B',
  track: '#163300',
  completed: '#72A51A',
  locationRing: '#163300',
  /**
   * Casing drawn under a route line. On light land the lime alone has too
   * little separation, so the selected route gets a dark green outline: the
   * line keeps its accent while gaining an edge against the map.
   */
  routeCasing: '#163300',
} as const;

export const darkMapPalette = {
  land: '#111310',
  water: '#0D0F0C',
  park: '#141710',
  building: '#1A1E17',
  minorRoad: '#23271F',
  majorRoad: '#30352B',
  motorway: '#3A4034',
  label: '#8B9184',
  labelHalo: '#111310',
  routeSecondary: '#70796A',
  routeActive: '#C5FF38',
  track: '#F2F5EB',
  completed: '#9CCB2D',
  locationRing: '#F2F5EB',
  /** On dark land the lime already separates; a light casing adds the edge. */
  routeCasing: '#0A0B08',
} as const;

export type MapColors = { [K in keyof typeof lightMapPalette]: string };

export function useMapPalette(): MapColors {
  return useAppearance() === 'dark' ? darkMapPalette : lightMapPalette;
}
