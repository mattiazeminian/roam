import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
import { brand, motion, useTheme } from '@/theme';

// The native splash holds the screen until the first frame is painted; the
// launch animation is then ours (#141), so the two never stack.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: motion.mediumDuration });

const SPLASH_LOCKUP = require('../../assets/images/splash-icon.png');

/** Long enough to feel deliberate, short enough not to be a wait. */
const SPLASH_HOLD_MS = 950;

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
  const [splashDone, setSplashDone] = useState(false);

  // Fills a fresh install with plausible history so the interface can be
  // judged. Development only, and only when there is nothing there already.
  useEffect(() => {
    void seedSampleDataIfEmpty();
    // Hand the screen over to our own splash, which owns the animation.
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  return (
    <SettingsProvider>
      <TrainingProvider>
      <AccountProvider>
        <LocationProvider>
          <RouteProvider>
            <RunProvider>
            <View
              style={[
                styles.root,
                { backgroundColor: splashDone ? theme.background : brand.ground },
              ]}>
              {/* Light on the dark launch screen, dark once the app is up. */}
              <StatusBar style={splashDone ? 'dark' : 'light'} />
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

              {!splashDone ? <AnimatedSplash onDone={handleSplashDone} /> : null}
            </View>
          </RunProvider>
        </RouteProvider>
      </LocationProvider>
      </AccountProvider>
      </TrainingProvider>
    </SettingsProvider>
  );
}

/**
 * The launch animation: the mark zooms in, holds, then the screen eases away.
 *
 * A short, quiet beat rather than a show — it exists so the launch reads as
 * deliberate, not because a splash is owed. Reduce Motion still gets the mark,
 * just without the movement.
 */
function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const scale = useSharedValue(0.82);
  const markOpacity = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    markOpacity.value = withTiming(1, {
      duration: motion.mediumDuration,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = withTiming(1, {
      duration: motion.mediumDuration + 160,
      easing: Easing.out(Easing.cubic),
    });

    const timer = setTimeout(() => {
      scale.value = withTiming(1.06, {
        duration: motion.mediumDuration,
        easing: Easing.in(Easing.cubic),
      });
      screenOpacity.value = withTiming(
        0,
        { duration: motion.mediumDuration, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(onDone)();
          }
        },
      );
    }, SPLASH_HOLD_MS);

    return () => clearTimeout(timer);
  }, [markOpacity, scale, screenOpacity, onDone]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const lockupStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.splash, screenStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Animated.Image
        source={SPLASH_LOCKUP}
        style={[styles.splashLockup, lockupStyle]}
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.ground,
  },
  splashLockup: {
    width: 200,
    height: 259,
  },
});
