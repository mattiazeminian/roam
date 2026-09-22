// Drag-and-drop uses Reanimated shared values mutated from gesture worklets,
// and the React Compiler cannot memoize a component built around that. The
// behaviour is correct; only the compiler's memoization is opted out.
/* eslint-disable react-hooks/preserve-manual-memoization, react-hooks/immutability */
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ActionSheet, type ActionSheetAction } from '@/components/action-sheet';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { WorkoutIcon } from '@/components/workout-icon';
import { impactLight, selectionFeedback, successFeedback } from '@/lib/haptics';
import { DEFAULT_DISTANCE_KM } from '@/components/distance-control';
import { useSettings } from '@/services/settings-context';
import {
  addDays,
  createWorkout,
  toDateKey,
  weekStartFor,
  weekdayOf,
  workoutsOnDate,
  WORKOUT_LABELS,
  type PlannedWorkout,
  type WorkoutType,
} from '@/services/training';
import { useTraining } from '@/services/training-context';
import { layout, radii, spacing, useTheme } from '@/theme';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The kinds a runner can drop onto a day by hand. */
const ADDABLE: WorkoutType[] = ['easy', 'long', 'tempo', 'fartlek', 'recovery'];

/** Fixed row geometry, so a drag translates to a day index arithmetically. */
const ROW_COUNT = 7;
const ROW_HEIGHT = 60;
const STRIDE = ROW_HEIGHT + spacing.sm;

type Day = { date: string; workout: PlannedWorkout | null };

/**
 * Schedule — the week, and the days in it, made editable.
 *
 * The plan sets the shape; this is where reality is recorded. A session can be
 * dragged onto another day, or a day tapped to complete, skip, remove or add a
 * run — because runs get moved in life, and a plan that cannot be adjusted
 * stops being used.
 */
