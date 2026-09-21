import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Divider } from '@/components/divider';
import { EmptyState } from '@/components/empty-state';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { impactLight, impactMedium, selectionFeedback } from '@/lib/haptics';
import { useRoutes } from '@/services/route-context';
import { useRun } from '@/services/run-context';
import { deleteRoute, listRoutes, type SavedRoute } from '@/services/route-storage';
import { formatRunDate, formatDuration } from '@/services/run-session';
import { useFormatters, type Formatters } from '@/services/settings-context';
import { layout, spacing, useTheme } from '@/theme';

/**
 * Saved routes — loops worth keeping, without accounts.
 *
 * Tapping a route puts it back on the map as the active candidate rather than
 * starting it immediately: a saved loop is still a route, and the runner should
 * see it before committing to it.
 */
export default function FavoritesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const { loadSaved } = useRoutes();
  const { start } = useRun();
  // Opened from Home to choose a route for a run, rather than to browse them
  // (#109). Same screen, same list; the tap does the obvious thing in context.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const runMode = mode === 'run';
  const [routes, setRoutes] = useState<SavedRoute[] | null>(null);

  // Reload on focus so a route saved moments ago is already here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listRoutes()
        .then((stored) => active && setRoutes(stored))
        .catch(() => active && setRoutes([]));
      return () => {
        active = false;
      };
    }, []),
  );

  const handleOpen = useCallback(
    (saved: SavedRoute) => {
      selectionFeedback();
      if (runMode) {
        // Go straight to the run: the runner already chose this route.
        impactMedium();
        start(saved.route, saved.route.distanceKm);
        router.push('/run');
        return;
      }
      loadSaved(saved.route, saved.route.distanceKm);
      router.push('/routes');
    },
    [runMode, start, loadSaved],
  );

  const handleRemove = useCallback((saved: SavedRoute) => {
    impactLight();
    Alert.alert(
      'Remove route?',
      'This removes the saved route. Runs you have already done are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void deleteRoute(saved.id).then(() =>
              setRoutes((current) => current?.filter((entry) => entry.id !== saved.id) ?? null),
            );
          },
        },
      ],
    );
  }, []);

  const isEmpty = routes !== null && routes.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        data={routes ?? []}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerControls}>
              <MapControl
                symbol="chevron.left"
                accessibilityLabel="Back"
                onPress={() => router.back()}
              />
            </View>
            <Text variant="large" style={styles.title}>
              {runMode ? 'Choose a route' : 'Saved routes'}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <Divider />}
        renderItem={({ item }) => (
          <RouteRow
            saved={item}
            fmt={fmt}
            runMode={runMode}
            onPress={() => handleOpen(item)}
            onRemove={() => handleRemove(item)}
          />
        )}
        ListEmptyComponent={
          isEmpty ? (
            <EmptyState
              title="No saved routes"
              body="Save a route from the map and it will be kept here, ready to run again."
              action={{ label: 'Find a route', onPress: () => router.back() }}
            />
          ) : null
        }
      />
    </View>
  );
}

function RouteRow({
  saved,
  fmt,
  runMode,
  onPress,
  onRemove,
}: {
  saved: SavedRoute;
  fmt: Formatters;
  runMode: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const distance = fmt.distance(saved.route.distanceKm * 1000);
  const details = saved.route.characteristics.join('  ·  ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${distance} ${fmt.unitSpoken} route, saved ${formatRunDate(saved.savedAt)}. ${
        runMode ? 'Start running it.' : 'Open on the map.'
      }`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <Text variant="caption" color="textSecondary">
          Saved {formatRunDate(saved.savedAt)}
        </Text>
        <View style={styles.rowValue}>
          <Text variant="display" tabular>
            {distance}
          </Text>
          <Text variant="body" color="textSecondary">
            {fmt.unitLabel}
          </Text>
        </View>
        {details ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {details}
          </Text>
        ) : null}
      </View>

      <View style={styles.rowSecondary}>
        <Text variant="body" color="textSecondary" tabular>
          {formatDuration(saved.route.estimatedMinutes * 60)}
        </Text>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove saved route"
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.remove, pressed && styles.rowPressed]}>
          <SymbolView name="trash" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
        </Pressable>
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
    flex: 1,
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
  remove: {
    minHeight: layout.minTouchTarget / 2,
    justifyContent: 'flex-end',
  },
});
