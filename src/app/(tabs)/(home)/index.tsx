import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear } from '@/components/appear';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { MapCanvas } from '@/components/map/map-canvas';
import { SectionHeader } from '@/components/section-header';
import { Text } from '@/components/text';
import { WorkoutIcon } from '@/components/workout-icon';
import { impactLight, impactMedium } from '@/lib/haptics';
import { listRoutes } from '@/services/route-storage';
import type { RouteCandidate } from '@/services/routing';
import { useRun } from '@/services/run-context';
import { formatDuration, formatRunDate, type SavedRun } from '@/services/run-session';
import { listRuns } from '@/services/run-storage';
import { useFormatters, useSettings, type Formatters } from '@/services/settings-context';
import {
  addDays,
  summarizeProgress,
  toDateKey,
  weekStartFor,
  workoutsFrom,
  workoutsOnDate,
  WORKOUT_DESCRIPTIONS,
  WORKOUT_LABELS,
  type PlannedWorkout,
} from '@/services/training';
import { planGoalLabel } from '@/services/training-presentation';
import { useTraining } from '@/services/training-context';
import { layout, radii, spacing, useTheme } from '@/theme';

/**
 * Home — one decision: what am I doing today?
 *
 * Today's workout is the dominant block. The week sits under it as a quiet
 * timeline, the last run is secondary, and route discovery is an optional way
 * in. Nothing here is a dashboard: the screen leads with one action (#135).
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const { recoverable, resumeRecovered, discardRecovered, start } = useRun();
  const { settings, loaded } = useSettings();
  const { state } = useTraining();

  const [run, setRun] = useState<SavedRun | null>(null);
  const [routeCount, setRouteCount] = useState(0);
  const [today, setToday] = useState(() => toDateKey(new Date()));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([listRuns(), listRoutes()])
        .then(([runs, routes]) => {
          if (active) {
            setRun(runs[0] ?? null);
            setRouteCount(routes.length);
            setToday(toDateKey(new Date()));
          }
        })
        .catch(() => {
          if (active) {
            setRun(null);
            setRouteCount(0);
          }
        });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    if (loaded && !settings.hasCompletedOnboarding) {
      router.replace('/onboarding');
    }
  }, [loaded, settings.hasCompletedOnboarding]);

  const workout = workoutsOnDate(state, today)[0] ?? null;
  const week = weekStartFor(today);
  const progress = summarizeProgress(state, week, addDays(week, 6));
  const next = workoutsFrom(state, addDays(today, 1))[0] ?? null;

  const startRun = useCallback(() => {
    impactMedium();
    router.push('/record');
  }, []);

  const startWorkout = useCallback(() => {
    if (workout) {
      impactMedium();
      start(null, workout.targetKm, workout.id);
      router.push('/run');
    }
  }, [start, workout]);

  const resume = useCallback(() => {
    impactMedium();
    resumeRecovered();
    router.push('/run');
  }, [resumeRecovered]);

  const discard = useCallback(
    () =>
      Alert.alert('Discard unfinished run?', 'The recorded progress will be removed from this device.', [
        { text: 'Keep run', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: discardRecovered },
      ]),
    [discardRecovered],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + layout.tabBarClearance + spacing.xl,
          },
        ]}>
        <View style={styles.topline}>
          <Text variant="micro" color="textSecondary">
            Roam
          </Text>
          <Text variant="caption" color="textSecondary">
            {formatToday()}
          </Text>
        </View>

        {recoverable ? (
          <Recovery
            distance={`${fmt.distance(recoverable.distanceKm * 1000)} ${fmt.unitLabel}`}
            resume={resume}
            discard={discard}
          />
        ) : null}

        {workout ? (
          <Today workout={workout} fmt={fmt} onStart={startWorkout} />
        ) : (
          <FreeRun onStart={startRun} />
        )}

        {state.plan ? (
          <Training
            goal={planGoalLabel(state.plan)}
            state={state}
            today={today}
            week={week}
            progress={progress}
            next={next}
          />
        ) : (
          <CreatePlan />
        )}

        {run ? (
          <Appear>
            <Recent run={run} fmt={fmt} />
          </Appear>
        ) : (
          <EmptyState
            align="start"
            title="No runs yet"
            body="Your completed runs will appear here."
          />
        )}

        <Pressable
          onPress={() => {
            impactLight();
            router.push('/maps');
          }}
          style={styles.explore}>
          <SymbolView
            name="point.topleft.down.to.point.bottomright.curvepath"
            size={28}
            tintColor={theme.accentText}
          />
          <View style={styles.flex}>
            <Text variant="micro" color="textSecondary">
              EXPLORE
            </Text>
            <Text variant="title">Find somewhere new</Text>
            <Text variant="caption" color="textSecondary">
              {routeCount
                ? `${routeCount} saved ${routeCount === 1 ? 'route' : 'routes'} · explore nearby`
                : 'See what starts nearby.'}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={18} tintColor={theme.textSecondary} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Today's workout — the dominant block. */
