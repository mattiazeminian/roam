import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear } from '@/components/appear';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { FormSheet } from '@/components/form-sheet';
import { MapControl } from '@/components/map-control';
import { SectionHeader } from '@/components/section-header';
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
import {
  paceTrend,
  summarizeRuns,
  shoeMileageMeters,
  weekDayBuckets,
  weeklyDistanceSeries,
  type RunOverview,
} from '@/services/run-analytics';
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

/** Which short-fact sheet is open, if any. */
type Editor = 'name' | 'age' | 'shoe' | null;

/**
 * Profile — who the runner is, and what they have done.
 *
 * The identity and the headline statistics live here rather than being spread
 * across Settings and History. Body measurements are intentionally not part of
 * this screen because they are not needed for running, training, or history.
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
  const [editor, setEditor] = useState<Editor>(null);

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

  // Editing opens Roam's own sheet rather than the system prompt: the system
  // prompt cannot be styled, cannot show more than one field, and looks nothing
  // like the rest of the app. The sheet is mounted only while open, so its
  // fields always start from the current values.
  const persistShoes = useCallback(async (next: Shoe[]) => {
    setShoes(next);
    await saveShoes(next);
  }, []);

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
            onPress={() => router.push('/profile/settings')}
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
            <Pressable onPress={() => setEditor('name')} accessibilityRole="button" accessibilityLabel="Edit name">
              <Text variant="large">{profile?.name ?? account?.name ?? 'Add your name'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setEditor('age')}
              accessibilityRole="button"
              accessibilityLabel="Edit age">
              <Text variant="caption" color="textSecondary" tabular>
                {profile?.age === null || profile?.age === undefined
                  ? 'Add your age'
                  : `${profile.age} years`}
              </Text>
            </Pressable>
          </View>
        </View>

        <Card style={styles.statsCard}>
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
        </Card>

        {runs !== null ? (
          <Appear>
            <WeekChart buckets={weekBuckets} todayKey={todayKey} fmt={fmt} />
          </Appear>
        ) : null}

        {runs !== null && allRuns.length > 0 ? (
          <Appear>
            <Trends runs={allRuns} nowMs={loadedAt} fmt={fmt} />
          </Appear>
        ) : null}

        <SectionHeader
          title="Recent runs"
          emphasis="title"
          style={styles.sectionHeader}
          action={
            overview.count > 0
              ? {
                  label: 'See all',
                  accessibilityLabel: 'See all runs',
                  onPress: () => router.push('/profile/history'),
                }
              : undefined
          }
        />

        {runs === null ? null : recent.length === 0 ? (
          <EmptyState
            align="start"
            title="No runs yet"
            body="Start one from Home and it will appear here."
          />
        ) : (
          recent.map((run) => (
            <Pressable
              key={run.id}
              onPress={() => router.push({ pathname: '/profile/run-detail', params: { id: run.id } })}
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

        <SectionHeader
          title="My shoes"
          emphasis="title"
          style={styles.sectionHeader}
          action={{
            label: 'Add',
            accessibilityLabel: 'Add a shoe',
            onPress: () => setEditor('shoe'),
          }}
        />

        {shoes.length === 0 ? (
          <EmptyState
            align="start"
            title="No shoes yet"
            body="Add the shoes you run in to keep track of the distance in each pair."
          />
        ) : (
          shoes.map((shoe) => (
            <ShoeCard
              key={shoe.id}
              shoe={shoe}
              meters={shoeMileageMeters(shoe.id, allRuns)}
              fmt={fmt}
              onPress={() => editShoe(shoe)}
            />
          ))
        )}

        <SectionHeader
          title="Saved routes"
          emphasis="title"
          style={styles.sectionHeader}
          action={
            savedRoutes.length > 0
              ? {
                  label: 'See all',
                  accessibilityLabel: 'See all saved routes',
                  onPress: () => router.push('/maps/favorites'),
                }
              : undefined
          }
        />

        {savedRoutes.length === 0 ? (
          <EmptyState
            align="start"
            title="No saved routes"
            body="Routes you save from Maps will appear here."
          />
        ) : (
          savedRoutes.map((saved) => (
            <Pressable
              key={saved.id}
              onPress={() => router.push('/maps/favorites')}
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

        <SectionHeader title="Account" emphasis="title" style={styles.sectionHeader} />
        <Text variant="body" color="textSecondary">
          {account
            ? `Signed in with Apple${account.email ? ` as ${account.email}` : ''}.`
            : 'Roam works without an account. Sign in with Apple to keep one identity for your runs.'}
        </Text>
        <Button
          label={account ? 'Manage account' : 'Sign in with Apple'}
          variant="secondary"
          onPress={() => {
            impactLight();
            router.push('/profile/account');
          }}
          style={styles.accountButton}
        />
      </ScrollView>

      {editor === 'name' && profile ? (
        <FormSheet
          title="Your name"
          message="Shown on your profile."
          fields={[
            {
              key: 'name',
              label: 'Name',
              placeholder: 'Your name',
              defaultValue: profile.name ?? '',
              autoFocus: true,
            },
          ]}
          onSubmit={(values) => {
            void persist({ ...profile, name: values.name.trim() });
            setEditor(null);
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {editor === 'age' && profile ? (
        <FormSheet
          title="Your age"
          message="Years."
          fields={[
            {
              key: 'age',
              label: 'Age',
              placeholder: 'Years',
              keyboardType: 'number-pad',
              defaultValue:
                profile.age === null || profile.age === undefined ? '' : String(profile.age),
              autoFocus: true,
            },
          ]}
          onSubmit={(values) => {
            const parsed = Number(values.age.replace(',', '.'));
            void persist({
              ...profile,
              age: values.age.trim() === '' || !Number.isFinite(parsed) ? null : parsed,
            });
            setEditor(null);
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}


      {editor === 'shoe' ? (
        <FormSheet
          title="Add a shoe"
          fields={[
            { key: 'brand', label: 'Brand', placeholder: 'e.g. Hoka', autoFocus: true },
            { key: 'model', label: 'Model', placeholder: 'e.g. Clifton 9' },
            { key: 'nickname', label: 'Nickname', placeholder: 'Optional', optional: true },
          ]}
          submitLabel="Add"
          onSubmit={(values) => {
            void persistShoes(
              addShoe(
                shoes,
                createShoe({
                  brand: values.brand,
                  model: values.model,
                  nickname: values.nickname,
                }),
              ),
            );
            setEditor(null);
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}
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

/**
 * Trends over time (#101, #117): distance per week and a plain pace
 * comparison. Two simple shapes, not a dashboard — and nothing is drawn from
 * anything but the runner's own recorded runs.
 */
