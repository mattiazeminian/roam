import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/text';
import { usePressScale } from '@/hooks/use-press-scale';
import { routeIdentity } from '@/services/route-identity';
import { popularityLabel, type RoutePopularity } from '@/services/route-popularity';
import type { RouteCandidate } from '@/services/routing';
import { useFormatters } from '@/services/settings-context';
import { radii, spacing, useTheme } from '@/theme';

export type RouteOptionsProps = {
  routes: RouteCandidate[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** The runner's own run counts per route identity (#15). */
  popularity?: RoutePopularity;
};

/**
 * Route selection.
 *
 * This replaced a swipeable carousel. Roam returns two or three candidates,
 * and they all fit across the sheet at once — so a carousel was hiding options
 * behind a gesture for no reason, and forced a "1 / 3" counter to explain
 * itself. Showing every option removes both.
 *
 * Selection is never carried by color alone: the chosen option inverts to a
 * filled accent surface with the opposite foreground, which reads under any
 * color vision, and is also announced via `accessibilityState`.
 */
export function RouteOptions({ routes, selectedIndex, onSelect, popularity }: RouteOptionsProps) {
  return (
    <View style={styles.row}>
      {routes.map((route, index) => (
        <RouteOption
          key={route.id}
          route={route}
          index={index}
          count={routes.length}
          selected={index === selectedIndex}
          onPress={() => onSelect(index)}
          runs={popularity?.get(routeIdentity(route)) ?? 0}
        />
      ))}
    </View>
  );
}

function RouteOption({
  route,
  index,
  count,
  selected,
  onPress,
  runs,
}: {
  route: RouteCandidate;
  index: number;
  count: number;
  selected: boolean;
  onPress: () => void;
  runs: number;
}) {
  const theme = useTheme();
  const fmt = useFormatters();
  const press = usePressScale(0.97);
  // Only ever a real count — a route with no history is simply not marked.
  const popular = popularityLabel(runs);

  return (
    <Animated.View style={[styles.item, press.animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Route ${index + 1} of ${count}, ${fmt.distance(route.distanceKm * 1000)} ${fmt.unitSpoken}, about ${route.estimatedMinutes} minutes${popular ? `, ${popular}` : ''}`}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: selected
              ? theme.accent
              : pressed
                ? theme.fillPressed
                : theme.fill,
          },
        ]}>
        <View style={styles.valueRow}>
          <Text
            variant="title"
            tabular
            color={selected ? 'accentForeground' : 'text'}
            style={styles.value}>
            {fmt.distance(route.distanceKm * 1000)}
          </Text>
          <Text variant="caption" color={selected ? 'accentForeground' : 'textSecondary'}>
            {fmt.unitLabel}
          </Text>
        </View>
        <Text variant="caption" color={selected ? 'accentForeground' : 'textSecondary'} tabular>
          {`${route.estimatedMinutes} min`}
        </Text>
        {popular ? (
          <Text variant="micro" color={selected ? 'accentForeground' : 'textSecondary'}>
            {popular}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  item: {
    flex: 1,
  },
  card: {
    borderRadius: radii.small,
    borderCurve: 'continuous',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 2,
    minHeight: 64,
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  value: {
    fontWeight: '700',
  },
});
