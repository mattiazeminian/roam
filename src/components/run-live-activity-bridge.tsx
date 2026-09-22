import type { LiveActivity } from 'expo-widgets';
import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';

import { useRun } from '@/services/run-context';
import { RunLiveActivity, type RunActivityProps } from '@/services/run-live-activity';
import { useFormatters } from '@/services/settings-context';
import { WORKOUT_LABELS } from '@/services/training';
import { useTraining } from '@/services/training-context';

/**
 * Drives the active-run Live Activity from the run engine (#149).
 *
 * The run engine stays the single source of truth: this only translates its
 * snapshot into activity props. It starts one activity per run, pushes content
 * on a bounded cadence (and immediately on pause/resume/finish), ends it when
 * the run ends, and cleans up leftovers so duplicates cannot accumulate.
 *
 * Every call is guarded: a device without Live Activities, or one where they
 * are disabled, simply does nothing — tracking is never affected.
 */
const UPDATE_INTERVAL_MS = 15_000;
const DEEP_LINK = 'roam://run';

export function RunLiveActivityBridge() {
  const run = useRun();
  const fmt = useFormatters();
  const { state: training } = useTraining();
  const instance = useRef<LiveActivity<RunActivityProps> | null>(null);
  const lastUpdate = useRef(0);

  const workout = run.plannedWorkoutId
    ? (training.workouts.find((entry) => entry.id === run.plannedWorkoutId) ?? null)
    : null;

  const props = useMemo<RunActivityProps>(
    () => ({
      distanceKm: run.distanceMeters / 1000,
      durationSeconds: run.activeSeconds,
      paceLabel: fmt.paceWithUnit(run.paceMinPerKm),
      state: run.status === 'paused' ? 'paused' : 'active',
      workoutLabel: workout ? WORKOUT_LABELS[workout.type] : null,
    }),
    // Recompute when any displayed value changes.
    [run.distanceMeters, run.activeSeconds, run.paceMinPerKm, run.status, workout, fmt],
  );

  const running = run.status === 'active' || run.status === 'paused';

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    try {
      if (running && !instance.current) {
        // A previous session may have left an activity behind (a kill, a crash);
        // end those before starting a fresh one so only one ever exists.
        for (const stale of RunLiveActivity.getInstances()) {
          void stale.end('immediate');
        }
        instance.current = RunLiveActivity.start(props, DEEP_LINK);
        lastUpdate.current = Date.now();
      } else if (!running && instance.current) {
        const current = instance.current;
        instance.current = null;
        void current.end('immediate', props);
      }
    } catch {
      // Live Activities unsupported or disabled: track normally.
      instance.current = null;
    }
    // Lifecycle is keyed on `running`; content is pushed in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    const current = instance.current;
    if (!current) {
      return;
    }
    const now = Date.now();
    const isStateChange = run.status !== 'active';
    if (!isStateChange && now - lastUpdate.current < UPDATE_INTERVAL_MS) {
      return;
    }
    lastUpdate.current = now;
    current.update(props).catch(() => {});
  }, [props, run.status]);

  return null;
}
