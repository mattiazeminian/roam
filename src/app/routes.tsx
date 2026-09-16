import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { RouteOptions } from '@/components/route-options';
import { ControlPanel } from '@/components/control-panel';
import { Text } from '@/components/text';
import { impactMedium, selectionFeedback } from '@/lib/haptics';
import { useLocation } from '@/services/location-context';
import { useRoutes } from '@/services/route-context';
import { useRun } from '@/services/run-context';
import { layout, spacing, useTheme } from '@/theme';

/** Height the sheet occupies, so the camera can frame routes above it. */
const SHEET_CLEARANCE = 260;

/**
 * Route Discovery — the map is the answer, the sheet is the choice.
 *
 * Every candidate is drawn at once; the selected one is heavier and accented while
 * the others stay thin and neutral, so the comparison happens on the map rather
 * than in the text.
 */
export default function RouteSelectionScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { origin } = useLocation();
  const { candidates, selectedRoute, selectedIndex, targetKm, status, errorMessage, retry, select } =
    useRoutes();
  const { start } = useRun();

  const handleSelect = useCallback(
    (index: number) => {
      if (index === selectedIndex) {
        return;
      }
      selectionFeedback();
      select(index);
    },
    [selectedIndex, select],
  );

  const handleStart = useCallback(() => {
    if (!selectedRoute) {
      return;
    }
    impactMedium();
    start(selectedRoute, targetKm ?? selectedRoute.distanceKm);
    router.replace('/run');
  }, [selectedRoute, start, targetKm]);

  const mapPadding = useMemo(
    () => ({
      top: insets.top + 80,
      bottom: insets.bottom + SHEET_CLEARANCE,
      left: spacing.xxl,
      right: spacing.xxl,
    }),
    [insets.top, insets.bottom],
  );

  const isFinding = status === 'finding';
  const isEmpty = candidates.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <MapCanvas
        origin={origin}
        routes={candidates}
        selectedRouteId={selectedRoute?.id}
        padding={mapPadding}
        cameraMode="fit"
      />

      <View
        style={[
          styles.topRow,
          { top: insets.top + spacing.xs, paddingHorizontal: layout.screenMargin },
        ]}
        pointerEvents="box-none">
        <MapControl
          symbol="chevron.left"
          accessibilityLabel="Back to distance"
          onPress={() => router.back()}
        />
      </View>

      <View style={styles.sheetAnchor}>
        <ControlPanel style={styles.sheet}>
          {isEmpty ? (
            <View style={styles.notice}>
              <Text variant="title">
                {isFinding ? 'Finding your way' : 'No routes found'}
              </Text>
              <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
                {isFinding
                  ? 'Looking for loops that start and end where you are.'
                  : (errorMessage ??
                    'ROAM could not find a running loop near you at this distance.')}
              </Text>
              {!isFinding ? (
                <View style={styles.noticeActions}>
                  <Button label="Try again" variant="accent" onPress={() => void retry()} />
                  <Button
                    label="Change distance"
                    variant="secondary"
                    onPress={() => router.back()}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <Text variant="micro" color="textSecondary">
                  {candidates.length === 1 ? '1 route' : `${candidates.length} routes`}
                </Text>
                {selectedRoute ? (
                  <Text variant="micro" color="textSecondary">
                    {selectedRoute.characteristics.join('  ·  ')}
                  </Text>
                ) : null}
              </View>

              <RouteOptions
                routes={candidates}
                selectedIndex={selectedIndex}
                onSelect={handleSelect}
              />

              <Button label="Start run" variant="accent" onPress={handleStart} />
            </>
          )}
        </ControlPanel>
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
  sheetAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notice: {
    gap: spacing.xs,
  },
  noticeActions: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
