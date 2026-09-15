import { useCallback } from 'react';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { motion } from '@/theme';

/**
 * Tactile press feedback: immediate scale-down on touch, then a short
 * high-damping spring back. Native-feeling, no visible bounce.
 */
export function usePressScale(pressedScale: number = motion.pressScale) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    scale.value = withTiming(pressedScale, { duration: motion.pressInDuration });
  }, [pressedScale, scale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, { ...motion.pressSpring });
  }, [scale]);

  return { animatedStyle, onPressIn, onPressOut };
}
