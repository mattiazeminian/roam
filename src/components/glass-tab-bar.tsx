import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { Text } from '@/components/text';
import { usePressScale } from '@/hooks/use-press-scale';
import { selectionFeedback } from '@/lib/haptics';
import { layout, radii, spacing, useTheme } from '@/theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type TabItemConfig = {
  name: string;
  label: string;
  symbol: SymbolName;
  selectedSymbol: SymbolName;
};

const TAB_ITEMS: TabItemConfig[] = [
  { name: 'index', label: 'Home', symbol: 'house', selectedSymbol: 'house.fill' },
  { name: 'history', label: 'History', symbol: 'clock', selectedSymbol: 'clock.fill' },
];

/**
 * A minimal floating tab bar built on the native Liquid Glass material. It
 * floats above the bottom safe area, uses monochrome SF Symbols, marks the
 * active tab with a soft lime tint, and never covers content.
 */
export function GlassTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const activeName = state.routes[state.index]?.name;

  return (
    <View
      style={[styles.container, { bottom: insets.bottom + layout.tabBarMargin }]}
      pointerEvents="box-none">
      <GlassSurface radius={radii.large} style={styles.bar}>
        {TAB_ITEMS.map((tab) => {
          const route = state.routes.find((item) => item.name === tab.name);
          if (!route) {
            return null;
          }
          const focused = activeName === tab.name;
          return (
            <TabItem
              key={tab.name}
              label={tab.label}
              symbol={focused ? tab.selectedSymbol : tab.symbol}
              focused={focused}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  selectionFeedback();
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </GlassSurface>
    </View>
  );
}

function TabItem({
  label,
  symbol,
  focused,
  onPress,
}: {
  label: string;
  symbol: SymbolName;
  focused: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const press = usePressScale(0.92);

  return (
    <Animated.View style={[styles.itemWrapper, press.animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        style={[styles.item, focused ? { backgroundColor: theme.accentMuted } : null]}>
        <SymbolView
          name={symbol}
          size={20}
          tintColor={focused ? theme.text : theme.textSecondary}
        />
        <Text variant="caption" color={focused ? 'text' : 'textSecondary'} style={styles.label}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.giant,
  },
  bar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.xxs,
    padding: spacing.xxs,
  },
  itemWrapper: {
    flex: 1,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.medium,
  },
  label: {
    fontWeight: '600',
  },
});