function Today({
  workout,
  fmt,
  onStart,
}: {
  workout: PlannedWorkout;
  fmt: Formatters;
  onStart: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { borderBottomColor: theme.divider }]}>
      <Text variant="micro" color="textSecondary">
        TODAY
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="hero">{WORKOUT_LABELS[workout.type]}</Text>
          <Text variant="body" color="textSecondary">
            {WORKOUT_DESCRIPTIONS[workout.type]}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text variant="metric" color="accentText" tabular>
            {fmt.distance(workout.targetKm * 1000)}
          </Text>
          <Text variant="caption" color="textSecondary">
            {fmt.unitLabel}
          </Text>
        </View>
      </View>
      <Button label="Start workout" variant="accent" onPress={onStart} />
      <Pressable onPress={() => router.push('/schedule')}>
        <Text variant="label" color="accentText">
          View this week
        </Text>
      </Pressable>
    </View>
  );
}

/** A day with nothing planned — Start Run is still the primary action. */
function FreeRun({ onStart }: { onStart: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { borderBottomColor: theme.divider }]}>
      <Text variant="micro" color="textSecondary">
        NO WORKOUT TODAY
      </Text>
      <Text variant="hero">Start run</Text>
      <Text variant="body" color="textSecondary">
        A free run from your current location.
      </Text>
      <Button label="Start run" variant="accent" onPress={onStart} style={styles.startRunButton} />
    </View>
  );
}

