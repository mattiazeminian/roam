import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ActionSheet } from '@/components/action-sheet';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Metric, MetricRow } from '@/components/metric';
import { ShareCard } from '@/components/share-card';
import { Text } from '@/components/text';
import { compareRunToRecent, type RecentComparison } from '@/services/run-analytics';
import { useRun } from '@/services/run-context';
import { runShareMessage } from '@/services/run-share';
import { formatDuration, formatRunDate } from '@/services/run-session';
import { listRuns } from '@/services/run-storage';
import { useFormatters } from '@/services/settings-context';
import { deriveWorkoutOutcome, WORKOUT_LABELS } from '@/services/training';
import { useTraining } from '@/services/training-context';
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
  const { state: training, markWorkout } = useTraining();
  const fmt = useFormatters();
  const [saving, setSaving] = useState(false);
  const [comparison, setComparison] = useState<RecentComparison | null>(null);
  const [showDiscardSheet, setShowDiscardSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<View>(null);

  // A light comparison against the runner's own recent, similar runs (#42).
  // The just-finished run is not saved yet, so this is against prior runs
  // only; if there are none comparable, nothing is shown.
  useEffect(() => {
    if (!completedRun) {
      return;
    }
    let active = true;
    void listRuns()
      .then((runs) => {
        if (active) {
          setComparison(compareRunToRecent(completedRun, runs));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [completedRun]);

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
    // Captured before `saveCompleted` resets the session. A run started from a
    // planned workout links back to it once it is saved (#116), and its outcome
    // is derived from what was actually run (#72) — never asserted.
    const run = completedRun;
    const plannedWorkout = run?.plannedWorkoutId
      ? (training.workouts.find((workout) => workout.id === run.plannedWorkoutId) ?? null)
      : null;
    const outcome = plannedWorkout && run ? deriveWorkoutOutcome(plannedWorkout, run) : 'completed';
    const runId = run?.id;
    try {
      await saveCompleted();
      if (plannedWorkout && runId) {
        // The run is already saved; failing to update the plan must not undo
        // that, so this is best-effort.
        await markWorkout(plannedWorkout.id, outcome, runId).catch(() => {});
      }
      router.replace('/profile/history');
    } catch {
      setSaving(false);
      setError('The run could not be written to this device.');
    }
  }, [completedRun, markWorkout, saveCompleted, saving, training.workouts]);

  const handleDiscard = useCallback(() => {
    setShowDiscardSheet(true);
  }, []);

  // Sharing needs no save first — the runner can send the result and still
  // decide whether to keep it. Dismissing the sheet is not an error.
  const handleShare = useCallback(async () => {
    if (!completedRun) {
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
        uri
          ? { url: uri, message: runShareMessage(completedRun, fmt) }
          : { message: runShareMessage(completedRun, fmt) },
      );
    } catch {
      // Dismissed, or sharing unavailable.
    }
  }, [completedRun, fmt]);

  if (!completedRun) {
    return <View style={[styles.root, { backgroundColor: theme.background }]} />;
  }

  const distanceMeters = completedRun.distanceKm * 1000;
  const hasTrack = completedRun.coordinates.length >= 2;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}> 
      <ActionSheet
        visible={showDiscardSheet}
        title="Discard this run?"
        message="The recorded run will not be saved."
        actions={[{ label: 'Discard', destructive: true, onPress: () => { discardCompleted(); router.replace('/'); } }]}
        onClose={() => setShowDiscardSheet(false)}
      />
      {error ? <Text variant="body" color="danger">{error}</Text> : null}
      <View style={styles.hiddenCard} pointerEvents="none">
        <ShareCard ref={cardRef} run={completedRun} fmt={fmt} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg },
        ]}>
        <View style={styles.headerRow}>
          <MapControl
            symbol="square.and.arrow.up"
            accessibilityLabel="Share run"
            onPress={() => void handleShare()}
          />
        </View>

        <View style={styles.headline}>
          <Text variant="micro" color="textSecondary">
            {formatRunDate(completedRun.startedAt)}
          </Text>
          {completedRun.workoutType ? (
            <Text variant="body" color="textSecondary">
              {WORKOUT_LABELS[completedRun.workoutType]}
              {completedRun.targetDurationSeconds
                ? ` · ${formatDuration(completedRun.targetDurationSeconds)} target`
                : ''}
            </Text>
          ) : null}

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

          {comparisonSentence(comparison) ? (
            <Text variant="caption" color="textSecondary">
              {comparisonSentence(comparison)}
            </Text>
          ) : null}
        </View>

        {hasTrack ? (
          <View style={[styles.map, { borderColor: theme.borderSubtle }]}>
            <MapCanvas
              origin={completedRun.coordinates[completedRun.coordinates.length - 1]}
              routes={completedRun.route ? [completedRun.route] : []}
              selectedRouteId={completedRun.route?.id}
              track={completedRun.coordinates}
              cameraMode="fit"
              interactive={false}
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

/**
 * A factual one-liner, or null when there is nothing worth saying. No
 * performance or health claim: it states a difference against the runner's own
 * runs and stops there (#42).
 */
function comparisonSentence(comparison: RecentComparison | null): string | null {
  if (!comparison) {
    return null;
  }
  const baseline = `your last ${comparison.comparedCount} similar ${
    comparison.comparedCount === 1 ? 'run' : 'runs'
  }`;

  if (comparison.paceDeltaMinPerKm !== null) {
    const seconds = Math.round(Math.abs(comparison.paceDeltaMinPerKm) * 60);
    if (seconds >= 5) {
      return `${seconds}s/km ${comparison.paceDeltaMinPerKm < 0 ? 'faster' : 'slower'} than ${baseline}`;
    }
  }

  if (Math.abs(comparison.distanceDeltaKm) >= 0.1) {
    return `${Math.abs(comparison.distanceDeltaKm).toFixed(1)} km ${
      comparison.distanceDeltaKm > 0 ? 'longer' : 'shorter'
    } than ${baseline}`;
  }

  return null;
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
    gap: spacing.xl,
  },
  headline: {
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
