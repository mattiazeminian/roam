import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Metric, MetricRow } from '@/components/metric';
import { ShareCard } from '@/components/share-card';
import { Text } from '@/components/text';
import { runShareMessage } from '@/services/run-share';
import { formatDuration, formatRunDate, type SavedRun } from '@/services/run-session';
import { useFormatters } from '@/services/settings-context';
import { getRun } from '@/services/run-storage';
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
  const cardRef = useRef<View>(null);

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
            <MapControl
              symbol="square.and.arrow.up"
              accessibilityLabel="Share run"
              onPress={() => void handleShare()}
            />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
