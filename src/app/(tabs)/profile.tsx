import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { impactLight, selectionFeedback } from '@/lib/haptics';
import { useAccount } from '@/services/account-context';
import { loadProfile, pickAvatar, saveProfile, type Profile } from '@/services/profile';
import {
  addShoe,
  createShoe,
  loadShoes,
  removeShoe,
  saveShoes,
  setShoeRetired,
  shoeName,
  type Shoe,
} from '@/services/shoes';
import { summarizeRuns, shoeMileageMeters, weekDayBuckets, type RunOverview } from '@/services/run-analytics';
import { formatDuration, formatRunDate, type SavedRun } from '@/services/run-session';
import { listRuns } from '@/services/run-storage';
import { listRoutes, type SavedRoute } from '@/services/route-storage';
import { useFormatters, type Formatters } from '@/services/settings-context';
import { toDateKey, weekStartFor } from '@/services/training';
import { layout, radii, spacing, useTheme } from '@/theme';

/** Sunday-first, matching how the week is drawn everywhere else. */
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Bar heights for the week chart, in points. */
const BAR_MAX = 52;
const BAR_MIN = 10;
const BAR_EMPTY = 4;

/**
 * Profile — who the runner is, and what they have done.
 *
 * The identity and the headline statistics live here rather than being spread
 * across Settings and History. Age and weight are shown as facts; nothing in
 * the app derives a metric from them, because nothing honest can be.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const { account } = useAccount();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [runs, setRuns] = useState<SavedRun[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [todayKey, setTodayKey] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const now = Date.now();
      void Promise.all([loadProfile(), listRuns(), loadShoes(), listRoutes()])
        .then(([stored, saved, storedShoes, routes]) => {
          if (!active) {
            return;
          }
          setProfile(stored);
          setRuns(saved);
          setShoes(storedShoes);
          setSavedRoutes(routes);
          setLoadedAt(now);
          setTodayKey(toDateKey(new Date(now)));
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const persist = useCallback(async (next: Profile) => {
    await saveProfile(next);
    setProfile(await loadProfile());
  }, []);

  // Editing is a small iOS prompt rather than a form screen: three short facts,
  // each changed rarely. Guarded because Alert.prompt is iOS-only, and ROAM is
  // iOS-first.
  const editName = useCallback(() => {
    if (Platform.OS !== 'ios' || !profile) {
      return;
    }
    Alert.prompt(
      'Your name',
      'Shown on your profile.',
      (value) => {
        void persist({ ...profile, name: value });
      },
      'plain-text',
      profile.name ?? '',
    );
  }, [profile, persist]);

  const editNumber = useCallback(
    (field: 'age' | 'weightKg') => {
      if (Platform.OS !== 'ios' || !profile) {
        return;
      }
      const isAge = field === 'age';
      Alert.prompt(
        isAge ? 'Your age' : 'Your weight',
        isAge ? 'Years.' : 'Kilograms.',
        (value) => {
          const parsed = Number(value.replace(',', '.'));
          void persist({ ...profile, [field]: value.trim() === '' ? null : parsed });
        },
        'plain-text',
        profile[field] === null ? '' : String(profile[field]),
      );
    },
    [profile, persist],
  );

  const persistShoes = useCallback(async (next: Shoe[]) => {
    setShoes(next);
    await saveShoes(next);
  }, []);

  // Two short prompts rather than a form screen, matching how the rest of the
  // profile is edited. iOS-only, and ROAM is iOS-first.
  const addAShoe = useCallback(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    Alert.prompt('Add a shoe', 'Brand', (brand) => {
      const trimmedBrand = brand.trim();
      if (trimmedBrand.length === 0) {
        return;
      }
      Alert.prompt('Add a shoe', 'Model', (model) => {
        const trimmedModel = model.trim();
        if (trimmedModel.length === 0) {
          return;
        }
        void persistShoes(addShoe(shoes, createShoe({ brand: trimmedBrand, model: trimmedModel })));
      });
    });
  }, [shoes, persistShoes]);

  const editShoe = useCallback(
    (shoe: Shoe) => {
      Alert.alert(shoeName(shoe), `${shoe.brand} ${shoe.model}`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: shoe.retired ? 'Bring back' : 'Retire',
          onPress: () => void persistShoes(setShoeRetired(shoes, shoe.id, !shoe.retired)),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void persistShoes(removeShoe(shoes, shoe.id)),
        },
      ]);
    },
    [shoes, persistShoes],
  );

  const changeAvatar = useCallback(async () => {
    if (!profile) {
      return;
    }
    selectionFeedback();
    const uri = await pickAvatar();
    if (!uri) {
      return;
    }
    await persist({ ...profile, avatarUri: uri });
  }, [profile, persist]);

  const allRuns = runs ?? [];
  const overview: RunOverview = summarizeRuns(allRuns, loadedAt, 7);
  const recent = allRuns.slice(0, 5);
  const totalSeconds = allRuns.reduce((sum, run) => sum + run.durationSeconds, 0);
  const weekBuckets = todayKey ? weekDayBuckets(allRuns, weekStartFor(todayKey)) : [];
  const initial = (profile?.name?.trim()?.[0] ?? account?.name?.trim()?.[0] ?? '·').toUpperCase();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xxl },
        ]}>
        {/* Profile is a tab root, so there is nothing to go back to — only the
            way into Settings. */}
        <View style={styles.headerRow}>
          <MapControl
            symbol="gearshape"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
          />
        </View>

        {/* Identity */}
        <View style={styles.identity}>
          <Pressable
            onPress={() => void changeAvatar()}
            accessibilityRole="button"
            accessibilityLabel={profile?.avatarUri ? 'Change profile photo' : 'Add a profile photo'}
            style={({ pressed }) => [pressed && styles.pressed]}>
            {profile?.avatarUri ? (
              <Image source={{ uri: profile.avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.fill }]}>
                <Text variant="title" color="textSecondary">
                  {initial}
                </Text>
              </View>
            )}
          </Pressable>

          <View style={styles.identityText}>
            <Pressable onPress={editName} accessibilityRole="button" accessibilityLabel="Edit name">
              <Text variant="large">{profile?.name ?? account?.name ?? 'Add your name'}</Text>
            </Pressable>
            <Pressable
              onPress={() => editNumber('age')}
              accessibilityRole="button"
              accessibilityLabel="Edit age">
              <Text variant="caption" color="textSecondary" tabular>
                {profile?.age === null || profile?.age === undefined
                  ? 'Add your age'
                  : `${profile.age} years`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => editNumber('weightKg')}
              accessibilityRole="button"
              accessibilityLabel="Edit weight">
              <Text variant="caption" color="textSecondary" tabular>
                {profile?.weightKg === null || profile?.weightKg === undefined
                  ? 'Add your weight'
                  : `${profile.weightKg} kg`}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.statsCard, { backgroundColor: theme.fill, borderColor: theme.borderSubtle }]}>
          <StatBar
            items={[
              { label: 'Runs', value: overview.count === 0 ? '—' : String(overview.count) },
              {
                label: 'Distance',
                value: overview.count === 0 ? '—' : fmt.distance(overview.totalMeters),
                unit: overview.count === 0 ? undefined : fmt.unitLabel,
              },
              { label: 'Time', value: totalSeconds > 0 ? formatDuration(totalSeconds) : '—' },
            ]}
          />
        </View>

        {runs !== null ? <WeekChart buckets={weekBuckets} todayKey={todayKey} fmt={fmt} /> : null}

        <View style={styles.sectionHeader}>
          <Text variant="title">Recent runs</Text>
          {overview.count > 0 ? (
            <Pressable
              onPress={() => router.push('/history')}
              accessibilityRole="button"
              accessibilityLabel="See all runs"
              hitSlop={spacing.sm}>
              <Text variant="body" color="accentText">
                See all
              </Text>
            </Pressable>
          ) : null}
        </View>

        {recent.length === 0 ? (
          <Text variant="body" color="textSecondary">
            No runs yet. Start one from Home and it will appear here.
          </Text>
        ) : (
          recent.map((run) => (
            <Pressable
              key={run.id}
              onPress={() => router.push({ pathname: '/run-detail', params: { id: run.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${formatRunDate(run.startedAt)}, ${fmt.distance(run.distanceKm * 1000)} ${fmt.unitSpoken}`}
              style={({ pressed }) => [styles.runRow, pressed && styles.pressed]}>
              <View>
                <Text variant="caption" color="textSecondary">
                  {formatRunDate(run.startedAt)}
                </Text>
                <Text variant="title" tabular>
                  {`${fmt.distance(run.distanceKm * 1000)} ${fmt.unitLabel}`}
                </Text>
              </View>
              <Text variant="caption" color="textSecondary" tabular>
                {fmt.paceWithUnit(run.averagePaceMinPerKm)}
              </Text>
            </Pressable>
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text variant="title">My shoes</Text>
          <Pressable
            onPress={addAShoe}
            accessibilityRole="button"
            accessibilityLabel="Add a shoe"
            hitSlop={spacing.sm}>
            <Text variant="body" color="accentText">
              Add
            </Text>
          </Pressable>
        </View>

        {shoes.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Add the shoes you run in to keep track of them here.
          </Text>
        ) : (
          shoes.map((shoe) => (
            <Pressable
              key={shoe.id}
              onPress={() => editShoe(shoe)}
              accessibilityRole="button"
              accessibilityLabel={`${shoeName(shoe)}${shoe.retired ? ', retired' : ''}. Edit shoe.`}
              style={({ pressed }) => [styles.runRow, pressed && styles.pressed]}>
              <View>
                <Text variant="body">{shoeName(shoe)}</Text>
                <Text variant="caption" color="textSecondary">
                  {`${shoe.brand} ${shoe.model}${shoe.retired ? ' · retired' : ''}`}
                </Text>
              </View>
              <Text variant="body" tabular>
                {`${fmt.distance(shoeMileageMeters(shoe.id, allRuns))} ${fmt.unitLabel}`}
              </Text>
            </Pressable>
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text variant="title">Saved routes</Text>
          {savedRoutes.length > 0 ? (
            <Pressable
              onPress={() => router.push('/favorites')}
              accessibilityRole="button"
              accessibilityLabel="See all saved routes"
              hitSlop={spacing.sm}>
              <Text variant="body" color="accentText">
                See all
              </Text>
            </Pressable>
          ) : null}
        </View>

        {savedRoutes.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Routes you save from Maps will appear here.
          </Text>
        ) : (
          savedRoutes.map((saved) => (
            <Pressable
              key={saved.id}
              onPress={() => router.push('/favorites')}
              accessibilityRole="button"
              accessibilityLabel={`${fmt.distance(saved.route.distanceKm * 1000)} ${fmt.unitSpoken} route`}
              style={({ pressed }) => [styles.runRow, pressed && styles.pressed]}>
              <View>
                <Text variant="title" tabular>
                  {`${fmt.distance(saved.route.distanceKm * 1000)} ${fmt.unitLabel}`}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {saved.route.characteristics.join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text variant="title">Account</Text>
        </View>
        <Text variant="body" color="textSecondary">
          {account
            ? `Signed in with Apple${account.email ? ` as ${account.email}` : ''}.`
            : 'ROAM works without an account. Sign in with Apple to keep one identity for your runs.'}
        </Text>
        <Button
          label={account ? 'Manage account' : 'Sign in with Apple'}
          variant="secondary"
          onPress={() => {
            impactLight();
            router.push('/account');
          }}
          style={styles.accountButton}
        />
      </ScrollView>
    </View>
  );
}

function StatBar({
  items,
}: {
  items: { label: string; value: string; unit?: string }[];
}) {
  return (
    <View style={styles.statBar}>
      {items.map((item) => (
        <View key={item.label} style={styles.statCell}>
          <View style={styles.statValueRow}>
            <Text variant="title" tabular>
              {item.value}
            </Text>
            {item.unit ? (
              <Text variant="caption" color="textSecondary">
                {item.unit}
              </Text>
            ) : null}
          </View>
          <Text variant="micro" color="textSecondary">
            {item.label.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WeekChart({
  buckets,
  todayKey,
  fmt,
}: {
  buckets: ReturnType<typeof weekDayBuckets>;
  todayKey: string;
  fmt: Formatters;
}) {
  const theme = useTheme();
  const maxMeters = Math.max(...buckets.map((bucket) => bucket.meters), 1);
  const total = buckets.reduce((sum, bucket) => sum + bucket.meters, 0);

  return (
    <View style={[styles.weekCard, { backgroundColor: theme.fill, borderColor: theme.borderSubtle }]}>
      <View style={styles.weekHeader}>
        <Text variant="micro" color="textSecondary">
          THIS WEEK
        </Text>
        {total > 0 ? (
          <Text variant="caption" color="textSecondary" tabular>
            {`${fmt.distance(total)} ${fmt.unitLabel}`}
          </Text>
        ) : null}
      </View>

      <View style={styles.weekBars}>
        {buckets.map((bucket, index) => {
          const active = bucket.meters > 0;
          const isToday = bucket.date === todayKey;
          const height = active
            ? BAR_MIN + (bucket.meters / maxMeters) * (BAR_MAX - BAR_MIN)
            : BAR_EMPTY;
          return (
            <View key={bucket.date} style={styles.weekBar}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height,
                      backgroundColor: active
                        ? isToday
                          ? theme.accentText
                          : theme.accent
                        : theme.borderSubtle,
                    },
                  ]}
                />
              </View>
              <Text
                variant="micro"
                color={isToday ? 'accentText' : 'textSecondary'}
                style={isToday ? styles.todayLetter : undefined}>
                {DAY_LETTERS[index]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    gap: spacing.xxs,
    flexShrink: 1,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    minHeight: layout.minTouchTarget,
  },
  statsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  statBar: {
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
    alignItems: 'flex-start',
    gap: spacing.xxs,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  weekCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  weekBar: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  barTrack: {
    height: BAR_MAX,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 16,
    borderRadius: 4,
  },
  todayLetter: {
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    minHeight: layout.minTouchTarget,
  },
  accountButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
});
