import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { impactMedium } from '@/lib/haptics';
import { useLocation } from '@/services/location-context';
import { useRun } from '@/services/run-context';
import { layout, spacing, useTheme } from '@/theme';

/**
 * Record — the fastest way to start running.
 *
 * No route, no choices: one deliberate action begins a run, and everything
 * else (a saved route, a plan) is an option beside it. The active run itself is
 * a full-screen flow, so the tab bar is out of the way while it is happening.
 */
export default function RecordScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status: locationStatus, originLabel } = useLocation();
  const { start } = useRun();

  const handleStart = useCallback(() => {
    impactMedium();
    start(null, 0);
    router.push('/run');
  }, [start]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
        },
      ]}>
      <View style={styles.intro}>
        <Text variant="large">Record</Text>
        <Text variant="body" color="textSecondary">
          Start running now. A route is optional — ROAM records the run either way, and you can keep
          what you ran as a route afterwards.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Start run"
          variant="accent"
          onPress={handleStart}
          disabled={locationStatus === 'denied'}
        />
        <Button
          label="Run a saved route"
          variant="secondary"
          onPress={() => router.push('/favorites?mode=run')}
        />
        <Text variant="caption" color="textSecondary">
          {locationStatus === 'denied'
            ? 'Location is off. Turn it on to record a run.'
            : `Starting from ${originLabel}`}
        </Text>
      </View>
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
  intro: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
