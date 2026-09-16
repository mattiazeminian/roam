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
    // Reanimated's SharedValue is mutable by design — `.value` assignment is
    // its documented API, not React state, so it is exempt from the
    // immutability rule this otherwise correctly enforces.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withTiming(pressedScale, { duration: motion.pressInDuration });
  }, [pressedScale, scale]);

  const onPressOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSpring(1, { ...motion.pressSpring });
  }, [scale]);

  return { animatedStyle, onPressIn, onPressOut };
}
