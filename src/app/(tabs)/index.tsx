import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM } from '@/components/distance-control';
import { FindRouteSheet } from '@/components/find-route-sheet';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { errorFeedback, impactLight, impactMedium, selectionFeedback, successFeedback } from '@/lib/haptics';
import { useAccount } from '@/services/account-context';
import { describeCoordinate } from '@/services/geocoding';
import { useLocation } from '@/services/location-context';
import { loadProfile } from '@/services/profile';
import { summarizeRuns, type RunOverview } from '@/services/run-analytics';
import { useRoutes } from '@/services/route-context';
import { listRoutes } from '@/services/route-storage';
import type { Coordinate } from '@/services/routing';
import { useRun } from '@/services/run-context';
import { listRuns } from '@/services/run-storage';
import { useFormatters, useSettings } from '@/services/settings-context';
import { toDateKey, weekdayOf, workoutsFrom, WORKOUT_LABELS } from '@/services/training';
import { useTraining } from '@/services/training-context';
import { layout, spacing, useTheme } from '@/theme';

/**
 * Home — the training dashboard.
 *
 * Two things, in order: who you are and how the week is going, then the one
 * action that matters, Start run. Route discovery is a single quiet button that
 * opens the distance and start-point choices in a sheet, so the choices exist
 * without standing between the runner and the run.
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
    finish,
    clearFinish,
    refresh,
  } = useLocation();
  const { status: routeStatus, errorMessage, find } = useRoutes();
  const { start, recoverable, resumeRecovered, discardRecovered } = useRun();
  const { settings, loaded: settingsLoaded, update } = useSettings();
  const { state: training, loaded: trainingLoaded } = useTraining();
  const { account } = useAccount();
  const fmt = useFormatters();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [overview, setOverview] = useState<RunOverview | null>(null);
  const [savedRoutes, setSavedRoutes] = useState(0);
  // Captured with the rest of the focus data rather than read during render.
  const [todayKey, setTodayKey] = useState('');
  // Derived rather than an effect: settings load asynchronously, so seeding
  // state from them would mean a setState inside an effect. Until the runner
  // picks a distance this session, the remembered one is shown.
  const [chosenKm, setChosenKm] = useState<number | null>(null);
  const distanceKm = chosenKm ?? settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM;
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [findRoutesOpen, setFindRoutesOpen] = useState(false);

  // Home shows who the runner is and what they have run, so statistics are
  // visible without opening History (#108). Reloaded on focus, so a run saved
  // moments ago is already counted, and a route saved after a run already
  // appears as somewhere to run (#109).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const now = Date.now();
      void Promise.all([loadProfile(), listRuns(), listRoutes()])
        .then(([profile, runs, routes]) => {
          if (!active) {
            return;
          }
          setDisplayName(profile.name ?? account?.name ?? null);
          setOverview(summarizeRuns(runs, now, 7));
          setSavedRoutes(routes.length);
          setTodayKey(toDateKey(new Date()));
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [account]),
  );

  // A new install meets the introduction first — before Home, and before any
  // location permission dialog (#19). `replace` so back cannot return here.
  const needsOnboarding = settingsLoaded && !settings.hasCompletedOnboarding;
  useEffect(() => {
    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [needsOnboarding]);

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

    const found = await find(origin, distanceKm, finish?.coordinate ?? null);
    if (!found) {
      // The visible message carries the failure; the haptic reinforces it.
      errorFeedback();
      return;
    }
    successFeedback();
    // Remember the distance so the next run opens where this one left off.
    update({ defaultDistanceKm: distanceKm });
    router.push('/routes');
  }, [origin, distanceKm, finish, find, isFinding, update]);

  // A run can start immediately, with no planned route (#33): route
  // discovery supports the run rather than gating it. A route-less run has
  // no target distance — there is nothing to hit a target *of* — so nothing
  // here reads `distanceKm`; that control only ever feeds route generation.
  const handleStartRun = useCallback(() => {
    impactMedium();
    start(null, 0);
    router.push('/run');
  }, [start]);

  const nextWorkout = training.plan && todayKey ? (workoutsFrom(training, todayKey)[0] ?? null) : null;
  const planLabel = !training.plan
    ? 'Set up a training plan'
    : nextWorkout
      ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayOf(nextWorkout.date)]} · ${
          WORKOUT_LABELS[nextWorkout.type]
        } · ${fmt.distance(nextWorkout.targetKm * 1000)} ${fmt.unitLabel}`
      : 'Training plan · no sessions yet';

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
          <MapControl
            symbol="clock.arrow.circlepath"
            accessibilityLabel="Your runs"
            onPress={() => router.push('/history')}
          />
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
                ? 'Location is off. ROAM needs it to track your run — turn it on in Settings.'
                : 'Location is unavailable. Tap to try again.'}
            </Text>
          </Pressable>
        ) : null}

        {hasError && errorMessage ? (
          <Text variant="label" color="textSecondary" accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}

        {/* Who the runner is, and what they have run this week — visible on
            open rather than buried in History (#108). Deliberately quiet: it
            must not compete with Start run below it. */}
        <View style={styles.identityRow}>
          <Pressable
            onPress={() => router.push('/account')}
            accessibilityRole="button"
            accessibilityLabel={displayName ? `Your profile, ${displayName}` : 'Your profile'}
            style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
            <View style={[styles.avatar, { backgroundColor: theme.fill }]}>
              <Text variant="label" color="textSecondary">
                {(displayName?.trim()?.[0] ?? '·').toUpperCase()}
              </Text>
            </View>
            <Text variant="body" numberOfLines={1} style={styles.identityName}>
              {displayName ?? 'You'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/history')}
            accessibilityRole="button"
            accessibilityLabel={
              overview && overview.count > 0
                ? `Statistics. This week, ${fmt.distance(overview.recentMeters)} ${fmt.unitSpoken} over ${overview.recentCount} runs.`
                : 'Statistics. No runs yet.'
            }
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
            <Text variant="caption" color="textSecondary" tabular>
              {overview && overview.count > 0
                ? `This week · ${fmt.distance(overview.recentMeters)} ${fmt.unitLabel} · ${overview.recentCount} ${
                    overview.recentCount === 1 ? 'run' : 'runs'
                  }`
                : 'No runs yet'}
            </Text>
          </Pressable>
        </View>

        {/* The question Home asks on open is "do I want to run now?", not
            "what route do I want?" (#34) — one accent action, nothing else
            on the panel competing with it. */}
        <Button
          label="Start run"
          variant="accent"
          onPress={handleStartRun}
          disabled={locationStatus === 'denied'}
        />

        {/* The training surface (#114) starts with a plan, and shows the next
            session once one exists. Quiet either way: running now needs
            neither. */}
        {trainingLoaded ? (
          <Pressable
            onPress={() => router.push('/plan')}
            accessibilityRole="button"
            accessibilityLabel={planLabel}
            style={({ pressed }) => [styles.originRow, pressed && styles.pressed]}>
            <SymbolView
              name="calendar"
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
            <Text variant="label" color="textTertiary" numberOfLines={1} style={styles.originLabel}>
              {planLabel}
            </Text>
            <SymbolView
              name="chevron.right"
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        ) : null}

        {/* Planning and running are separate journeys (#107): a route kept
            earlier can be run directly from here, without regenerating
            anything (#109). Absent until there is something to run. */}
        {savedRoutes > 0 ? (
          <Pressable
            onPress={() => router.push('/favorites?mode=run')}
            accessibilityRole="button"
            accessibilityLabel={`Run a saved route. ${savedRoutes} saved.`}
            style={({ pressed }) => [styles.originRow, pressed && styles.pressed]}>
            <SymbolView
              name="bookmark"
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
            <Text variant="label" color="textTertiary" style={styles.originLabel}>
              Run a saved route
            </Text>
            <Text variant="caption" color="textSecondary" tabular>
              {savedRoutes}
            </Text>
            <SymbolView
              name="chevron.right"
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        ) : null}

        {/* Route discovery is one quiet button now: it opens the start point,
            distance and finish choices in a sheet, out of the way of running
            (#107). The primary action above stays the only accent on screen. */}
        <Button
          label="Find a route"
          variant="secondary"
          onPress={() => {
            impactLight();
            setFindRoutesOpen(true);
          }}
          disabled={!origin}
        />
      </View>

      {/* The route choices, out of the way until asked for. A sheet rather than
          a screen: choosing a route is a decision, not a destination. */}
      <FindRouteSheet
        visible={findRoutesOpen}
        onClose={() => setFindRoutesOpen(false)}
        startLabel={originLabel}
        hasCustomStart={hasCustomOrigin}
        onChangeStart={() => router.push('/location-search')}
        finishLabel={finish?.label ?? null}
        onChangeFinish={() => router.push('/location-search?mode=finish')}
        onClearFinish={clearFinish}
        distanceKm={distanceKm}
        onChangeDistance={setChosenKm}
        busy={isFinding}
        errorMessage={hasError ? errorMessage : null}
        onSubmit={() => {
          setFindRoutesOpen(false);
          void handleFindRoutes();
        }}
      />
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
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityName: {
    flexShrink: 1,
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
