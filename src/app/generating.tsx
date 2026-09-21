import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { useRoutes } from '@/services/route-context';
import { layout, spacing, useTheme } from '@/theme';

/** Long enough to read as deliberate work, short enough not to be a wait. */
const MIN_DURATION_MS = 3500;

/** The mark, on the light canvas. */
const MARK = require('../../assets/images/mark-green.png');

/**
 * Generating — the moment a route is built.
 *
 * The search is already running when this opens; this screen exists so that
 * three seconds of work is a considered moment rather than a frozen button. The
 * brand mark — a route that ends where it began — breathes while the search
 * runs. There is deliberately no staged checklist or percentage, because the
 * search is a single call with no milestones to report honestly.
 */
export default function GeneratingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status, errorMessage, retry } = useRoutes();
  const reduceMotion = useReducedMotion();

  const sawFinding = useRef(false);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status === 'finding') {
      sawFinding.current = true;
      return;
    }
    // Only hand over once this screen has seen its own search run, so arriving
    // with an old "ready" state cannot bounce straight through.
    if (status === 'ready' && sawFinding.current && minElapsed) {
      router.replace('/routes');
    }
  }, [status, minElapsed]);

  const failed = status === 'error';

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.background, paddingTop: insets.top + spacing.xs },
      ]}>
      {/* A runner who changes their mind, or whose search is taking too long,
          must not be stuck here until it succeeds or fails. */}
      <MapControl
        symbol="chevron.left"
        accessibilityLabel="Cancel and go back"
        onPress={() => router.back()}
      />

      <View style={styles.stage}>
        {!failed ? <Mark reduceMotion={reduceMotion} /> : null}
        <Text variant="display" style={styles.headline}>
          {failed ? 'That did not work' : 'Building your route'}
        </Text>
        <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
          {failed
            ? (errorMessage ?? 'Roam could not find a route near you.')
            : 'Finding a route with fewer turns and useful paths.'}
        </Text>
      </View>

      {failed ? (
        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Button label="Try again" variant="accent" onPress={() => void retry()} />
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <View style={{ paddingBottom: insets.bottom + spacing.lg }} />
      )}
    </View>
  );
}

/**
 * The brand mark, breathing. It is a route that closes on itself, so it already
 * reads as "a loop being worked out" — the motion only says the search is
 * alive. Reduce Motion holds it still.
 */
function Mark({ reduceMotion }: { reduceMotion: boolean }) {
  const breath = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [breath, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + breath.value * 0.45,
    transform: [{ scale: 0.95 + breath.value * 0.05 }],
  }));

  return <Animated.Image source={MARK} style={[styles.mark, style]} accessibilityIgnoresInvertColors />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: 128,
    height: 128,
    marginBottom: spacing.lg,
  },
  headline: {
    textAlign: 'center',
  },
  actions: {
    gap: spacing.xs,
  },
});
