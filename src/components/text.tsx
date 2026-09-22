import {
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import {
  fontFamilies,
  tabularFigures,
  trackingSlack,
  typography,
  useTheme,
  type ColorToken,
  type TypographyVariant,
} from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: ColorToken;
  mono?: boolean;
  tabular?: boolean;
};

/**
 * The tracking a variant ends up with, given a caller's style override.
 * Negative tracking trims the *advance* of the last glyph but not its ink, so
 * the ink overhangs the measured width and the glyph clips on the right — most
 * visibly on a big numeral or a trailing unit. See docs/design-system.md.
 */
function slackFor(variant: TypographyVariant, style: TextProps['style']): number {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const tracking =
    flat?.letterSpacing ?? (typography[variant] as { letterSpacing?: number }).letterSpacing;
  return trackingSlack(tracking);
}

export function Text({
  variant = 'body',
  color = 'text',
  mono = false,
  tabular = false,
  maxFontSizeMultiplier,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const { fontSize, lineHeight } = typography[variant];

  // Allow Dynamic Type to scale text up to the point where it would exceed the
  // variant's line height (then stop, so it never clips). Callers can override.
  const fontScaleCap =
    maxFontSizeMultiplier ??
    (fontSize && lineHeight ? Math.min(1.4, lineHeight / fontSize) : 1.4);

  const slack = slackFor(variant, style);

  return (
    <RNText
      maxFontSizeMultiplier={fontScaleCap}
      style={[
        typography[variant],
        {
          color: theme[color],
          // A variant may carry its own face (the condensed display type); only
          // fall back to the system sans when it does not.
          fontFamily: mono
            ? fontFamilies.mono
            : ((typography[variant] as { fontFamily?: string }).fontFamily ??
              fontFamilies.sans),
        },
        // Padding protects the glyph inside the text box; the margin also
        // gives the parent layout room for the final glyph's ink overhang.
        // This matters for large values such as `12.50`, where the last zero
        // can otherwise be clipped even though the measured text width fits.
        slack > 0 && { paddingRight: slack, marginRight: slack },
        tabular && tabularFigures,
        style,
      ]}
      {...rest}
    />
  );
}
