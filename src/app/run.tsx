import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlassSurface } from '@/components/glass-surface';
import { MapSurface } from '@/components/map/map-surface';
import { RouteOverlay } from '@/components/map/route-overlay';
import { Text } from '@/components/text';
import { MOCK_ORIGIN, generateRoutes, type RouteCandidate } from '@/services/routing';
import { layout, radii, spacing } from '@/theme';

/**
 * Active Run placeholder. This only proves the transition from Route Selection;
 * live tracking is intentionally not implemented yet.
 */
export default function ActiveRunPlaceholderScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ routeId?: string; target?: string }>();

  const route = useMemo<RouteCandidate | undefined>(() => {
    const targetKm = Number.parseFloat(params.target ?? '');
    if (!Number.isFinite(targetKm) || targetKm <= 0) {
      return undefined;
    }
    const routes = generateRoutes({ origin: MOCK_ORIGIN, targetKm });
    return routes.find((candidate) => candidate.id === params.routeId) ?? routes[0];
  }, [params.routeId, params.target]);

  return (
    <View style={styles.root}>
      <MapSurface style={StyleSheet.absoluteFill}>
        <RouteOverlay
          origin={MOCK_ORIGIN}
          routes={route ? [route] : []}
          selectedRouteId={route?.id}
        />
      </MapSurface>

      <View
        style={[styles.panel, { bottom: insets.bottom + spacing.md, paddingHorizontal: layout.floatingInset }]}
        pointerEvents="box-none">
        <GlassSurface radius={radii.large} style={styles.surface}>
          <Text variant="caption" color="textSecondary">
            Active run
          </Text>

          {route ? (
            <View style={styles.summaryRow}>
              <Text variant="large" tabular>
                {route.distanceKm.toFixed(1)}
              </Text>
              <Text variant="title" color="textSecondary" style={styles.unit}>
                km
              </Text>
              <Text variant="title" color="textSecondary" tabular style={styles.time}>
                {`${route.estimatedMinutes} min`}
              </Text>
            </View>
          ) : null}

          <Text variant="body" color="textSecondary">
            Live tracking is not implemented yet.
          </Text>

          <Button label="End run" variant="secondary" onPress={() => router.back()} />
        </GlassSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  surface: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  unit: {
    paddingBottom: spacing.xxs,
  },
  time: {
    marginLeft: spacing.sm,
  },
});
