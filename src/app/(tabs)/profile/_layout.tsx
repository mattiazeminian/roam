import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Profile owns its own stack (#119). History, a run's detail, Settings and the
 * account screen all push within the tab, so the tab bar stays visible and
 * Profile keeps its position. Activity is no longer a separate tab: it is
 * History, reached from here.
 */
export default function ProfileStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="history" />
      <Stack.Screen name="run-detail" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
