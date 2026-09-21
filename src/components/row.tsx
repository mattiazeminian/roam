import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { layout, spacing, useTheme, type ColorToken } from '@/theme';

export type RowProps = {
  /** Simple text label. Use `children` instead for a custom leading layout. */
  label?: string;
  labelColor?: ColorToken;
  children?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Trailing content (a value, a control). */
  trailing?: ReactNode;
  showChevron?: boolean;
  /** A destructive action reads in the emphasis ink. */
  destructive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * One row inside a `Card`: label, optional value/control, optional chevron. It
 * is the single row implementation settings, account and any grouped list share
 * (#137), so heights and dividers stay consistent.
 */
export function Row({
  label,
  labelColor = 'text',
  children,
  onPress,
  onLongPress,
  trailing,
  showChevron = false,
  destructive = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: RowProps) {
  const theme = useTheme();

  const content = (
    <>
      {children ?? (
        <Text variant="body" color={destructive ? 'danger' : labelColor}>
          {label}
        </Text>
      )}
      <View style={styles.spacer} />
      {trailing}
      {showChevron ? (
        <SymbolView
          name="chevron.right"
          size={layout.iconSizeSmall}
          tintColor={theme.textSecondary}
        />
      ) : null}
    </>
  );

  if (!onPress && !onLongPress) {
    return <View style={[styles.row, style]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.row,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.minTouchTarget + spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  spacer: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.35,
  },
});
