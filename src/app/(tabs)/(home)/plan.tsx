import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM, DistanceControl } from '@/components/distance-control';
import { Text } from '@/components/text';
import { WorkoutIcon } from '@/components/workout-icon';
import { impactMedium, selectionFeedback, successFeedback } from '@/lib/haptics';
import { useSettings } from '@/services/settings-context';
import {
  DEFAULT_PREFERRED_DAYS,
  DEFAULT_RUNS_PER_WEEK,
  addDays,
  summarizeProgress,
  toDateKey,
  weekStartFor,
  WORKOUT_LABELS,
  workoutsOnDate,
  type TrainingGoalKind,
  type TrainingLevel,
} from '@/services/training';
import { useTraining } from '@/services/training-context';
import { planGoalLabel } from '@/services/training-presentation';
import { layout, radii, spacing, useTheme } from '@/theme';

const GOALS: { id: TrainingGoalKind; label: string; detail: string }[] = [
  { id: 'fitness', label: 'General fitness', detail: 'Run consistently, no target distance.' },
  { id: 'distance', label: 'A distance', detail: 'Work toward covering a set distance.' },
  { id: 'race', label: 'A race', detail: 'A target distance on a date.' },
];

const LEVELS: { id: TrainingLevel; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'occasional', label: 'Occasional' },
  { id: 'regular', label: 'Regular' },
  { id: 'experienced', label: 'Experienced' },
];

const RACE_WEEKS = [8, 12, 16];

/**
 * Training volume, in Runna's terms: how much running the week holds. It maps
 * straight onto runs per week — the one input the week rules actually use.
 */
const VOLUMES: { id: string; label: string; detail: string; runsPerWeek: number }[] = [
  { id: 'gradual', label: 'Gradual', detail: '3 runs a week', runsPerWeek: 3 },
  { id: 'steady', label: 'Steady', detail: '4 runs a week', runsPerWeek: 4 },
  { id: 'progressive', label: 'Progressive', detail: '5 runs a week', runsPerWeek: 5 },
];

/**
 * The steps shown while the plan is built. They are not decoration: each one is
 * a thing the scheduler actually does, in the order it does it. Nothing here
 * claims an intelligence that is not in the code.
 */
const BUILD_STEPS = [
  'Reading your recent runs',
  'Laying out your week',
  'Placing the long run',
  'Spacing the hard workouts',
  'Working out your distances',
];

/** Sunday-first, matching the plan's weekday numbering. */
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_MS = 86_400_000;

/**
 * Create a training plan (#69).
 *
 * Only what the schedule actually needs: what the runner is working toward,
 * how often they want to run, which days, and where they are starting from.
 * Nothing here is stored unused — a target with no distance goal, or a race
 * date without a race, is discarded by `buildPlan` rather than kept for show.
 */
