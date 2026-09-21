import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';
import { HoldButton } from '@/components/hold-button';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Metric, MetricRow } from '@/components/metric';
import { ControlPanel } from '@/components/control-panel';
import { SlideToConfirm } from '@/components/slide-to-confirm';
import { Text } from '@/components/text';
import { WorkoutIcon } from '@/components/workout-icon';
import { cumulativeDistances, sliceAlongPath } from '@/services/geo';
import { useRun } from '@/services/run-context';
import { compassDirection, formatDuration } from '@/services/run-session';
import { useFormatters } from '@/services/settings-context';
import { WORKOUT_LABELS } from '@/services/training';
import { useTraining } from '@/services/training-context';
import { layout, radii, spacing, useTheme } from '@/theme';

/**
 * Active Run — the map is the screen; the readout sits on the sheet.
 *
 * Distance, time and pace only. Everything shown comes from the GPS track, and
 * progress along the planned route comes from position, never from elapsed
 * time.
 */
export default function ActiveRunScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    status,
    route,
    plannedWorkoutId,
    distanceMeters,
    activeSeconds,
    paceMinPerKm,
    currentPaceMinPerKm,
    track,
    progressMeters,
    degradedSignal,
    position,
    completionSuggested,
    offRoute,
    distanceToRouteMeters,
    directionToRouteDegrees,
    pause,
    resume,
    finish,
    dismissCompletionSuggestion,
  } = useRun();

  const fmt = useFormatters();
  const { state: training } = useTraining();
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [followBroken, setFollowBroken] = useState(false);

  // The planned workout this run was started from, if any — so the runner can
  // see what they set out to do, not just what they are doing (#116).
  const plannedWorkout = plannedWorkoutId
    ? training.workouts.find((workout) => workout.id === plannedWorkoutId) ?? null
    : null;

  // This screen is only ever mounted while a run is active or paused (see the
  // redirect below), so keeping the screen awake for its whole lifetime is
  // exactly "while a run is in progress" — no separate active/paused branch
  // needed.
  useKeepAwake();

  // A finished run hands off to the summary; an idle one means there is no
  // session (a reload, or a deep link), so fall back to Home.
  useEffect(() => {
    if (status === 'finished') {
      router.replace('/run-summary');
    } else if (status === 'idle') {
      router.replace('/');
    }
  }, [status]);

  // Suggest finishing once the runner has covered the loop and returned to
  // the start; hold-to-finish keeps working regardless of this prompt.
  useEffect(() => {
    if (!completionSuggested) {
      return;
    }
    Alert.alert('Finish run?', "Looks like you're back at the start.", [
      { text: 'Keep going', style: 'cancel', onPress: dismissCompletionSuggestion },
      { text: 'Finish', onPress: finish },
    ]);
  }, [completionSuggested, dismissCompletionSuggestion, finish]);

  const completedGeometry = useMemo(() => {
    if (!route || route.geometry.length < 2 || progressMeters <= 0) {
      return undefined;
    }
    const cumulative = cumulativeDistances(route.geometry);
    return sliceAlongPath(route.geometry, cumulative, progressMeters);
  }, [route, progressMeters]);

  const handleRecenter = useCallback(() => {
    setFollowBroken(false);
    setRecenterSignal((value) => value + 1);
  }, []);

  const isPaused = status === 'paused';

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <MapCanvas
        origin={position}
        routes={route ? [route] : []}
        // Deliberately not marked selected: during a run the plan is the
        // reference, not the subject. It stays thin and neutral so the accent
        // completed portion drawn over it is what the runner actually reads.
        cameraMode="follow"
        recenterSignal={recenterSignal}
        track={track}
        completedGeometry={completedGeometry}
        onFollowBroken={() => setFollowBroken(true)}
      />

      <View
        style={[
          styles.topRow,
          { top: insets.top + spacing.xs, paddingHorizontal: layout.screenMargin },
        ]}
        pointerEvents="box-none">
        <View style={styles.status}>
          {plannedWorkout ? (
            <GlassSurface radius={radii.pill} style={styles.pill}>
              <WorkoutIcon
                type={plannedWorkout.type}
                size={layout.iconSizeSmall}
                tintColor={theme.text}
              />
              <Text variant="micro" color="text">
                {`${WORKOUT_LABELS[plannedWorkout.type]} · ${fmt.distance(
                  plannedWorkout.targetKm * 1000,
                )} ${fmt.unitLabel}`}
              </Text>
            </GlassSurface>
          ) : null}

          {isPaused ? (
            <GlassSurface radius={radii.pill} style={styles.pill}>
              <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
              <Text variant="micro" color="text">
                Paused
              </Text>
            </GlassSurface>
          ) : null}

          {degradedSignal ? (
            // Never imply the track is accurate when the fixes are not — but
            // also never imply the run has stopped. Those are two different
            // anxieties and only one of them is true, so the pill says which.
            <GlassSurface radius={radii.pill} style={styles.pill}>
              <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
              <Text
                variant="micro"
                color="textSecondary"
                accessibilityLiveRegion="polite"
                accessibilityLabel="Weak GPS signal. Still recording your run.">
                Weak GPS · still recording
              </Text>
            </GlassSurface>
          ) : null}

          {offRoute ? (
            // Conveyed by icon + text, not colour alone — a glance while
            // running still needs to work for anyone who can't rely on hue.
            <GlassSurface radius={radii.pill} style={styles.pill}>
              <SymbolView
                name="location.slash"
                size={layout.iconSizeSmall}
                tintColor={theme.textSecondary}
              />
              <Text variant="micro" color="textSecondary" accessibilityLiveRegion="polite">
                {`Off route · ${Math.round(distanceToRouteMeters)}m${
                  directionToRouteDegrees !== null
                    ? ` ${compassDirection(directionToRouteDegrees)}`
                    : ''
                }`}
              </Text>
            </GlassSurface>
          ) : null}
        </View>

        {followBroken ? (
          <MapControl
            symbol="location"
            accessibilityLabel="Recenter on your position"
            onPress={handleRecenter}
          />
        ) : null}
      </View>

      <View style={styles.sheetAnchor}>
        <ControlPanel style={styles.sheet}>
          <Metric
            label="Distance"
            value={fmt.distance(distanceMeters)}
            unit={fmt.unitLabel}
            emphasis="hero"
            accessibilityLabel={`Distance ${fmt.distance(distanceMeters)} ${fmt.unitSpoken}`}
          />

          <MetricRow>
            <Metric
              fill
              label="Time"
              value={formatDuration(activeSeconds)}
              accessibilityLabel={`Time ${formatDuration(activeSeconds)}`}
            />
            <Metric
              fill
              label="Avg pace"
              value={fmt.paceWithUnit(paceMinPerKm)}
              accessibilityLabel={fmt.paceSpoken(paceMinPerKm)}
            />
            {/* Current pace over a trailing window (#37) — withheld, not
                guessed, when there isn't enough recent movement to trust it;
                `fmt.paceWithUnit(null)` already renders the same placeholder
                average pace uses before the run has moved. */}
            <Metric
              fill
              label="Current"
              value={fmt.paceWithUnit(currentPaceMinPerKm)}
              accessibilityLabel={`Current pace ${fmt.paceSpoken(currentPaceMinPerKm)}`}
            />
          </MetricRow>

          <View style={styles.controls}>
            {isPaused ? (
              <HoldButton
                label="Hold to resume"
                holdingLabel="Keep holding…"
                accessibilityLabel="Resume run"
                variant="accent"
                durationMs={600}
                symbol="play.fill"
                onComplete={resume}
              />
            ) : (
              <HoldButton
                label="Hold to pause"
                holdingLabel="Keep holding…"
                accessibilityLabel="Pause run"
                variant="secondary"
                durationMs={600}
                symbol="pause.fill"
                onComplete={pause}
              />
            )}
            <SlideToConfirm
              label="Slide to finish"
              accessibilityLabel="Finish run"
              onComplete={finish}
            />
          </View>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  status: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: layout.indicatorSize,
    height: layout.indicatorSize,
    borderRadius: layout.indicatorSize / 2,
  },
  sheetAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    gap: spacing.lg,
  },
  controls: {
    gap: spacing.xs,
  },
});
