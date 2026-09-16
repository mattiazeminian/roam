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
import { motion, useTheme } from '@/theme';

/**
 * ROAM has no tab bar.
 *
 * The product is one journey — choose a distance, pick a route, run it — and a
 * place to look back. A two-item tab bar spent permanent chrome on a
 * destination used a fraction of the time, and cost the map 68pt on the screen
 * that matters most. History is pushed from Home instead, and Records live
 * inside History rather than as a peer destination.
 */
export default function RootLayout() {
  const theme = useTheme();

  return (
    <SettingsProvider>
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
              <Stack.Screen name="index" />
              {/* The introduction replaces Home, so there is no back gesture
                  into a half-started app (#19). */}
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
    </SettingsProvider>
  );
}