export default function ScheduleScreen() {
  'use no memo';
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { state, loaded, markWorkout, moveWorkout, removeWorkout, scheduleWorkouts } = useTraining();

  const [weekOffset, setWeekOffset] = useState(0);
  const [todayKey] = useState(() => toDateKey(new Date()));

  const weekStart = addDays(weekStartFor(todayKey), weekOffset * 7);
  const targetKm = settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM;

  const days: Day[] = Array.from({ length: ROW_COUNT }, (_, index) => {
    const date = addDays(weekStart, index);
    return { date, workout: workoutsOnDate(state, date)[0] ?? null };
  });

  const [sheet, setSheet] = useState<{ title: string; message?: string; actions: ActionSheetAction[] } | null>(null);

  // Drag state, on the UI thread so the gesture never waits on a render.
  const dragIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);

  const addWorkout = useCallback(
    async (date: string, type: WorkoutType) => {
      await scheduleWorkouts([
        createWorkout({ id: `manual-${date}-${type}`, date, type, targetKm }),
      ]);
      successFeedback();
    },
    [scheduleWorkouts, targetKm],
  );

  const moveToIndex = useCallback(
    (id: string, index: number) => {
      const target = days[index];
      if (!target) {
        return;
      }
      successFeedback();
      void moveWorkout(id, target.date);
    },
    [days, moveWorkout],
  );

  const openDay = useCallback(
    (date: string, workout: PlannedWorkout | null, weekday: number) => {
      impactLight();
      const where = `${DAY_NAMES[weekday]} ${date}`;

      if (!workout) {
        setSheet({
          title: where,
          message: 'Nothing planned. Add a run?',
          actions: ADDABLE.map((type) => ({ label: WORKOUT_LABELS[type], onPress: () => void addWorkout(date, type) })),
        });
        return;
      }

      const editable = workout.status !== 'completed';
      setSheet({
        title: where,
        message: `${WORKOUT_LABELS[workout.type]} · ${workout.targetKm} km · ${workout.status}`,
        actions: [
          ...(workout.status === 'completed' ? [] : [{ label: 'Mark completed', onPress: () => void markWorkout(workout.id, 'completed') }]),
          ...(workout.status === 'skipped' ? [] : [{ label: 'Mark skipped', onPress: () => void markWorkout(workout.id, 'skipped') }]),
          ...(editable ? [
            { label: 'Remove', destructive: true, onPress: () => void removeWorkout(workout.id) },
          ] : []),
        ],
      });
    },
    [addWorkout, markWorkout, removeWorkout],
  );

  const weekLabel = `Week of ${
    new Date(
      Number(weekStart.slice(0, 4)),
      Number(weekStart.slice(5, 7)) - 1,
      Number(weekStart.slice(8, 10)),
    ).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  }`;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xxl },
        ]}>
        <View style={styles.headerRow}>
          <MapControl symbol="chevron.left" accessibilityLabel="Back" onPress={() => router.back()} />
        </View>

        <Text variant="large">Schedule</Text>
        <Text variant="body" color="textSecondary">
          Make this week fit real life. Drag a session onto another day, or tap a day to complete, skip, or add a run.
        </Text>

        <View style={styles.weekHeader}>
          <MapControl
            symbol="chevron.left"
            accessibilityLabel="Previous week"
            onPress={() => {
              selectionFeedback();
              setWeekOffset((value) => value - 1);
            }}
          />
          <Text variant="title">{weekLabel}</Text>
          <MapControl
            symbol="chevron.right"
            accessibilityLabel="Next week"
            onPress={() => {
              selectionFeedback();
              setWeekOffset((value) => value + 1);
            }}
          />
        </View>

        {loaded
          ? days.map((day, index) => (
              <DayRow
                key={day.date}
                index={index}
                day={day}
                isToday={day.date === todayKey}
                dragIndex={dragIndex}
                dragY={dragY}
                onOpen={openDay}
                onDrop={moveToIndex}
              />
            ))
          : null}

        <Text variant="caption" color="textSecondary" style={styles.hint}>
          Plan shows your direction. Schedule is where you adjust the week.
        </Text>

        <Button
          label="Training plan"
          variant="secondary"
          onPress={() => router.push('/plan')}
        />
      </ScrollView>
      <ActionSheet
        visible={sheet !== null}
        title={sheet?.title ?? ''}
        message={sheet?.message}
        actions={sheet?.actions ?? []}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function DayRow({
  index,
  day,
  isToday,
  dragIndex,
  dragY,
  onOpen,
  onDrop,
}: {
  index: number;
  day: Day;
  isToday: boolean;
  dragIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  onOpen: (date: string, workout: PlannedWorkout | null, weekday: number) => void;
  onDrop: (id: string, index: number) => void;
}) {
  'use no memo';
  const theme = useTheme();
  const { date, workout } = day;
  const [, month, dayOfMonth] = date.split('-');
  const weekday = weekdayOf(date);
  const label = `${DAY_NAMES[weekday].slice(0, 3)} ${Number(dayOfMonth)}/${Number(month)}`;
  const draggable = Boolean(workout) && workout?.status !== 'completed';

  const animatedStyle = useAnimatedStyle(() => {
    const dragging = dragIndex.value === index;
    const target =
      dragIndex.value >= 0
        ? Math.min(ROW_COUNT - 1, Math.max(0, dragIndex.value + Math.round(dragY.value / STRIDE)))
        : -1;
    return {
      transform: [{ translateY: dragging ? dragY.value : 0 }, { scale: dragging ? 1.03 : 1 }],
      zIndex: dragging ? 20 : 0,
      opacity: dragging ? 0.96 : 1,
      borderColor: target === index ? theme.accent : isToday ? theme.borderSubtle : 'transparent',
      backgroundColor: target === index ? theme.fill : isToday ? theme.fill : 'transparent',
    };
  }, [index, isToday, theme.accent, theme.borderSubtle, theme.fill]);

  const pan = Gesture.Pan()
    .enabled(draggable)
    .activateAfterLongPress(200)
    .onStart(() => {
      dragIndex.value = index;
    })
    .onUpdate((event) => {
      dragY.value = event.translationY;
    })
    .onEnd(() => {
      const target = Math.min(
        ROW_COUNT - 1,
        Math.max(0, index + Math.round(dragY.value / STRIDE)),
      );
      if (target !== index && workout) {
        runOnJS(onDrop)(workout.id, target);
      }
    })
    .onFinalize(() => {
      dragIndex.value = -1;
      dragY.value = 0;
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.dayRow, animatedStyle]}>
        <Pressable
          onPress={() => onOpen(date, workout, weekday)}
          accessibilityRole="button"
          accessibilityLabel={
            workout
              ? `${label}: ${WORKOUT_LABELS[workout.type]}, ${workout.status}. Edit.${
                  draggable ? ' Long press and drag to another day.' : ''
                }`
              : `${label}: nothing planned. Add a run.`
          }
          style={({ pressed }) => [styles.dayPress, pressed && styles.pressed]}>
          <Text variant="micro" color="textSecondary" style={styles.dayLabel}>
            {label.toUpperCase()}
          </Text>
          {workout ? (
            <View style={styles.dayWorkout}>
              <View
                style={[
                  styles.dayIcon,
                  {
                    backgroundColor:
                      workout.status === 'completed' ? theme.accent : theme.fill,
                  },
                ]}>
                <WorkoutIcon
                  type={workout.type}
                  size={layout.iconSizeSmall}
                  tintColor={
                    workout.status === 'completed'
                      ? theme.accentForeground
                      : theme.textSecondary
                  }
                />
              </View>
              <Text variant="body">{WORKOUT_LABELS[workout.type]}</Text>
              <Text variant="caption" color="textSecondary" tabular>
                {`${workout.targetKm} km`}
              </Text>
            </View>
          ) : (
            <Text variant="caption" color="textSecondary">
              Rest
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  dayRow: {
    height: ROW_HEIGHT,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
  },
  dayPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  dayLabel: {
    width: 82,
  },
  dayWorkout: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
});
