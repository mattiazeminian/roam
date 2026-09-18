import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

// Imported for its side effect: it registers the background location task with
// TaskManager, which must happen at the bundle's global scope so the task
// exists when the OS wakes the app in the background (#30).
import '@/services/background-location';
import { AccountProvider } from '@/services/account-context';
import { LocationProvider } from '@/services/location-context';
import { RouteProvider } from '@/services/route-context';
import { RunProvider } from '@/services/run-context';
import { SettingsProvider } from '@/services/settings-context';
import { seedSampleDataIfEmpty } from '@/services/sample-data';
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

  // Fills a fresh install with plausible history so the interface can be
  // judged. Development only, and only when there is nothing there already.
  useEffect(() => {
    void seedSampleDataIfEmpty();
  }, []);

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
              {/* A run in progress is not dismissable: the only way out is to
                  finish it. Leaving the swipe-back gesture on meant a rightward
                  drag could pop the screen mid-run. */}
              <Stack.Screen
                name="run"
                options={{
                  animation: 'fade',
                  animationDuration: motion.mediumDuration,
                  gestureEnabled: false,
                }}
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
              <Stack.Screen name="schedule" />
              <Stack.Screen name="generate-route" />
              <Stack.Screen name="generating" options={{ gestureEnabled: false, animation: 'fade', animationDuration: motion.mediumDuration }} />
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
