import { router } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { impactLight } from '@/lib/haptics';
import { useSettings } from '@/services/settings-context';
import { brand, layout, spacing } from '@/theme';

const MARK = require('../../assets/images/mark-lime.png');

const STEPS = [
  {
    title: 'Set a goal',
    body: 'Tell ROAM what you are training for and the days you can run.',
  },
  {
    title: 'Get your week',
    body: 'ROAM builds a week of easy, long and hard sessions around those days.',
  },
  {
    title: 'Run, and it adapts',
    body: 'Every run moves the plan on. Move or skip a session whenever life happens.',
  },
];

/**
 * The one-time introduction (#19).
 *
 * One screen, not a carousel. Its job is to say what ROAM will do before it
 * asks for anything: set a goal, get a week, and adjust it as you go. It
 * deliberately asks for no data here — the goal and days belong in the plan
 * flow, where the answers actually do something.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { update } = useSettings();

  const finish = useCallback(
    (next: '/plan' | '/') => {
      impactLight();
      update({ hasCompletedOnboarding: true });
      router.replace(next);
    },
    [update],
  );

  return (
    <View style={[styles.root, { backgroundColor: brand.ground }]}>
      {/* A slow, soft gradient: two warm lights drifting on the dark ground.
          No image, no blur library — just large, faint fields moving. */}
      <Blob size={520} color="rgba(159, 232, 112, 0.16)" top={-180} left={-160} drift={{ x: 60, y: 40 }} duration={11000} />
      <Blob size={460} color="rgba(159, 232, 112, 0.10)" bottom={-160} right={-140} drift={{ x: -50, y: -40 }} duration={13000} />
      <Blob size={380} color="rgba(232, 235, 230, 0.05)" top={180} right={-120} drift={{ x: -40, y: 50 }} duration={15000} />

      <View style={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.brand}>
          <Image source={MARK} style={styles.mark} accessibilityIgnoresInvertColors />
          <Wordmark size="large" color="inverse" />
        </View>

        <View style={styles.copy}>
          <Text variant="display" color="inverse" accessibilityRole="header">
            Run somewhere new
          </Text>
          <Text variant="body" style={styles.lede}>
            ROAM turns a goal into a week of running you can actually keep up with.
            It does not need your history to start — it needs a goal and the days
            you can run.
          </Text>
        </View>

        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text variant="label" color="accentForeground" tabular>
                  {index + 1}
                </Text>
              </View>
              <View style={styles.stepText}>
                <Text variant="title" color="inverse">
                  {step.title}
                </Text>
                <Text variant="body" style={styles.stepBody}>
                  {step.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="Create my plan" variant="accent" onPress={() => finish('/plan')} />
          <Text
            variant="label"
            color="inverse"
            accessibilityRole="button"
            accessibilityLabel="Start running without a plan"
            onPress={() => finish('/')}
            style={styles.skip}>
            I’ll just run
          </Text>
        </View>
      </View>
    </View>
  );
}

/** One soft light field, drifting slowly back and forth. */
function Blob({
  size,
  color,
  drift,
  duration,
  top,
  left,
  right,
  bottom,
}: {
  size: number;
  color: string;
  drift: { x: number; y: number };
  duration: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [progress, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * drift.x }, { translateY: progress.value * drift.y }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.blob, { width: size, height: size, borderRadius: size / 2, backgroundColor: color, top, left, right, bottom }, style]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
    gap: spacing.xl,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: 34,
    height: 34,
  },
  copy: {
    gap: spacing.md,
  },
  lede: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  steps: {
    gap: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    gap: spacing.xxs,
  },
  stepBody: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  actions: {
    gap: spacing.md,
    alignItems: 'center',
  },
  skip: {
    paddingVertical: spacing.xs,
    color: 'rgba(255, 255, 255, 0.86)',
  },
});
