import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

const CONTAINER = 28;
const RING = 26;
const DOT = 12;

/**
 * Small, precise current-location marker: an accent center with a subtle accent
 * ring. It eases in once on mount and never pulses on its own.
 */
export function LocationMarker({
  x,
  y,
  replaySignal = 0,
}: {
  x: number;
  y: number;
  replaySignal?: number;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const entrance = useSharedValue(0);

  useEffect(() => {
    entrance.value = 0;
    entrance.value = withTiming(1, {
      duration: reduceMotion ? 0 : 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [entrance, replaySignal, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ scale: reduceMotion ? 1 : 0.5 + entrance.value * 0.5 }],
  }));

  return (
    <Animated.View
      accessible
      accessibilityLabel="Your current location"
      pointerEvents="none"
      style={[styles.container, { left: x - CONTAINER / 2, top: y - CONTAINER / 2 }, style]}>
      <View style={[styles.ring, { borderColor: theme.textSecondary }]} />
      <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.text }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: CONTAINER,
    height: CONTAINER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
  },
});
