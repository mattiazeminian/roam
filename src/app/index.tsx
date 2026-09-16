import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM, DistanceControl } from '@/components/distance-control';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { errorFeedback, impactLight, selectionFeedback, successFeedback } from '@/lib/haptics';
import { describeCoordinate } from '@/services/geocoding';
import { useLocation } from '@/services/location-context';
import { useRoutes } from '@/services/route-context';
import type { Coordinate } from '@/services/routing';
import { useRun } from '@/services/run-context';
import { useSettings } from '@/services/settings-context';
import { layout, spacing, useTheme } from '@/theme';

/**
 * Home — the map, and one decision: how far.
 *
 * The controls are a fixed region of the screen, not a sheet floating over the
 * map. A sheet's shape — rounded top corners, a shadow, a glass material —
 * promises that it can be dismissed, and these controls never can. Splitting
 * the screen instead means the map is never occluded by something pretending
 * to be temporary, and the panel can simply be part of the layout.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    status: locationStatus,
    coordinate,
    origin,
    originLabel,
    hasCustomOrigin,
    setOrigin,
    refresh,
  } = useLocation();
  const { status: routeStatus, errorMessage, find } = useRoutes();
  const { recoverable, resumeRecovered, discardRecovered } = useRun();
  const { settings, update } = useSettings();
  // Derived rather than an effect: settings load asynchronously, so seeding
  // state from them would mean a setState inside an effect. Until the runner
  // picks a distance this session, the remembered one is shown.
  const [chosenKm, setChosenKm] = useState<number | null>(null);
  const distanceKm = chosenKm ?? settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM;
  const [recenterSignal, setRecenterSignal] = useState(0);

  const isFinding = routeStatus === 'finding';
  const hasError = routeStatus === 'error';
  // Only a missing device position blocks the flow — a chosen start place works
  // even when the device cannot locate itself.
  const locationBlocked = origin === null && locationStatus !== 'requesting';

  // Dropping the pin sets the start immediately; the name is filled in after,
  // so a slow or failed lookup never delays the interaction.
  const handleOriginMoved = useCallback(
    (nextOrigin: Coordinate) => {
      selectionFeedback();
      setOrigin({ label: 'Dropped pin', coordinate: nextOrigin });
      void describeCoordinate(nextOrigin).then((name) => {
        if (name) {
          setOrigin({ label: name, coordinate: nextOrigin });
        }
      });
    },
    [setOrigin],
  );

  // The app was killed or crashed mid-run. Offer to pick up where it left
  // off before the runner can start something new over it.
  useEffect(() => {
    if (!recoverable) {
      return;
    }
    Alert.alert(
      'Resume your run?',
      `ROAM found an interrupted run in progress (${(recoverable.distanceKm).toFixed(2)} km so far). Resume it or discard it.`,
      [
        { text: 'Discard', style: 'destructive', onPress: discardRecovered },
        {
          text: 'Resume',
          onPress: () => {
            resumeRecovered();
            router.push('/run');
          },
        },
      ],
    );
  }, [recoverable, resumeRecovered, discardRecovered]);

  const handleFindRoutes = useCallback(async () => {
    if (isFinding || !origin) {
      return;
    }
    impactLight();

    const found = await find(origin, distanceKm);
    if (!found) {
      // The visible message carries the failure; the haptic reinforces it.
      errorFeedback();
      return;
    }
    successFeedback();
    // Remember the distance so the next run opens where this one left off.
    update({ defaultDistanceKm: distanceKm });
    router.push('/routes');
  }, [origin, distanceKm, find, isFinding, update]);

  return (
    // The panel is in normal flow, so the standard iOS keyboard behaviour works
    // — the map gives up height and the controls ride up with the keyboard.
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior="padding">
      <View style={styles.mapRegion}>
        <MapCanvas
          origin={origin}
          routes={[]}
          cameraMode="center"
          searching={isFinding}
          recenterSignal={recenterSignal}
          onOriginMoved={handleOriginMoved}
        />

        <View
          style={[
            styles.mapControls,
            { top: insets.top + spacing.xs, paddingHorizontal: layout.screenMargin },
          ]}
          pointerEvents="box-none">
          <View style={styles.mapControlsGroup}>
            <MapControl
              symbol="clock.arrow.circlepath"
              accessibilityLabel="Your runs"
              onPress={() => router.push('/history')}
            />
            <MapControl
              symbol="bookmark"
              accessibilityLabel="Saved routes"
              onPress={() => router.push('/favorites')}
            />
          </View>
          {coordinate ? (
            <MapControl
              symbol="location"
              accessibilityLabel="Recenter on current location"
              onPress={() => setRecenterSignal((value) => value + 1)}
            />
          ) : null}
        </View>
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
        {locationBlocked ? (
          <Pressable
            onPress={locationStatus === 'denied' ? undefined : refresh}
            accessibilityRole={locationStatus === 'denied' ? 'text' : 'button'}>
            <Text variant="label" color="textSecondary">
              {locationStatus === 'denied'
                ? 'Location is off. ROAM needs it to find routes near you — turn it on in Settings.'
                : 'Location is unavailable. Tap to try again.'}
            </Text>
          </Pressable>
        ) : null}

        {hasError && errorMessage ? (
          <Text variant="label" color="textSecondary" accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}

        {/* Where the run starts, and the way to change it. Deliberately not
            accented: the accent is reserved for the value and the action, so
            it keeps meaning something. */}
        <Pressable
          onPress={() => router.push('/location-search')}
          accessibilityRole="button"
          accessibilityLabel={`Starting from ${originLabel}. Change starting point.`}
          style={({ pressed }) => [styles.originRow, pressed && styles.pressed]}>
          <SymbolView
            name={hasCustomOrigin ? 'mappin.circle.fill' : 'location.fill'}
            size={layout.iconSizeSmall}
            tintColor={theme.textSecondary}
          />
          <Text variant="label" color="textTertiary" numberOfLines={1} style={styles.originLabel}>
            {originLabel}
          </Text>
          <SymbolView
            name="chevron.right"
            size={layout.iconSizeSmall}
            tintColor={theme.textSecondary}
          />
        </Pressable>

        <DistanceControl valueKm={distanceKm} onChange={setChosenKm} disabled={isFinding} />

        <Button
          label={isFinding ? 'Finding your way' : hasError ? 'Try again' : 'Find routes'}
          variant="accent"
          onPress={handleFindRoutes}
          disabled={isFinding || !origin}
          loading={isFinding}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  mapRegion: {
    flex: 1,
    overflow: 'hidden',
  },
  mapControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mapControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  originRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouchTarget,
    marginBottom: -spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
  originLabel: {
    flex: 1,
  },
});
