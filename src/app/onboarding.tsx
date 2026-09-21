import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { impactLight } from '@/lib/haptics';
import { loadProfile, saveProfile } from '@/services/profile';
import { useSettings } from '@/services/settings-context';
import { brand, layout, spacing } from '@/theme';

const MARK = require('../../assets/images/mark-lime.png');
const GRADIENT = require('../../assets/images/onboarding-gradient.png');

const STEPS = [
  {
    title: 'Set a goal',
    body: 'Tell ROAM what you are training for and the days you can run.',
  },
  {
    title: 'Get your week',
    body: 'ROAM builds a week of easy, long and hard sessions around those days.',
  },
  {
    title: 'Run, and it adapts',
    body: 'Every run moves the plan on. Move or skip a session whenever life happens.',
  },
];

/**
 * The one-time introduction (#19).
 *
 * One screen, not a carousel. Its job is to say what ROAM will do before it
 * asks for anything: set a goal, get a week, and adjust it as you go. It
 * deliberately asks for no data here — the goal and days belong in the plan
 * flow, where the answers actually do something.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { update } = useSettings();
  const [name, setName] = useState('');

  // The profile is created here, not left for the Profile tab: once a runner
  // has been asked for a name, the name is theirs. It is optional — the app
  // works without one, and a blank field is simply ignored.
  const finish = useCallback(
    async (next: '/plan' | '/') => {
      impactLight();
      const trimmed = name.trim();
      if (trimmed.length > 0) {
        try {
          const current = await loadProfile();
          await saveProfile({ ...current, name: trimmed });
        } catch {
          // A profile that cannot be written must not block starting.
        }
      }
      update({ hasCompletedOnboarding: true });
      router.replace(next);
    },
    [name, update],
  );

  return (
    <View style={[styles.root, { backgroundColor: brand.ground }]}>
      {/* A real gradient — lime bleeding into black, painted once as an image
          so there is no banding and no gradient dependency. */}
      <Image source={GRADIENT} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />

      <View style={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.brand}>
          <Image source={MARK} style={styles.mark} accessibilityIgnoresInvertColors />
          <Wordmark size="large" color="inverse" />
        </View>

        <View style={styles.copy}>
          <Text variant="display" color="inverse" accessibilityRole="header">
            Run somewhere new
          </Text>
          <Text variant="body" style={styles.lede}>
            ROAM turns a goal into a week of running you can keep up with. No
            history needed — just a goal and the days you can run.
          </Text>
        </View>

        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text variant="label" color="accentForeground" tabular>
                  {index + 1}
                </Text>
              </View>
              <View style={styles.stepText}>
                <Text variant="title" color="inverse">
                  {step.title}
                </Text>
                <Text variant="body" style={styles.stepBody}>
                  {step.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.nameField}>
          <Text variant="micro" color="inverse" style={styles.nameLabel}>
            YOUR NAME (OPTIONAL)
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="What should ROAM call you?"
            placeholderTextColor="rgba(255, 255, 255, 0.45)"
            style={styles.input}
            returnKeyType="done"
            maxLength={40}
            accessibilityLabel="Your name"
          />
        </View>

        <View style={styles.actions}>
          <Button label="Create my plan" variant="accent" onPress={() => void finish('/plan')} />
          <Text
            variant="label"
            color="inverse"
            accessibilityRole="button"
            accessibilityLabel="Start running without a plan"
            onPress={() => void finish('/')}
            style={styles.skip}>
            I’ll just run
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
    gap: spacing.xl,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: 34,
    height: 34,
  },
  copy: {
    gap: spacing.md,
  },
  lede: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  steps: {
    gap: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    gap: spacing.xxs,
  },
  stepBody: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  nameField: {
    gap: spacing.xs,
  },
  nameLabel: {
    opacity: 0.7,
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    fontSize: 17,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  actions: {
    gap: spacing.md,
    alignItems: 'center',
  },
  skip: {
    paddingVertical: spacing.xs,
    color: 'rgba(255, 255, 255, 0.86)',
  },
});
