import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { useRoutes } from '@/services/route-context';
import { parseRouteShareParams, type RouteShareParams } from '@/services/route-share';
import { layout, spacing, useTheme } from '@/theme';

/**
 * A route opened from someone else's link (#23).
 *
 * Handled as a screen rather than a startup branch, so the runner sees what
 * they were sent: the route is loaded into the normal selection flow, where it
 * behaves like any other candidate — startable, savable, editable. A link that
 * cannot be reconstructed says so instead of showing invented geometry.
 */
export default function SharedRouteScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();
  const { loadSaved } = useRoutes();
  const handled = useRef(false);

  const route = useMemo(
    () => parseRouteShareParams(params as RouteShareParams),
    [params],
  );

  useEffect(() => {
    if (handled.current || !route) {
      return;
    }
    handled.current = true;
    loadSaved(route, route.distanceKm);
    router.replace('/routes');
  }, [route, loadSaved]);

  if (route) {
    return (
      <View
        style={[
          styles.root,
          { backgroundColor: theme.background, paddingTop: spacing.xxl },
        ]}>
        <Text variant="title">Opening route…</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
          paddingTop: spacing.xxl,
          paddingBottom: spacing.lg,
        },
      ]}>
      <Text variant="title">That route could not be opened</Text>
      <Text variant="body" color="textSecondary">
        The link is missing or damaged, so there is no route to show.
      </Text>
      <Button
        label="Find a route"
        variant="accent"
        onPress={() => router.replace('/')}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    gap: spacing.sm,
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
});
