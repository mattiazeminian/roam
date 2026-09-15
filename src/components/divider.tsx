import { View, type ViewProps } from 'react-native';

import { borderWidths, useTheme } from '@/theme';

export type DividerProps = ViewProps & {
  inset?: number;
};

export function Divider({ style, inset = 0, ...rest }: DividerProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="none"
      style={[
        { height: borderWidths.thin, backgroundColor: theme.divider, marginHorizontal: inset },
        style,
      ]}
      {...rest}
    />
  );
}
