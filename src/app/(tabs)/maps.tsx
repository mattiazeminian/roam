import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM } from '@/components/distance-control';
import { FindRouteSheet } from '@/components/find-route-sheet';
import { MapCanvas } from '@/components/map/map-canvas';
import { Text } from '@/components/text';
import { errorFeedback, impactLight, successFeedback } from '@/lib/haptics';
import { useLocation } from '@/services/location-context';
import { useRoutes } from '@/services/route-context';
import { listRoutes, type SavedRoute } from '@/services/route-storage';
import { useSettings } from '@/services/settings-context';
import { layout, spacing, useTheme } from '@/theme';

/**
 * Maps — the route workspace.
 *
 * The map is the screen; everything else is a small panel at the edge of it.
 * Routes the runner already kept are the primary content here, and generating a
 * new one opens the same sheet Home uses rather than a screen of its own.
 */
export default function MapsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { origin, originLabel, hasCustomOrigin, finish, clearFinish } = useLocation();
  const { status: routeStatus, errorMessage, find } = useRoutes();
  const { settings, update } = useSettings();

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isFinding = routeStatus === 'finding';
  const hasError = routeStatus === 'error';
  const targetKm = distanceKm ?? settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listRoutes()
        .then((stored) => active && setSavedRoutes(stored))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const handleGenerate = useCallback(async () => {
    if (isFinding || !origin) {
      return;
    }
    const found = await find(origin, targetKm, finish?.coordinate ?? null);
    if (!found) {
      errorFeedback();
      return;
    }
    successFeedback();
    update({ defaultDistanceKm: targetKm });
    router.push('/routes');
  }, [isFinding, origin, targetKm, finish, find, update]);

  const howMany = savedRoutes.length;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.map}>
        <MapCanvas
          origin={origin}
          routes={savedRoutes.map((saved) => saved.route)}
          // Centred on the runner, not framed to the saved routes: Maps opens
          // where you are, and routes elsewhere in the world should not drag
          // the camera away from you.
          cameraMode="center"
          padding={{ top: insets.top + 88, bottom: 220, left: 48, right: 48 }}
        />
      </View>

      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.borderSubtle,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}>
        <Text variant="large">Maps</Text>

        <View style={styles.savedRow}>
          <SymbolView
            name="bookmark"
            size={layout.iconSizeSmall}
            tintColor={theme.textSecondary}
          />
          <Text variant="label" color="textSecondary" style={styles.savedLabel}>
            {howMany === 0
              ? 'No saved routes yet'
              : `${howMany} saved ${howMany === 1 ? 'route' : 'routes'}`}
          </Text>
          {howMany > 0 ? (
            <Text variant="caption" color="textSecondary" tabular>
              {howMany}
            </Text>
          ) : null}
        </View>

        <Button
          label="Generate a route"
          variant="accent"
          onPress={() => {
            impactLight();
            setSheetOpen(true);
          }}
          disabled={!origin}
        />

        {howMany > 0 ? (
          <Button
            label="My routes"
            variant="secondary"
            onPress={() => router.push('/favorites')}
          />
        ) : null}
      </View>

      <FindRouteSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        startLabel={originLabel}
        hasCustomStart={hasCustomOrigin}
        onChangeStart={() => router.push('/location-search')}
        finishLabel={finish?.label ?? null}
        onChangeFinish={() => router.push('/location-search?mode=finish')}
        onClearFinish={clearFinish}
        distanceKm={targetKm}
        onChangeDistance={setDistanceKm}
        busy={isFinding}
        errorMessage={hasError ? errorMessage : null}
        onSubmit={() => {
          setSheetOpen(false);
          void handleGenerate();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  map: {
    flex: 1,
    overflow: 'hidden',
  },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouchTarget,
  },
  savedLabel: {
    flex: 1,
  },
});
