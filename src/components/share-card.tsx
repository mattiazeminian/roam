import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapCanvas } from '@/components/map/map-canvas';
import { Metric, MetricRow } from '@/components/metric';
import { Text } from '@/components/text';
import { formatDuration, formatRunDate, type SavedRun } from '@/services/run-session';
import type { Formatters } from '@/services/settings-context';
import { colors, radii, spacing } from '@/theme';

const CARD_WIDTH = 390;
const CARD_HEIGHT = 488;

export type ShareCardProps = {
  run: SavedRun;
  fmt: Formatters;
};

/**
 * The composed view captured for a run share image (#25).
 *
 * Fixed size and rendered off-screen — see `run-detail.tsx`/`run-summary.tsx`
 * for how it is mounted and captured with `react-native-view-shot`. Shows
 * only what ROAM actually recorded: the route, distance, duration, pace and
 * date. No badges, streaks or calories, matching the restraint of the rest
 * of the app.
 *
 * Colours are read directly from `colors` rather than `useTheme()`: a share
 * card should look the same regardless of the system appearance the runner
 * happens to be in when they tap Share, so it deliberately does not follow
 * dark mode.
 */
export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard({ run, fmt }, ref) {
  const hasTrack = run.coordinates.length >= 2;

  return (
    <View ref={ref} style={styles.root} collapsable={false}>
      <View style={styles.map}>
        {hasTrack ? (
          <MapCanvas
            origin={run.coordinates[run.coordinates.length - 1]}
            routes={run.route ? [run.route] : []}
            selectedRouteId={run.route?.id}
            track={run.coordinates}
            cameraMode="fit"
            interactive={false}
            padding={{ top: 24, bottom: 24, left: 24, right: 24 }}
          />
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text variant="micro" color="textSecondary">
          {formatRunDate(run.startedAt)}
        </Text>

        <Metric
          label="Distance"
          value={fmt.distance(run.distanceKm * 1000)}
          unit={fmt.unitLabel}
          emphasis="hero"
        />

        <MetricRow>
          <Metric fill label="Time" value={formatDuration(run.durationSeconds)} />
          <Metric fill label="Pace" value={fmt.paceWithUnit(run.averagePaceMinPerKm)} />
        </MetricRow>

        <Text variant="micro" color="textSecondary" style={styles.wordmark}>
          ROAM
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: colors.background,
    overflow: 'hidden',
    borderRadius: radii.medium,
  },
  map: {
    height: CARD_HEIGHT * 0.6,
    backgroundColor: colors.surface,
  },
  panel: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  wordmark: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    letterSpacing: 2,
  },
});
