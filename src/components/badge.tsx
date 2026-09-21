import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { radii, spacing, useTheme } from '@/theme';

export type BadgeTone = 'neutral' | 'accent';

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
};

/**
 * A small status label — "retired", a workout state. One implementation, so
 * badges keep the same size, radius and casing everywhere (#137).
 */
export function Badge({ children, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone === 'accent' ? theme.accentMuted : theme.fill,
        },
        style,
      ]}>
      <Text variant="micro" color="textSecondary">
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radii.xs,
    borderCurve: 'continuous',
  },
});
