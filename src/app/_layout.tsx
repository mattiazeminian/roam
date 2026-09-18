import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Imported for its side effect: it registers the background location task with
// TaskManager, which must happen at the bundle's global scope so the task
// exists when the OS wakes the app in the background (#30).
import '@/services/background-location';
import { AccountProvider } from '@/services/account-context';
import { LocationProvider } from '@/services/location-context';
import { RouteProvider } from '@/services/route-context';
import { RunProvider } from '@/services/run-context';
import { SettingsProvider } from '@/services/settings-context';
import { TrainingProvider } from '@/services/training-context';
import { motion, useTheme } from '@/theme';

/**
 * The app shell.
 *
 * The four destinations live in the `(tabs)` group behind a native tab bar
 * (#113). Everything registered here is a flow that deliberately leaves that
 * shell: onboarding, route selection, the active run and its summary, and the
 * browsing screens pushed over the tabs.
 */
export default function RootLayout() {
  const theme = useTheme();

  return (
    <SettingsProvider>
      <TrainingProvider>
      <AccountProvider>
        <LocationProvider>
          <RouteProvider>
            <RunProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.background },
              }}>
              <Stack.Screen name="(tabs)" />
              {/* The introduction replaces the app, so there is no back gesture
                  into a half-started shell (#19). */}
              <Stack.Screen
                name="onboarding"
                options={{ animation: 'fade', animationDuration: motion.mediumDuration, gestureEnabled: false }}
              />
              <Stack.Screen
                name="routes"
                options={{ animation: 'fade', animationDuration: motion.mediumDuration }}
              />
              <Stack.Screen
                name="run"
                options={{ animation: 'fade', animationDuration: motion.mediumDuration }}
              />
              {/* The summary replaces the run, so it has no back gesture. */}
              <Stack.Screen
                name="run-summary"
                options={{
                  animation: 'fade',
                  animationDuration: motion.mediumDuration,
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen name="history" />
              <Stack.Screen name="favorites" />
              <Stack.Screen name="run-detail" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="account" />
              {/* A plan is created in a sheet, not a journey of its own. */}
              <Stack.Screen name="plan" options={{ presentation: 'modal' }} />
              {/* A route opened from a share link lands here, then hands off
                  to the normal selection flow (#23). */}
              <Stack.Screen name="shared-route" />
              {/* Choosing a start place is a modal decision, not a destination. */}
              <Stack.Screen name="location-search" options={{ presentation: 'modal' }} />
            </Stack>
          </RunProvider>
        </RouteProvider>
      </LocationProvider>
      </AccountProvider>
      </TrainingProvider>
    </SettingsProvider>
  );
}
