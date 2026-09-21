import { useEffect } from 'react';
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

import { motion, useTheme } from '@/theme';

const BASE = 140;

function Ring({
  x,
  y,
  color,
  delay,
  reduceMotion,
}: {
  x: number;
  y: number;
  color: string;
  delay: number;
  reduceMotion: boolean;
}) {
  const progress = useSharedValue(reduceMotion ? 0.35 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0.35;
      return;
    }
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: motion.searchPulseDuration, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [delay, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.2 + progress.value * 0.9 }],
    opacity: 0.4 * (1 - progress.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { left: x - BASE / 2, top: y - BASE / 2, borderColor: color }, style]}
    />
  );
}

/**
 * A restrained expanding search radius around the current location, shown only
 * while Roam is looking for routes. Not a decorative pulse.
 */
export function SearchPulse({ x, y }: { x: number; y: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Ring x={x} y={y} color={theme.accent} delay={0} reduceMotion={reduceMotion} />
      <Ring x={x} y={y} color={theme.accent} delay={750} reduceMotion={reduceMotion} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: BASE,
    height: BASE,
    borderRadius: BASE / 2,
    borderWidth: 1.5,
  },
});
