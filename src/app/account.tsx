import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { useAccount } from '@/services/account-context';
import { layout, radii, spacing, useTheme } from '@/theme';

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
  const insets = useSafeAreaInsets();
  const { account, loaded, supported, signingIn, errorMessage, signIn, signOut } = useAccount();

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
