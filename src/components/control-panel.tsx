import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, spacing, useTheme } from '@/theme';

export type ControlPanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra space above the safe-area inset at the bottom. */
  bottomInset?: number;
  /**
   * Reserve the home-indicator inset. Turn this off when the panel has been
   * lifted onto the keyboard, which already covers that area.
   */
  safeArea?: boolean;
};

/**
 * The region that holds a screen's controls beneath the map.
 *
 * This replaced a glass bottom sheet. Two problems with that: a sheet's shape —
 * rounded top corners, a shadow, a translucent material — promises it can be
 * dismissed, and none of these can be; and it meant Home (an opaque panel) and
 * Routes/Run (a glass sheet) used two different treatments for the same job.
 *
 * So there is one treatment: opaque surface, a single hairline ring along the
 * top edge, square corners. Depth comes from the ring, not from a shadow —
 * design.md's elevation model.
 */
export function ControlPanel({
  children,
  style,
  bottomInset = spacing.lg,
  safeArea = true,
}: ControlPanelProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.borderSubtle,
          paddingBottom: (safeArea ? insets.bottom : 0) + bottomInset,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
  },
});
