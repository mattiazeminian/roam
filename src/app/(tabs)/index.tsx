import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM } from '@/components/distance-control';
import { FindRouteSheet } from '@/components/find-route-sheet';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { WORKOUT_SYMBOLS } from '@/components/workout-icon';
import { errorFeedback, impactLight, impactMedium, selectionFeedback, successFeedback } from '@/lib/haptics';
import { describeCoordinate } from '@/services/geocoding';
import { useLocation } from '@/services/location-context';
import { summarizeRuns, weeklyRunStreak, type RunOverview } from '@/services/run-analytics';
import { useRoutes } from '@/services/route-context';
import { listRoutes } from '@/services/route-storage';
import type { Coordinate } from '@/services/routing';
import { useRun } from '@/services/run-context';
import { listRuns } from '@/services/run-storage';
import { useFormatters, useSettings, type Formatters } from '@/services/settings-context';
import {
  addDays,
  summarizeProgress,
  toDateKey,
  weekStartFor,
  weekdayOf,
  workoutsFrom,
  workoutsOnDate,
  WORKOUT_LABELS,
  type PlannedWorkout,
  type WorkoutStatus,
} from '@/services/training';
import { useTraining } from '@/services/training-context';
import { layout, radii, spacing, useTheme } from '@/theme';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type SymbolName = ComponentProps<typeof SymbolView>['name'];

const STATUS_LABELS: Record<WorkoutStatus, string> = {
  planned: 'Missed',
  completed: 'Completed',
  skipped: 'Skipped',
  modified: 'Modified',
};