export default function PlanScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { state, createPlanFor, clearPlan } = useTraining();

  const [goalKind, setGoalKind] = useState<TrainingGoalKind>(state.plan?.goal.kind ?? 'fitness');
  const [targetKm, setTargetKm] = useState<number>(
    state.plan?.goal.targetKm ?? settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM,
  );
  const [raceWeeks, setRaceWeeks] = useState(12);
  const [runsPerWeek, setRunsPerWeek] = useState(state.plan?.runsPerWeek ?? DEFAULT_RUNS_PER_WEEK);
  const [days, setDays] = useState<number[]>(
    state.plan?.preferredDays ?? [...DEFAULT_PREFERRED_DAYS],
  );
  const [level, setLevel] = useState<TrainingLevel>(state.plan?.level ?? 'occasional');
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const reduceMotion = useReducedMotion();

  // Advance the build narration. Reduce Motion skips straight to the end rather
  // than stepping, so the moment still exists without the sequence.
  useEffect(() => {
    if (!building || reduceMotion || buildStep >= BUILD_STEPS.length - 1) {
      return;
    }
    const timer = setTimeout(() => setBuildStep((current) => current + 1), 420);
    return () => clearTimeout(timer);
  }, [building, buildStep, reduceMotion]);

  const toggleDay = useCallback((day: number) => {
    selectionFeedback();
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setBuilding(true);
    setBuildStep(0);
    try {
      // Computed here rather than during render: reading the clock is not a
      // render-time concern, and the date only matters once it is saved.
      const raceDate =
        goalKind === 'race' ? toDateKey(new Date(Date.now() + raceWeeks * 7 * DAY_MS)) : null;

      await createPlanFor({
        goalKind,
        targetKm,
        raceDate,
        runsPerWeek,
        weeks: raceWeeks,
        preferredDays: days,
        level,
      });
      successFeedback();
      // Let the last line be read rather than flashing past on a fast device.
      await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 250 : 750));
      impactMedium();
      router.back();
    } finally {
      setSaving(false);
      setBuilding(false);
    }
  }, [saving, goalKind, raceWeeks, targetKm, runsPerWeek, days, level, createPlanFor, reduceMotion]);

  const handleRemove = useCallback(async () => {
    impactMedium();
    await clearPlan();
    router.back();
  }, [clearPlan]);

  if (state.plan && !editing) {
    return <PlanOverview onEdit={() => setEditing(true)} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text variant="large">{state.plan ? 'Your plan' : 'Training plan'}</Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={spacing.sm}>
            <Text variant="body" color="accentText">
              Close
            </Text>
          </Pressable>
        </View>

        <Field label="What are you working toward?">
          {GOALS.map((goal) => (
            <Choice
              key={goal.id}
              label={goal.label}
              detail={goal.detail}
              selected={goalKind === goal.id}
              onPress={() => {
                selectionFeedback();
                setGoalKind(goal.id);
              }}
            />
          ))}
        </Field>

        {goalKind !== 'fitness' ? (
          <Field label="Target distance">
            <DistanceControl valueKm={targetKm} onChange={setTargetKm} />
          </Field>
        ) : null}

        {/* The block length. For a race it also fixes the race date; for every
            goal it is how far ahead Roam schedules. */}
        <Field label={goalKind === 'race' ? 'When is the race?' : 'How long a plan?'}>
          <View style={styles.chipRow}>
            {RACE_WEEKS.map((weeks) => (
              <Chip
                key={weeks}
                label={`${weeks} weeks`}
                selected={raceWeeks === weeks}
                onPress={() => {
                  selectionFeedback();
                  setRaceWeeks(weeks);
                }}
              />
            ))}
          </View>
        </Field>

        <Field label="Training volume">
          {VOLUMES.map((volume) => (
            <Choice
              key={volume.id}
              label={volume.label}
              detail={volume.detail}
              selected={runsPerWeek === volume.runsPerWeek}
              onPress={() => {
                selectionFeedback();
                setRunsPerWeek(volume.runsPerWeek);
              }}
            />
          ))}
        </Field>

        <Field label="Which days?">
          <View style={styles.chipRow}>
            {DAY_LETTERS.map((letter, day) => (
              <Chip
                key={day}
                label={letter}
                selected={days.includes(day)}
                accessibilityLabel={DAY_NAMES[day]}
                onPress={() => toggleDay(day)}
              />
            ))}
          </View>
        </Field>

        <Field label="Where are you starting from?">
          <View style={styles.chipRow}>
            {LEVELS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                selected={level === option.id}
                onPress={() => {
                  selectionFeedback();
                  setLevel(option.id);
                }}
              />
            ))}
          </View>
        </Field>

        <Button
          label={state.plan ? 'Update plan' : 'Create plan'}
          variant="accent"
          onPress={() => void handleSave()}
          loading={saving}
          style={styles.action}
        />

        {state.plan ? (
          <Button
            label="Remove plan"
            variant="secondary"
            onPress={() => void handleRemove()}
            disabled={saving}
          />
        ) : null}

        <Text variant="caption" color="textSecondary" style={styles.note}>
          Roam builds the week from what you choose here — the days you pick, that many workouts,
          one long run. It never prescribes heart-rate zones, calorie targets or times it cannot
          know.
        </Text>
      </ScrollView>

      {/* The build moment. The work is instant and deterministic; this exists so
          the runner sees what is being decided on their behalf, rather than a
          screen that blinks and changes. */}
      {building ? (
        <View style={[styles.building, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.textSecondary} />
          <Text variant="title">Building your plan</Text>
          <View style={styles.buildingSteps}>
            {BUILD_STEPS.slice(0, buildStep + 1).map((label, index) => (
              <Text
                key={label}
                variant="caption"
                color={index === buildStep ? 'text' : 'textSecondary'}>
                {label}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PlanOverview({ onEdit }: { onEdit: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = useTraining();
  const plan = state.plan;
  if (!plan) return null;
  const today = toDateKey(new Date());
  const weekStart = weekStartFor(today);
  const progress = summarizeProgress(state, weekStart, addDays(weekStart, 6));
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.headerRow}>
          <Text variant="large">Training plan</Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button"><Text variant="body" color="accentText">Close</Text></Pressable>
        </View>
        <Text variant="micro" color="textSecondary">YOUR DIRECTION</Text>
        <Text variant="hero">{planGoalLabel(plan)}</Text>
        <Text variant="body" color="textSecondary">{`${plan.runsPerWeek} runs each week · ${plan.level} starting point`}</Text>
        <View style={[styles.overviewRule, { backgroundColor: theme.track }]} />
        <View style={styles.overviewHeading}><Text variant="title">This week</Text><Text variant="caption" color="textSecondary" tabular>{`${progress.completed} of ${progress.planned} complete`}</Text></View>
        <View style={styles.overviewTimeline}>
          {days.map((date) => {
            const workout = workoutsOnDate(state, date)[0] ?? null;
            const isToday = date === today;
            return <View key={date} style={styles.overviewDay}><Text variant="caption" color={isToday ? 'accentText' : 'textSecondary'}>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text><View style={[styles.overviewMark, { backgroundColor: workout?.status === 'completed' ? theme.accent : workout ? theme.fill : theme.background, borderColor: isToday ? theme.accent : theme.divider }]}>{workout ? <WorkoutIcon type={workout.type} size={16} tintColor={workout.status === 'completed' ? theme.accentForeground : theme.textSecondary} /> : null}</View>{workout ? <Text variant="micro" color="textSecondary">{workout.targetKm}</Text> : null}</View>;
          })}
        </View>
        <View style={[styles.overviewRule, { backgroundColor: theme.track }]} />
        <Text variant="title">The week ahead</Text>
        {state.workouts.filter((workout) => workout.date >= today).slice(0, 4).map((workout) => <View key={workout.id} style={[styles.overviewWorkout, { borderBottomColor: theme.track }]}><WorkoutIcon type={workout.type} size={20} tintColor={theme.textSecondary} /><View style={styles.overviewWorkoutCopy}><Text variant="body">{WORKOUT_LABELS[workout.type]}</Text><Text variant="caption" color="textSecondary">{workout.date} · {workout.targetKm} km</Text></View><Text variant="caption" color="textSecondary">{workout.status}</Text></View>)}
        <Button label="Edit plan" variant="accent" onPress={onEdit} />
        <Button label="Edit schedule" variant="secondary" onPress={() => router.push('/schedule')} />
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="micro" color="textSecondary">
        {label}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.fill },
        pressed && !selected && styles.pressed,
      ]}>
      <Text variant="label" color={selected ? 'accentForeground' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${detail}`}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? theme.accent : theme.fill,
        },
        pressed && !selected && styles.pressed,
      ]}>
      <Text variant="body" color={selected ? 'accentForeground' : 'text'}>
        {label}
      </Text>
      <Text variant="caption" color={selected ? 'accentForeground' : 'textSecondary'}>
        {detail}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  field: {
    gap: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    minWidth: 44,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  choice: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    gap: 2,
  },
  action: {
    marginTop: spacing.sm,
  },
  note: {
    marginTop: spacing.sm,
  },
  overviewRule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  overviewHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  overviewTimeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  overviewDay: {
    alignItems: 'center',
    gap: spacing.xxs,
    minWidth: 32,
  },
  overviewMark: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewWorkout: {
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overviewWorkoutCopy: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  building: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenMargin,
  },
  buildingSteps: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
});
