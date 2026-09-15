import { useColorScheme } from '@/hooks/use-color-scheme';

import { colors, type ColorSchemeName, type ThemeColors } from './colors';

/**
 * Resolves the semantic color tokens for the current color scheme.
 */
export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  const name: ColorSchemeName = scheme === 'dark' ? 'dark' : 'light';
  return colors[name];
}
