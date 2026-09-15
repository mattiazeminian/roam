import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_DISTANCE_KM } from '@/components/distance-control';
import { MapControl } from '@/components/map-control';
import { MapSurface } from '@/components/map/map-surface';
import { RouteOverlay } from '@/components/map/route-overlay';
import { RouteInfoPanel } from '@/components/route-info-panel';
import { impactMedium, selectionFeedback } from '@/lib/haptics';
import { MOCK_ORIGIN, generateRoutes, getLastRoutes } from '@/services/routing';
import { layout, spacing } from '@/theme';

/**
 * Route Selection — candidate routes drawn on the map with a floating glass
 * selection panel. The map stays the primary surface.
 */
export default function RouteSelectionScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ distance?: string }>();

  const targetKm = useMemo(() => {
    const parsed = Number.parseFloat(params.distance ?? '');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DISTANCE_KM;
  }, [params.distance]);

  const routes = useMemo(
    () => getLastRoutes(targetKm) ?? generateRoutes({ origin: MOCK_ORIGIN, targetKm }),
    [targetKm],
  );

  const [selectedId, setSelectedId] = useState<string>(() => routes[0]?.id ?? '');
  const selectedRoute = routes.find((route) => route.id === selectedId) ?? routes[0];

  const handleSelect = useCallback(
    (id: string) => {
      if (id === selectedId) {
        return;
      }
      selectionFeedback();
      setSelectedId(id);
    },
    [selectedId],
  );

  const handleStart = useCallback(() => {
    if (!selectedRoute) {
      return;
    }
    impactMedium();
    router.push({
      pathname: '/run',
      params: { routeId: selectedRoute.id, target: targetKm.toFixed(1) },
    });
  }, [selectedRoute, targetKm]);

  return (
    <View style={styles.root}>
      <MapSurface style={StyleSheet.absoluteFill}>
        <RouteOverlay
          origin={MOCK_ORIGIN}
          routes={routes}
          selectedRouteId={selectedId}
          onSelectRoute={handleSelect}
        />
      </MapSurface>

      <View
        style={[styles.topRow, { top: insets.top + spacing.xs, paddingHorizontal: layout.floatingInset }]}
        pointerEvents="box-none">
        <MapControl
          symbol="chevron.left"
          accessibilityLabel="Back to distance"
          onPress={() => router.back()}
        />
      </View>

      <View
        style={[styles.panel, { bottom: insets.bottom + spacing.md, paddingHorizontal: layout.floatingInset }]}
        pointerEvents="box-none">
        <RouteInfoPanel
          targetKm={targetKm}
          routes={routes}
          selectedRouteId={selectedId}
          onSelectRoute={handleSelect}
          onStart={handleStart}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topRow: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
