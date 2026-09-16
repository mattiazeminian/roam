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
  type RunRecords,
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

            <RecordList records={records} fmt={fmt} />
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

type RecordRow = {
  key: string;
  label: string;
  value: string;
  run: SavedRun;
};

/**
 * Personal records as plain rows — label, value, and the run they came from.
 *
 * The date is part of the record, not decoration: "fastest pace" is only
 * meaningful if you can see which run it was. A record with no qualifying run
 * is simply absent rather than shown as a placeholder.
 */
function RecordList({ records, fmt }: { records: RunRecords; fmt: Formatters }) {
  const rows: RecordRow[] = [];
  if (records.longest) {
    rows.push({
      key: 'longest',
      label: 'Longest',
      value: `${fmt.distance(records.longest.distanceKm * 1000)} ${fmt.unitLabel}`,
      run: records.longest,
    });
  }
  if (records.fastest) {
    rows.push({
      key: 'fastest',
      label: 'Fastest pace',
      value: fmt.paceWithUnit(records.fastest.averagePaceMinPerKm),
      run: records.fastest,
    });
  }
  if (records.fastest5k) {
    rows.push({
      key: 'fastest5k',
      label: 'Best 5 km',
      value: fmt.paceWithUnit(records.fastest5k.averagePaceMinPerKm),
      run: records.fastest5k,
    });
  }
  if (records.fastest10k) {
    rows.push({
      key: 'fastest10k',
      label: 'Best 10 km',
      value: fmt.paceWithUnit(records.fastest10k.averagePaceMinPerKm),
      run: records.fastest10k,
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <View style={styles.records}>
      {rows.map((row) => {
        const date = formatRunDate(row.run.startedAt);
        return (
          <View
            key={row.key}
            accessible
            accessibilityLabel={`${row.label}: ${row.value}, on ${date}`}
            style={styles.recordRow}>
            <Text variant="caption" color="textSecondary">
              {row.label}
            </Text>
            <View style={styles.recordValue}>
              <Text variant="title" color="accentText" tabular>
                {row.value}
              </Text>
              <Text variant="micro" color="textSecondary" tabular>
                {date}
              </Text>
            </View>
          </View>
        );
      })}
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
    gap: spacing.sm,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  recordValue: {
    alignItems: 'flex-end',
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
