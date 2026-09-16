import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
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
  /** Shows a spinner in place of the label and blocks presses. */
  loading?: boolean;
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
        backgroundColor: theme.fill,
        pressedBackground: theme.fillPressed,
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
  loading = false,
  style,
  onPress,
  onPressIn,
  onPressOut,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const press = usePressScale();
  const isInert = !!disabled || loading;
  const colors = resolveColors(theme, variant, !!disabled);

  return (
    <Animated.View style={[press.animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isInert, busy: loading }}
        disabled={isInert}
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
              pressed && !isInert ? colors.pressedBackground : colors.backgroundColor,
            opacity: pressed && !isInert ? 0.94 : 1,
          },
        ]}
        {...rest}>
        {/* The label stays mounted while loading so the button cannot change
            width mid-press; the spinner sits on top of it. */}
        <Text
          variant="heading"
          color={colors.textColor}
          style={[styles.label, loading && styles.labelHidden]}>
          {label}
        </Text>
        {loading ? (
          <View style={styles.spinner} pointerEvents="none">
            <ActivityIndicator color={theme[colors.textColor]} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    // Pill geometry is the strongest single Wise signature, and it reads as a
    // deliberate action rather than a generic rounded rectangle.
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.controlHeight,
  },
  // Sentence case, semibold — the native iOS button convention. Uppercasing
  // every label reads as web UI and hurts legibility at a glance.
  label: {
    fontWeight: '600',
  },
  labelHidden: {
    opacity: 0,
  },
  spinner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
