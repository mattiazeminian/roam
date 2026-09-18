import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Divider } from '@/components/divider';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { impactLight, selectionFeedback } from '@/lib/haptics';
import { useAccount } from '@/services/account-context';
import { loadProfile, pickAvatar, saveProfile, type Profile } from '@/services/profile';
import { summarizeRuns, type RunOverview } from '@/services/run-analytics';
import {
  computeRecords,
  formatRunDate,
  type RunRecords,
  type SavedRun,
} from '@/services/run-session';
import { listRuns } from '@/services/run-storage';
import { useFormatters } from '@/services/settings-context';
import { layout, spacing, useTheme } from '@/theme';

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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const now = Date.now();
      void Promise.all([loadProfile(), listRuns()])
        .then(([stored, saved]) => {
          if (!active) {
            return;
          }
          setProfile(stored);
          setRuns(saved);
          setLoadedAt(now);
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
  const records: RunRecords = computeRecords(allRuns);
  const recent = allRuns.slice(0, 5);
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

        <StatRow
          label="Runs"
          value={overview.count === 0 ? '—' : String(overview.count)}
          onPress={() => router.push('/history')}
        />
        <Divider />
        <StatRow
          label="Total distance"
          value={
            overview.count === 0
              ? '—'
              : `${fmt.distance(overview.totalMeters)} ${fmt.unitLabel}`
          }
          onPress={() => router.push('/history')}
        />
        <Divider />
        <StatRow
          label="This week"
          value={
            overview.count === 0
              ? '—'
              : `${fmt.distance(overview.recentMeters)} ${fmt.unitLabel} · ${overview.recentCount}`
          }
          onPress={() => router.push('/history')}
        />
        <Divider />
        <StatRow
          label="Longest run"
          value={
            records.longest
              ? `${fmt.distance(records.longest.distanceKm * 1000)} ${fmt.unitLabel}`
              : '—'
          }
        />
        <Divider />
        <StatRow
          label="Fastest pace"
          value={records.fastest ? fmt.paceWithUnit(records.fastest.averagePaceMinPerKm) : '—'}
        />

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

function StatRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.statRow}>
      <Text variant="body" color="textSecondary">
        {label}
      </Text>
      <Text variant="title" tabular>
        {value}
      </Text>
    </View>
  );

  if (!onPress) {
    return content;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}. See all runs.`}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {content}
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
