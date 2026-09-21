import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { spacing } from '@/theme';

export type SectionHeaderProps = {
  title: string;
  /**
   * `micro` is the quiet uppercase label that names a group; `title` is a
   * full section heading. Defaults to `micro`.
   */
  emphasis?: 'micro' | 'title';
  action?: {
    label: string;
    onPress: () => void;
    accessibilityLabel?: string;
  };
  style?: StyleProp<ViewStyle>;
};

/**
 * The row that names a section, with an optional action on the right. One
 * implementation so every screen's section headings line up and read the same
 * (#137).
 */
export function SectionHeader({ title, emphasis = 'micro', action, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text variant={emphasis === 'title' ? 'title' : 'micro'} color={emphasis === 'title' ? 'text' : 'textSecondary'}>
        {title}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          hitSlop={spacing.md}>
          <Text variant="label" color="accentText">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
