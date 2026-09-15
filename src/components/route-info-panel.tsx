import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { GlassSurface } from '@/components/glass-surface';
import { Text } from '@/components/text';
import type { RouteCandidate } from '@/services/routing';
import { radii, spacing } from '@/theme';

export type RouteInfoPanelProps = {
  /** The currently selected route, if any. */
  route?: RouteCandidate;
  routeCount: number;
  onStart: () => void;
};

/**
 * A small contextual surface for the selected route. The map is the selector;
 * this only reflects the current choice and offers the primary action.
 */
export function RouteInfoPanel({ route, routeCount, onStart }: RouteInfoPanelProps) {
  return (
    <GlassSurface radius={radii.large} style={styles.surface}>
      <View style={styles.headerRow}>
        <Text variant="label" color="text">
          Choose your route
        </Text>
        <Text variant="caption" color="textSecondary">
          {`${routeCount} ${routeCount === 1 ? 'route' : 'routes'}`}
        </Text>
      </View>

      {route ? (
        <View style={styles.info}>
          <View style={styles.metricRow}>
            <Text variant="large" tabular>
              {route.distanceKm.toFixed(1)}
            </Text>
            <Text variant="heading" color="textSecondary" style={styles.unit}>
              km
            </Text>
            <Text variant="title" color="textSecondary" tabular style={styles.time}>
              {`${route.estimatedMinutes} min`}
            </Text>
          </View>
          <Text variant="label" color="textSecondary">
            {route.characteristics.join(' · ')}
          </Text>
        </View>
      ) : (
        <Text variant="body" color="textSecondary">
          Tap a route on the map to select it.
        </Text>
      )}

      <Button label="Start run" variant="accent" onPress={onStart} disabled={!route} />
    </GlassSurface>
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
  info: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  unit: {
    paddingBottom: 1,
  },
  time: {
    marginLeft: spacing.sm,
  },
});
