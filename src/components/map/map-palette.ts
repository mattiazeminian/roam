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
    land: '#F7F7F7',
    building: '#ECECEC',
    minorRoad: '#E3E3E3',
    majorRoad: '#CFCFCF',
    label: '#9A9A9A',
  },
  dark: {
    land: '#0B0B0B',
    building: '#161616',
    minorRoad: '#242424',
    majorRoad: '#3A3A3A',
    label: '#6B6B6B',
  },
} as const;

export type MapColors = Record<keyof typeof mapPalette.light, string>;

export function useMapPalette(): MapColors {
  const scheme = useColorScheme();
  return mapPalette[scheme === 'dark' ? 'dark' : 'light'];
}
