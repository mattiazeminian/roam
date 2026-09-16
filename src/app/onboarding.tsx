import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { impactLight } from '@/lib/haptics';
import { useSettings } from '@/services/settings-context';
import { layout, spacing, useTheme } from '@/theme';

/**
 * The one-time introduction (#19).
 *
 * One screen, not a carousel: ROAM does one thing — choose a distance, run a
 * loop — and padding that out would teach the runner nothing. Its real job is
 * to explain the location request *before* the system dialog appears, which is
 * why `LocationProvider` waits on the flag this screen sets.
 */
export default function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { update } = useSettings();

  const handleStart = useCallback(() => {
    impactLight();
    update({ hasCompletedOnboarding: true });
    router.replace('/');
  }, [update]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.lg,
        },
      ]}>
      <View style={styles.copy}>
        <Text variant="display" accessibilityRole="header">
          Run somewhere new
        </Text>
        <Text variant="body" color="textSecondary">
          Choose how far you want to go. ROAM finds running loops that start from where you are, and keeps
          a record of every run you finish.
        </Text>
        {/* Stated plainly, before the system dialog rather than instead of it:
            the permission prompt itself is the request, and this is context. */}
        <Text variant="body" color="textSecondary">
          ROAM needs your location to find routes near you and to record your run.
        </Text>
      </View>

      <Button label="Get started" variant="accent" onPress={handleStart} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
    gap: spacing.xl,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
});
