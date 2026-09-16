import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { layout, spacing, useTheme } from '@/theme';

/**
 * History — an honest empty state. Saved runs are not implemented yet, so this
 * screen shows no fabricated data.
 */
export default function HistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + layout.tabBarClearance,
          },
        ]}>
        <Text variant="large">History</Text>

        <View style={styles.empty}>
          <Text variant="title">No runs yet</Text>
          <Text variant="body" color="textSecondary">
            Saved runs will appear here. Choose a distance on Home to find your first route.
          </Text>
          <Button
            label="Find a route"
            variant="accent"
            onPress={() => router.navigate('/')}
            style={styles.cta}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.floatingInset,
    gap: spacing.xxl,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cta: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
});
