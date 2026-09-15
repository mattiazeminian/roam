import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM, DistanceControl } from '@/components/distance-control';
import { GenerationStatus } from '@/components/generation-status';
import { GlassSurface } from '@/components/glass-surface';
import { MapControl } from '@/components/map-control';
import { MapSurface } from '@/components/map/map-surface';
import { RouteOverlay } from '@/components/map/route-overlay';
import { Text } from '@/components/text';
import { impactLight, successFeedback } from '@/lib/haptics';
import { MOCK_ORIGIN, findRoutes } from '@/services/routing';
import { layout, radii, spacing, useTheme } from '@/theme';

const GENERATION_MESSAGES = [
  'Finding your way',
  'Checking nearby streets',
  'Looking for a good loop',
  'Building your route',
  'Route ready',
];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Home — the map, the current location and the distance choice. One decision:
 * how far to run. Controls float over the map on native glass.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [distanceKm, setDistanceKm] = useState<number>(DEFAULT_DISTANCE_KM);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setIsGenerating(false);
    }, []),
  );

  useEffect(() => {
    if (!isGenerating) {
      return;
    }
    setStatusIndex(0);
    const interval = setInterval(() => {
      setStatusIndex((index) => Math.min(index + 1, GENERATION_MESSAGES.length - 2));
    }, 300);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleDistanceChange = useCallback((value: number) => {
    setErrorMessage(null);
    setDistanceKm(value);
  }, []);

  const handleFindRoutes = useCallback(async () => {
    if (isGenerating) {
      return;
    }
    impactLight();
    setErrorMessage(null);
    setIsGenerating(true);

    try {
      await Promise.all([findRoutes({ origin: MOCK_ORIGIN, targetKm: distanceKm }), delay(1100)]);

      setStatusIndex(GENERATION_MESSAGES.length - 1);
      successFeedback();
      await delay(220);

      router.push({ pathname: '/routes', params: { distance: distanceKm.toFixed(1) } });
    } catch {
      // Fail gracefully: stay on Home with a plain message instead of crashing.
      setIsGenerating(false);
      setErrorMessage('Could not find routes. Try another distance.');
    }
  }, [distanceKm, isGenerating]);

  return (
    <View style={styles.root}>
      <MapSurface style={StyleSheet.absoluteFill}>
        <RouteOverlay
          origin={MOCK_ORIGIN}
          routes={[]}
          searching={isGenerating}
          recenterSignal={recenterSignal}
        />
      </MapSurface>

      <View
        style={[styles.topRow, { top: insets.top + spacing.xs, paddingHorizontal: layout.floatingInset }]}
        pointerEvents="box-none">
        <GlassSurface radius={radii.pill} style={styles.locationPill}>
          <View style={[styles.locationDot, { backgroundColor: theme.accent }]} />
          <Text variant="caption" color="textSecondary" style={styles.locationLabel}>
            Current location
          </Text>
        </GlassSurface>
        <MapControl
          symbol="location"
          accessibilityLabel="Recenter on current location"
          onPress={() => setRecenterSignal((value) => value + 1)}
        />
      </View>

      <View
        style={[
          styles.controls,
          {
            bottom: insets.bottom + layout.tabBarClearance,
            paddingHorizontal: layout.floatingInset,
          },
        ]}
        pointerEvents="box-none">
        {isGenerating || errorMessage ? (
          <View style={styles.statusWrap} pointerEvents="none">
            <GenerationStatus message={errorMessage ?? GENERATION_MESSAGES[statusIndex]} />
          </View>
        ) : null}

        <DistanceControl
          valueKm={distanceKm}
          onChange={handleDistanceChange}
          disabled={isGenerating}
        />

        <Button
          label={isGenerating ? 'Finding your way' : 'Find routes'}
          variant="accent"
          onPress={handleFindRoutes}
          disabled={isGenerating}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  locationLabel: {
    fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    gap: spacing.sm,
  },
  statusWrap: {
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
});