function Trends({ runs, nowMs, fmt }: { runs: SavedRun[]; nowMs: number; fmt: Formatters }) {
  const theme = useTheme();
  const series = weeklyDistanceSeries(runs, nowMs, 8);
  const trend = paceTrend(runs, nowMs, 30);
  const maxMeters = Math.max(...series.map((point) => point.meters), 1);
  const total = series.reduce((sum, point) => sum + point.meters, 0);
  const currentIndex = series.length - 1;
  const pace = paceSentence(trend, fmt);

  return (
    <Card style={styles.trendCard}>
      <View style={styles.weekHeader}>
        <Text variant="micro" color="textSecondary">
          LAST 8 WEEKS
        </Text>
        {total > 0 ? (
          <Text variant="caption" color="textSecondary" tabular>
            {`${fmt.distance(total)} ${fmt.unitLabel}`}
          </Text>
        ) : null}
      </View>

      <View style={styles.trendBars}>
        {series.map((point, index) => {
          const active = point.meters > 0;
          const height = active
            ? BAR_MIN + (point.meters / maxMeters) * (BAR_MAX - BAR_MIN)
            : BAR_EMPTY;
          return (
            <View key={point.weekStart} style={styles.trendBar}>
              <View
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor: active
                      ? index === currentIndex
                        ? theme.accentText
                        : theme.accent
                      : theme.borderSubtle,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {pace ? (
        <Text variant="caption" color="textSecondary">
          {pace}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * A factual pace line, or null. States a difference against the runner's own
 * previous window and stops there — no performance or health claim.
 */
function paceSentence(trend: ReturnType<typeof paceTrend>, fmt: Formatters): string | null {
  if (trend.currentMinPerKm === null) {
    return null;
  }
  const base = `Last ${trend.windowDays} days · average pace ${fmt.paceWithUnit(
    trend.currentMinPerKm,
  )}`;
  if (trend.previousMinPerKm === null) {
    return base;
  }
  const seconds = Math.round(Math.abs(trend.currentMinPerKm - trend.previousMinPerKm) * 60);
  if (seconds < 5) {
    return base;
  }
  const direction = trend.currentMinPerKm < trend.previousMinPerKm ? 'faster' : 'slower';
  return `${base} · ${seconds}s/km ${direction} than the ${trend.windowDays} days before`;
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
    <Card style={styles.weekCard}>
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
    </Card>
  );
}

function ShoeCard({
  shoe,
  meters,
  fmt,
  onPress,
}: {
  shoe: Shoe;
  meters: number;
  fmt: Formatters;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${shoeName(shoe)}${shoe.retired ? ', retired' : ''}, ${fmt.distance(meters)} ${fmt.unitSpoken}. Edit shoe.`}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <Card padded={false} style={styles.shoeCard}>
        <View style={[styles.shoeTile, { backgroundColor: theme.fill }]}>
          <SymbolView name="shoeprints.fill" size={layout.iconSize} tintColor={theme.textSecondary} />
        </View>
        <View style={styles.shoeText}>
          <View style={styles.shoeNameRow}>
            <Text variant="body" numberOfLines={1}>
              {shoeName(shoe)}
            </Text>
            {shoe.retired ? <Badge>RETIRED</Badge> : null}
          </View>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {`${shoe.brand} ${shoe.model}`}
          </Text>
        </View>
        <View style={styles.shoeMileage}>
          <Text variant="title" color="accentText" tabular>
            {fmt.distance(meters)}
          </Text>
          <Text variant="micro" color="textSecondary">
            {fmt.unitLabel.toUpperCase()}
          </Text>
        </View>
      </Card>
    </Pressable>
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
    borderRadius: radii.pill,
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
  shoeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  shoeTile: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoeText: {
    flex: 1,
    gap: 2,
  },
  shoeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  shoeMileage: {
    alignItems: 'flex-end',
    gap: 1,
  },
  statsCard: {
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
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  trendCard: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  trendBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  trendBar: {
    flex: 1,
    height: BAR_MAX,
    justifyContent: 'flex-end',
    alignItems: 'center',
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
    borderRadius: radii.xs,
  },
  todayLetter: {
    fontWeight: '600',
  },
  sectionHeader: {
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
