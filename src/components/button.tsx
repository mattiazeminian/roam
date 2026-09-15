import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/text';
import { usePressScale } from '@/hooks/use-press-scale';
import { layout, radii, spacing, useTheme, type ColorToken, type ThemeColors } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'accent';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
};

function resolveColors(theme: ThemeColors, variant: ButtonVariant, disabled: boolean) {
  if (disabled) {
    return {
      backgroundColor: theme.disabled,
      pressedBackground: theme.disabled,
      textColor: 'textDisabled' as ColorToken,
    };
  }

  switch (variant) {
    case 'accent':
      return {
        backgroundColor: theme.accent,
        pressedBackground: theme.pressed,
        textColor: 'accentForeground' as ColorToken,
      };
    case 'secondary':
      return {
        backgroundColor: theme.surface,
        pressedBackground: theme.disabled,
        textColor: 'text' as ColorToken,
      };
    case 'primary':
    default:
      return {
        backgroundColor: theme.inverseBackground,
        pressedBackground: theme.inverseBackground,
        textColor: 'inverse' as ColorToken,
      };
  }
}

/**
 * Soft, physical control. Rounded (not pill), no border, no gradient. Pressing
 * scales it down slightly and shifts its fill.
 */
export function Button({
  label,
  variant = 'primary',
  disabled,
  style,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const press = usePressScale();
  const colors = resolveColors(theme, variant, !!disabled);

  return (
    <Animated.View style={[press.animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={(event) => {
          press.onPressIn();
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          press.onPressOut();
          onPressOut?.(event);
        }}
        style={({ pressed }) => [
          styles.base,
          {
            backgroundColor:
              pressed && !disabled ? colors.pressedBackground : colors.backgroundColor,
            opacity: pressed && !disabled ? 0.94 : 1,
          },
        ]}
        {...rest}>
        <Text variant="body" color={colors.textColor} style={styles.label}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.small,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.controlHeight,
  },
  label: {
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
