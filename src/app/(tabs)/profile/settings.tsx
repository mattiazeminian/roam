import Constants from 'expo-constants';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ActionSheet } from '@/components/action-sheet';
import { Divider } from '@/components/divider';
import { MapControl } from '@/components/map-control';
import { Row } from '@/components/row';
import { SectionHeader } from '@/components/section-header';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { errorFeedback, impactLight, selectionFeedback } from '@/lib/haptics';
import { useAccount } from '@/services/account-context';
import { writeRunsGpx } from '@/services/run-export';
import { formatPace } from '@/services/run-session';
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

const APPEARANCE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' } as const;

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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
    setDeleteConfirm(true);
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
        setNotice('There are no saved runs on this device.');
        return;
      }

      const { uri, exported, skipped } = await writeRunsGpx(runs);
      if (exported === 0) {
        setNotice('None of your saved runs have a recorded track to export.');
        return;
      }

      await Share.share({ url: uri });

      if (skipped > 0) {
        setNotice(`${exported} ${exported === 1 ? 'run' : 'runs'} exported. ${
            skipped === 1 ? '1 run' : `${skipped} runs`
          } without a recorded track ${skipped === 1 ? 'was' : 'were'} skipped.`,
        );
      }
    } catch {
      errorFeedback();
      setNotice('The export file could not be created.');
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  const paceDisplay = paceToDisplay(settings.typicalPaceMinPerKm, settings.unit);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}> 
      <ActionSheet
        visible={deleteConfirm}
        title="Delete all runs?"
        message={`${runCount === 1 ? 'Your saved run' : `All ${runCount ?? 0} saved runs`} will be removed from this device. This cannot be undone.`}
        actions={[{ label: 'Delete', destructive: true, onPress: () => { void listRuns().then((runs) => Promise.all(runs.map((run) => deleteRun(run.id)))).then(() => setRunCount(0)).catch(() => setNotice('The saved runs could not be removed.')); } }]}
        onClose={() => setDeleteConfirm(false)}
      />
      {notice ? <Text variant="body" color="danger">{notice}</Text> : null}
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

        <Section title="Account">
          <Row
            label={account ? (account.name ?? 'Signed in with Apple') : 'Sign in with Apple'}
            showChevron
            onPress={() => router.push('/profile/account')}
            accessibilityLabel={
              account
                ? `Account, signed in as ${account.name ?? account.email ?? 'Apple user'}. Manage account.`
                : 'Sign in with Apple'
            }
          />
        </Section>

        <Section
          title="Appearance"
          footer="System follows your iPhone. Light and Dark stay put regardless of the system setting.">
          <View style={styles.segment}>
            {(['system', 'light', 'dark'] as const).map((option) => {
              const selected = settings.appearance === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    selectionFeedback();
                    update({ appearance: option });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={APPEARANCE_LABELS[option]}
                  style={[
                    styles.segmentItem,
                    { backgroundColor: selected ? theme.accent : theme.fill },
                  ]}>
                  <Text variant="label" color={selected ? 'accentForeground' : 'textTertiary'}>
                    {APPEARANCE_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section
          title="Running"
          footer="Typical pace is used to estimate how long a route will take. Routing only reports walking times, which are far too slow for a run.">
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
          <Divider />
          <Row
            accessibilityLabel={`Typical pace, ${formatters.paceSpoken(settings.typicalPaceMinPerKm)}`}
            trailing={
              <View style={styles.steppers}>
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
            }>
            <Text variant="display" color="accentText" tabular>
              {formatPace(paceDisplay)}
            </Text>
            <Text variant="body" color="textSecondary" style={styles.rowUnit}>
              {`/${formatters.unitLabel}`}
            </Text>
          </Row>
        </Section>

        <Section title="Data">
          <Row
            label={
              runCount === null
                ? 'Counting…'
                : runCount === 0
                  ? 'No runs saved'
                  : `${runCount} ${runCount === 1 ? 'run' : 'runs'} on this device`
            }
          />
          <Divider />
          <Row
            label={exporting ? 'Preparing export…' : 'Export runs (.gpx)'}
            labelColor="accentText"
            onPress={() => void handleExport()}
            accessibilityLabel="Export saved runs as a GPX file"
          />
          {runCount ? (
            <>
              <Divider />
              <Row
                label="Delete all runs"
                destructive
                onPress={handleDeleteAll}
                accessibilityLabel="Delete all saved runs"
              />
            </>
          ) : null}
          <Divider />
          <View style={styles.aboutBlock}>
            <Text variant="caption" color="textSecondary">
              Your runs, saved routes and preferences are stored on this device. Generating a route
              sends only your start point and chosen distance to the routing service — nothing else
              leaves the phone, and no account is required.
            </Text>
          </View>
        </Section>

        <Section title="About">
          <View style={styles.brandRow}>
            <Image
              source={require('../../../../assets/images/mark-green.png')}
              style={styles.brandMark}
              accessibilityIgnoresInvertColors
            />
            <Wordmark />
          </View>
          <Divider />
          <Row
            label="Version"
            labelColor="textSecondary"
            trailing={
              <Text variant="body" color="textSecondary" tabular>
                {Constants.expoConfig?.version ?? '—'}
              </Text>
            }
          />
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
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <Card padded={false} style={styles.cardBody}>
        {children}
      </Card>
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
  cardBody: {
    paddingHorizontal: spacing.md,
  },
  rowUnit: {
    paddingBottom: spacing.xxs,
  },
  steppers: {
    flexDirection: 'row',
    alignItems: 'center',
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