/** The week at a glance, with the next planned workout under it. */
function Training({
  goal,
  state,
  today,
  week,
  progress,
  next,
}: {
  goal: string;
  state: ReturnType<typeof useTraining>['state'];
  today: string;
  week: string;
  progress: ReturnType<typeof summarizeProgress>;
  next: PlannedWorkout | null;
}) {
  const theme = useTheme();
  return (
    <View style={styles.training}>
      <SectionHeader
        title="Training"
        action={{ label: 'Open plan', onPress: () => router.push('/plan') }}
      />
      <View style={styles.heading}>
        <Text variant="title">{goal}</Text>
        <Text variant="caption" color="textSecondary" tabular>
          {`${progress.completed}/${progress.planned} this week`}
        </Text>
      </View>

      <View style={styles.timeline}>
        {Array.from({ length: 7 }, (_, i) => {
          const date = addDays(week, i);
          const item = state.workouts.find((entry) => entry.date === date);
          const current = date === today;
          const done = item?.status === 'completed';
          return (
            <View key={date} style={styles.day}>
              <Text variant="caption" color={current ? 'accentText' : 'textSecondary'}>
                {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Text>
              <View
                style={[
                  styles.mark,
                  {
                    backgroundColor: done ? theme.accent : item ? theme.fill : theme.background,
                    borderColor: current ? theme.accent : theme.divider,
                  },
                ]}>
                {item ? (
                  <WorkoutIcon
                    type={item.type}
                    size={14}
                    tintColor={done ? theme.accentForeground : theme.textSecondary}
                  />
                ) : null}
              </View>
              {item ? (
                <Text variant="micro" color="textSecondary">
                  {item.targetKm}
                </Text>
              ) : (
                <View style={[styles.rest, { backgroundColor: theme.track }]} />
              )}
            </View>
          );
        })}
      </View>

      <View style={[styles.rule, { backgroundColor: theme.divider }]} />

      <Pressable style={styles.row} onPress={() => router.push('/schedule')}>
        <View
          style={[styles.nextIcon, { backgroundColor: next ? theme.fill : theme.background }]}>
          {next ? <WorkoutIcon type={next.type} size={20} tintColor={theme.text} /> : null}
        </View>
        <View style={styles.flex}>
          <Text variant="caption" color="textSecondary">
            NEXT
          </Text>
          <Text variant="body">
            {next ? `${WORKOUT_LABELS[next.type]} · ${next.targetKm} km` : 'Your week is clear'}
          </Text>
        </View>
        <SymbolView name="chevron.right" size={18} tintColor={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

function CreatePlan() {
  return (
    <View style={styles.section}>
      <Text variant="title">Train for something</Text>
      <Text variant="body" color="textSecondary">
        Set a goal and Roam will shape your week around the days you choose.
      </Text>
      <Button label="Create a plan" variant="secondary" onPress={() => router.push('/plan')} />
    </View>
  );
}

/** A run that was interrupted — the only way to keep it is to finish it. */
function Recovery({
  distance,
  resume,
  discard,
}: {
  distance: string;
  resume: () => void;
  discard: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.recovery, { backgroundColor: theme.inverseBackground }]}>
      <View style={styles.heading}>
        <View style={styles.flex}>
          <Text variant="micro" color="inverse">
            RUN IN PROGRESS
          </Text>
          <Text variant="title" color="inverse">
            {distance} recorded
          </Text>
        </View>
        <Pressable onPress={discard}>
          <Text variant="label" color="inverse">
            Discard
          </Text>
        </Pressable>
      </View>
      <Button label="Resume run" variant="accent" onPress={resume} />
    </View>
  );
}

/** The last completed run — secondary to today, but worth one glance. */
function Recent({ run, fmt }: { run: SavedRun; fmt: Formatters }) {
  const theme = useTheme();
  const route = useMemo<RouteCandidate | null>(
    () =>
      run.coordinates.length > 1
        ? {
            id: run.id,
            distanceKm: run.distanceKm,
            estimatedMinutes: run.durationSeconds / 60,
            geometry: run.coordinates,
            characteristics: [],
          }
        : null,
    [run],
  );

  return (
    <View style={styles.recent}>
      <SectionHeader
        title="Recent run"
        action={{ label: 'All runs', onPress: () => router.push('/profile/history') }}
      />
      <Pressable
        onPress={() => router.push({ pathname: '/profile/run-detail', params: { id: run.id } })}
        style={styles.preview}>
        {route ? (
          <MapCanvas
            origin={null}
            routes={[route]}
            selectedRouteId={route.id}
            cameraMode="fit"
            interactive={false}
            padding={{ top: 12, right: 12, bottom: 12, left: 12 }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.fill }]} />
        )}
        <View style={[styles.readout, { backgroundColor: theme.overlay }]}>
          <Text variant="display" tabular>
            {fmt.distance(run.distanceKm * 1000)}{' '}
            <Text variant="body" color="textSecondary">
              {fmt.unitLabel}
            </Text>
          </Text>
          <Text variant="caption" color="textSecondary">
            {formatRunDate(run.startedAt)}
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {`${formatDuration(run.durationSeconds)}   ${fmt.paceWithUnit(run.averagePaceMinPerKm)}`}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function formatToday() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.xxl,
  },
  topline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  section: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  startRunButton: {
    minHeight: 64,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  metric: {
    alignItems: 'flex-end',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  training: {
    gap: spacing.md,
  },
  timeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    alignItems: 'center',
    gap: 2,
    minWidth: 32,
  },
  mark: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rest: {
    width: 4,
    height: 4,
    borderRadius: radii.pill,
    marginTop: 5,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
  nextIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recovery: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
  },
  recent: {
    gap: spacing.sm,
  },
  preview: {
    height: 190,
    overflow: 'hidden',
    borderRadius: radii.medium,
    borderCurve: 'continuous',
  },
  readout: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    padding: spacing.sm,
    minWidth: 148,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    gap: 2,
  },
  explore: {
    minHeight: 104,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