/**
 * Home — the training dashboard (#114).
 *
 * Plan first, not map first: what to run today, how the week is shaped, what is
 * next, and what has happened. The map survives only as a small window inside
 * today's session, because Maps is the route workspace now.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const {
    status: locationStatus,
    origin,
    originLabel,
    hasCustomOrigin,
    setOrigin,
    finish,
    clearFinish,
    refresh,
  } = useLocation();
  const { status: routeStatus, errorMessage, find } = useRoutes();
  const { start, recoverable, resumeRecovered, discardRecovered } = useRun();
  const { settings, loaded: settingsLoaded, update } = useSettings();
  const { state: training } = useTraining();

  const [chosenKm, setChosenKm] = useState<number | null>(null);
  const distanceKm = chosenKm ?? settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM;
  const [findRoutesOpen, setFindRoutesOpen] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [overview, setOverview] = useState<RunOverview | null>(null);
  const [todayKey, setTodayKey] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const now = Date.now();
      const today = toDateKey(new Date());
      void Promise.all([listRuns(), listRoutes()])
        .then(([runs, routes]) => {
          if (!active) {
            return;
          }
          setSavedRoutes(routes.length);
          setStreakWeeks(weeklyRunStreak(runs, today));
          setOverview(summarizeRuns(runs, now, 7));
          setTodayKey(today);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const needsOnboarding = settingsLoaded && !settings.hasCompletedOnboarding;
  useEffect(() => {
    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [needsOnboarding]);

  useEffect(() => {
    if (!recoverable) {
      return;
    }
    Alert.alert(
      'Resume your run?',
      `ROAM found an interrupted run in progress (${recoverable.distanceKm.toFixed(2)} km so far). Resume it or discard it.`,
      [
        { text: 'Discard', style: 'destructive', onPress: discardRecovered },
        {
          text: 'Resume',
          onPress: () => {
            resumeRecovered();
            router.push('/run');
          },
        },
      ],
    );
  }, [recoverable, resumeRecovered, discardRecovered]);

  const handleOriginMoved = useCallback(
    (nextOrigin: Coordinate) => {
      selectionFeedback();
      setOrigin({ label: 'Dropped pin', coordinate: nextOrigin });
      void describeCoordinate(nextOrigin).then((name) => {
        if (name) {
          setOrigin({ label: name, coordinate: nextOrigin });
        }
      });
    },
    [setOrigin],
  );

  const isFinding = routeStatus === 'finding';
  const hasError = routeStatus === 'error';

  const handleFindRoutes = useCallback(async () => {
    if (isFinding || !origin) {
      return;
    }
    impactLight();
    const found = await find(origin, distanceKm, finish?.coordinate ?? null);
    if (!found) {
      errorFeedback();
      return;
    }
    successFeedback();
    update({ defaultDistanceKm: distanceKm });
    router.push('/routes');
  }, [origin, distanceKm, finish, find, isFinding, update]);

  const handleStart = useCallback(
    (targetKm: number) => {
      impactMedium();
      start(null, targetKm);
      router.push('/run');
    },
    [start],
  );

  // -- Training, derived from the plan -------------------------------------

  const todayWorkout: PlannedWorkout | null = todayKey
    ? (workoutsOnDate(training, todayKey)[0] ?? null)
    : null;
  const upcoming = todayKey ? workoutsFrom(training, addDays(todayKey, 1)).slice(0, 3) : [];
  const recent = [...training.workouts]
    .filter((workout) => workout.date <= todayKey)
    .filter((workout) => workout.status !== 'planned' || workout.date < todayKey)
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .slice(0, 3);

  const weekStart = todayKey ? weekStartFor(todayKey) : '';
  const progress = todayKey
    ? summarizeProgress(training, weekStart, addDays(weekStart, 6))
    : { planned: 0, completed: 0, skipped: 0, plannedKm: 0, completedKm: 0 };

  const plannedMinutes = todayWorkout
    ? Math.max(1, Math.round(todayWorkout.targetKm * settings.typicalPaceMinPerKm))
    : 0;

  const weekDays = weekStart
    ? Array.from({ length: 7 }, (_, index) => {
        const date = addDays(weekStart, index);
        return {
          date,
          letter: DAY_LETTERS[index],
          workout: workoutsOnDate(training, date)[0] ?? null,
          isToday: date === todayKey,
          isPast: date < todayKey,
        };
      })
    : [];

  const todayLabel = todayKey
    ? new Date(
        Number(todayKey.slice(0, 4)),
        Number(todayKey.slice(5, 7)) - 1,
        Number(todayKey.slice(8, 10)),
      ).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior="padding">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxl + 64 },
        ]}>
        <View style={styles.headerRow}>
          <View>
            <Text variant="micro" color="textSecondary">
              {todayLabel.toUpperCase()}
            </Text>
            <Text variant="large">{training.plan ? 'Your training' : 'Run somewhere new'}</Text>
          </View>
          <MapControl
            symbol="clock.arrow.circlepath"
            accessibilityLabel="Your runs"
            onPress={() => router.push('/history')}
          />
        </View>

        {locationStatus === 'denied' || locationStatus === 'unavailable' ? (
          <Pressable
            onPress={locationStatus === 'denied' ? undefined : refresh}
            accessibilityRole={locationStatus === 'denied' ? 'text' : 'button'}>
            <Text variant="label" color="textSecondary">
              {locationStatus === 'denied'
                ? 'Location is off. ROAM needs it to track your run — turn it on in Settings.'
                : 'Location is unavailable. Tap to try again.'}
            </Text>
          </Pressable>
        ) : null}

        {/* Today — the one thing the screen is for. */}
        <View style={[styles.card, { backgroundColor: theme.fill, borderColor: theme.borderSubtle }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBadge, { backgroundColor: theme.background }]}>
              <SymbolView
                name={
                  todayWorkout
                    ? WORKOUT_SYMBOLS[todayWorkout.type]
                    : training.plan
                      ? 'moon.zzz'
                      : 'figure.run'
                }
                size={layout.iconSize}
                tintColor={theme.accentText}
              />
            </View>
            <View style={styles.cardHeaderText}>
              <Text variant="micro" color="textSecondary">
                TODAY
              </Text>
              <Text variant="title">
                {todayWorkout ? WORKOUT_LABELS[todayWorkout.type] : training.plan ? 'Rest day' : 'Ready to run'}
              </Text>
            </View>
          </View>

          <Text variant="body" color="textSecondary" tabular>
            {todayWorkout
              ? `${fmt.distance(todayWorkout.targetKm * 1000)} ${fmt.unitLabel} · about ${plannedMinutes} min`
              : training.plan
                ? 'Nothing scheduled today. Run anyway if you feel like it.'
                : 'Start a run now, or set up a plan to follow.'}
          </Text>

          {/* The map as a window, not the screen. */}
          <View style={[styles.minimap, { borderColor: theme.borderSubtle, backgroundColor: theme.background }]}>
            <MapCanvas
              origin={origin}
              routes={[]}
              cameraMode="center"
              onOriginMoved={handleOriginMoved}
              padding={{ top: 16, bottom: 16, left: 16, right: 16 }}
            />
          </View>

          <Button
            label="Start run"
            variant="accent"
            onPress={() => handleStart(todayWorkout?.targetKm ?? 0)}
            disabled={locationStatus === 'denied'}
          />
        </View>

        {/* The week, at a glance. */}
        {training.plan ? (
          <View style={[styles.card, { backgroundColor: theme.fill, borderColor: theme.borderSubtle }]}>
            <Text variant="micro" color="textSecondary">
              THIS WEEK
            </Text>
            <View style={styles.weekStrip}>
              {weekDays.map((day) => (
                <View key={day.date} style={styles.weekDay}>
                  <Text variant="micro" color="textSecondary">
                    {day.letter}
                  </Text>
                  <View
                    style={[
                      styles.weekDot,
                      {
                        backgroundColor: day.workout
                          ? day.workout.status === 'completed'
                            ? theme.accent
                            : theme.background
                          : 'transparent',
                        borderColor: day.isToday
                          ? theme.accentText
                          : day.workout
                            ? theme.border
                            : 'transparent',
                        opacity: !day.workout || (day.isPast && day.workout.status === 'planned') ? 0.45 : 1,
                      },
                    ]}>
                    {day.workout ? (
                      <SymbolView
                        name={WORKOUT_SYMBOLS[day.workout.type]}
                        size={12}
                        tintColor={
                          day.workout.status === 'completed' ? theme.accentForeground : theme.textSecondary
                        }
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.tileRow}>
              <Tile
                symbol="checkmark.circle"
                label="Sessions"
                value={`${progress.completed}/${progress.planned}`}
              />
              <Tile
                symbol="point.topleft.down.to.point.bottomright.curvepath"
                label="Distance"
                value={`${Math.round(progress.completedKm)}/${Math.round(progress.plannedKm)} ${fmt.unitLabel}`}
              />
              <Tile symbol="calendar" label="Streak" value={`${streakWeeks}w`} />
            </View>
          </View>
        ) : null}

        <Section title="Upcoming">
          {upcoming.length === 0 ? (
            <Text variant="caption" color="textSecondary">
              {training.plan ? 'Nothing scheduled yet.' : 'No plan yet.'}
            </Text>
          ) : (
            upcoming.map((workout) => (
              <WorkoutRow key={workout.id} workout={workout} fmt={fmt} />
            ))
          )}
        </Section>

        <Section title="Recent">
          {recent.length === 0 ? (
            <Text variant="caption" color="textSecondary">
              Nothing completed yet.
            </Text>
          ) : (
            recent.map((workout) => (
              <WorkoutRow key={workout.id} workout={workout} fmt={fmt} showStatus />
            ))
          )}
        </Section>

        <Pressable
          onPress={() => router.push('/plan')}
          accessibilityRole="button"
          accessibilityLabel={training.plan ? 'Manage your training plan' : 'Set up a training plan'}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <SymbolView name="calendar" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
          <Text variant="label" color="textTertiary" style={styles.rowLabel}>
            {training.plan
              ? `Manage plan · ${training.plan.runsPerWeek} runs a week`
              : 'Set up a training plan'}
          </Text>
          <SymbolView
            name="chevron.right"
            size={layout.iconSizeSmall}
            tintColor={theme.textSecondary}
          />
        </Pressable>

        {savedRoutes > 0 ? (
          <Pressable
            onPress={() => router.push('/favorites?mode=run')}
            accessibilityRole="button"
            accessibilityLabel={`Run a saved route. ${savedRoutes} saved.`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <SymbolView name="bookmark" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
            <Text variant="label" color="textTertiary" style={styles.rowLabel}>
              Run a saved route
            </Text>
            <Text variant="caption" color="textSecondary" tabular>
              {savedRoutes}
            </Text>
            <SymbolView
              name="chevron.right"
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        ) : null}

        <Button
          label="Find a route"
          variant="secondary"
          onPress={() => {
            impactLight();
            setFindRoutesOpen(true);
          }}
          disabled={!origin}
        />

        {overview && overview.count > 0 ? (
          <Text variant="caption" color="textSecondary" tabular style={styles.footnote}>
            {`All time · ${overview.count} runs · ${fmt.distance(overview.totalMeters)} ${fmt.unitLabel}`}
          </Text>
        ) : null}

        {hasError && errorMessage ? (
          <Text variant="label" color="textSecondary" accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <FindRouteSheet
        visible={findRoutesOpen}
        onClose={() => setFindRoutesOpen(false)}
        startLabel={originLabel}
        hasCustomStart={hasCustomOrigin}
        onChangeStart={() => router.push('/location-search')}
        finishLabel={finish?.label ?? null}
        onChangeFinish={() => router.push('/location-search?mode=finish')}
        onClearFinish={clearFinish}
        distanceKm={distanceKm}
        onChangeDistance={setChosenKm}
        busy={isFinding}
        errorMessage={hasError ? errorMessage : null}
        onSubmit={() => {
          setFindRoutesOpen(false);
          void handleFindRoutes();
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Tile({ symbol, label, value }: { symbol: SymbolName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.tile}>
      <SymbolView name={symbol} size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
      <Text variant="title" tabular>
        {value}
      </Text>
      <Text variant="micro" color="textSecondary">
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="micro" color="textSecondary">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function WorkoutRow({
  workout,
  fmt,
  showStatus = false,
}: {
  workout: PlannedWorkout;
  fmt: Formatters;
  showStatus?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.workoutRow}>
      <View style={[styles.rowIcon, { backgroundColor: theme.fill }]}>
        <SymbolView
          name={WORKOUT_SYMBOLS[workout.type]}
          size={layout.iconSizeSmall}
          tintColor={theme.textSecondary}
        />
      </View>
      <View style={styles.workoutText}>
        <Text variant="body" numberOfLines={1}>
          {WORKOUT_LABELS[workout.type]}
        </Text>
        <Text variant="caption" color="textSecondary" tabular>
          {`${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayOf(workout.date)]} · ${fmt.distance(
            workout.targetKm * 1000,
          )} ${fmt.unitLabel}${showStatus ? ` · ${STATUS_LABELS[workout.status]}` : ''}`}
        </Text>
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
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardHeaderText: {
    gap: 2,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimap: {
    height: 128,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekDay: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  weekDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouchTarget,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutText: {
    flex: 1,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouchTarget,
  },
  rowLabel: {
    flex: 1,
  },
  footnote: {
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
});
