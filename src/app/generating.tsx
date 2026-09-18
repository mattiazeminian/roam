import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { useRoutes } from '@/services/route-context';
import { layout, spacing, useTheme } from '@/theme';

/** Long enough to read as deliberate work, short enough not to be a wait. */
const MIN_DURATION_MS = 3500;
const STEP_INTERVAL_MS = 640;

const STEPS = [
  'Reading the map',
  'Finding paths around you',
  'Following the quiet streets',
  'Checking the turns',
  'Almost there',
];

const PARTICLE_COUNT = 18;

/**
 * Generating — the moment a route is built.
 *
 * The search is already running when this opens; this screen exists so that
 * three seconds of work is a considered moment rather than a frozen button. The
 * words are the real steps the router and the quality scorer take, in order.
 */
export default function GeneratingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status, errorMessage, retry } = useRoutes();
  const reduceMotion = useReducedMotion();

  const sawFinding = useRef(false);
  const [step, setStep] = useState(0);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      STEP_INTERVAL_MS,
    );
    return () => clearInterval(timer);
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
        { backgroundColor: theme.background, paddingTop: insets.top + spacing.xxl },
      ]}>
      <View style={styles.stage}>
        {!failed ? <ParticleField reduceMotion={reduceMotion} /> : null}
        <Text variant="micro" color="textSecondary">
          {failed ? 'NO ROUTE YET' : 'GENERATING'}
        </Text>
        <Text variant="large" style={styles.headline}>
          {failed ? 'That did not work' : 'Building your route'}
        </Text>
        <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
          {failed ? (errorMessage ?? 'ROAM could not find a route near you.') : STEPS[step]}
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
 * Dots travelling outward from the mark and fading, so the work has motion
 * without a spinner. Reduce Motion replaces it with a still, quiet field.
 */
function ParticleField({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <View style={styles.particles} pointerEvents="none">
      {Array.from({ length: PARTICLE_COUNT }, (_, index) => (
        <Particle key={index} index={index} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function Particle({ index, reduceMotion }: { index: number; reduceMotion: boolean }) {
  const theme = useTheme();
  const progress = useSharedValue(reduceMotion ? 0.5 : 0);
  const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
  const radius = 90;

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    progress.value = withDelay(
      index * 90,
      withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [index, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.3 : 1 - progress.value,
    transform: [
      { translateX: Math.cos(angle) * progress.value * radius },
      { translateY: Math.sin(angle) * progress.value * radius },
      { scale: 1 - progress.value * 0.6 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        { backgroundColor: index % 3 === 0 ? theme.accent : theme.textSecondary },
        style,
      ]}
    />
  );
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
    gap: spacing.xs,
  },
  headline: {
    textAlign: 'center',
  },
  particles: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actions: {
    gap: spacing.xs,
  },
});
