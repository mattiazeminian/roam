import { SymbolView } from 'expo-symbols';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { usePressScale } from '@/hooks/use-press-scale';
import { impactLight } from '@/lib/haptics';
import { layout, radii, useTheme } from '@/theme';

export type MapControlProps = {
  symbol: ComponentProps<typeof SymbolView>['name'];
  accessibilityLabel: string;
  onPress: () => void;
  fallback?: ReactNode;
};

/**
 * A small floating map control: circular native Liquid Glass (or a solid
 * fallback), with a monochrome SF Symbol and a light haptic on tap.
 */
export function MapControl({ symbol, accessibilityLabel, onPress, fallback }: MapControlProps) {
  const theme = useTheme();
  const press = usePressScale(0.96);

  return (
    <Animated.View style={press.animatedStyle}>
      <Pressable
        onPress={() => {
          impactLight();
          onPress();
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.hit}>
        <GlassSurface radius={radii.pill} style={styles.surface}>
          <SymbolView
            name={symbol}
            size={layout.iconSize}
            tintColor={theme.text}
            fallback={fallback}
          />
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: layout.controlSizeCircular,
    height: layout.controlSizeCircular,
  },
  surface: {
    width: layout.controlSizeCircular,
    height: layout.controlSizeCircular,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
