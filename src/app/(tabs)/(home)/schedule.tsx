import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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

/**
 * Schedule — the week, and the days in it, made editable.
 *
 * The plan sets the shape; this is where reality is recorded. A day can be
 * marked done or skipped, a session moved to another day, removed, or added
 * from nothing — because runs get moved in life, and a plan that cannot be
 * adjusted stops being used.
 */
export default function ScheduleScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { state, loaded, markWorkout, moveWorkout, removeWorkout, scheduleWorkouts } = useTraining();

  const [weekOffset, setWeekOffset] = useState(0);
  const [todayKey] = useState(() => toDateKey(new Date()));

  const weekStart = addDays(weekStartFor(todayKey), weekOffset * 7);
  const targetKm = settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM;

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return { date, workout: workoutsOnDate(state, date)[0] ?? null };
  });

  const [sheet, setSheet] = useState<{ title: string; message?: string; actions: ActionSheetAction[] } | null>(null);

  const addWorkout = useCallback(
    async (date: string, type: WorkoutType) => {
      await scheduleWorkouts([
        createWorkout({ id: `manual-${date}-${type}`, date, type, targetKm }),
      ]);
      successFeedback();
    },
    [scheduleWorkouts, targetKm],
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
            { label: 'Move to next day', onPress: () => void moveWorkout(workout.id, addDays(workout.date, 1)) },
            { label: 'Move to previous day', onPress: () => void moveWorkout(workout.id, addDays(workout.date, -1)) },
            { label: 'Remove', destructive: true, onPress: () => void removeWorkout(workout.id) },
          ] : []),
        ],
      });
    },
    [addWorkout, markWorkout, moveWorkout, removeWorkout],
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
        <Text variant="body" color="textSecondary">Make this week fit real life. Tap a day to move, complete, skip, or add a run.</Text>

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

        {loaded ? (
          days.map((day) => {
            const [, month, dayOfMonth] = day.date.split('-');
            const weekday = weekdayOf(day.date);
            const label = `${DAY_NAMES[weekday].slice(0, 3)} ${Number(dayOfMonth)}/${Number(month)}`;
            const isToday = day.date === todayKey;

            return (
              <Pressable
                key={day.date}
                onPress={() => openDay(day.date, day.workout, weekdayOf(day.date))}
                accessibilityRole="button"
                accessibilityLabel={
                  day.workout
                    ? `${label}: ${WORKOUT_LABELS[day.workout.type]}, ${day.workout.status}. Edit.`
                    : `${label}: nothing planned. Add a run.`
                }
                style={({ pressed }) => [
                  styles.dayRow,
                  {
                    backgroundColor: isToday ? theme.fill : 'transparent',
                    borderColor: isToday ? theme.borderSubtle : 'transparent',
                  },
                  pressed && styles.pressed,
                ]}>
                <Text variant="micro" color="textSecondary" style={styles.dayLabel}>
                  {label.toUpperCase()}
                </Text>
                {day.workout ? (
                  <View style={styles.dayWorkout}>
                    <View
                      style={[
                        styles.dayIcon,
                        {
                          backgroundColor:
                            day.workout.status === 'completed' ? theme.accent : theme.fill,
                        },
                      ]}>
                      <WorkoutIcon
                        type={day.workout.type}
                        size={layout.iconSizeSmall}
                        tintColor={
                          day.workout.status === 'completed'
                            ? theme.accentForeground
                            : theme.textSecondary
                        }
                      />
                    </View>
                    <Text variant="body">{WORKOUT_LABELS[day.workout.type]}</Text>
                    <Text variant="caption" color="textSecondary" tabular>
                      {`${day.workout.targetKm} km`}
                    </Text>
                  </View>
                ) : (
                  <Text variant="caption" color="textSecondary">
                    Rest
                  </Text>
                )}
              </Pressable>
            );
          })
        ) : null}

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
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
