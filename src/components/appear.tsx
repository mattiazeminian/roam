import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { motion } from '@/theme';

/**
 * A short fade for content that arrives asynchronously (a run loaded from
 * storage, a chart that only exists once its data is in). It marks that
 * something changed without moving the layout, and collapses to an instant
 * appearance when Reduce Motion is on (#138).
 */
export function Appear({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View entering={FadeIn.duration(motion.mediumDuration)} style={style}>
      {children}
    </Animated.View>
  );
}
