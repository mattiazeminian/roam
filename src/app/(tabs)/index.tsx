import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { WORKOUT_SYMBOLS } from '@/components/workout-icon';
import { impactLight, impactMedium, selectionFeedback } from '@/lib/haptics';
import { describeCoordinate } from '@/services/geocoding';
import { useLocation } from '@/services/location-context';
import { summarizeRuns, weeklyRunStreak, type RunOverview } from '@/services/run-analytics';
import { listRoutes, type SavedRoute } from '@/services/route-storage';
import { findRoutes, type Coordinate, type RouteCandidate } from '@/services/routing';
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

/** How far a saved route's distance may be from the target and still count as a match. */
const ROUTE_MATCH_TOLERANCE = 0.25;

/** The saved route closest to `targetKm`, or null when none is close enough. */
function closestSavedRoute(routes: SavedRoute[], targetKm: number): RouteCandidate | null {
  if (targetKm <= 0) {
    return null;
  }
  let best: SavedRoute | null = null;
  let bestDelta = Infinity;
  for (const saved of routes) {
    const delta = Math.abs(saved.route.distanceKm - targetKm);
    if (delta < bestDelta) {
      best = saved;
      bestDelta = delta;
    }
  }
  if (!best || bestDelta / targetKm > ROUTE_MATCH_TOLERANCE) {
    return null;
  }
  return best.route;
}

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
  const { status: locationStatus, origin, setOrigin, refresh } = useLocation();
  const { start, recoverable, resumeRecovered, discardRecovered } = useRun();
  const { settings, loaded: settingsLoaded } = useSettings();
  const { state: training } = useTraining();

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
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
          setSavedRoutes(routes);
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

  const handleStart = useCallback(
    (targetKm: number, plannedRoute: RouteCandidate | null) => {
      impactMedium();
      start(plannedRoute, targetKm);
      router.push('/run');
    },
    [start],
  );

  // -- Training, derived from the plan -------------------------------------

  const todayWorkout: PlannedWorkout | null = todayKey
    ? (workoutsOnDate(training, todayKey)[0] ?? null)
    : null;

  // A saved route close to today's target distance, so the map preview shows
  // something a runner can actually recognise instead of a bare dot (a
  // planned workout carries no route of its own — see PlannedWorkout in
  // training.ts). Checked first because it costs nothing — no request, no
  // wait — before falling back to generating one below. Within 25% of the
  // target, or nothing — never a route that doesn't actually match the plan.
  const suggestedRoute = todayWorkout
    ? closestSavedRoute(savedRoutes, todayWorkout.targetKm)
    : null;

  // No saved route matched — generate one for today's target, the same way
  // Maps' "Generate a route" does, so the suggestion is a real route rather
  // than an empty preview. Runs once per workout (tracked by id in the ref
  // below), not on every render or every visit to Home, and fails silently:
  // a routing outage must never make Home itself feel broken.
  const [generatedRoute, setGeneratedRoute] = useState<RouteCandidate | null>(null);
  const generatedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!todayWorkout || !origin || suggestedRoute) {
      return;
    }
    if (generatedForRef.current === todayWorkout.id) {
      return;
    }
    generatedForRef.current = todayWorkout.id;
    setGeneratedRoute(null); // clear any route generated for a previous workout
    let active = true;
    void findRoutes({ origin, targetKm: todayWorkout.targetKm })
      .then((candidates) => {
        if (active && candidates.length > 0) {
          setGeneratedRoute(candidates[0]);
        }
      })
      .catch(() => {
        // Home never blocks or breaks over a routing failure — the dot stays.
      });
    return () => {
      active = false;
    };
  }, [todayWorkout, origin, suggestedRoute]);

  // Cheap-first: a saved match, then a generated one, then nothing.
  const displayRoute = suggestedRoute ?? generatedRoute;

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

          {todayWorkout ? (
            <View style={styles.todayHero}>
              <Text variant="display" color="accentText" tabular>
                {fmt.distance(todayWorkout.targetKm * 1000)}
              </Text>
              <Text variant="body" color="textSecondary" tabular>
                {`${fmt.unitLabel} · about ${plannedMinutes} min`}
              </Text>
            </View>
          ) : (
            <Text variant="body" color="textSecondary" tabular>
              {training.plan
                ? 'Nothing scheduled today. Run anyway if you feel like it.'
                : 'Start a run now, or set up a plan to follow.'}
            </Text>
          )}

          {/* The map as a window, not the screen. */}
          <View style={[styles.minimap, { borderColor: theme.borderSubtle, backgroundColor: theme.background }]}>
            <MapCanvas
              origin={origin}
              routes={displayRoute ? [displayRoute] : []}
              selectedRouteId={displayRoute?.id}
              cameraMode={displayRoute ? 'fit' : 'center'}
              onOriginMoved={handleOriginMoved}
              padding={{ top: 16, bottom: 16, left: 16, right: 16 }}
            />
          </View>

          <Button
            label="Start run"
            variant="accent"
            onPress={() => handleStart(todayWorkout?.targetKm ?? 0, displayRoute)}
            disabled={locationStatus === 'denied'}
          />
        </View>

        {/* The week, at a glance. */}
        {training.plan ? (
          <View style={[styles.card, { backgroundColor: theme.fill, borderColor: theme.borderSubtle }]}>
            <Text variant="micro" color="textSecondary">
              THIS WEEK
            </Text>
            <Pressable
              onPress={() => router.push('/schedule')}
              accessibilityRole="button"
              accessibilityLabel="Open the schedule to change your running days"
              style={styles.weekStrip}>
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
            </Pressable>

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

        {savedRoutes.length > 0 ? (
          <Pressable
            onPress={() => router.push('/favorites?mode=run')}
            accessibilityRole="button"
            accessibilityLabel={`Run a saved route. ${savedRoutes.length} saved.`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <SymbolView name="bookmark" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
            <Text variant="label" color="textTertiary" style={styles.rowLabel}>
              Run a saved route
            </Text>
            <Text variant="caption" color="textSecondary" tabular>
              {savedRoutes.length}
            </Text>
            <SymbolView
              name="chevron.right"
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        ) : null}

        <Button
          label="Generate a route"
          variant="secondary"
          onPress={() => {
            impactLight();
            router.push('/generate-route');
          }}
          disabled={!origin}
        />

        {overview && overview.count > 0 ? (
          <Text variant="caption" color="textSecondary" tabular style={styles.footnote}>
            {`All time · ${overview.count} runs · ${fmt.distance(overview.totalMeters)} ${fmt.unitLabel}`}
          </Text>
        ) : null}

      </ScrollView>

    </KeyboardAvoidingView>
  );
}

function Tile({ symbol, label, value }: { symbol: SymbolName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.tile}>
      <SymbolView name={symbol} size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
      <Text variant="title" color="accentText" tabular>
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
  todayHero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
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
