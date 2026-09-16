import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Divider } from '@/components/divider';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import {
  computeRecords,
  formatDuration,
  formatRunDate,
  type SavedRun,
} from '@/services/run-session';
import { useFormatters, type Formatters } from '@/services/settings-context';
import { listRuns } from '@/services/run-storage';
import { layout, spacing, useTheme } from '@/theme';

/**
 * History — saved runs, newest first, with records folded in above them.
 *
 * A plain list rather than cards: the useful act here is comparing one run to
 * another, which only works when a run is one scannable line. Records are two
 * facts, not a destination, so they sit in the header instead of owning a tab.
 */
export default function HistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const [runs, setRuns] = useState<SavedRun[] | null>(null);

  // Reload on focus so a run saved moments ago is already here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listRuns()
        .then((stored) => active && setRuns(stored))
        .catch(() => active && setRuns([]));
      return () => {
        active = false;
      };
    }, []),
  );

  const records = computeRecords(runs ?? []);
  const isEmpty = runs !== null && runs.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        data={runs ?? []}
        keyExtractor={(run) => run.id}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Settings lives here rather than on Home: Home is one decision,
                and this is already the "everything else" area. */}
            <View style={styles.headerControls}>
              <MapControl
                symbol="chevron.left"
                accessibilityLabel="Back"
                onPress={() => router.back()}
              />
              <MapControl
                symbol="gearshape"
                accessibilityLabel="Settings"
                onPress={() => router.push('/settings')}
              />
            </View>
            <Text variant="large" style={styles.title}>
              Your runs
            </Text>

            {records.longest || records.fastest ? (
              <View style={styles.records}>
                {records.longest ? (
                  <RecordCell
                    label="Longest"
                    value={`${fmt.distance(records.longest.distanceKm * 1000)} ${fmt.unitLabel}`}
                  />
                ) : null}
                {records.fastest ? (
                  <RecordCell
                    label="Fastest pace"
                    value={fmt.paceWithUnit(records.fastest.averagePaceMinPerKm)}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <Divider />}
        renderItem={({ item }) => <RunRow run={item} fmt={fmt} />}
        ListEmptyComponent={
          isEmpty ? (
            <View style={styles.empty}>
              <Text variant="title">No runs yet</Text>
              <Text variant="body" color="textSecondary" style={styles.emptyBody}>
                Runs you save will appear here, with the route you actually took.
              </Text>
              <Button
                label="Find a route"
                variant="accent"
                onPress={() => router.back()}
                style={styles.cta}
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}

function RecordCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.recordCell}>
      <Text variant="micro" color="textSecondary">
        {label}
      </Text>
      <Text variant="title" color="accentText" tabular>
        {value}
      </Text>
    </View>
  );
}

function RunRow({ run, fmt }: { run: SavedRun; fmt: Formatters }) {
  const distance = fmt.distance(run.distanceKm * 1000);
  const duration = formatDuration(run.durationSeconds);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/run-detail', params: { id: run.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${formatRunDate(run.startedAt)}, ${distance} ${fmt.unitSpoken}, ${duration}, ${fmt.paceSpoken(run.averagePaceMinPerKm)}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <Text variant="caption" color="textSecondary">
          {formatRunDate(run.startedAt)}
        </Text>
        <View style={styles.rowValue}>
          <Text variant="display" tabular>
            {distance}
          </Text>
          <Text variant="body" color="textSecondary">
            {fmt.unitLabel}
          </Text>
        </View>
      </View>

      <View style={styles.rowSecondary}>
        <Text variant="body" color="textSecondary" tabular>
          {duration}
        </Text>
        <Text variant="caption" color="textSecondary" tabular>
          {fmt.paceWithUnit(run.averagePaceMinPerKm)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    flexGrow: 1,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    marginTop: spacing.xs,
  },
  records: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  recordCell: {
    gap: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    minHeight: layout.minTouchTarget,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowMain: {
    gap: spacing.xxs,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  rowSecondary: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyBody: {
    maxWidth: 280,
  },
  cta: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
});
