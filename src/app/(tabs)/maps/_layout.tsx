import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Maps owns its own stack (#119): the saved-routes list and a route's details
 * push within the tab, so the tab bar stays visible and Maps keeps its place.
 * Route generation and selection stay full-screen flows at the root.
 */
export default function MapsStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="favorites" />
    </Stack>
  );
}
