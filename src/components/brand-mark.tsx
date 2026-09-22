import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { brandInitials, type ShoeBrand } from '@/services/shoe-catalog';
import { useTheme } from '@/theme';

export type BrandMarkProps = {
  brand: ShoeBrand | null;
  /** Fallback brand name for a stored shoe without a catalog entry. */
  fallbackName?: string;
  size?: number;
};

/**
 * A brand's real mark, or its initials when no openly licensed vector exists.
 *
 * Simple Icons path data is rendered as an SVG with the current text colour, so
 * the mark stays legible in light and dark. Nothing is drawn by hand and no
 * trademark is approximated: a brand the icon set does not carry falls back to
 * a plain monogram tile.
 */
export function BrandMark({ brand, fallbackName, size = 32 }: BrandMarkProps) {
  const theme = useTheme();

  if (brand?.iconPath) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${theme.text}" d="${brand.iconPath}"/></svg>`;
    return (
      <Image
        source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }}
        style={{ width: size * 0.72, height: size * 0.72 }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.28, backgroundColor: theme.fill },
      ]}>
      <Text variant="micro" color="textSecondary">
        {brandInitials(brand?.name ?? fallbackName ?? 'Shoe')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
