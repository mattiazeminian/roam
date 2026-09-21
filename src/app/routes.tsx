import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { RouteOptions } from '@/components/route-options';
import { ControlPanel } from '@/components/control-panel';
import { Text } from '@/components/text';
import { impactMedium, selectionFeedback, successFeedback } from '@/lib/haptics';
import { useLocation } from '@/services/location-context';
import { routeIdentity } from '@/services/route-identity';
import { loadRoutePopularity, type RoutePopularity } from '@/services/route-popularity';
import { routeShareLink } from '@/services/route-share';
import { useRoutes } from '@/services/route-context';
import { listRoutes, saveRoute } from '@/services/route-storage';
import { useRun } from '@/services/run-context';
import { formatDuration } from '@/services/run-session';
import { useFormatters } from '@/services/settings-context';
import { layout, radii, spacing, useTheme } from '@/theme';

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
  const fmt = useFormatters();
  const { origin } = useLocation();
  const {
    candidates,
    selectedRoute,
    selectedIndex,
    targetKm,
    status,
    errorMessage,
    retry,
    select,
    editWaypoints,
    editStatus,
    canUndo,
    moveWaypoint,
    addWaypoint,
    removeLastWaypoint,
    undoEdit,
    resetEdit,
  } = useRoutes();
  const { start } = useRun();
  const [editing, setEditing] = useState(false);
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [popularity, setPopularity] = useState<RoutePopularity>(new Map());

  // Which routes are already saved. Loaded once — the set only grows while this
  // screen is open, and a route is never unsaved from here.
  useEffect(() => {
    let active = true;
    void listRoutes()
      .then((saved) => {
        if (active) {
          setSavedIds(new Set(saved.map((entry) => entry.id)));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // The runner's own run counts, so a route they have finished before is marked
  // (#15). Loaded once; a run finishing while this screen is open is not a case
  // that can happen.
  useEffect(() => {
    let active = true;
    void loadRoutePopularity()
      .then((counts) => {
        if (active) {
          setPopularity(counts);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedIdentity = selectedRoute ? routeIdentity(selectedRoute) : null;
  const isSaved = selectedIdentity !== null && savedIds.has(selectedIdentity);

  const handleSave = useCallback(async () => {
    if (!selectedRoute || isSaved) {
      return;
    }
    const saved = await saveRoute(selectedRoute);
    successFeedback();
    setSavedIds((current) => new Set(current).add(saved.id));
  }, [selectedRoute, isSaved]);

  // Sharing sends a link that reconstructs the route; the share sheet being
  // dismissed is not an error, so nothing is reported (#23).
  const handleShare = useCallback(async () => {
    if (!selectedRoute) {
      return;
    }
    const link = routeShareLink(selectedRoute);
    try {
      await Share.share({ message: `A running route from Roam:\n${link}` });
    } catch {
      // Dismissed, or sharing unavailable — nothing to tell the runner.
    }
  }, [selectedRoute]);

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
        autoFit={!editing}
        waypoints={editing ? editWaypoints : undefined}
        onMapPress={editing ? addWaypoint : undefined}
        onWaypointMoved={editing ? moveWaypoint : undefined}
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
        {!isEmpty ? (
          <View style={styles.topActions}>
            <MapControl
              symbol="square.and.arrow.up"
              accessibilityLabel="Share route"
              onPress={() => void handleShare()}
            />
            <MapControl
              symbol={editing ? 'checkmark' : 'pencil'}
              accessibilityLabel={editing ? 'Finish editing' : 'Edit route'}
              onPress={() => setEditing((value) => !value)}
            />
          </View>
        ) : null}
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
                    'Roam could not find a running loop near you at this distance.')}
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
          ) : editing ? (
            <View style={styles.editPanel}>
              <View style={styles.header}>
                <Text variant="micro" color="textSecondary">
                  {editStatus === 'recalculating' ? 'Updating route…' : 'Editing route'}
                </Text>
                {selectedRoute ? (
                  <Text variant="micro" color="textSecondary">
                    {`${fmt.distance(selectedRoute.distanceKm * 1000)} ${fmt.unitLabel}  ·  ${formatDuration(
                      selectedRoute.estimatedMinutes * 60,
                    )}`}
                  </Text>
                ) : null}
              </View>

              <Text variant="caption" color="textSecondary">
                Tap the map to add a point. Drag a point to move it.
              </Text>

              {editStatus === 'error' && errorMessage ? (
                <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
                  {errorMessage}
                </Text>
              ) : null}

              <View style={styles.editActions}>
                <Button
                  label="Undo"
                  variant="secondary"
                  onPress={undoEdit}
                  disabled={!canUndo}
                  style={styles.grow}
                />
                <Button
                  label="Remove point"
                  variant="secondary"
                  onPress={removeLastWaypoint}
                  disabled={editWaypoints.length === 0}
                  style={styles.grow}
                />
              </View>

              <View style={styles.editActions}>
                <Button
                  label="Reset"
                  variant="secondary"
                  onPress={resetEdit}
                  disabled={!canUndo && editWaypoints.length === 0}
                  style={styles.grow}
                />
                <Button
                  label="Done"
                  variant="accent"
                  onPress={() => setEditing(false)}
                  style={styles.grow}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <Text variant="micro" color="textSecondary">
                  {candidates.length === 1 ? '1 route' : `${candidates.length} routes`}
                </Text>
              </View>

              <RouteOptions
                routes={candidates}
                selectedIndex={selectedIndex}
                onSelect={handleSelect}
                popularity={popularity}
              />

              {/* Each fact about the selected route on its own pill, rather than
                  one caption of joined fragments nothing can be scanned from. */}
              {selectedRoute ? (
                <View style={styles.facts}>
                  {selectedRoute.characteristics.map((fact) => (
                    <View
                      key={fact}
                      style={[styles.fact, { backgroundColor: theme.fill }]}>
                      <Text variant="caption" color="textSecondary">
                        {fact}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.actions}>
                <Button
                  label={isSaved ? 'Saved' : 'Save route'}
                  variant="secondary"
                  onPress={() => void handleSave()}
                  disabled={isSaved || !selectedRoute}
                />
                <Button
                  label="Start run"
                  variant="accent"
                  onPress={handleStart}
                  style={styles.startButton}
                />
              </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  fact: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
  },
  notice: {
    gap: spacing.xs,
  },
  noticeActions: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  startButton: {
    flex: 1,
  },
  editPanel: {
    gap: spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
});
