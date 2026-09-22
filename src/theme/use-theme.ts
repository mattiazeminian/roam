import { createContext, createElement, useContext, useEffect, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

import { darkColors, lightColors, type ThemeColors } from './colors';

/** The persisted appearance preference. `system` follows iOS. */
export type AppearancePreference = 'system' | 'light' | 'dark';

/** The appearance actually rendered, after resolving `system`. */
export type ResolvedScheme = 'light' | 'dark';

const AppearanceContext = createContext<ResolvedScheme>('light');

/**
 * Resolves the appearance preference against the system scheme and provides it
 * to every `useTheme` below (#145). Kept outside the settings provider so the
 * theme has no dependency on the settings module; the root layout passes the
 * stored preference in as a prop.
 *
 * `Appearance.setColorScheme` forces the native trait too, so the tab bar,
 * keyboard and system alerts match an explicit Light/Dark choice rather than
 * following the system behind the app's back.
 */
export function AppearanceProvider({
  preference,
  children,
}: {
  preference: AppearancePreference;
  children: ReactNode;
}) {
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const system = useColorScheme();
  const resolved: ResolvedScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  return createElement(AppearanceContext.Provider, { value: resolved }, children);
}

/** The resolved appearance, for the few places that need it directly. */
export function useAppearance(): ResolvedScheme {
  return useContext(AppearanceContext);
}

/**
 * The semantic colour set for the current appearance. One call site per
 * component; screens never branch on the scheme themselves.
 */
export function useTheme(): ThemeColors {
  return useAppearance() === 'dark' ? darkColors : lightColors;
}
