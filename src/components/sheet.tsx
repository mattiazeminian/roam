import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface, isNativeGlassAvailable } from '@/components/glass-surface';
import { radii, spacing, useTheme } from '@/theme';

export type SheetProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra space above the safe-area inset at the bottom. */
  bottomInset?: number;
  /**
   * Reserve the home-indicator inset. Turn this off when the sheet has been
   * lifted onto the keyboard, which already covers that area — otherwise the
   * reserved space becomes a gap between the sheet and the keyboard.
   */
  safeArea?: boolean;
};

/**
 * The surface content sits on when the map is behind it.
 *
 * ROAM used to float a rounded card over the map on every screen, which is why
 * five screens looked like one idea repeated. This is anchored to the bottom
 * edge and rounded only on top, so it reads as part of the screen rather than
 * as a card dropped onto it — the iOS sheet convention. Its *content* changes
 * by context; its shape does not.
 *
 * The material is genuine native Liquid Glass where the platform provides it.
 * `GlassView` rounds all four corners, so the glass layer is inset behind a
 * top-rounded clipping container instead of being rounded itself, and the
 * bottom corners fall outside the clip.
 */
export function Sheet({
  children,
  style,
  bottomInset = spacing.md,
  safeArea = true,
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const glass = isNativeGlassAvailable();

  return (
    <View
      style={[
        styles.clip,
        {
          borderTopColor: theme.glassBorder,
          // Without the native material, fall back to an opaque surface rather
          // than imitating glass with a blur-and-transparency approximation.
          backgroundColor: glass ? 'transparent' : theme.surfaceElevated,
          shadowColor: theme.shadow,
        },
      ]}>
      {glass ? (
        <GlassSurface radius={0} glassEffectStyle="regular" style={styles.material} />
      ) : null}

      <View
        style={[
          styles.content,
          { paddingBottom: (safeArea ? insets.bottom : 0) + bottomInset },
          style,
        ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    borderCurve: 'continuous',
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    // A wide, soft shadow lifts the sheet off the map without reading as a
    // drop shadow on a card.
    shadowOpacity: 1,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
  },
  material: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    paddingTop: spacing.lg,
  },
});
