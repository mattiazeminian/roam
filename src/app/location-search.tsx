import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Divider } from '@/components/divider';
import { Text } from '@/components/text';
import { selectionFeedback } from '@/lib/haptics';
import { GeocodingError, searchPlaces, type Place } from '@/services/geocoding';
import { useLocation } from '@/services/location-context';
import { layout, radii, spacing, useAppearance, useTheme } from '@/theme';

/** Wait this long after the last keystroke before searching. */
const DEBOUNCE_MS = 320;

/**
 * Choose where a run starts — or, in finish mode, where it ends.
 *
 * A run does not have to begin where you are standing — you might be planning
 * one for a park across town. Picking a place here replaces the origin every
 * other screen plans from. The same screen picks a finish (#17), which turns
 * the route into a one-way; the only real difference is which slot it writes
 * to, so there is no reason for a second screen.
 */
export default function LocationSearchScreen() {
  const theme = useTheme();
  const scheme = useAppearance();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isFinish = mode === 'finish';
  const { coordinate, originLabel, hasCustomOrigin, setOrigin, resetOrigin, setFinish } =
    useLocation();

  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  // Clearing happens here rather than in the effect: a query too short to
  // search has nothing to show, and that is a consequence of the edit, not
  // state to synchronize afterwards.
  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    if (next.trim().length < 2) {
      request.current?.abort();
      setPlaces([]);
      setSearching(false);
      setError(null);
    }
  }, []);

  // Debounced so typing does not fire a request per keystroke, and each new
  // search cancels the one before it so results cannot arrive out of order.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    const timer = setTimeout(() => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setSearching(true);
      setError(null);

      searchPlaces(trimmed, coordinate, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) {
            return;
          }
          setPlaces(results);
          setSearching(false);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          setSearching(false);
          setPlaces([]);
          setError(
            cause instanceof GeocodingError ? cause.message : 'Could not search for places.',
          );
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, coordinate]);

  useEffect(() => () => request.current?.abort(), []);

  const choose = useCallback(
    (place: Place) => {
      selectionFeedback();
      if (isFinish) {
        setFinish({ label: place.name, coordinate: place.coordinate });
      } else {
        setOrigin({ label: place.name, coordinate: place.coordinate });
      }
      router.back();
    },
    [isFinish, setFinish, setOrigin],
  );

  const chooseCurrent = useCallback(() => {
    selectionFeedback();
    resetOrigin();
    router.back();
  }, [resetOrigin]);

  const showEmpty = query.trim().length >= 2 && !searching && !error && places.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerRow}>
          <Text variant="title">{isFinish ? 'Finish at' : 'Start from'}</Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}>
            <Text variant="heading" color="accentText">
              Done
            </Text>
          </Pressable>
        </View>

        <View style={[styles.field, { backgroundColor: theme.fill }]}>
          <SymbolView name="magnifyingglass" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search for a place"
            placeholderTextColor={theme.textSecondary}
            keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel={isFinish ? 'Search for a finish place' : 'Search for a starting place'}
            style={[styles.input, { color: theme.text }]}
          />
          {searching ? <ActivityIndicator color={theme.textSecondary} /> : null}
        </View>
      </View>

      <FlatList
        data={places}
        keyExtractor={(place) => place.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        ListHeaderComponent={
          <>
            {/* A finish equal to the start would be a zero-length "loop", so
                the current-location shortcut only makes sense for a start. */}
            {!isFinish ? (
              <Pressable
                onPress={chooseCurrent}
                accessibilityRole="button"
                accessibilityState={{ selected: !hasCustomOrigin }}
                accessibilityLabel="Use my current location"
                disabled={!coordinate}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <SymbolView
                  name="location.fill"
                  size={layout.iconSize}
                  tintColor={coordinate ? theme.accent : theme.textDisabled}
                />
                <View style={styles.rowText}>
                  <Text variant="body" color={coordinate ? 'text' : 'textDisabled'}>
                    Current location
                  </Text>
                  {!coordinate ? (
                    <Text variant="caption" color="textSecondary">
                      Location is unavailable
                    </Text>
                  ) : null}
                </View>
                {!hasCustomOrigin ? (
                  <SymbolView name="checkmark" size={layout.iconSizeSmall} tintColor={theme.accent} />
                ) : null}
              </Pressable>
            ) : null}

            {!isFinish && hasCustomOrigin ? (
              <>
                <Divider />
                <View style={styles.current}>
                  <Text variant="micro" color="textSecondary">
                    Currently starting from
                  </Text>
                  <Text variant="body">{originLabel}</Text>
                </View>
              </>
            ) : null}

            {places.length > 0 ? <Divider /> : null}
          </>
        }
        ItemSeparatorComponent={() => <Divider />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => choose(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}${item.context ? `, ${item.context}` : ''}`}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <SymbolView name="mappin" size={layout.iconSize} tintColor={theme.textSecondary} />
            <View style={styles.rowText}>
              <Text variant="body" numberOfLines={1}>
                {item.name}
              </Text>
              {item.context ? (
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {item.context}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          error ? (
            <Text variant="body" color="textSecondary" style={styles.message}>
              {error}
            </Text>
          ) : showEmpty ? (
            <Text variant="body" color="textSecondary" style={styles.message}>
              {`No places found for "${query.trim()}".`}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    height: layout.controlHeightCompact,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  list: {
    paddingHorizontal: layout.screenMargin,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: layout.minTouchTarget,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  current: {
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
  },
  message: {
    paddingTop: spacing.lg,
  },
});
