import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapCanvas } from '@/components/map/map-canvas';
import { Text } from '@/components/text';
import { impactLight } from '@/lib/haptics';
import { useLocation } from '@/services/location-context';
import { listRoutes, type SavedRoute } from '@/services/route-storage';
import { layout, spacing, useTheme } from '@/theme';

/**
 * Maps — the route workspace.
 *
 * The map is the screen; everything else is a small panel at the edge of it.
 * Routes the runner already kept are the primary content here, and generating a
 * new one opens the same sheet Home uses rather than a screen of its own.
 */
export default function MapsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { origin } = useLocation();

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listRoutes()
        .then((stored) => active && setSavedRoutes(stored))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );


  const howMany = savedRoutes.length;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.map}>
        <MapCanvas
          origin={origin}
          routes={savedRoutes.map((saved) => saved.route)}
          // Centred on the runner, not framed to the saved routes: Maps opens
          // where you are, and routes elsewhere in the world should not drag
          // the camera away from you.
          cameraMode="center"
          padding={{ top: insets.top + 88, bottom: 220, left: 48, right: 48 }}
        />
      </View>

      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.borderSubtle,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}>
        <Text variant="large">Maps</Text>

        <View style={styles.savedRow}>
          <SymbolView
            name="bookmark"
            size={layout.iconSizeSmall}
            tintColor={theme.textSecondary}
          />
          <Text variant="label" color="textSecondary" style={styles.savedLabel}>
            {howMany === 0
              ? 'No saved routes yet'
              : `${howMany} saved ${howMany === 1 ? 'route' : 'routes'}`}
          </Text>
          {howMany > 0 ? (
            <Text variant="caption" color="textSecondary" tabular>
              {howMany}
            </Text>
          ) : null}
        </View>

        <Button
          label="Generate a route"
          variant="accent"
          onPress={() => {
            impactLight();
            router.push('/generate-route');
          }}
          disabled={!origin}
        />

        {howMany > 0 ? (
          <Button
            label="My routes"
            variant="secondary"
            onPress={() => router.push('/favorites')}
          />
        ) : null}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  map: {
    flex: 1,
    overflow: 'hidden',
  },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouchTarget,
  },
  savedLabel: {
    flex: 1,
  },
});
