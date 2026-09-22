import { requireNativeModule } from 'expo-modules-core';
import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';

import { useRun } from '@/services/run-context';
import { useFormatters } from '@/services/settings-context';
import { WORKOUT_LABELS } from '@/services/training';
import { useTraining } from '@/services/training-context';

/**
 * Drives the active-run Live Activity from the run engine (#149).
 *
 * The run engine stays the single source of truth: this only reflects its
 * snapshot through the native ActivityKit module — start one activity per run,
 * push content on a bounded cadence (and immediately on pause/resume/finish),
 * end it when the run ends, and clear leftovers so duplicates cannot stack.
 *
 * Guarded throughout: on a device without the native module, or with Live
 * Activities unsupported or disabled, it does nothing and tracking is normal.
 */
const UPDATE_INTERVAL_MS = 15_000;

type NativeLiveActivity = {
  start: (
    distanceKm: number,
    durationSeconds: number,
    startedAtMs: number,
    paceLabel: string,
    state: string,
    workoutLabel: string,
  ) => string | null;
  update: (
    id: string,
    distanceKm: number,
    durationSeconds: number,
    startedAtMs: number,
    paceLabel: string,
    state: string,
    workoutLabel: string,
  ) => Promise<void>;
  end: (id: string) => Promise<void>;
  endAll: () => Promise<void>;
};

/** Resolved once. Absent on non-iOS or when the module is not linked. */
const native: NativeLiveActivity | null = (() => {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    return requireNativeModule<NativeLiveActivity>('RoamLiveActivity');
  } catch {
    return null;
  }
})();

export function RunLiveActivityBridge() {
  const run = useRun();
  const fmt = useFormatters();
  const { state: training } = useTraining();
  const activityId = useRef<string | null>(null);
  const lastUpdate = useRef(0);
  const lastState = useRef<string | null>(null);

  const workout = run.plannedWorkoutId
    ? (training.workouts.find((entry) => entry.id === run.plannedWorkoutId) ?? null)
    : null;

  const content = useMemo(
    () => ({
      distanceKm: run.distanceMeters / 1000,
      durationSeconds: Math.max(0, Math.round(run.activeSeconds)),
      paceLabel: fmt.paceWithUnit(run.paceMinPerKm),
      state: run.status === 'paused' ? 'paused' : 'active',
      // A planned workout's label, else the kind chosen in the launcher (#151),
      // else empty so the widget falls back to its own title.
      workoutLabel: workout
        ? WORKOUT_LABELS[workout.type]
        : run.workoutType
          ? WORKOUT_LABELS[run.workoutType]
          : '',
    }),
    [run.distanceMeters, run.activeSeconds, run.paceMinPerKm, run.status, run.workoutType, workout, fmt],
  );



  const running = run.status === 'active' || run.status === 'paused';

  // Start / end with the run lifecycle.
  useEffect(() => {
    if (!native) {
      return;
    }
    let cancelled = false;
    void (async () => {
      if (running) {
        if (activityId.current === null) {
          // End anything left over from an earlier session before starting.
          await native.endAll().catch(() => {});
          if (cancelled) {
            return;
          }
          // Anchor the system clock so the elapsed time ticks live: the widget
          // counts up from this instant, and each push re-anchors it slightly.
          const id = native.start(
            content.distanceKm,
            content.durationSeconds,
            Date.now() - content.durationSeconds * 1000,
            content.paceLabel,
            content.state,
            content.workoutLabel,
          );
          if (!cancelled) {
            activityId.current = id;
            lastUpdate.current = Date.now();
            lastState.current = content.state;
          }
        }
      } else if (activityId.current !== null) {
        const id = activityId.current;
        activityId.current = null;
        await native.end(id).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
    // Lifecycle only: content is pushed in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Push content on a bounded cadence, and immediately on a state change.
  useEffect(() => {
    if (!native || activityId.current === null) {
      return;
    }
    const now = Date.now();
    const isStateChange = lastState.current !== content.state;
    lastState.current = content.state;
    if (!isStateChange && now - lastUpdate.current < UPDATE_INTERVAL_MS) {
      return;
    }
    lastUpdate.current = now;
    const id = activityId.current;
    void native
      .update(
        id,
        content.distanceKm,
        content.durationSeconds,
        Date.now() - content.durationSeconds * 1000,
        content.paceLabel,
        content.state,
        content.workoutLabel,
      )
      .catch(() => {});
  }, [content]);

  return null;
}
