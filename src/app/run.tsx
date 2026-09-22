import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';
import { ActionSheet } from '@/components/action-sheet';
import { HoldButton } from '@/components/hold-button';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Metric, MetricRow } from '@/components/metric';
import { ControlPanel } from '@/components/control-panel';
import { SlideToConfirm } from '@/components/slide-to-confirm';
import { Text } from '@/components/text';
import { WorkoutIcon } from '@/components/workout-icon';
import { selectionFeedback } from '@/lib/haptics';
import { cumulativeDistances, sliceAlongPath } from '@/services/geo';
import { useRun } from '@/services/run-context';
import { compassDirection, formatDuration, formatShortDistance } from '@/services/run-session';
import { useFormatters } from '@/services/settings-context';
import { WORKOUT_LABELS } from '@/services/training';
import { remainingDurationSeconds, runExecutionMode } from '@/services/run-execution';
import { useTraining } from '@/services/training-context';
import { WORKOUT_STEP_LABELS } from '@/services/workout-execution';
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
    workoutType,
    targetKm,
    targetDurationSeconds,
    workoutSteps,
    workoutStep,
    workoutStepProgress,
    workoutStepRemaining,
    workoutStepsComplete,
    distanceMeters,
    activeSeconds,
    paceMinPerKm,
    currentPaceMinPerKm,
    track,
    progressMeters,
    degradedSignal,
    autoPaused,
    position,
    completionSuggested,
    offRoute,
    distanceToRouteMeters,
    directionToRouteDegrees,
    pause,
    resume,
    finish,
    dismissCompletionSuggestion,
    reroute,
    rerouting,
    rerouteError,
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

  // The run engine owns phase state (#148), so this screen only reacts to it.
  // A phase change is a real state change, so it gets a selection haptic; the
  // step objects are stable while the phase holds, so the id only changes on a
  // transition.
  const lastStepId = useRef<string | null>(null);
  useEffect(() => {
    const id = workoutStep?.id ?? null;
    if (id !== null && lastStepId.current !== null && id !== lastStepId.current) {
      selectionFeedback();
    }
    lastStepId.current = id;
  }, [workoutStep?.id]);

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
  // The run's own target, which is what a distance run from Record sets —
  // the planned workout's target is only a fallback.
  const targetProgressKm = targetKm > 0 ? targetKm : (plannedWorkout?.targetKm ?? 0);
  const executionMode = runExecutionMode(workoutType, targetDurationSeconds, targetProgressKm);
  const remainingSeconds = remainingDurationSeconds(targetDurationSeconds, activeSeconds);
  const workoutProgress =
    targetProgressKm > 0 ? Math.min(1, distanceMeters / 1000 / targetProgressKm) : 0;
  const workoutComplete =
    executionMode === 'time'
      ? remainingSeconds === 0
      : (targetProgressKm > 0 && workoutProgress >= 1) || workoutStepsComplete;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}> 
      <ActionSheet
        visible={completionSuggested}
        title="Finish run?"
        message="Looks like you're back at the start."
        actions={[{ label: 'Finish', onPress: finish }]}
        onClose={() => {
          dismissCompletionSuggestion();
        }}
      />
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
          ) : workoutType ? (
            // A free run the runner labelled on Record, e.g. a tempo run.
            <GlassSurface radius={radii.pill} style={styles.pill}>
              <WorkoutIcon type={workoutType} size={layout.iconSizeSmall} tintColor={theme.text} />
              <Text variant="micro" color="text">
                {WORKOUT_LABELS[workoutType]}
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

          {/* Auto-pause is visible while it is holding the clock, so a frozen
              timer never looks like a bug (#38). Manual pause takes over the
              label above. */}
          {autoPaused && !isPaused ? (
            <GlassSurface radius={radii.pill} style={styles.pill}>
              <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
              <Text
                variant="micro"
                color="textSecondary"
                accessibilityLiveRegion="polite"
                accessibilityLabel="Auto-paused. Still recording your position.">
                Auto-paused
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
                {`Off route · ${formatShortDistance(distanceToRouteMeters, fmt.unit)}${
                  directionToRouteDegrees !== null
                    ? ` ${compassDirection(directionToRouteDegrees)}`
                    : ''
                }`}
              </Text>
            </GlassSurface>
          ) : null}

          {/* The way back is always an explicit tap, never automatic (#64). */}
          {offRoute && route ? (
            <Pressable
              onPress={() => void reroute()}
              disabled={rerouting}
              accessibilityRole="button"
              accessibilityLabel={
                rerouting
                  ? 'Finding a way back to your route'
                  : 'Route back to your planned route'
              }
              style={({ pressed }) => (pressed && !rerouting ? styles.pressed : undefined)}>
              <GlassSurface radius={radii.pill} style={styles.pill}>
                <SymbolView
                  name="arrow.uturn.backward"
                  size={layout.iconSizeSmall}
                  tintColor={theme.text}
                />
                <Text variant="micro" color="text">
                  {rerouting ? 'Finding a way back…' : 'Back to route'}
                </Text>
              </GlassSurface>
            </Pressable>
          ) : null}

          {rerouteError ? (
            <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
              {rerouteError}
            </Text>
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
          {executionMode === 'time' ? (
            <Metric
              label="Remaining"
              value={formatDuration(remainingSeconds)}
              emphasis="hero"
              accessibilityLabel={`Remaining ${formatDuration(remainingSeconds)}`}
            />
          ) : (
            <Metric
              label={plannedWorkout?.type === 'long' ? 'Distance progress' : 'Distance'}
              value={fmt.distance(distanceMeters)}
              unit={fmt.unitLabel}
              emphasis="hero"
              accessibilityLabel={`Distance ${fmt.distance(distanceMeters)} ${fmt.unitSpoken}`}
            />
          )}

          {/* A structured workout shows the phase being run and how far into it
              the runner is; a plain target shows overall progress (#148). */}
          {workoutStep && workoutSteps.length > 1 ? (
            <>
              <View style={styles.phaseRow}>
                <Text variant="micro" color="accentText" accessibilityLiveRegion="polite">
                  {WORKOUT_STEP_LABELS[workoutStep.kind]}
                </Text>
                <Text variant="caption" color="textSecondary" tabular>
                  {workoutStep.target.kind === 'duration'
                    ? `${formatDuration(workoutStepRemaining)} left`
                    : `${fmt.distance(workoutStepRemaining)} ${fmt.unitLabel} left`}
                </Text>
              </View>
              <View
                style={[styles.workoutProgress, { backgroundColor: theme.track }]}
                accessibilityLabel={`${WORKOUT_STEP_LABELS[workoutStep.kind]}, ${Math.round(
                  workoutStepProgress * 100,
                )} percent`}>
                <View
                  style={[
                    styles.workoutProgressFill,
                    {
                      width: `${Math.round(workoutStepProgress * 100)}%`,
                      backgroundColor: theme.accent,
                    },
                  ]}
                />
              </View>
            </>
          ) : executionMode !== 'time' && targetProgressKm > 0 ? (
            <View
              style={[styles.workoutProgress, { backgroundColor: theme.track }]}
              accessibilityLabel={`${Math.round(workoutProgress * 100)} percent of target`}>
              <View
                style={[
                  styles.workoutProgressFill,
                  { width: `${Math.round(workoutProgress * 100)}%`, backgroundColor: theme.accent },
                ]}
              />
            </View>
          ) : null}

          {workoutComplete ? (
            <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
              Workout complete · continue running or finish
            </Text>
          ) : null}

          {/* Current pace gets its own line: it is the number a runner checks
              mid-run, so it sits above the totals rather than sharing a row
              with them (#36). Withheld, not guessed, until there is enough
              recent movement to trust it. */}
          <Metric
            label="Current pace"
            value={fmt.paceWithUnit(currentPaceMinPerKm)}
            accessibilityLabel={fmt.paceSpoken(currentPaceMinPerKm)}
          />

          <MetricRow>
            <Metric
              fill
              label="Time"
              value={formatDuration(activeSeconds)}
              accessibilityLabel={`Time ${formatDuration(activeSeconds)}`}
            />
            {executionMode === 'time' ? (
              <Metric fill label="Distance" value={fmt.distance(distanceMeters)} unit={fmt.unitLabel} />
            ) : null}
            <Metric
              fill
              label="Avg pace"
              value={fmt.paceWithUnit(paceMinPerKm)}
              accessibilityLabel={fmt.paceSpoken(paceMinPerKm)}
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
  pressed: {
    opacity: 0.6,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workoutProgress: {
    height: 4,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  workoutProgressFill: {
    height: '100%',
  },
});
