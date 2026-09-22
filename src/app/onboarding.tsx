import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { OnboardingShell, SelectionRow } from '@/components/onboarding-shell';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { impactLight, selectionFeedback, successFeedback } from '@/lib/haptics';
import { loadProfile, pickAvatar, saveProfile } from '@/services/profile';
import { useSettings } from '@/services/settings-context';
import {
  DEFAULT_RUNS_PER_WEEK,
  TRAINING_LEVELS,
  addDays,
  toDateKey,
  weekStartFor,
  workoutsFrom,
  workoutsOnDate,
  WORKOUT_LABELS,
  type TrainingGoalKind,
  type TrainingLevel,
} from '@/services/training';
import { useTraining } from '@/services/training-context';
import { layout, radii, spacing, useAppearance, useTheme } from '@/theme';

type Step =
  | 'welcome'
  | 'name'
  | 'experience'
  | 'frequency'
  | 'goal'
  | 'plan'
  | 'availability'
  | 'preview'
  | 'location';

const MARK = require('../../assets/images/mark-green.png');

const LEVEL_COPY: Record<TrainingLevel, { title: string; detail: string }> = {
  new: { title: 'I’m getting started', detail: 'New to running, or coming back to it.' },
  occasional: { title: 'I run now and then', detail: 'A couple of runs most weeks.' },
  regular: { title: 'I run regularly', detail: 'Most weeks, without thinking about it.' },
  experienced: { title: 'I’ve run for years', detail: 'Training is part of my routine.' },
};

const GOALS: { id: TrainingGoalKind; title: string; detail: string }[] = [
  { id: 'fitness', title: 'Run consistently', detail: 'Build the habit and keep it.' },
  { id: 'distance', title: 'Train for a distance', detail: 'Work up to a set distance.' },
  { id: 'race', title: 'Train for a race', detail: 'A date to work toward.' },
];

