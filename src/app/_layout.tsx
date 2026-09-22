import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Imported for its side effect: it registers the background location task with
// TaskManager, which must happen at the bundle's global scope so the task
// exists when the OS wakes the app in the background (#30).
import '@/services/background-location';
import { RunLiveActivityBridge } from '@/components/run-live-activity-bridge';
import { AccountProvider } from '@/services/account-context';
import { LocationProvider } from '@/services/location-context';
import { RouteProvider } from '@/services/route-context';
import { RunProvider } from '@/services/run-context';
import { SettingsProvider, useSettings } from '@/services/settings-context';
import { seedSampleDataIfEmpty } from '@/services/sample-data';
import { TrainingProvider } from '@/services/training-context';
import { AppearanceProvider, motion, useAppearance, useTheme } from '@/theme';

// The native launch screen is the only splash: the mark on the brand ground,
// fading into the app. There is deliberately no second, in-app splash — two
// marks in a row read as the logo jumping rather than one deliberate entry.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: motion.mediumDuration });

/**
 * The app shell.
 *
 * The four destinations live in the `(tabs)` group behind a native tab bar
 * (#113), each with its own nested stack (#119). Everything registered here is
 * a flow that deliberately leaves that shell: onboarding, route selection and
 * generation, the active run and its summary, share-link entry, and the
 * location-search modal.
 *
 * Appearance (#145) is resolved from the stored preference inside the settings
 * provider, then provided to every `useTheme` below.
 */
export default function RootLayout() {
  useEffect(() => {
    // Fills a fresh install with plausible history so the interface can be
    // judged. Development only, and only when there is nothing there already.
    void seedSampleDataIfEmpty();
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SettingsProvider>
      <AppearanceGate>
        <TrainingProvider>
          <AccountProvider>
            <LocationProvider>
              <RouteProvider>
                <RunProvider>
                  <RunLiveActivityBridge />
                  <AppShell />
                </RunProvider>
              </RouteProvider>
            </LocationProvider>
          </AccountProvider>
        </TrainingProvider>
      </AppearanceGate>
    </SettingsProvider>
  );
}

/** Bridges the stored appearance preference into the theme provider. */
function AppearanceGate({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  return <AppearanceProvider preference={settings.appearance}>{children}</AppearanceProvider>;
}

/** The themed shell: background, status bar and the root stack. */
function AppShell() {
  const theme = useTheme();
  const scheme = useAppearance();

  return (
    <GestureHandlerRootView style={styles.root}>
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
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
        {/* Route generation and selection are full-screen flows that
            deliberately leave the tab shell. Browsing screens —
            history, a run's detail, settings, the account screen and
            the saved-routes list — push within their tab instead
            (#119). */}
        <Stack.Screen name="generate-route" />
        <Stack.Screen name="generating" options={{ gestureEnabled: false, animation: 'fade', animationDuration: motion.mediumDuration }} />
        {/* A route opened from a share link lands here, then hands off
            to the normal selection flow (#23). */}
        <Stack.Screen name="shared-route" />
        {/* Choosing a start place is a modal decision, not a destination. */}
        <Stack.Screen name="location-search" options={{ presentation: 'modal' }} />
        {/* Adding a shoe is a short, self-contained pick. */}
        <Stack.Screen name="add-shoe" options={{ presentation: 'modal' }} />
      </Stack>
    </View>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
