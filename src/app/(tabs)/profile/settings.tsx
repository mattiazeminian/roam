import Constants from 'expo-constants';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Divider } from '@/components/divider';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { errorFeedback, impactLight, selectionFeedback } from '@/lib/haptics';
import { useAccount } from '@/services/account-context';
import { writeRunsGpx } from '@/services/run-export';
import { useSettings } from '@/services/settings-context';
import {
  MAX_PACE_MIN_PER_KM,
  MIN_PACE_MIN_PER_KM,
  paceToDisplay,
  type DistanceUnit,
} from '@/services/settings';
import { deleteRun, listRuns } from '@/services/run-storage';
import { layout, radii, spacing, useTheme } from '@/theme';

const PACE_STEP = 0.1;

/**
 * Settings — only things that change what Roam does.
 *
 * No notifications and no toggles that lead nowhere; each row changes a number
 * the app actually uses, acts on data it actually stores, or opens the one
 * account entry point.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, update, formatters } = useSettings();
  const { account } = useAccount();
  const [runCount, setRunCount] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    void listRuns()
      .then((runs) => active && setRunCount(runs.length))
      .catch(() => active && setRunCount(0));
    return () => {
      active = false;
    };
  }, []);

  const setUnit = useCallback(
    (unit: DistanceUnit) => {
      if (unit === settings.unit) {
        return;
      }
      selectionFeedback();
      update({ unit });
    },
    [settings.unit, update],
  );

  const adjustPace = useCallback(
    (delta: number) => {
      const next = Math.round((settings.typicalPaceMinPerKm + delta) * 10) / 10;
      if (next < MIN_PACE_MIN_PER_KM || next > MAX_PACE_MIN_PER_KM) {
        return;
      }
      impactLight();
      update({ typicalPaceMinPerKm: next });
    },
    [settings.typicalPaceMinPerKm, update],
  );

  const handleDeleteAll = useCallback(() => {
    if (!runCount) {
      return;
    }
    Alert.alert(
      'Delete all runs?',
      `${runCount === 1 ? 'Your saved run' : `All ${runCount} saved runs`} will be removed from this device. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void listRuns()
              .then((runs) => Promise.all(runs.map((run) => deleteRun(run.id))))
              .then(() => setRunCount(0))
              .catch(() => {
                Alert.alert('Could not delete', 'The saved runs could not be removed.');
              });
          },
        },
      ],
    );
  }, [runCount]);

  // Export is honest about what it can carry: a run recorded without GPS has no
  // track to write, so it is skipped and said so rather than exported empty.
  const handleExport = useCallback(async () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      const runs = await listRuns();
      if (runs.length === 0) {
        Alert.alert('Nothing to export', 'There are no saved runs on this device.');
        return;
      }

      const { uri, exported, skipped } = await writeRunsGpx(runs);
      if (exported === 0) {
        Alert.alert(
          'Nothing to export',
          'None of your saved runs have a recorded track to export.',
        );
        return;
      }

      await Share.share({ url: uri });

      if (skipped > 0) {
        Alert.alert(
          'Exported',
          `${exported} ${exported === 1 ? 'run' : 'runs'} exported. ${
            skipped === 1 ? '1 run' : `${skipped} runs`
          } without a recorded track ${skipped === 1 ? 'was' : 'were'} skipped.`,
        );
      }
    } catch {
      errorFeedback();
      Alert.alert('Could not export', 'The export file could not be created.');
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  const paceDisplay = paceToDisplay(settings.typicalPaceMinPerKm, settings.unit);
  const paceMinutes = Math.floor(paceDisplay);
  const paceSeconds = Math.round((paceDisplay - paceMinutes) * 60);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xxl },
        ]}>
        <View style={styles.header}>
          <MapControl symbol="chevron.left" accessibilityLabel="Back" onPress={() => router.back()} />
          <Text variant="large" style={styles.title}>
            Settings
          </Text>
        </View>

        <Section title="Units">
          <View style={styles.segment}>
            {(['km', 'mi'] as const).map((unit) => {
              const selected = settings.unit === unit;
              return (
                <Pressable
                  key={unit}
                  onPress={() => setUnit(unit)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={unit === 'km' ? 'Kilometers' : 'Miles'}
                  style={[
                    styles.segmentItem,
                    { backgroundColor: selected ? theme.accent : theme.fill },
                  ]}>
                  <Text variant="label" color={selected ? 'accentForeground' : 'textTertiary'}>
                    {unit === 'km' ? 'Kilometers' : 'Miles'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section
          title="Typical pace"
          footer="Used to estimate how long a route will take. Routing only reports walking times, which are far too slow for a run.">
          <View style={styles.row}>
            <Text
              variant="display"
              color="accentText"
              tabular
              accessibilityLabel={`Typical pace ${paceMinutes} minutes ${paceSeconds} seconds per ${settings.unit === 'mi' ? 'mile' : 'kilometer'}`}>
              {`${paceMinutes}'${paceSeconds.toString().padStart(2, '0')}"`}
            </Text>
            <Text variant="body" color="textSecondary" style={styles.rowUnit}>
              {`/${formatters.unitLabel}`}
            </Text>

            <View style={styles.spacer} />

            <Stepper
              symbol="minus"
              accessibilityLabel="Faster pace"
              onPress={() => adjustPace(-PACE_STEP)}
              disabled={settings.typicalPaceMinPerKm <= MIN_PACE_MIN_PER_KM}
            />
            <Stepper
              symbol="plus"
              accessibilityLabel="Slower pace"
              onPress={() => adjustPace(PACE_STEP)}
              disabled={settings.typicalPaceMinPerKm >= MAX_PACE_MIN_PER_KM}
            />
          </View>
        </Section>

        <Section title="Saved runs">
          <View style={styles.row}>
            <Text variant="body">
              {runCount === null
                ? 'Counting…'
                : runCount === 0
                  ? 'No runs saved'
                  : `${runCount} ${runCount === 1 ? 'run' : 'runs'} on this device`}
            </Text>
          </View>
          {runCount ? (
            <>
              <Divider />
              <Pressable
                onPress={handleDeleteAll}
                accessibilityRole="button"
                accessibilityLabel="Delete all saved runs"
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <Text variant="body" color="accentText">
                  Delete all runs
                </Text>
              </Pressable>
            </>
          ) : null}
        </Section>

        <Section title="Account">
          <Pressable
            onPress={() => router.push('/account')}
            accessibilityRole="button"
            accessibilityLabel={
              account
                ? `Account, signed in as ${account.name ?? account.email ?? 'Apple user'}. Manage account.`
                : 'Sign in with Apple'
            }
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <Text variant="body">
              {account ? (account.name ?? 'Signed in with Apple') : 'Sign in with Apple'}
            </Text>
            <View style={styles.spacer} />
            <SymbolView
              name="chevron.right"
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        </Section>

        <Section title="Your data">
          <View style={styles.aboutBlock}>
            <Text variant="caption" color="textSecondary">
              Your runs, saved routes and preferences are stored on this device. Generating a route
              sends only your start point and chosen distance to the routing service — nothing else
              leaves the phone, and no account is required.
            </Text>
          </View>
          <Divider />
          <Pressable
            onPress={() => void handleExport()}
            accessibilityRole="button"
            accessibilityLabel="Export saved runs as a GPX file"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <Text variant="body" color="accentText">
              {exporting ? 'Preparing export…' : 'Export runs (.gpx)'}
            </Text>
          </Pressable>
        </Section>

        <Section title="About">
          <View style={styles.brandRow}>
            <Image
              source={require('../../assets/images/mark-green.png')}
              style={styles.brandMark}
              accessibilityIgnoresInvertColors
            />
            <Wordmark />
          </View>
          <Divider />
          <View style={styles.row}>
            <Text variant="body" color="textSecondary">
              Version
            </Text>
            <View style={styles.spacer} />
            <Text variant="body" color="textSecondary" tabular>
              {Constants.expoConfig?.version ?? '—'}
            </Text>
          </View>
          <Divider />
          <View style={styles.aboutBlock}>
            <Text variant="caption" color="textSecondary">
              Maps © Mapbox and OpenStreetMap contributors. Routes by OpenRouteService, using
              OpenStreetMap data.
            </Text>
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="micro" color="textSecondary">
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>{children}</View>
      {footer ? (
        <Text variant="caption" color="textSecondary" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

function Stepper({
  symbol,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  symbol: 'plus' | 'minus';
  accessibilityLabel: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.stepper,
        {
          backgroundColor: pressed && !disabled ? theme.fillPressed : theme.fill,
          opacity: disabled ? 0.35 : 1,
        },
      ]}>
      <SymbolView
        name={symbol}
        size={layout.iconSize}
        weight="semibold"
        tintColor={disabled ? theme.textDisabled : theme.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  title: {
    marginTop: spacing.xs,
  },
  section: {
    gap: spacing.xs,
  },
  card: {
    borderRadius: radii.medium,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.minTouchTarget + spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.xxs,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowUnit: {
    paddingBottom: spacing.xxs,
  },
  spacer: {
    flex: 1,
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  segmentItem: {
    flex: 1,
    height: layout.controlHeightCompact,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  aboutBlock: {
    paddingVertical: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  brandMark: {
    width: 26,
    height: 26,
  },
  footer: {
    paddingHorizontal: spacing.xxs,
  },
});
