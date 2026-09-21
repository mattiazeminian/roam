import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radii, spacing, useTheme } from '@/theme';

export type CardTone = 'surface' | 'fill';

export type CardProps = {
  children: ReactNode;
  /**
   * `surface` is the standard grouped card (a lightly-tinted white, per
   * brand.md). `fill` is the quieter green wash, for a card that should recede.
   */
  tone?: CardTone;
  /** Apply the standard inner padding. Off for cards that hold full-bleed rows. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The one grouped surface. Structure comes from a hairline ring and the tinted
 * fill, never a shadow (docs/design-system.md §5). Screens must not restate
 * their own card styling (#137).
 */
export function Card({ children, tone = 'surface', padded = true, style }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tone === 'fill' ? theme.fill : theme.surface,
          borderColor: theme.borderSubtle,
        },
        padded && styles.padded,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.md,
  },
});
