import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { Text } from '@/components/text';
import { motion, radii, spacing, useTheme } from '@/theme';

/**
 * A small floating readout shown while ROAM is finding routes. The message
 * eases in on change; the lime dot marks it as active.
 */
export function GenerationStatus({ message }: { message: string }) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: motion.fastDuration,
      easing: Easing.out(Easing.quad),
    });
  }, [message, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 4 }],
  }));

  return (
    <GlassSurface radius={radii.pill} style={styles.surface}>
      <View style={[styles.dot, { backgroundColor: theme.accent }]} />
      <Animated.View style={style}>
        <Text variant="label" color="text" style={styles.text}>
          {message}
        </Text>
      </Animated.View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontWeight: '600',
  },
});
