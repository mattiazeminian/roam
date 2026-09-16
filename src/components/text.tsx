import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import {
  fontFamilies,
  tabularFigures,
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

  return (
    <RNText
      maxFontSizeMultiplier={fontScaleCap}
      style={[
        typography[variant],
        { color: theme[color], fontFamily: mono ? fontFamilies.mono : fontFamilies.sans },
        tabular && tabularFigures,
        style,
      ]}
      {...rest}
    />
  );
}
