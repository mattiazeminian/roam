import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/text';
import { impactLight, successFeedback } from '@/lib/haptics';
import { layout, motion, radii, spacing, useTheme, type ColorToken } from '@/theme';

/** Long enough to be deliberate, short enough not to feel like a punishment. */
const HOLD_DURATION_MS = 1200;

export type HoldButtonProps = {
  label: string;
  /** Shown while the hold is in progress. */
  holdingLabel?: string;
  onComplete: () => void;
  accessibilityLabel?: string;
  /** Visual emphasis. `quiet` is the bare hold; `accent`/`secondary` are filled. */
  variant?: 'quiet' | 'accent' | 'secondary';
  /** How long the hold takes. Defaults to the deliberate finish hold. */
  durationMs?: number;
};

/**
 * Press-and-hold confirmation.
 *
 * Finishing a run discards nothing but cannot be undone mid-run, so it is
 * deliberately not a single tap. The filling track is the progress indicator;
 * releasing early cancels it. Pause and resume reuse the same control with a
 * much shorter hold, so a stray tap cannot change the run's state but a
 * deliberate one stays fast.
 *
 * Assistive technology gets a direct action instead of having to emulate a
 * sustained press.
 */
export function HoldButton({
  label,
  holdingLabel,
  onComplete,
  accessibilityLabel,
  variant = 'quiet',
  durationMs,
}: HoldButtonProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const holding = useSharedValue(0);
  // The swap has to be real React state: the resting label is what the control
  // is *for*, and rendering the holding copy unconditionally made the finish
  // action read "Keep holding" before it was ever touched.
  const [isHolding, setIsHolding] = useState(false);

  const background =
    variant === 'accent' ? theme.accent : variant === 'secondary' ? theme.fill : 'transparent';
  const labelColor: ColorToken =
    variant === 'accent'
      ? 'accentForeground'
      : variant === 'secondary'
        ? 'text'
        : isHolding
          ? 'text'
          : 'textSecondary';
  const fillColor = variant === 'accent' ? theme.accentPressed : theme.accent;

  const finish = () => {
    successFeedback();
    onComplete();
  };

  const handlePressIn = () => {
    impactLight();
    setIsHolding(true);
    holding.value = 1;
    progress.value = withTiming(
      1,
      { duration: durationMs ?? HOLD_DURATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) {
          progress.value = 0;
          holding.value = 0;
          runOnJS(setIsHolding)(false);
          runOnJS(finish)();
        }
      },
    );
  };

  const handlePressOut = () => {
    cancelAnimation(progress);
    setIsHolding(false);
    holding.value = 0;
    progress.value = withTiming(0, { duration: motion.microDuration });
  };

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  // The progress track is *essential* motion — it is the only thing telling the
  // runner how much longer to hold — so it is never disabled. The label's fade
  // is decorative, and that is what Reduce Motion switches off.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : holding.value ? 0.8 : 1,
  }));

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint="Press and hold to confirm"
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={finish}
      // Quiet by design: Pause is the action a runner reaches for mid-run, so
      // it keeps the filled treatment and finishing sits below it as a
      // deliberate, lower-contrast commitment.
      style={[styles.base, { backgroundColor: background }]}>
      <View style={styles.labelWrap} pointerEvents="none">
        <Animated.View style={labelStyle}>
          <Text variant="label" color={labelColor} style={styles.label}>
            {isHolding ? (holdingLabel ?? label) : label}
          </Text>
        </Animated.View>
      </View>
      {/* Progress reads along the bottom edge rather than as a fill behind the
          label: a full-height accent fill would put white-on-accent text in dark
          mode, which fails contrast badly. */}
      <Animated.View
        style={[styles.fill, { backgroundColor: fillColor }, fillStyle]}
        pointerEvents="none"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.small,
    borderCurve: 'continuous',
    minHeight: layout.minTouchTarget,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
  },
  labelWrap: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
