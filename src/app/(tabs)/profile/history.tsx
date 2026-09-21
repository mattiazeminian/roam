import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Divider } from '@/components/divider';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import {
  RUN_PERIODS,
  filterRunsByPeriod,
  summarizeRuns,
  type RunPeriod,
} from '@/services/run-analytics';
import {
  computeRecords,
  formatDuration,
  formatRunDate,
  type RunRecords,
  type SavedRun,
} from '@/services/run-session';
import { useFormatters, type Formatters } from '@/services/settings-context';
import { listRuns, deleteRun } from '@/services/run-storage';
import { layout, radii, spacing, useTheme } from '@/theme';

/**
 * History — saved runs, newest first, with records folded in above them.
 *
 * A plain list rather than cards: the useful act here is comparing one run to
 * another, which only works when a run is one scannable line. Records are two
 * facts, not a destination, so they sit in the header instead of owning a tab.
 *
 * The overview and period filter answer "how much have I run?" without turning
 * the screen into a dashboard, and records stay all-time even when the list is
 * filtered — a record is not a property of the last 30 days.
 */
export default function HistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const [runs, setRuns] = useState<SavedRun[] | null>(null);
  const [period, setPeriod] = useState<RunPeriod>('all');
  // Captured when the list loads rather than during render: reading the clock
  // in render is impure, and the period boundary only needs to be stable for
  // as long as the list on screen is.
  const [loadedAt, setLoadedAt] = useState(0);

  // Reload on focus so a run saved moments ago is already here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const settle = (stored: SavedRun[]) => {
        if (active) {
          setRuns(stored);
          setLoadedAt(Date.now());
        }
      };
      void listRuns()
        .then(settle)
        .catch(() => settle([]));
      return () => {
        active = false;
      };
    }, []),
  );

  const now = loadedAt;
  const allRuns = runs ?? [];
  const records = computeRecords(allRuns);
  const overview = summarizeRuns(allRuns, now);
  const visibleRuns = filterRunsByPeriod(allRuns, period, now);
  const hasRuns = runs !== null && runs.length > 0;
  const filteredEmpty = hasRuns && visibleRuns.length === 0;

  // Deleting a single run is a long-press here, so a normal tap keeps opening
  // it. Confirmed, because this is the runner's record and there is no undo.
  const handleDelete = useCallback((run: SavedRun) => {
    Alert.alert('Delete this run?', 'It will be removed from this device. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteRun(run.id)
            .then(() =>
              setRuns((current) => current?.filter((entry) => entry.id !== run.id) ?? null),
            )
            .catch(() => {
              Alert.alert('Could not delete', 'The run could not be removed.');
            });
        },
      },
    ]);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        data={visibleRuns}
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

            {overview.count > 0 ? (
              <View style={styles.overview}>
                <Text variant="caption" color="textSecondary">
                  {`${overview.count} ${overview.count === 1 ? 'run' : 'runs'} · ${fmt.distance(overview.totalMeters)} ${fmt.unitLabel} total`}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {`Past ${overview.recentWindowDays} days · ${overview.recentCount} ${
                    overview.recentCount === 1 ? 'run' : 'runs'
                  } · ${fmt.distance(overview.recentMeters)} ${fmt.unitLabel}`}
                </Text>
              </View>
            ) : null}

            {hasRuns ? (
              <View style={styles.filters}>
                {RUN_PERIODS.map((option) => {
                  const selected = option.id === period;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setPeriod(option.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Show ${option.label}`}
                      style={({ pressed }) => [
                        styles.filter,
                        { backgroundColor: selected ? theme.accent : theme.fill },
                        pressed && !selected && styles.filterPressed,
                      ]}>
                      <Text
                        variant="caption"
                        color={selected ? 'accentForeground' : 'textSecondary'}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <RecordList records={records} fmt={fmt} />
          </View>
        }
        ItemSeparatorComponent={() => <Divider />}
        renderItem={({ item }) => <RunRow run={item} fmt={fmt} onRequestDelete={handleDelete} />}
        ListEmptyComponent={
          filteredEmpty ? (
            <View style={styles.empty}>
              <Text variant="title">Nothing in this period</Text>
              <Text variant="body" color="textSecondary" style={styles.emptyBody}>
                No runs in the chosen period. Choose a longer one to see more.
              </Text>
            </View>
          ) : runs !== null && runs.length === 0 ? (
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

function RunRow({
  run,
  fmt,
  onRequestDelete,
}: {
  run: SavedRun;
  fmt: Formatters;
  onRequestDelete: (run: SavedRun) => void;
}) {
  const distance = fmt.distance(run.distanceKm * 1000);
  const duration = formatDuration(run.durationSeconds);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/run-detail', params: { id: run.id } })}
      onLongPress={() => onRequestDelete(run)}
      accessibilityRole="button"
      accessibilityLabel={`${formatRunDate(run.startedAt)}, ${distance} ${fmt.unitSpoken}, ${duration}, ${fmt.paceSpoken(run.averagePaceMinPerKm)}`}
      accessibilityHint="Long press to delete this run"
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
  overview: {
    gap: 2,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filter: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.small,
    borderCurve: 'continuous',
  },
  filterPressed: {
    opacity: 0.7,
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
