import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM } from '@/components/distance-control';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { StartCountdown, useStartCountdown } from '@/components/start-countdown';
import { Text } from '@/components/text';
import { WorkoutIcon } from '@/components/workout-icon';
import { selectionFeedback } from '@/lib/haptics';
import { useLocation } from '@/services/location-context';
import { useRun } from '@/services/run-context';
import { listRoutes } from '@/services/route-storage';
import { distancePresets } from '@/services/settings';
import { useFormatters, useSettings } from '@/services/settings-context';
import { stepsForWorkout } from '@/services/workout-execution';
import {
  WORKOUT_DESCRIPTIONS,
  WORKOUT_LABELS,
  WORKOUT_TYPES,
  type WorkoutType,
} from '@/services/training';
import { layout, radii, spacing, useTheme } from '@/theme';

const TIME_PRESETS = [15, 30, 45, 60];

/**
 * Record — choose what you are about to do, then go.
 *
 * The map fills the screen so the start point is never in doubt. Distance or
 * time are the two ways a runner thinks about a run, and the workout type is
 * what they are setting out to do — including a fartlek, which is a real run
 * and not a renamed interval session. "Just run" is the default and needs no
 * choice at all.
 */
export default function RecordScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const { coordinate, originLabel, status: locationStatus } = useLocation();
  const { start } = useRun();
  const { settings } = useSettings();
  const { counting, begin, complete } = useStartCountdown();

  const [mode, setMode] = useState<'free' | 'distance' | 'time'>('free');
  const [distanceKm, setDistanceKm] = useState(settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM);
  const [minutes, setMinutes] = useState(30);
  const [type, setType] = useState<WorkoutType | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [savedRouteCount, setSavedRouteCount] = useState(0);

  // A saved route is another way into a run (#116). Reloaded on focus so one
  // saved moments ago is offered straight away.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listRoutes()
        .then((stored) => active && setSavedRouteCount(stored.length))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  // A time target is what the runner asked for; the distance is only how it
  // converts at their own pace, and is labelled as such rather than presented
  // as a target they did not set.
  const estimatedKm = minutes / settings.typicalPaceMinPerKm;
  const roundedEstimate = Math.max(0.5, Math.round(estimatedKm * 10) / 10);
  const targetKm = mode === 'distance' ? distanceKm : mode === 'time' ? roundedEstimate : 0;

  const handleStart = useCallback(() => {
    if (!coordinate) {
      return;
    }
    // Carry the chosen workout type into the run, so the chip the runner
    // picked is recorded rather than discarded (#116), and build its phases
    // when there is a target to run them against (#148).
    const durationSeconds = mode === 'time' ? minutes * 60 : 0;
    const steps =
      targetKm > 0 || durationSeconds > 0
        ? stepsForWorkout(
            {
              id: 'adhoc',
              date: '',
              type: type ?? 'easy',
              targetKm: Math.max(targetKm, 0.1),
              status: 'planned',
              runId: null,
              note: null,
            },
            durationSeconds,
          )
        : [];
    start(null, targetKm, null, type, durationSeconds, steps);
    router.push('/run');
  }, [coordinate, minutes, mode, start, targetKm, type]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.map}>
        <MapCanvas
          origin={coordinate}
          routes={[]}
          cameraMode="center"
          recenterSignal={recenterSignal}
          padding={{ top: insets.top + 96, bottom: 320, left: 48, right: 48 }}
        />
        <View
          style={[
            styles.mapControls,
            { top: insets.top + spacing.xs, paddingHorizontal: layout.screenMargin },
          ]}
          pointerEvents="box-none">
          <View>
            <Text variant="micro" color="textSecondary">RUN NOW</Text>
            <Text variant="large">Start a run</Text>
          </View>
          <MapControl
            symbol="location"
            accessibilityLabel="Recenter on current location"
            onPress={() => setRecenterSignal((value) => value + 1)}
          />
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
        <View style={styles.panelIntro}>
          <Text variant="title">Ready when you are</Text>
          <Text variant="caption" color="textSecondary">
            Choose a target or just head out. Roam will record from your current location.
          </Text>
        </View>

        {/* What kind of run this is, if it is a particular one. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          <Chip
            label="Just run"
            selected={type === null}
            onPress={() => {
              selectionFeedback();
              setType(null);
            }}
          />
          {WORKOUT_TYPES.map((workoutType) => (
            <Chip
              key={workoutType}
              label={WORKOUT_LABELS[workoutType]}
              type={workoutType}
              selected={type === workoutType}
              onPress={() => {
                selectionFeedback();
                setType(workoutType);
              }}
            />
          ))}
        </ScrollView>

        <Text
          variant="caption"
          color="textSecondary"
          numberOfLines={2}
          accessibilityLabel={
            type ? `${WORKOUT_LABELS[type]}: ${WORKOUT_DESCRIPTIONS[type]}` : 'Free run: run without a workout target.'
          }>
          {type ? WORKOUT_DESCRIPTIONS[type] : 'Run without a workout target. Finish whenever you want.'}
        </Text>

        {/* Distance or time — the two ways a runner thinks about a run. */}
        <View style={styles.modeRow}>
          <ModeToggle
            label="Free run"
            selected={mode === 'free'}
            onPress={() => {
              selectionFeedback();
              setMode('free');
            }}
          />
          <ModeToggle
            label="Distance"
            selected={mode === 'distance'}
            onPress={() => {
              selectionFeedback();
              setMode('distance');
            }}
          />
          <ModeToggle
            label="Time"
            selected={mode === 'time'}
            onPress={() => {
              selectionFeedback();
              setMode('time');
            }}
          />
        </View>

        <View style={styles.valueRow}>
          <Text variant="display" tabular>
            {mode === 'free' ? '—' : mode === 'distance' ? fmt.distance(distanceKm * 1000) : String(minutes)}
            <Text variant="body" color="textSecondary">
              {` ${mode === 'free' ? 'no target' : mode === 'distance' ? fmt.unitLabel : 'min'}`}
            </Text>
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {mode !== 'free' && (mode === 'distance'
            ? distancePresets(settings.unit).map((km) => ({ key: `d${km}`, label: `${km}`, value: km }))
            : TIME_PRESETS.map((value) => ({ key: `t${value}`, label: `${value}`, value }))
          ).map((option) => {
            const selected =
              mode === 'distance' ? distanceKm === option.value : minutes === option.value;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  selectionFeedback();
                  if (mode === 'distance') {
                    setDistanceKm(option.value);
                  } else {
                    setMinutes(option.value);
                  }
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={
                  mode === 'distance'
                    ? `${option.label} ${fmt.unitSpoken}`
                    : `${option.label} minutes`
                }
                style={({ pressed }) => [
                  styles.valueChip,
                  { backgroundColor: selected ? theme.accent : theme.fill },
                  pressed && !selected && styles.pressed,
                ]}>
                <Text variant="body" tabular color={selected ? 'accentForeground' : 'text'}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text variant="caption" color="textSecondary" tabular>
          {mode === 'free'
            ? 'Free run · finish whenever you want'
            : mode === 'time'
            ? `${minutes} min · about ${fmt.distance(roundedEstimate * 1000)} ${fmt.unitLabel} at your pace`
            : coordinate
              ? `Starting from your current location · ${originLabel}`
              : locationStatus === 'requesting'
                ? 'Getting your current location…'
                : 'Current location unavailable'}
        </Text>

        <Button
          label="Start run"
          variant="accent"
          onPress={() => begin(handleStart)}
          disabled={locationStatus !== 'available' || !coordinate}
        />

        {savedRouteCount > 0 ? (
          <Button
            label="Run a saved route"
            variant="secondary"
            onPress={() => {
              selectionFeedback();
              router.push('/maps/favorites?mode=run');
            }}
          />
        ) : null}
      </View>

      {counting ? <StartCountdown onComplete={complete} /> : null}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  type,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  type?: WorkoutType;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.fill },
        pressed && !selected && styles.pressed,
      ]}>
      {type ? (
        <WorkoutIcon
          type={type}
          size={layout.iconSizeSmall}
          tintColor={selected ? theme.accentForeground : theme.textSecondary}
        />
      ) : (
        <SymbolView
          name="figure.run"
          size={layout.iconSizeSmall}
          tintColor={selected ? theme.accentForeground : theme.textSecondary}
        />
      )}
      <Text variant="caption" color={selected ? 'accentForeground' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

function ModeToggle({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.mode,
        { borderColor: selected ? theme.accentText : theme.borderSubtle },
        pressed && !selected && styles.pressed,
      ]}>
      <Text variant="label" color={selected ? 'text' : 'textSecondary'}>
        {label}
      </Text>
    </Pressable>
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
  panelIntro: {
    gap: spacing.xxs,
  },
  chips: {
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.small,
    borderCurve: 'continuous',
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  mode: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
    minWidth: 0,
    flexShrink: 1,
  },
  valueChip: {
    minWidth: 56,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.small,
    borderCurve: 'continuous',
  },
  pressed: {
    opacity: 0.6,
  },
});
