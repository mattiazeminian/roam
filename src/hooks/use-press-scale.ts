import { useCallback } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '@/theme';

/**
 * Tactile press feedback: a short, restrained scale down on touch and a quick
 * return on release. Native-feeling timing, no bounce.
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
    scale.value = withTiming(1, { duration: motion.pressOutDuration });
  }, [scale]);

  return { animatedStyle, onPressIn, onPressOut };
}
