import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM, DistanceControl } from '@/components/distance-control';
import { Text } from '@/components/text';
import { impactMedium, selectionFeedback, successFeedback } from '@/lib/haptics';
import { useSettings } from '@/services/settings-context';
import {
  DEFAULT_PREFERRED_DAYS,
  DEFAULT_RUNS_PER_WEEK,
  toDateKey,
  type TrainingGoalKind,
  type TrainingLevel,
} from '@/services/training';
import { useTraining } from '@/services/training-context';
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
        preferredDays: days,
        level,
      });
      successFeedback();
      impactMedium();
      router.back();
    } finally {
      setSaving(false);
    }
  }, [saving, goalKind, raceWeeks, targetKm, runsPerWeek, days, level, createPlanFor]);

  const handleRemove = useCallback(async () => {
    impactMedium();
    await clearPlan();
    router.back();
  }, [clearPlan]);

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

        {goalKind === 'race' ? (
          <Field label="When">
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
        ) : null}

        <Field label="Runs per week">
          <View style={styles.chipRow}>
            {[2, 3, 4, 5, 6].map((count) => (
              <Chip
                key={count}
                label={String(count)}
                selected={runsPerWeek === count}
                onPress={() => {
                  selectionFeedback();
                  setRunsPerWeek(count);
                }}
              />
            ))}
          </View>
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
          ROAM builds the week from what you choose here — the days you pick, that many sessions, one
          long run. It never prescribes heart-rate zones, calorie targets or times it cannot know.
        </Text>
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
  pressed: {
    opacity: 0.6,
  },
});
