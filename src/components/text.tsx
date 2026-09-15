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
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  return (
    <RNText
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
