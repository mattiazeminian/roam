import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM } from '@/components/distance-control';
import { FindRouteSheet } from '@/components/find-route-sheet';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
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

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Tall enough to be a real map, short enough that the dashboard is on screen. */
const MAP_HEIGHT = 220;

const STATUS_LABELS: Record<WorkoutStatus, string> = {
  planned: 'Missed',
  completed: 'Completed',
  skipped: 'Skipped',
  modified: 'Modified',
};

/**
 * Home — the training dashboard (#114).
 *
 * It answers "what should I run today?" before anything else: today's session
 * with the action that starts it, then what is coming, then what has happened,
 * then the week in three numbers. Route discovery and saved routes sit below
 * that, and the map is a header rather than the screen — Maps is the route
 * workspace now.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const {
    status: locationStatus,
    coordinate,
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
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [findRoutesOpen, setFindRoutesOpen] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [overview, setOverview] = useState<RunOverview | null>(null);
  const [todayKey, setTodayKey] = useState('');

  // Read on focus rather than during render, so returning from a run or a plan
  // change shows the current picture.
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

  const isFinding = routeStatus === 'finding';
  const hasError = routeStatus === 'error';

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

  // -- Training, derived from the plan -------------------------------------

  const todayWorkout: PlannedWorkout | null = todayKey
    ? (workoutsOnDate(training, todayKey)[0] ?? null)
    : null;
  const upcoming = todayKey ? workoutsFrom(training, addDays(todayKey, 1)).slice(0, 3) : [];
  // A session whose day has passed without being completed is shown, not
  // hidden: leaving it out would make a missed day simply vanish. The "missed"
  // reading is derived from the date — nothing is written back to storage to
  // say so, and today's session is never called missed while the day is still
  // running.
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

  const handleStart = useCallback(
    (targetKm: number) => {
      impactMedium();
      start(null, targetKm);
      router.push('/run');
    },
    [start],
  );

  return (
    // The panel is in normal flow, so the standard iOS keyboard behaviour works
    // — the sheet's distance field rides up with the keyboard.
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior="padding">
      <View style={[styles.mapRegion, { height: insets.top + MAP_HEIGHT }]}>
        <MapCanvas
          origin={origin}
          routes={[]}
          cameraMode="center"
          searching={isFinding}
          recenterSignal={recenterSignal}
          onOriginMoved={handleOriginMoved}
        />
        <View
          style={[
            styles.mapControls,
            { top: insets.top + spacing.xs, paddingHorizontal: layout.screenMargin },
          ]}
          pointerEvents="box-none">
          <MapControl
            symbol="clock.arrow.circlepath"
            accessibilityLabel="Your runs"
            onPress={() => router.push('/history')}
          />
          {coordinate ? (
            <MapControl
              symbol="location"
              accessibilityLabel="Recenter on current location"
              onPress={() => setRecenterSignal((value) => value + 1)}
            />
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          // Clear the floating tab bar, which overlays the scroll view.
          { paddingBottom: insets.bottom + spacing.xxl + 64 },
        ]}>
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

        {/* Today */}
        <View style={[styles.card, { borderColor: theme.borderSubtle }]}>
          <Text variant="micro" color="textSecondary">
            TODAY
          </Text>
          {todayWorkout ? (
            <>
              <Text variant="large">{WORKOUT_LABELS[todayWorkout.type]}</Text>
              <Text variant="body" color="textSecondary" tabular>
                {`${fmt.distance(todayWorkout.targetKm * 1000)} ${fmt.unitLabel} · about ${plannedMinutes} min`}
              </Text>
            </>
          ) : (
            <>
              <Text variant="large">{training.plan ? 'Rest day' : 'Ready to run'}</Text>
              <Text variant="body" color="textSecondary">
                {training.plan
                  ? 'Nothing scheduled today. Run anyway if you feel like it.'
                  : 'Start a run now, or set up a plan to follow.'}
              </Text>
            </>
          )}
          <Button
            label="Start run"
            variant="accent"
            onPress={() => handleStart(todayWorkout?.targetKm ?? 0)}
            disabled={locationStatus === 'denied'}
            style={styles.cardAction}
          />
        </View>

        {/* This week */}
        <View style={styles.overviewRow}>
          <Text variant="caption" color="textSecondary" tabular>
            {`This week · ${progress.completed} of ${progress.planned} sessions`}
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {`${fmt.distance(progress.completedKm * 1000)} of ${fmt.distance(progress.plannedKm * 1000)} ${fmt.unitLabel}`}
          </Text>
        </View>
        {streakWeeks > 0 ? (
          <Text variant="caption" color="textSecondary">
            {`${streakWeeks} week${streakWeeks === 1 ? '' : 's'} in a row with a run`}
          </Text>
        ) : null}

        {/* Upcoming */}
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

        {/* Completed */}
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

        {overview && overview.count > 0 ? (
          <Text variant="caption" color="textSecondary" tabular style={styles.footnote}>
            {`All time · ${overview.count} runs · ${fmt.distance(overview.totalMeters)} ${fmt.unitLabel}`}
          </Text>
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
  return (
    <View style={styles.workoutRow}>
      <Text variant="body" tabular>
        {`${WEEKDAY_SHORT[weekdayOf(workout.date)]} · ${WORKOUT_LABELS[workout.type]}`}
      </Text>
      <Text variant="caption" color="textSecondary" tabular>
        {`${fmt.distance(workout.targetKm * 1000)} ${fmt.unitLabel}${
          showStatus ? ` · ${STATUS_LABELS[workout.status]}` : ''
        }`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  mapRegion: {
    overflow: 'hidden',
  },
  mapControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    padding: spacing.md,
    gap: spacing.xxs,
  },
  cardAction: {
    marginTop: spacing.sm,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.xxs,
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