const DISTANCE_OPTIONS = [5, 10, 21.1, 42.2];
const FREQUENCY_OPTIONS = [2, 3, 4, 5];
const WEEK_OPTIONS = [4, 8, 12];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * The runner setup (#142).
 *
 * One question a screen, in the order a person actually decides: who they are,
 * how they run, what they want, and whether they want help getting there. Every
 * answer configures something the app already uses — the profile, or the same
 * training plan Home and Schedule show. Nothing is asked for show, and nothing
 * is invented.
 */
export default function OnboardingScreen() {
  const theme = useTheme();
  const scheme = useAppearance();
  const { update } = useSettings();
  const { state: training, createPlanFor } = useTraining();

  const [step, setStep] = useState<Step>('welcome');
  const [history, setHistory] = useState<Step[]>([]);

  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [level, setLevel] = useState<TrainingLevel>('occasional');
  const [runsPerWeek, setRunsPerWeek] = useState(DEFAULT_RUNS_PER_WEEK);
  const [goalKind, setGoalKind] = useState<TrainingGoalKind>('fitness');
  const [targetKm, setTargetKm] = useState(10);
  const [weeks, setWeeks] = useState(8);
  const [days, setDays] = useState<number[]>([]);
  const [wantsPlan, setWantsPlan] = useState<boolean | null>(null);
  const [building, setBuilding] = useState(false);

  // The route through setup depends on one answer: whether a plan was wanted.
  const flow = useMemo<Step[]>(
    () => [
      'welcome',
      'name',
      'experience',
      'frequency',
      'goal',
      'plan',
      ...(wantsPlan ? (['availability', 'preview'] as Step[]) : []),
      'location',
    ],
    [wantsPlan],
  );
  const stepIndex = Math.max(0, flow.indexOf(step));
  const go = useCallback(
    (next: Step) => {
      setHistory((previous) => [...previous, step]);
      setStep(next);
    },
    [step],
  );
  const back = useCallback(() => {
    if (history.length === 0) {
      return;
    }
    setStep(history[history.length - 1]);
    setHistory((previous) => previous.slice(0, -1));
  }, [history]);
  const restartAt = useCallback((next: Step) => {
    setStep(next);
    setHistory([]);
  }, []);

  // The plan is generated when the preview is reached, and regenerated if the
  // runner backs up and changes an answer — so the preview is never stale.
  const builtFor = useRef('');
  const signature = `${goalKind}|${targetKm}|${level}|${runsPerWeek}|${days.join(',')}|${weeks}`;
  useEffect(() => {
    if (step !== 'preview' || builtFor.current === signature) {
      return;
    }
    builtFor.current = signature;
    setBuilding(true);
    void createPlanFor({
      goalKind,
      targetKm: goalKind === 'fitness' ? null : targetKm,
      raceDate:
        goalKind === 'race'
          ? toDateKey(new Date(Date.now() + weeks * 7 * 86_400_000))
          : null,
      runsPerWeek,
      weeks,
      preferredDays: days,
      level,
    })
      .catch(() => {})
      .finally(() => setBuilding(false));
  }, [step, signature, createPlanFor, goalKind, targetKm, runsPerWeek, weeks, days, level]);

  const finish = useCallback(() => {
    successFeedback();
    update({ hasCompletedOnboarding: true });
    router.replace('/');
  }, [update]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OnboardingShell
        step={stepIndex}
        total={flow.length}
        onBack={step === 'welcome' ? undefined : back}
        footer={renderFooter()}>
        {renderStep()}
      </OnboardingShell>
    </KeyboardAvoidingView>
  );

  function renderStep() {
    switch (step) {
      case 'welcome':
        return (
          <View style={styles.centered}>
            <View style={styles.brandRow}>
              <Image source={MARK} style={styles.mark} accessibilityIgnoresInvertColors />
              <Wordmark size="large" color="text" />
            </View>
            <Text variant="display" color="text">
              Run somewhere new
            </Text>
            <Text variant="body" color="textSecondary">
              A few questions, then Roam is yours — routes, running and a plan if
              you want one.
            </Text>
          </View>
        );

      case 'name':
        return (
          <View style={styles.block}>
            <Text variant="large" color="text">
              What should Roam call you?
            </Text>
            <View style={styles.identityRow}>
              <Pressable
                onPress={() => void choosePhoto()}
                accessibilityRole="button"
                accessibilityLabel={avatarUri ? 'Change photo' : 'Add a photo, optional'}
                style={({ pressed }) => [
                  styles.avatar,
                  { backgroundColor: theme.fill, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <SymbolView name="camera" size={22} tintColor={theme.textSecondary} />
                )}
              </Pressable>
              <View style={styles.identityText}>
                <Text variant="body" color="text">
                  Add a photo
                </Text>
                <Text variant="caption" color="textSecondary">
                  Optional. You can change it later.
                </Text>
              </View>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={theme.textSecondary}
              keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
              autoFocus
              returnKeyType="done"
              maxLength={40}
              accessibilityLabel="Your name"
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.fill, borderColor: theme.border },
              ]}
            />
          </View>
        );

      case 'experience':
        return (
          <View style={styles.block}>
            <Text variant="large" color="text">
              How would you describe your running?
            </Text>
            <View>
              {TRAINING_LEVELS.map((option) => (
                <SelectionRow
                  key={option}
                  label={LEVEL_COPY[option].title}
                  detail={LEVEL_COPY[option].detail}
                  selected={level === option}
                  onPress={() => {
                    selectionFeedback();
                    setLevel(option);
                    go('frequency');
                  }}
                />
              ))}
            </View>
          </View>
        );

      case 'frequency':
        return (
          <View style={styles.block}>
            <Text variant="large" color="text">
              How often do you want to run?
            </Text>
            <View>
              {FREQUENCY_OPTIONS.map((option) => (
                <SelectionRow
                  key={option}
                  label={`${option} ${option === 1 ? 'run' : 'runs'} a week`}
                  selected={runsPerWeek === option}
                  onPress={() => {
                    selectionFeedback();
                    setRunsPerWeek(option);
                    go('goal');
                  }}
                />
              ))}
            </View>
          </View>
        );

      case 'goal':
        return (
          <View style={styles.block}>
            <Text variant="large" color="text">
              What do you want to achieve?
            </Text>
            <View>
              {GOALS.map((goal) => (
                <SelectionRow
                  key={goal.id}
                  label={goal.title}
                  detail={goal.detail}
                  selected={goalKind === goal.id}
                  onPress={() => {
                    selectionFeedback();
                    setGoalKind(goal.id);
                    if (goal.id === 'fitness') {
                      go('plan');
                    }
                  }}
                />
              ))}
            </View>
            {goalKind !== 'fitness' ? (
              <View style={styles.chips}>
                {DISTANCE_OPTIONS.map((option) => (
                  <Chip
                    key={option}
                    label={`${option} km`}
                    selected={targetKm === option}
                    onPress={() => {
                      selectionFeedback();
                      setTargetKm(option);
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );

      case 'plan':
        return (
          <View style={styles.centered}>
            <Text variant="display" color="text">
              Want a plan built around you?
            </Text>
            <Text variant="body" color="textSecondary">
              Roam can turn your goal, your experience and your days into a week
              you can actually keep up with.
            </Text>
          </View>
        );

      case 'availability':
        return (
          <View style={styles.block}>
            <Text variant="large" color="text">
              Which days can you run?
            </Text>
            <View style={styles.chips}>
              {DAY_LETTERS.map((letter, day) => (
                <Chip
                  key={day}
                  label={letter}
                  selected={days.includes(day)}
                  accessibilityLabel={DAY_NAMES[day]}
                  onPress={() => {
                    selectionFeedback();
                    setDays((current) =>
                      current.includes(day)
                        ? current.filter((value) => value !== day)
                        : [...current, day].sort((a, b) => a - b),
                    );
                  }}
                />
              ))}
            </View>
            <Text variant="micro" color="textSecondary">
              HOW LONG A PLAN?
            </Text>
            <View style={styles.chips}>
              {WEEK_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  label={`${option} weeks`}
                  selected={weeks === option}
                  onPress={() => {
                    selectionFeedback();
                    setWeeks(option);
                  }}
                />
              ))}
            </View>
          </View>
        );

      case 'preview': {
        const today = toDateKey(new Date());
        const next = workoutsFrom(training, today)[0] ?? null;
        const week = weekStartFor(today);
        const weekDays = Array.from({ length: 7 }, (_, index) => {
          const date = addDays(week, index);
          return { date, workout: workoutsOnDate(training, date)[0] ?? null };
        });
        return (
          <View style={styles.block}>
            <Text variant="large" color="text">
              {building ? 'Building your plan…' : 'Here’s your first week'}
            </Text>
            <Text variant="body" color="textSecondary">
              {`${goalLabel()}. ${runsPerWeek} runs a week, ${weeks} weeks.`}
            </Text>
            <View style={styles.weekRow}>
              {weekDays.map((day, index) => (
                <View key={day.date} style={styles.weekDay}>
                  <Text variant="caption" color="text">
                    {DAY_LETTERS[index]}
                  </Text>
                  <View
                    style={[
                      styles.weekMark,
                      { backgroundColor: day.workout ? theme.accent : theme.borderSubtle },
                    ]}
                  />
                </View>
              ))}
            </View>
            {next ? (
              <Text variant="body" color="text">
                {`Next up: ${WORKOUT_LABELS[next.type]} · ${next.targetKm} km`}
              </Text>
            ) : null}
          </View>
        );
      }

      case 'location':
        return (
          <View style={styles.centered}>
            <Text variant="display" color="text">
              Roam needs your location
            </Text>
            <Text variant="body" color="textSecondary">
              To record your runs, measure GPS distance and find routes that start
              where you are. Nothing leaves your phone.
            </Text>
          </View>
        );
    }
  }

  function renderFooter() {
    switch (step) {
      case 'welcome':
        return (
          <Button
            label="Get started"
            variant="accent"
            onPress={() => {
              impactLight();
              go('name');
            }}
          />
        );

      case 'name':
        return (
          <Button
            label="Continue"
            variant="accent"
            onPress={() => void saveIdentity()}
          />
        );

      case 'experience':
      case 'frequency':
        // Answered by choosing; nothing to confirm.
        return null;

      case 'goal':
        return goalKind === 'fitness' ? null : (
          <Button label="Continue" variant="accent" onPress={() => go('plan')} />
        );

      case 'plan':
        return (
          <>
            <Button
              label="Create my plan"
              variant="accent"
              onPress={() => {
                impactLight();
                setWantsPlan(true);
                // The flow gains the availability and preview steps; start them.
                restartAt('availability');
              }}
            />
            <Pressable
              onPress={() => {
                impactLight();
                setWantsPlan(false);
                restartAt('location');
              }}
              accessibilityRole="button"
              accessibilityLabel="Not now, skip the plan"
              style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
              <Text variant="label" color="text">
                Not now
              </Text>
            </Pressable>
          </>
        );

      case 'availability':
        return (
          <Button
            label="Continue"
            variant="accent"
            disabled={days.length === 0}
            onPress={() => {
              impactLight();
              go('preview');
            }}
          />
        );

      case 'preview':
        return (
          <>
            <Button
              label="Start training"
              variant="accent"
              loading={building}
              onPress={() => {
                impactLight();
                go('location');
              }}
            />
            <Pressable
              onPress={back}
              accessibilityRole="button"
              accessibilityLabel="Change your answers"
              style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
              <Text variant="label" color="text">
                Change something
              </Text>
            </Pressable>
          </>
        );

      case 'location':
        return (
          <>
            <Button label="Allow location" variant="accent" onPress={finish} />
            <Pressable
              onPress={finish}
              accessibilityRole="button"
              accessibilityLabel="Continue without location"
              style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
              <Text variant="label" color="text">
                Not now
              </Text>
            </Pressable>
          </>
        );
    }
  }

  function goalLabel(): string {
    if (goalKind === 'fitness') {
      return 'Running consistently';
    }
    if (goalKind === 'race') {
      return `Racing ${targetKm} km`;
    }
    return `Training for ${targetKm} km`;
  }

  async function saveIdentity() {
    impactLight();
    try {
      const current = await loadProfile();
      await saveProfile({ ...current, name: name.trim() || current.name, avatarUri });
    } catch {
      // A profile that cannot be written must not block setup.
    }
    go('experience');
  }

  async function choosePhoto() {
    const uri = await pickAvatar();
    if (uri) {
      setAvatarUri(uri);
      selectionFeedback();
    }
  }
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
        {
          backgroundColor: selected ? theme.accent : theme.fill,
          borderColor: selected ? theme.accent : theme.borderSubtle,
        },
        pressed && styles.pressed,
      ]}>
      <Text variant="label" color={selected ? 'accentForeground' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  block: {
    flex: 1,
    gap: spacing.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  mark: {
    width: 34,
    height: 34,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 64,
    height: 64,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  input: {
    minHeight: 56,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    fontSize: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: layout.minTouchTarget,
    minWidth: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  weekDay: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  weekMark: {
    width: 32,
    height: 6,
    borderRadius: radii.pill,
  },
  skip: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
