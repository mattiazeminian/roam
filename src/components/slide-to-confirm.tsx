import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/text';
import { successFeedback } from '@/lib/haptics';
import { layout, radii, useTheme } from '@/theme';

const THUMB = 48;
const PADDING = 4;

/** Fraction of the track that must be crossed before it counts as deliberate. */
const COMMIT_FRACTION = 0.85;

export type SlideToConfirmProps = {
  label: string;
  onComplete: () => void;
  accessibilityLabel?: string;
};

/**
 * Slide to confirm.
 *
 * Finishing a run cannot be undone mid-run, so it is deliberately not a tap and
 * not a hold either: the runner drags the thumb the length of the track. An
 * accidental finish cannot travel that far, while a deliberate slide is one
 * quick gesture. Assistive technology gets a direct activate action rather than
 * having to emulate a drag.
 *
 * Built on the platform `PanResponder` over Reanimated shared values, so it
 * needs no gesture-handler root view and adds nothing to the tree.
 */
export function SlideToConfirm({ label, onComplete, accessibilityLabel }: SlideToConfirmProps) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const committed = useSharedValue(false);

  const maxX = Math.max(0, trackWidth - THUMB - PADDING * 2);

  const complete = () => {
    if (committed.value) {
      return;
    }
    committed.value = true;
    successFeedback();
    onComplete();
  };

  const handleMove = (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
    x.value = Math.min(Math.max(startX.value + gesture.dx, 0), maxX);
  };

  const handleGrant = () => {
    startX.value = x.value;
  };

  const handleRelease = () => {
    if (maxX > 0 && x.value >= maxX * COMMIT_FRACTION) {
      x.value = withTiming(maxX, { duration: 120 }, (done) => {
        if (done) {
          runOnJS(complete)();
        }
      });
      return;
    }
    x.value = withSpring(0, { damping: 20, stiffness: 180 });
  };

  const handleTerminate = () => {
    x.value = withSpring(0, { damping: 20, stiffness: 180 });
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Only claim the gesture once it reads as a deliberate rightward drag, so a
    // vertical wobble or a tap is left alone.
    onMoveShouldSetPanResponder: (_event, gesture) =>
      maxX > 0 && gesture.dx > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    // Once claimed, the drag belongs to this control: it is not handed to the
    // parent or to a navigation gesture mid-slide.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: handleGrant,
    onPanResponderMove: handleMove,
    onPanResponderRelease: handleRelease,
    onPanResponderTerminate: handleTerminate,
  });

  const fillStyle = useAnimatedStyle(() => ({ width: x.value + THUMB }));
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, maxX || 1], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint="Drag to the right to confirm"
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={complete}
      style={[styles.track, { backgroundColor: theme.fill }]}
      {...panResponder.panHandlers}>
      <Animated.View
        style={[styles.fill, { backgroundColor: theme.accent }, fillStyle]}
        pointerEvents="none"
      />
      <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
        <Text variant="label" color="textSecondary" style={styles.label}>
          {label}
        </Text>
      </Animated.View>
      <Animated.View
        style={[styles.thumb, { backgroundColor: theme.accentForeground }, thumbStyle]}
        pointerEvents="none">
        <SymbolView name="stop.fill" size={layout.iconSizeSmall} tintColor={theme.accent} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB + PADDING * 2,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: PADDING,
    top: PADDING,
    bottom: PADDING,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
  },
  labelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: THUMB,
  },
  label: {
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  thumb: {
    position: 'absolute',
    left: PADDING,
    top: PADDING,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
