import { SymbolView } from 'expo-symbols';
import { useState, type ComponentProps } from 'react';
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
  /** Optional leading glyph, e.g. a play or pause mark. */
  symbol?: ComponentProps<typeof SymbolView>['name'];
};

/**
 * Press-and-hold confirmation.
 *
 * Finishing a run cannot be undone mid-run, so it is never a single tap. The
 * filling track is the progress indicator; releasing early cancels it. Pause
 * and resume reuse the same control with a much shorter hold, so a stray tap
 * cannot change the run's state but a deliberate one stays fast.
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
  symbol,
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
  const trackColor = variant === 'accent' ? 'rgba(22, 51, 0, 0.16)' : theme.borderSubtle;

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
    opacity: reduceMotion ? 1 : holding.value ? 0.85 : 1,
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
      style={[styles.base, { backgroundColor: background }]}>
      <View style={styles.content} pointerEvents="none">
        {symbol ? (
          <SymbolView name={symbol} size={layout.iconSizeSmall} tintColor={theme[labelColor]} />
        ) : null}
        <Animated.View style={labelStyle}>
          <Text variant="label" color={labelColor} style={styles.label}>
            {isHolding ? (holdingLabel ?? label) : label}
          </Text>
        </Animated.View>
      </View>
      {/* The track shows what is left as well as what is done, so the hold reads
          as a countdown rather than an open-ended press. */}
      <View style={[styles.progressTrack, { backgroundColor: trackColor }]} pointerEvents="none">
        <Animated.View style={[styles.fill, { backgroundColor: fillColor }, fillStyle]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    minHeight: layout.controlHeight,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  label: {
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
  },
  fill: {
    height: '100%',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
});
