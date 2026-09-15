import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/button';
import { GlassSurface } from '@/components/glass-surface';
import { Text } from '@/components/text';
import { usePressScale } from '@/hooks/use-press-scale';
import type { RouteCandidate } from '@/services/routing';
import { radii, spacing, useTheme } from '@/theme';

export type RouteInfoPanelProps = {
  targetKm: number;
  routes: RouteCandidate[];
  selectedRouteId: string;
  onSelectRoute: (id: string) => void;
  onStart: () => void;
};

/**
 * The route selection surface: a floating glass panel with soft rounded rows
 * (no hard cards) and the lime start action.
 */
export function RouteInfoPanel({
  targetKm,
  routes,
  selectedRouteId,
  onSelectRoute,
  onStart,
}: RouteInfoPanelProps) {
  const theme = useTheme();
  const selected = routes.find((route) => route.id === selectedRouteId);

  return (
    <GlassSurface radius={radii.large} style={styles.surface}>
      <View style={styles.headerRow}>
        <Text variant="caption" color="textSecondary">
          ROUTES
        </Text>
        <Text variant="caption" color="textSecondary">
          {`About ${targetKm.toFixed(1)} km`}
        </Text>
      </View>

      {routes.length === 0 ? (
        <Text variant="body" color="textSecondary">
          No routes available. Go back and try another distance.
        </Text>
      ) : (
        <View style={styles.list}>
          {routes.map((route, index) => (
            <RouteRow
              key={route.id}
              route={route}
              index={index}
              selected={route.id === selectedRouteId}
              onPress={() => onSelectRoute(route.id)}
            />
          ))}
        </View>
      )}

      <Button
        label="Start this route"
        variant="accent"
        onPress={onStart}
        disabled={!selected}
      />
    </GlassSurface>
  );
}

function RouteRow({
  route,
  index,
  selected,
  onPress,
}: {
  route: RouteCandidate;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const press = usePressScale(0.98);

  return (
    <Animated.View style={press.animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Route ${index + 1}, ${route.distanceKm.toFixed(1)} kilometers, ${route.estimatedMinutes} minutes`}
        style={[styles.row, { backgroundColor: selected ? theme.accentMuted : theme.surface }]}>
        <View style={styles.rowLeft}>
          <Text variant="caption" color="textSecondary">
            {`Route ${String(index + 1).padStart(2, '0')}`}
          </Text>
          <View style={styles.distanceRow}>
            <Text variant="title" tabular>
              {route.distanceKm.toFixed(1)}
            </Text>
            <Text variant="label" color="textSecondary" style={styles.unit}>
              km
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            {route.characteristics.join(' · ')}
          </Text>
        </View>

        <View style={styles.rowRight}>
          <Text variant="label" color="textSecondary" tabular>
            {`${route.estimatedMinutes} min`}
          </Text>
          <View
            style={[
              styles.indicator,
              {
                borderColor: selected ? theme.accent : theme.textSecondary,
                backgroundColor: selected ? theme.accent : 'transparent',
              },
            ]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.medium,
  },
  rowLeft: {
    gap: 2,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  unit: {
    paddingBottom: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  indicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
});
