import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { motion, useTheme } from '@/theme';

export default function RootLayout() {
  const theme = useTheme();
  const scheme = useColorScheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="(tabs)" />
        {/* Route selection and the active run are full-screen, above the tabs. */}
        <Stack.Screen
          name="routes"
          options={{ animation: 'fade', animationDuration: motion.mediumDuration }}
        />
        <Stack.Screen
          name="run"
          options={{ animation: 'fade', animationDuration: motion.mediumDuration }}
        />
      </Stack>
    </>
  );
}
