import { colors, type ThemeColors } from './colors';

/**
 * Roam renders dark in every appearance. See `colors.ts` for why the accent
 * depends on it.
 */
export function useTheme(): ThemeColors {
  return colors;
}
