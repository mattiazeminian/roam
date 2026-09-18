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
import { Text } from '@/components/text';
import { useRoutes } from '@/services/route-context';
import { layout, radii, spacing, useTheme } from '@/theme';

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

const TRACK_WIDTH = 260;
const DASH_SPACING = 26;
const GROUND_DASHES = 12;

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
        { backgroundColor: theme.background, paddingTop: insets.top + spacing.lg },
      ]}>
      <View style={styles.topline}>
        <View style={[styles.liveDot, { backgroundColor: theme.accent }]} />
        <Text variant="micro" color="textSecondary">
          ROUTE SEARCH
        </Text>
      </View>
      <View style={styles.stage}>
        <Text variant="large" style={styles.headline}>
          {failed ? 'That did not work' : 'Building your route'}
        </Text>
        <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
          {failed
            ? (errorMessage ?? 'ROAM could not find a route near you.')
            : 'Finding a route with fewer turns and useful paths.'}
        </Text>
        {!failed ? (
          <View
            style={[styles.searchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Route generation progress"
            accessibilityValue={{ min: 0, max: STEPS.length, now: step + 1 }}>
            <Runner reduceMotion={reduceMotion} />
            <View style={styles.progressHeader}>
              <Text variant="label">{STEPS[step]}</Text>
              <Text variant="micro" color="textSecondary">
                {step + 1}/{STEPS.length}
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.fill }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${((step + 1) / STEPS.length) * 100}%`,
                    backgroundColor: theme.accent,
                  },
                ]}
              />
            </View>
            <View style={styles.stepList}>
              {STEPS.map((label, index) => {
                const complete = index < step;
                const current = index === step;
                return (
                  <View key={label} style={styles.stepRow}>
                    <View
                      style={[
                        styles.stepDot,
                        {
                          backgroundColor: complete || current ? theme.accent : theme.fill,
                          borderColor: complete || current ? theme.accent : theme.borderSubtle,
                        },
                      ]}
                    />
                    <Text
                      variant="caption"
                      color={current ? 'text' : 'textSecondary'}
                      style={complete ? styles.completedStep : undefined}>
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
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
 * A small stylized runner marking time while the route is built.
 *
 * Drawn from simple bars rather than an image, so it stays crisp and cheap: a
 * head, a torso and four limbs whose rotation follows one shared stride cycle,
 * with the ground scrolling underneath to give the running some movement.
 * Reduce Motion holds every limb at a fixed point in the cycle.
 */
function Runner({ reduceMotion }: { reduceMotion: boolean }) {
  const theme = useTheme();
  const stride = useSharedValue(0);
  const ground = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    stride.value = withRepeat(
      withTiming(1, { duration: 620, easing: Easing.linear }),
      -1,
      false,
    );
    ground.value = withRepeat(
      withTiming(1, { duration: 460, easing: Easing.linear }),
      -1,
      false,
    );
  }, [stride, ground, reduceMotion]);

  const cycle = () => {
    'worklet';
    return reduceMotion ? 0.25 : stride.value;
  };
  const swing = (degrees: number) => {
    'worklet';
    return `${Math.sin(cycle() * Math.PI * 2) * degrees}deg`;
  };

  const leftLeg = useAnimatedStyle(() => ({ transform: [{ rotate: swing(30) }] }));
  const rightLeg = useAnimatedStyle(() => ({ transform: [{ rotate: swing(-30) }] }));
  const leftArm = useAnimatedStyle(() => ({ transform: [{ rotate: swing(-26) }] }));
  const rightArm = useAnimatedStyle(() => ({ transform: [{ rotate: swing(26) }] }));
  const bob = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.abs(Math.sin(cycle() * Math.PI * 4)) * 2 }],
  }));
  const groundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reduceMotion ? 0 : -ground.value * DASH_SPACING }],
  }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.ground, groundStyle]}>
        {Array.from({ length: GROUND_DASHES }).map((_, index) => (
          <View key={index} style={[styles.dash, { backgroundColor: theme.borderSubtle }]} />
        ))}
      </Animated.View>
      <Animated.View style={[styles.runner, bob]}>
        <View style={[styles.head, { backgroundColor: theme.accent }]} />
        <View style={[styles.torso, { backgroundColor: theme.accent }]} />
        <Animated.View
          style={[styles.arm, styles.leftArm, { backgroundColor: theme.accent }, leftArm]}
        />
        <Animated.View
          style={[styles.arm, styles.rightArm, { backgroundColor: theme.accent }, rightArm]}
        />
        <Animated.View
          style={[styles.leg, styles.leftLeg, { backgroundColor: theme.accent }, leftLeg]}
        />
        <Animated.View
          style={[styles.leg, styles.rightLeg, { backgroundColor: theme.accent }, rightLeg]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
  },
  topline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  headline: {
    textAlign: 'center',
    marginTop: spacing.md,
  },
  searchCard: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  stepList: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.iconSizeSmall,
  },
  stepDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  completedStep: {
    textDecorationLine: 'line-through',
    opacity: 0.65,
  },
  track: {
    width: TRACK_WIDTH,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  ground: {
    position: 'absolute',
    bottom: 22,
    left: 0,
    flexDirection: 'row',
  },
  dash: {
    width: 14,
    height: 2,
    borderRadius: 1,
    marginRight: DASH_SPACING - 14,
  },
  runner: {
    position: 'absolute',
    bottom: 22,
    width: 36,
    height: 46,
  },
  head: {
    position: 'absolute',
    top: 0,
    left: 13,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  torso: {
    position: 'absolute',
    top: 10,
    left: 16,
    width: 4,
    height: 17,
    borderRadius: 2,
  },
  arm: {
    position: 'absolute',
    top: 12,
    width: 3,
    height: 13,
    borderRadius: 1.5,
    transformOrigin: '50% 0%',
  },
  leftArm: {
    left: 15,
  },
  rightArm: {
    left: 18,
  },
  leg: {
    position: 'absolute',
    top: 26,
    width: 3,
    height: 15,
    borderRadius: 1.5,
    transformOrigin: '50% 0%',
  },
  leftLeg: {
    left: 15,
  },
  rightLeg: {
    left: 18,
  },
  actions: {
    gap: spacing.xs,
  },
});
