import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapCanvas } from '@/components/map/map-canvas';
import { Metric, MetricRow } from '@/components/metric';
import { Text } from '@/components/text';
import { useRun } from '@/services/run-context';
import { formatDuration, formatRunDate } from '@/services/run-session';
import { useFormatters } from '@/services/settings-context';
import { layout, radii, spacing, useTheme } from '@/theme';

/**
 * Run Complete — "that was my run", not a dashboard.
 *
 * Three numbers, the route that was actually recorded, and the only two
 * decisions left. No badges, no calories, no encouragement.
 */
export default function RunSummaryScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { completedRun, saveCompleted, discardCompleted } = useRun();
  const fmt = useFormatters();
  const [saving, setSaving] = useState(false);

  // Nothing to summarize (a reload, or the run was already resolved).
  useEffect(() => {
    if (!completedRun) {
      router.replace('/');
    }
  }, [completedRun]);

  const handleSave = useCallback(async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      await saveCompleted();
      router.replace('/history');
    } catch {
      setSaving(false);
      Alert.alert('Could not save run', 'The run could not be written to this device.');
    }
  }, [saveCompleted, saving]);

  const handleDiscard = useCallback(() => {
    Alert.alert('Discard this run?', 'The recorded run will not be saved.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardCompleted();
          router.replace('/');
        },
      },
    ]);
  }, [discardCompleted]);

  if (!completedRun) {
    return <View style={[styles.root, { backgroundColor: theme.background }]} />;
  }

  const distanceMeters = completedRun.distanceKm * 1000;
  const hasTrack = completedRun.coordinates.length >= 2;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg },
        ]}>
        <View style={styles.headline}>
          <Text variant="micro" color="textSecondary">
            {formatRunDate(completedRun.startedAt)}
          </Text>

          <Metric
            label="Distance"
            value={fmt.distance(distanceMeters)}
            unit={fmt.unitLabel}
            emphasis="hero"
            accessibilityLabel={`${fmt.distance(distanceMeters)} ${fmt.unitSpoken}`}
          />

          <MetricRow>
            <Metric
              fill
              label="Time"
              value={formatDuration(completedRun.durationSeconds)}
              accessibilityLabel={`Time ${formatDuration(completedRun.durationSeconds)}`}
            />
            <Metric
              fill
              label="Pace"
              value={fmt.paceWithUnit(completedRun.averagePaceMinPerKm)}
              accessibilityLabel={fmt.paceSpoken(completedRun.averagePaceMinPerKm)}
            />
          </MetricRow>
        </View>

        {hasTrack ? (
          <View style={[styles.map, { borderColor: theme.borderSubtle }]}>
            <MapCanvas
              origin={completedRun.coordinates[completedRun.coordinates.length - 1]}
              routes={completedRun.route ? [completedRun.route] : []}
              selectedRouteId={completedRun.route?.id}
              track={completedRun.coordinates}
              cameraMode="fit"
              padding={{ top: 32, bottom: 32, left: 32, right: 32 }}
            />
          </View>
        ) : (
          <Text variant="body" color="textSecondary">
            No GPS track was recorded for this run.
          </Text>
        )}
      </ScrollView>

      <View
        style={[
          styles.actions,
          { paddingBottom: insets.bottom + spacing.md, backgroundColor: theme.background },
        ]}>
        <Button
          label="Save run"
          variant="accent"
          onPress={handleSave}
          loading={saving}
        />
        <Button label="Discard" variant="secondary" onPress={handleDiscard} disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.xl,
  },
  headline: {
    gap: spacing.lg,
  },
  map: {
    height: layout.mapPreviewHeight,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Actions stay out of the scroll view so the two decisions are always
  // reachable without scrolling to them.
  actions: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
});
