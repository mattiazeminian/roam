import {
  GlassView as ExpoGlassView,
  isLiquidGlassAvailable,
  type GlassViewProps,
} from 'expo-glass-effect';
import type { ComponentType, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radii, useTheme } from '@/theme';

/**
 * `borderRadius` is a native prop on `GlassView` (it configures the effect's own
 * corner shape). Passing it only as a style does not reach the native glass, so
 * the corners stay square. This widens the type to allow the prop.
 */
type GlassViewWithRadiusProps = GlassViewProps & {
  borderRadius?: number;
};

const GlassView = ExpoGlassView as unknown as ComponentType<GlassViewWithRadiusProps>;

let cachedAvailability: boolean | null = null;

/**
 * Genuine native Liquid Glass is used when the platform exposes it. This is a
 * runtime capability check, not a visual imitation.
 */
export function isNativeGlassAvailable(): boolean {
  if (cachedAvailability === null) {
    try {
      cachedAvailability = isLiquidGlassAvailable();
    } catch {
      cachedAvailability = false;
    }
  }
  return cachedAvailability;
}

export type GlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  tintColor?: string;
  interactive?: boolean;
  glassEffectStyle?: 'regular' | 'clear';
};

/**
 * A floating surface. On iOS 26+ it is rendered by the native Liquid Glass API
 * (`expo-glass-effect`). When that material is unavailable it degrades to a
 * solid elevated surface — deliberately not a fake-glass approximation.
 */
export function GlassSurface({
  children,
  style,
  radius = radii.large,
  tintColor,
  interactive = false,
  glassEffectStyle = 'regular',
}: GlassSurfaceProps) {
  const theme = useTheme();

  if (isNativeGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle={glassEffectStyle}
        tintColor={tintColor}
        isInteractive={interactive}
        borderRadius={radius}
        style={style}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.fallbackShadow,
        {
          borderRadius: radius,
          backgroundColor: theme.surfaceElevated,
          borderColor: theme.glassBorder,
          borderWidth: StyleSheet.hairlineWidth,
          shadowColor: theme.shadow,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackShadow: {
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
});
