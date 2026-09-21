import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Home owns its own stack (#119), so anything pushed from Home — the training
 * plan and the week's schedule — keeps the tab bar and Home's position. The
 * group name `(home)` keeps Home's URL at `/`.
 */
export default function HomeStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" />
      {/* A plan is created in a sheet, not a journey of its own. */}
      <Stack.Screen name="plan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="schedule" />
    </Stack>
  );
}
