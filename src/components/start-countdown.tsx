import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/text';
import { impactLight, impactMedium } from '@/lib/haptics';
import { motion, radii, spacing, useTheme } from '@/theme';

/** One second per step, then a short beat on GO before the run actually begins. */
const STEP_MS = 1000;
const GO_HOLD_MS = 550;

const SEQUENCE = ['3', '2', '1', 'GO'] as const;

/**
 * A 3-2-1-GO countdown shown over the screen a run starts from.
 *
 * Starting a run the instant the button is tapped meant the tracker's first
 * accepted fix often arrived while the phone was still settling and the runner
 * was still getting ready, which is exactly when a fix is least trustworthy.
 * The countdown gives the GPS a moment to converge and the runner an
 * unambiguous start signal.
 *
 * The timing is functional, not decorative — it still counts down under Reduce
 * Motion; only the pop is switched off.
 */
export function StartCountdown({ onComplete }: { onComplete: () => void }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [label, setLabel] = useState<string>(SEQUENCE[0]);
  const enter = useSharedValue(reduceMotion ? 1 : 0);

  // The countdown must not restart if the parent re-creates its callback, so
  // the latest one is read from a ref rather than being an effect dependency.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const show = (index: number) => {
      if (cancelled) {
        return;
      }
      const next = SEQUENCE[index];
      setLabel(next);
      if (next === 'GO') {
        impactMedium();
      } else {
        impactLight();
      }
      if (!reduceMotion) {
        enter.value = 0;
        enter.value = withTiming(1, {
          duration: motion.fastDuration,
          easing: Easing.out(Easing.cubic),
        });
      }
      // VoiceOver: the number is the only signal, so it is announced rather
      // than left to be discovered on screen.
      AccessibilityInfo.announceForAccessibility(next === 'GO' ? 'Go' : next);

      if (index + 1 < SEQUENCE.length) {
        timers.push(setTimeout(() => show(index + 1), STEP_MS));
      } else {
        timers.push(
          setTimeout(() => {
            if (!cancelled) {
              onCompleteRef.current();
            }
          }, GO_HOLD_MS),
        );
      }
    };

    show(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [enter, reduceMotion]);

  const numberStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.72 + enter.value * 0.28 }],
  }));

  const isGo = label === 'GO';

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]} accessibilityViewIsModal>
      <Text variant="micro" color="textSecondary">
        GET READY
      </Text>
      <Animated.View style={numberStyle}>
        {isGo ? (
          <View style={[styles.goPill, { backgroundColor: theme.accent }]}>
            <Text variant="metric" color="accentForeground">
              GO
            </Text>
          </View>
        ) : (
          <Text variant="metric" tabular accessibilityLiveRegion="assertive">
            {label}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * Wires a one-tap start to the countdown. `begin` records what to do when the
 * countdown finishes; the caller renders `StartCountdown` while `counting`, and
 * `complete` is its `onComplete`.
 */
export function useStartCountdown() {
  const [counting, setCounting] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const begin = useCallback((action: () => void) => {
    pending.current = action;
    setCounting(true);
  }, []);

  const complete = useCallback(() => {
    setCounting(false);
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);

  return { counting, begin, complete };
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  goPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
  },
});
