import { useColorScheme } from 'react-native';

/**
 * Map-specific neutrals.
 *
 * The map is intentionally exempt from the UI color tokens (see
 * docs/map-style.md): it needs its own very light land, subtle roads and
 * restrained labels so the route stays visually dominant. This is the only
 * place raw map colors live. Route and marker colors still come from the theme.
 */
export const mapPalette = {
  light: {
    land: '#F3F3F3',
    building: '#E7E7E7',
    minorRoad: '#D9D9D9',
    majorRoad: '#BDBDBD',
    label: '#8A8A8A',
  },
  dark: {
    land: '#0A0A0A',
    building: '#191919',
    minorRoad: '#2C2C2C',
    majorRoad: '#484848',
    label: '#8A8A8A',
  },
} as const;

export type MapColors = Record<keyof typeof mapPalette.light, string>;

export function useMapPalette(): MapColors {
  const scheme = useColorScheme();
  return mapPalette[scheme === 'dark' ? 'dark' : 'light'];
}
