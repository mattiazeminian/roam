import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapControl } from '@/components/map-control';
import { Metric, MetricRow } from '@/components/metric';
import { Row } from '@/components/row';
import { Text } from '@/components/text';
import { useAccount } from '@/services/account-context';
import { loadProfile, saveProfile, DEFAULT_PROFILE, type Profile } from '@/services/profile';
import { listRuns } from '@/services/run-storage';
import { useFormatters } from '@/services/settings-context';
import { layout, radii, spacing, useAppearance, useTheme } from '@/theme';

type Stats = { distanceKm: number; runCount: number };

/**
 * Account — Sign in with Apple, and nothing else (#20).
 *
 * The app works entirely signed out; this screen exists so the identity can be
 * established when it is wanted, not to gate anything. Apple's own button is
 * used rather than a custom one, which is both required by their guidelines and
 * automatically correct for accessibility and localization.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const scheme = useAppearance();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const { account, loaded, supported, signingIn, errorMessage, signIn, signOut } = useAccount();

  const [name, setName] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);

  useEffect(() => {
    let active = true;
    void loadProfile().then((stored) => {
      if (active) {
        setProfile(stored);
        setName(stored.name ?? '');
      }
    });
    void listRuns().then((runs) => {
      if (active) {
        setStats({
          distanceKm: runs.reduce((total, run) => total + run.distanceKm, 0),
          runCount: runs.length,
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleNameBlur = useCallback(() => {
    const trimmed = name.trim();
    setName(trimmed);
    // Merged, not replaced: renaming must not wipe the avatar or age.
    const next = { ...profile, name: trimmed.length > 0 ? trimmed : null };
    setProfile(next);
    void saveProfile(next);
  }, [name, profile]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + spacing.xs,
          paddingBottom: insets.bottom + spacing.lg,
        },
      ]}>
      <MapControl
        symbol="chevron.left"
        accessibilityLabel="Back"
        onPress={() => router.back()}
      />

      <Text variant="large">Account</Text>

      <View style={styles.profile}>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={handleNameBlur}
          placeholder="Add your name"
          placeholderTextColor={theme.textSecondary}
          keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Your name"
          style={[styles.nameInput, { color: theme.text, borderColor: theme.borderSubtle }]}
        />

        {stats ? (
          <MetricRow>
            <Metric
              fill
              label="Total distance"
              value={fmt.distance(stats.distanceKm * 1000)}
              unit={fmt.unitLabel}
              accessibilityLabel={`Total distance ${fmt.distance(stats.distanceKm * 1000)} ${fmt.unitSpoken}`}
            />
            <Metric fill label="Runs" value={String(stats.runCount)} />
          </MetricRow>
        ) : null}

        <Row
          label="Favorite routes"
          showChevron
          onPress={() => router.push('/maps/favorites')}
          accessibilityLabel="Favorite routes"
        />
      </View>

      {account ? (
        <View style={styles.body}>
          <View style={styles.identity}>
            <Text variant="title">{account.name ?? 'Signed in with Apple'}</Text>
            {account.email ? (
              <Text variant="caption" color="textSecondary">
                {account.email}
              </Text>
            ) : null}
          </View>
          <Button
            label="Sign out"
            variant="secondary"
            onPress={() => void signOut()}
            style={styles.action}
          />
        </View>
      ) : (
        <View style={styles.body}>
          <Text variant="body" color="textSecondary">
            Signing in with Apple keeps one stable identity for your runs. It is stored on this
            device only, and the app works the same without it.
          </Text>

          {loaded && supported ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radii.small}
              style={styles.appleButton}
              onPress={() => void signIn()}
            />
          ) : loaded ? (
            <Text variant="caption" color="textSecondary">
              Sign in with Apple is not available on this device.
            </Text>
          ) : null}

          {signingIn ? (
            <Text variant="caption" color="textSecondary">
              Signing in…
            </Text>
          ) : null}

          {errorMessage ? (
            <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    gap: spacing.md,
  },
  body: {
    flex: 1,
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  identity: {
    gap: spacing.xxs,
  },
  profile: {
    gap: spacing.md,
  },
  nameInput: {
    minHeight: layout.minTouchTarget,
    borderBottomWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  appleButton: {
    width: '100%',
    height: 52,
    marginTop: spacing.sm,
  },
});
