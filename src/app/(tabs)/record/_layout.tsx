import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Record owns its own stack (#119, #116). Record is the fastest way into a run
 * and stays a peer destination; the active run itself leaves the shell.
 */
export default function RecordStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
