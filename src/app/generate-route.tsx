import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM, DistanceControl } from '@/components/distance-control';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { impactLight } from '@/lib/haptics';
import { useLocation } from '@/services/location-context';
import { useRoutes } from '@/services/route-context';
import { useSettings } from '@/services/settings-context';
import { layout, radii, spacing, useTheme } from '@/theme';

/**
 * Generate a route — a form, not a sheet.
 *
 * Three inputs and one action. It is a page because the runner is setting
 * something up deliberately here, and the generation that follows deserves its
 * own moment rather than a sheet that snaps open and shut.
 */
export default function GenerateRouteScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { origin, originLabel, hasCustomOrigin, finish, clearFinish } = useLocation();
  const { status, errorMessage, find } = useRoutes();
  const { settings, update } = useSettings();

  const [distanceKm, setDistanceKm] = useState(
    settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM,
  );

  const isFinding = status === 'finding';

  const handleGenerate = useCallback(() => {
    if (!origin || isFinding) {
      return;
    }
    impactLight();
    update({ defaultDistanceKm: distanceKm });
    // Start the search and hand straight over to the generating screen, which
    // watches this same request through the route context.
    void find(origin, distanceKm, finish?.coordinate ?? null);
    router.push('/generating');
  }, [origin, distanceKm, finish, find, isFinding, update]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xxl },
        ]}>
        <View style={styles.headerRow}>
          <MapControl symbol="chevron.left" accessibilityLabel="Back" onPress={() => router.back()} />
        </View>

        <View style={styles.intro}>
          <Text variant="large">Generate a route</Text>
          <Text variant="body" color="textSecondary">
            Roam builds a loop from where you start, at the distance you choose.
          </Text>
        </View>

        <Field label="Start">
          <Pressable
            onPress={() => router.push('/location-search')}
            accessibilityRole="button"
            accessibilityLabel={`Starting from ${originLabel}. Change starting point.`}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.fillSubtle },
              pressed && styles.pressed,
            ]}>
            <SymbolView
              name={hasCustomOrigin ? 'mappin.circle.fill' : 'location.fill'}
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
            <Text variant="body" numberOfLines={1} style={styles.rowLabel}>
              {originLabel}
            </Text>
            <SymbolView name="chevron.right" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
          </Pressable>
        </Field>

        <Field label="Distance">
          <DistanceControl valueKm={distanceKm} onChange={setDistanceKm} />
        </Field>

        <Field label="Finish">
          <View style={styles.finishRow}>
            <Pressable
              onPress={() => router.push('/location-search?mode=finish')}
              accessibilityRole="button"
              accessibilityLabel={
                finish
                  ? `Finishing at ${finish.label}. Change finish point.`
                  : 'Loop, finishing back where you started. Choose a finish point.'
              }
              style={({ pressed }) => [
                styles.row,
                styles.finishTarget,
                { backgroundColor: theme.fillSubtle },
                pressed && styles.pressed,
              ]}>
              <SymbolView
                name={finish ? 'flag' : 'arrow.triangle.2.circlepath'}
                size={layout.iconSizeSmall}
                tintColor={theme.textSecondary}
              />
              <Text variant="body" numberOfLines={1} style={styles.rowLabel}>
                {finish ? finish.label : 'Back where you started'}
              </Text>
              <SymbolView name="chevron.right" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
            </Pressable>
            {finish ? (
              <Pressable
                onPress={clearFinish}
                accessibilityRole="button"
                accessibilityLabel="Make it a loop instead"
                hitSlop={spacing.sm}
                style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
                <SymbolView
                  name="xmark.circle.fill"
                  size={layout.iconSizeSmall}
                  tintColor={theme.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>
        </Field>

        {errorMessage ? (
          <Text variant="label" color="textSecondary" accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}

        <Button
          label="Generate"
          variant="accent"
          onPress={handleGenerate}
          disabled={!origin || isFinding}
          style={styles.action}
        />
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="micro" color="textSecondary">
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  intro: {
    gap: spacing.xs,
  },
  field: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.small,
    borderCurve: 'continuous',
  },
  rowLabel: {
    flex: 1,
  },
  finishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  finishTarget: {
    flex: 1,
  },
  action: {
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
});
