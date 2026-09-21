import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Metric, MetricRow } from '@/components/metric';
import { ShareCard } from '@/components/share-card';
import { Text } from '@/components/text';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { runShareMessage } from '@/services/run-share';
import { routeFromRun } from '@/services/run-to-route';
import { formatDuration, formatRunDate, splitsFor, type SavedRun } from '@/services/run-session';
import { isRouteSaved, saveRoute } from '@/services/route-storage';
import { useFormatters } from '@/services/settings-context';
import { getRun, saveRun } from '@/services/run-storage';
import { loadShoes, shoeName, type Shoe } from '@/services/shoes';
import { layout, radii, spacing, useTheme } from '@/theme';

/** Run detail — the recorded route, and the numbers that describe it. */
export default function RunDetailScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const fmt = useFormatters();
  const [run, setRun] = useState<SavedRun | null>(null);
  // With no id there is nothing to wait for, so this starts resolved rather
  // than being flipped by a synchronous setState inside the effect.
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    let active = true;
    if (!id) {
      return;
    }
    void getRun(id)
      .then((stored) => {
        if (active) {
          setRun(stored);
          setLoaded(true);
        }
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [id]);

  const hasTrack = (run?.coordinates.length ?? 0) >= 2;
  // Splits cut at the runner's own unit; withheld entirely when times are missing.
  const splitMeters = fmt.unit === 'mi' ? 1609.344 : 1000;
  const splits = run && hasTrack ? splitsFor(run.coordinates, run.timestamps ?? [], splitMeters) : [];
  const cardRef = useRef<View>(null);
  const [trackIsSaved, setTrackIsSaved] = useState(false);
  const [shoes, setShoes] = useState<Shoe[]>([]);

  useEffect(() => {
    let active = true;
    void loadShoes()
      .then((stored) => {
        if (active) {
          setShoes(stored);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const currentShoe = run?.shoeId ? shoes.find((shoe) => shoe.id === run.shoeId) : undefined;
  const shoeLabel = currentShoe ? shoeName(currentShoe) : 'No shoe';

  // Attribute the run to a shoe, or take it off. Attribution is editable after
  // the fact: a runner may only realise later which pair these kilometres
  // belong to, and a past run is allowed to name a shoe since retired.
  const attributeShoe = useCallback(
    (shoeId: string | null) => {
      if (!run) {
        return;
      }
      const next = { ...run, shoeId: shoeId ?? undefined };
      setRun(next);
      void saveRun(next).catch(() => {});
    },
    [run],
  );

  const handleSetShoe = useCallback(() => {
    if (!run) {
      return;
    }
    Alert.alert('Shoe', 'Which shoe did you run in?', [
      ...shoes.map((shoe) => ({
        text: shoeName(shoe),
        onPress: () => attributeShoe(shoe.id),
      })),
      { text: 'No shoe', onPress: () => attributeShoe(null) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [run, shoes, attributeShoe]);


  // Whether this track is already kept as a route, so the control reflects
  // reality rather than a local guess. Nothing is set synchronously in the
  // effect: when there is no track the control is not rendered at all.
  useEffect(() => {
    let active = true;
    const candidate = run ? routeFromRun(run) : null;
    if (!candidate) {
      return;
    }
    void isRouteSaved(candidate)
      .then((saved) => {
        if (active) {
          setTrackIsSaved(saved);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [run]);

  const routeSaved = hasTrack && trackIsSaved;

  // A run's track can be kept as a route, so somewhere new becomes somewhere
  // you can run again (#110). Never automatic — the runner chooses.
  const handleSaveRoute = useCallback(async () => {
    if (!run || routeSaved) {
      return;
    }
    const candidate = routeFromRun(run);
    if (!candidate) {
      return;
    }
    try {
      await saveRoute(candidate);
      successFeedback();
      setTrackIsSaved(true);
    } catch {
      errorFeedback();
      Alert.alert('Could not save route', 'The route could not be written to this device.');
    }
  }, [run, routeSaved]);

  const handleShare = useCallback(async () => {
    if (!run) {
      return;
    }
    let uri: string | undefined;
    try {
      uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
    } catch {
      // No track to render, or the capture failed — share the text alone.
    }
    try {
      await Share.share(
        uri ? { url: uri, message: runShareMessage(run, fmt) } : { message: runShareMessage(run, fmt) },
      );
    } catch {
      // Dismissed, or sharing unavailable.
    }
  }, [run, fmt]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {run ? (
        // Rendered off-screen, not display:none — the map needs to actually
        // lay out and draw tiles to be captured when Share is tapped.
        <View style={styles.hiddenCard} pointerEvents="none">
          <ShareCard ref={cardRef} run={run} fmt={fmt} />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xxl },
        ]}>
        <View style={styles.headerRow}>
          <MapControl symbol="chevron.left" accessibilityLabel="Back" onPress={() => router.back()} />
          {run ? (
            <View style={styles.headerActions}>
              {hasTrack ? (
                <MapControl
                  symbol={routeSaved ? 'bookmark.fill' : 'bookmark'}
                  accessibilityLabel={
                    routeSaved ? 'Saved as a route' : 'Save this run as a route'
                  }
                  onPress={() => void handleSaveRoute()}
                />
              ) : null}
              <MapControl
                symbol="square.and.arrow.up"
                accessibilityLabel="Share run"
                onPress={() => void handleShare()}
              />
            </View>
          ) : null}
        </View>

        {!loaded ? null : !run ? (
          <Text variant="body" color="textSecondary">
            This run could not be loaded.
          </Text>
        ) : (
          <>
            <View style={styles.headline}>
              <Text variant="micro" color="textSecondary">
                {formatRunDate(run.startedAt)}
              </Text>

              <Metric
                label="Distance"
                value={fmt.distance(run.distanceKm * 1000)}
                unit={fmt.unitLabel}
                emphasis="hero"
                accessibilityLabel={`${fmt.distance(run.distanceKm * 1000)} ${fmt.unitSpoken}`}
              />

              <MetricRow>
                <Metric
                  fill
                  label="Time"
                  value={formatDuration(run.durationSeconds)}
                  accessibilityLabel={`Time ${formatDuration(run.durationSeconds)}`}
                />
                <Metric
                  fill
                  label="Pace"
                  value={fmt.paceWithUnit(run.averagePaceMinPerKm)}
                  accessibilityLabel={fmt.paceSpoken(run.averagePaceMinPerKm)}
                />
              </MetricRow>

              {shoes.length > 0 ? (
                <Pressable
                  onPress={handleSetShoe}
                  accessibilityRole="button"
                  accessibilityLabel={`Shoe, ${shoeLabel}. Change.`}
                  style={({ pressed }) => [styles.shoeRow, pressed && styles.pressed]}>
                  <Text variant="caption" color="textSecondary">
                    Shoe
                  </Text>
                  <Text variant="body" color="accentText">
                    {shoeLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {hasTrack ? (
              <View style={[styles.map, { borderColor: theme.borderSubtle }]}>
                <MapCanvas
                  origin={run.coordinates[run.coordinates.length - 1]}
                  routes={run.route ? [run.route] : []}
                  selectedRouteId={run.route?.id}
                  track={run.coordinates}
                  cameraMode="fit"
                  padding={{ top: 32, bottom: 32, left: 32, right: 32 }}
                />
              </View>
            ) : (
              <Text variant="body" color="textSecondary">
                No GPS track was recorded for this run.
              </Text>
            )}

            {splits.length > 0 ? (
              <View style={styles.splits}>
                <Text variant="micro" color="textSecondary">
                  SPLITS
                </Text>
                {splits.map((split) => (
                  <View key={split.index} style={styles.splitRow}>
                    <Text variant="body" color="textSecondary" tabular style={styles.splitLabel}>
                      {split.distanceMeters === splitMeters
                        ? `${split.index} ${fmt.unitLabel}`
                        : `${fmt.distance(split.distanceMeters)} ${fmt.unitLabel}`}
                    </Text>
                    <View style={styles.splitValues}>
                      <Text variant="body" tabular>
                        {fmt.paceWithUnit(split.paceMinPerKm)}
                      </Text>
                      <Text variant="caption" color="textSecondary" tabular>
                        {formatDuration(split.durationSeconds)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hiddenCard: {
    position: 'absolute',
    top: 0,
    left: -9999,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  headline: {
    gap: spacing.lg,
  },
  shoeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouchTarget,
    gap: spacing.md,
  },
  splits: {
    alignSelf: 'stretch',
    gap: spacing.xxs,
    marginTop: spacing.md,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouchTarget,
  },
  splitLabel: {
    flex: 1,
  },
  splitValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  map: {
    alignSelf: 'stretch',
    height: layout.mapPreviewHeight,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
