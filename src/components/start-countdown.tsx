import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/text';
import { impactLight, impactMedium } from '@/lib/haptics';
import { palette, spacing } from '@/theme';
import { useSettings } from '@/services/settings-context';

/** One second per step, then a short beat on GO before the run actually begins. */
const STEP_MS = 1000;
const GO_HOLD_MS = 550;
/** How long the takeover fades out over the run screen's own fade-in. */
const HANDOVER_MS = 300;
/** A hair beyond the fade, so removal happens while it is already invisible. */
const HANDOVER_REMOVE_MS = 340;

/**
 * A 3-2-1-GO countdown shown over the screen a run starts from.
 *
 * Starting a run the instant the button is tapped meant the tracker's first
 * accepted fix often arrived while the phone was still settling and the runner
 * was still getting ready, which is exactly when a fix is least trustworthy.
 * The countdown gives the GPS a moment to converge and the runner an
 * unambiguous start signal.
 *
 * A full-screen brand-black takeover, like Nike's. It is a modal, so it covers
 * the tab bar and the whole screen. On GO it does not just disappear: it hands
 * over to the run screen by fading out *while* that screen fades in, so the
 * screen the run was started from is never shown in between.
 */
export function StartCountdown({ onComplete }: { onComplete: () => void }) {
  const reduceMotion = useReducedMotion();
  const { settings } = useSettings();
  const duration = settings.startCountdownSeconds;
  const sequence = useMemo(
    () => [...Array.from({ length: duration }, (_, index) => String(duration - index)), 'GO'],
    [duration],
  );
  const [label, setLabel] = useState<string>(sequence[0] ?? 'GO');

  /** 0 → 1 across one step. Drives both the grow and the dissolve. */
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  /** 0 while counting a number, 1 on GO (which holds instead of dissolving). */
  const goPhase = useSharedValue(0);
  /** The whole takeover's opacity, so GO can hand over rather than cut. */
  const overlay = useSharedValue(1);

  // The countdown must not restart if the parent re-creates its callback, so
  // the latest one is read from a ref rather than being an effect dependency.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Navigate now and fade the takeover out with it: the run screen fades in
    // underneath, so the runner goes straight from GO to the run.
    const handOver = () => {
      if (cancelled) {
        return;
      }
      if (!reduceMotion) {
        overlay.value = withTiming(0, {
          duration: HANDOVER_MS,
          easing: Easing.out(Easing.quad),
        });
      }
      onCompleteRef.current();
    };

    const show = (index: number) => {
      if (cancelled) {
        return;
      }
      const next = sequence[index];
      const isGo = next === 'GO';
      setLabel(next);
      goPhase.value = isGo ? 1 : 0;

      if (isGo) {
        impactMedium();
      } else {
        impactLight();
      }
      AccessibilityInfo.announceForAccessibility(isGo ? 'Go' : next);

      if (isGo) {
        // GO eases in, then holds until the hand-over.
        if (!reduceMotion) {
          progress.value = 0;
          progress.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
        }
        timers.push(setTimeout(handOver, GO_HOLD_MS));
        return;
      }

      if (!reduceMotion) {
        progress.value = 0;
        progress.value = withTiming(1, { duration: STEP_MS, easing: Easing.linear });
      }
      timers.push(setTimeout(() => show(index + 1), STEP_MS));
    };

    show(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [goPhase, overlay, progress, reduceMotion, sequence]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value }));

  const numberStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return { opacity: 1, transform: [{ scale: 1 }] };
    }
    const p = progress.value;
    if (goPhase.value === 1) {
      // GO arrives and stays put.
      return {
        opacity: interpolate(p, [0, 0.5], [0, 1], Extrapolation.CLAMP),
        transform: [{ scale: interpolate(p, [0, 1], [0.9, 1], Extrapolation.CLAMP) }],
      };
    }
    // A number: fade up, grow past its size, then dissolve upward.
    return {
      opacity: interpolate(p, [0, 0.16, 0.68, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 0.55, 1], [0.72, 1, 1.42], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => {}}>
      <Animated.View style={[styles.root, overlayStyle]} accessibilityViewIsModal>
        {/* The takeover is always dark, so the status bar must read light on it
            even in the light appearance. */}
        <StatusBar style="light" />
        <Animated.View style={numberStyle}>
          <Text
            variant="metric"
            color="accent"
            tabular
            maxFontSizeMultiplier={1}
            numberOfLines={1}
            accessibilityLiveRegion="assertive"
            style={styles.countdownNumber}>
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Wires a one-tap start to the countdown. `begin` records what to do when the
 * countdown finishes; the caller renders `StartCountdown` while `counting`, and
 * `complete` is its `onComplete`.
 */
export function useStartCountdown() {
  const { settings } = useSettings();
  const [counting, setCounting] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const removing = useRef<ReturnType<typeof setTimeout> | null>(null);

  const begin = useCallback((action: () => void) => {
    pending.current = action;
    if (settings.startCountdownSeconds === 0) {
      pending.current = null;
      action();
      return;
    }
    setCounting(true);
  }, [settings.startCountdownSeconds]);

  const complete = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    // Start the run first, then drop the (now invisible) takeover once the run
    // screen's own transition has finished. Removing it immediately would flash
    // the screen the run was started from.
    action?.();
    if (removing.current) {
      clearTimeout(removing.current);
    }
    removing.current = setTimeout(() => {
      removing.current = null;
      setCounting(false);
    }, HANDOVER_REMOVE_MS);
  }, []);

  useEffect(
    () => () => {
      if (removing.current) {
        clearTimeout(removing.current);
      }
    },
    [],
  );

  return { counting, begin, complete };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    // The brand ground, always: a deliberate black takeover before the run.
    backgroundColor: palette.nearBlack,
  },
  countdownNumber: {
    // Full width so the numeral centres with room either side. The tracking is
    // reset here so a single glyph cannot clip on its right edge; the tall line
    // box gives the same room vertically.
    width: '100%',
    minHeight: 110,
    lineHeight: 110,
    letterSpacing: 0,
    textAlign: 'center',
  },
});
