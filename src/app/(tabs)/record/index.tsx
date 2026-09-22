import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DEFAULT_DISTANCE_KM } from '@/components/distance-control';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { StartCountdown, useStartCountdown } from '@/components/start-countdown';
import { Text } from '@/components/text';
import { ValueSheet, type ValuePreset } from '@/components/value-sheet';
import { selectionFeedback } from '@/lib/haptics';
import { useLocation } from '@/services/location-context';
import { useRun } from '@/services/run-context';
import { formatDuration } from '@/services/run-session';
import { listRoutes } from '@/services/route-storage';
import { displayToKm, distancePresets, kmToDisplay, type DistanceUnit } from '@/services/settings';
import { useFormatters, useSettings } from '@/services/settings-context';
import {
  DEFAULT_INTERVALS,
  DEFAULT_FARTLEK,
  DEFAULT_TEMPO,
  LIMITS,
  RECOVERY_SECOND_PRESETS,
  REP_PRESETS,
  RUN_KIND_LABELS,
  RUN_KINDS,
  WARMUP_MINUTE_PRESETS,
  WORK_TIME_MINUTE_PRESETS,
  compileStructured,
  runKindWorkoutType,
  startLabel,
  summarizeSteps,
  type RunKind,
  type StepTargetSpec,
  type StructuredSpec,
} from '@/services/workout-builder';
import { layout, radii, spacing, useTheme } from '@/theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

const TIME_PRESETS = [20, 30, 45, 60];
const DISTANCE_LIMITS: Record<DistanceUnit, { min: number; max: number; step: number }> = {
  km: { min: 1, max: 42, step: 0.5 },
  mi: { min: 0.5, max: 26, step: 0.5 },
};

const KIND_SYMBOLS: Record<RunKind, SymbolName> = {
  free: 'figure.run',
  distance: 'ruler',
  time: 'timer',
  intervals: 'bolt',
  fartlek: 'shuffle',
  tempo: 'stopwatch',
};

type StructuredKind = 'intervals' | 'fartlek' | 'tempo';

type SheetKey =
  | 'distance'
  | 'minutes'
  | 'warmup'
  | 'cooldown'
  | 'reps'
  | 'work'
  | 'recovery';

/** `90` → "90 sec", `120` → "2 min". */
function formatSeconds(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60} min`;
  }
  return `${Math.round(seconds)} sec`;
}

/** A short distance for a step: metres for kilometres, the runner's unit above 1 km. */
function formatStepDistance(meters: number, unit: DistanceUnit): string {
  if (unit === 'km' && meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${kmToDisplay(meters / 1000, unit).toFixed(2)} ${unit === 'mi' ? 'mi' : 'km'}`;
}

function formatTarget(target: StepTargetSpec, unit: DistanceUnit): string {
  return target.kind === 'duration'
    ? formatSeconds(target.minutes * 60)
    : formatStepDistance(target.km * 1000, unit);
}

function workDistancePresets(unit: DistanceUnit): ValuePreset[] {
  return unit === 'mi'
    ? [
        { label: '0.1 mi', value: 0.1 },
        { label: '0.25 mi', value: 0.25 },
        { label: '0.5 mi', value: 0.5 },
        { label: '1 mi', value: 1 },
      ]
    : [
        { label: '200 m', value: 0.2 },
        { label: '400 m', value: 0.4 },
        { label: '800 m', value: 0.8 },
        { label: '1 km', value: 1 },
        { label: '1.6 km', value: 1.6 },
      ];
}

const WORK_LABELS: Record<StructuredKind, { work: string; recovery: string }> = {
  intervals: { work: 'Run', recovery: 'Recovery' },
  fartlek: { work: 'Fast', recovery: 'Easy' },
  tempo: { work: 'Tempo', recovery: 'Recovery' },
};

/**
 * Record — the run launcher (#151).
 *
 * One question first: what kind of run? Free run is one tap; every other kind
 * reveals only its own controls, presets always alongside a way past them, and
 * structured sessions show exactly what they will do before Start.
 */
export default function RecordScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fmt = useFormatters();
  const { coordinate, originLabel, status: locationStatus } = useLocation();
  const { start } = useRun();
  const { settings } = useSettings();
  const { counting, begin, complete } = useStartCountdown();

  const [kind, setKind] = useState<RunKind>('free');
  const [distanceKm, setDistanceKm] = useState(settings.defaultDistanceKm ?? DEFAULT_DISTANCE_KM);
  const [minutes, setMinutes] = useState(30);
  const [intervals, setIntervals] = useState<StructuredSpec>(() => ({ ...DEFAULT_INTERVALS }));
  const [fartlek, setFartlek] = useState<StructuredSpec>(() => ({ ...DEFAULT_FARTLEK }));
  const [tempo, setTempo] = useState<StructuredSpec>(() => ({ ...DEFAULT_TEMPO }));
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [savedRouteCount, setSavedRouteCount] = useState(0);

  const unit = fmt.unit;
  const distanceDisplay = kmToDisplay(distanceKm, unit);

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

  const structuredSpec: StructuredSpec | null =
    kind === 'intervals' ? intervals : kind === 'fartlek' ? fartlek : kind === 'tempo' ? tempo : null;

  const updateSpec = useCallback(
    (patch: Partial<StructuredSpec>) => {
      if (kind === 'intervals') setIntervals((current) => ({ ...current, ...patch }));
      else if (kind === 'fartlek') setFartlek((current) => ({ ...current, ...patch }));
      else if (kind === 'tempo') setTempo((current) => ({ ...current, ...patch }));
    },
    [kind],
  );

  const steps = useMemo(
    () => (structuredSpec ? compileStructured(kind as StructuredKind, structuredSpec) : []),
    [kind, structuredSpec],
  );
  const summary = useMemo(() => summarizeSteps(steps), [steps]);

  const estimatedKm = Math.max(0.5, Math.round((minutes / settings.typicalPaceMinPerKm) * 10) / 10);

  const handleStart = useCallback(() => {
    if (!coordinate) {
      return;
    }
    if (kind === 'free') {
      start(null, 0, null, null, 0, []);
    } else if (kind === 'distance') {
      start(null, distanceKm, null, null, 0, []);
    } else if (kind === 'time') {
      start(null, estimatedKm, null, null, Math.round(minutes * 60), []);
    } else if (structuredSpec) {
      // No target distance is claimed: warm-up/cool-down are time-based, so a
      // total would be invented. Completion is driven by the steps (#151).
      start(null, 0, null, runKindWorkoutType(kind), 0, steps);
    }
    router.push('/run');
  }, [coordinate, kind, distanceKm, estimatedKm, minutes, start, structuredSpec, steps]);

  const summaryBits: string[] = [];
  if (summary.reps) summaryBits.push(`${summary.reps} reps`);
  if (summary.fastDistanceMeters) {
    summaryBits.push(`${fmt.distance(summary.fastDistanceMeters)} ${fmt.unitLabel} fast`);
  }
  if (summary.totalDurationSeconds) {
    summaryBits.push(`${formatDuration(summary.totalDurationSeconds)} total`);
  }

  const open = useCallback((next: SheetKey) => {
    selectionFeedback();
    setSheet(next);
  }, []);

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
          { backgroundColor: theme.background, borderTopColor: theme.borderSubtle },
        ]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.panelContent,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}>
          <Text variant="title">What kind of run?</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {RUN_KINDS.map((option) => {
              const selected = option === kind;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    selectionFeedback();
                    setKind(option);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={RUN_KIND_LABELS[option]}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: selected ? theme.accent : theme.fill },
                    pressed && !selected && styles.pressed,
                  ]}>
                  <SymbolView
                    name={KIND_SYMBOLS[option]}
                    size={layout.iconSizeSmall}
                    tintColor={selected ? theme.accentForeground : theme.textSecondary}
                  />
                  <Text variant="caption" color={selected ? 'accentForeground' : 'text'}>
                    {RUN_KIND_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {kind === 'free' ? (
            <Text variant="caption" color="textSecondary">
              Run without a target. Finish whenever you want.
            </Text>
          ) : null}

          {kind === 'distance' ? (
            <>
              <ChipRow>
                {distancePresets(unit).map((preset) => {
                  const selected = Math.abs(preset - distanceDisplay) < 0.05;
                  return (
                    <ValueChip
                      key={preset}
                      label={`${preset}`}
                      selected={selected}
                      onPress={() => setDistanceKm(displayToKm(preset, unit))}
                    />
                  );
                })}
                <ValueChip
                  label={
                    distancePresets(unit).some((preset) => Math.abs(preset - distanceDisplay) < 0.05)
                      ? 'Custom'
                      : `${distanceDisplay.toFixed(1)}`
                  }
                  selected={
                    !distancePresets(unit).some((preset) => Math.abs(preset - distanceDisplay) < 0.05)
                  }
                  onPress={() => open('distance')}
                />
              </ChipRow>
              <Text variant="caption" color="textSecondary">
                {coordinate
                  ? `Starting from your current location · ${originLabel}`
                  : locationStatus === 'requesting'
                    ? 'Getting your current location…'
                    : 'Current location unavailable'}
              </Text>
            </>
          ) : null}

          {kind === 'time' ? (
            <>
              <ChipRow>
                {TIME_PRESETS.map((preset) => (
                  <ValueChip
                    key={preset}
                    label={`${preset}`}
                    selected={minutes === preset}
                    onPress={() => setMinutes(preset)}
                  />
                ))}
                <ValueChip
                  label={TIME_PRESETS.includes(minutes) ? 'Custom' : `${minutes}`}
                  selected={!TIME_PRESETS.includes(minutes)}
                  onPress={() => open('minutes')}
                />
              </ChipRow>
              <Text variant="caption" color="textSecondary" tabular>
                {`${minutes} min · about ${fmt.distance(estimatedKm * 1000)} ${fmt.unitLabel} at your pace`}
              </Text>
            </>
          ) : null}

          {structuredSpec && kind !== 'free' ? (
            <>
              <View style={styles.builder}>
                <BuilderRow
                  label="Warm up"
                  value={structuredSpec.warmupMinutes > 0 ? `${structuredSpec.warmupMinutes} min` : 'None'}
                  onPress={() => open('warmup')}
                />
                {structuredSpec.reps > 1 ? (
                  <BuilderRow label="Repeat" value={`× ${structuredSpec.reps}`} onPress={() => open('reps')} />
                ) : null}
                <BuilderRow
                  label={WORK_LABELS[kind as StructuredKind].work}
                  value={formatTarget(structuredSpec.work, unit)}
                  onPress={() => open('work')}
                />
                {structuredSpec.reps > 1 ? (
                  <BuilderRow
                    label={WORK_LABELS[kind as StructuredKind].recovery}
                    value={formatTarget(structuredSpec.recovery, unit)}
                    onPress={() => open('recovery')}
                  />
                ) : null}
                <BuilderRow
                  label="Cool down"
                  value={structuredSpec.cooldownMinutes > 0 ? `${structuredSpec.cooldownMinutes} min` : 'None'}
                  onPress={() => open('cooldown')}
                />
              </View>

              <Text variant="caption" color="textSecondary" accessibilityLabel="Workout preview">
                {previewLine(kind as StructuredKind, structuredSpec, unit)}
              </Text>
              {summaryBits.length > 0 ? (
                <Text variant="micro" color="textSecondary" tabular>
                  {summaryBits.join(' · ')}
                </Text>
              ) : null}
            </>
          ) : null}

          <Button
            label={startLabel(kind)}
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
        </ScrollView>
      </View>

      {renderSheet()}
      {counting ? <StartCountdown onComplete={complete} /> : null}
    </View>
  );

  function renderSheet() {
    if (!sheet) {
      return null;
    }

    if (sheet === 'distance') {
      const limits = DISTANCE_LIMITS[unit];
      return (
        <ValueSheet
          visible
          title="Distance"
          valueLabel={distanceDisplay.toFixed(1)}
          unit={fmt.unitLabel}
          presets={distancePresets(unit).map((preset) => ({ label: `${preset}`, value: preset }))}
          current={distanceDisplay}
          min={limits.min}
          max={limits.max}
          step={limits.step}
          onChange={(value) => setDistanceKm(displayToKm(value, unit))}
          onClose={() => setSheet(null)}
        />
      );
    }

    if (sheet === 'minutes') {
      return (
        <ValueSheet
          visible
          title="Duration"
          valueLabel={`${minutes}`}
          unit="min"
          presets={TIME_PRESETS.map((preset) => ({ label: `${preset}`, value: preset }))}
          current={minutes}
          min={5}
          max={180}
          step={5}
          onChange={setMinutes}
          onClose={() => setSheet(null)}
        />
      );
    }

    if (!structuredSpec) {
      return null;
    }

    if (sheet === 'warmup' || sheet === 'cooldown') {
      const key = sheet === 'warmup' ? 'warmupMinutes' : 'cooldownMinutes';
      const current = structuredSpec[key];
      return (
        <ValueSheet
          visible
          title={sheet === 'warmup' ? 'Warm up' : 'Cool down'}
          valueLabel={current > 0 ? `${current}` : 'None'}
          unit="min"
          presets={WARMUP_MINUTE_PRESETS.map((preset) => ({ label: `${preset}`, value: preset }))}
          current={current}
          min={LIMITS.warmupMinutes.min}
          max={LIMITS.warmupMinutes.max}
          step={LIMITS.warmupMinutes.step}
          allowNone
          onChange={(value) => updateSpec({ [key]: value })}
          onClose={() => setSheet(null)}
        />
      );
    }

    if (sheet === 'reps') {
      return (
        <ValueSheet
          visible
          title="Repeat"
          valueLabel={`${structuredSpec.reps}`}
          unit="×"
          presets={REP_PRESETS.map((preset) => ({ label: `${preset}`, value: preset }))}
          current={structuredSpec.reps}
          min={LIMITS.reps.min}
          max={LIMITS.reps.max}
          step={LIMITS.reps.step}
          onChange={(value) => updateSpec({ reps: Math.round(value) })}
          onClose={() => setSheet(null)}
        />
      );
    }

    if (sheet === 'work') {
      return targetSheet('work');
    }
    return targetSheet('recovery');
  }

  function targetSheet(which: 'work' | 'recovery') {
    if (!structuredSpec) {
      return null;
    }
    const target = structuredSpec[which];
    const title = which === 'work' ? WORK_LABELS[kind as StructuredKind].work : WORK_LABELS[kind as StructuredKind].recovery;

    if (target.kind === 'duration') {
      const seconds = target.minutes * 60;
      return (
        <ValueSheet
          visible
          title={title}
          valueLabel={formatSeconds(seconds)}
          segments={[
            { key: 'duration', label: 'Time' },
            { key: 'distance', label: 'Distance' },
          ]}
          segment="duration"
          onSegmentChange={(key) => {
            if (key === 'distance') {
              updateSpec({ [which]: { kind: 'distance', km: 0.4 } });
            }
          }}
          presets={
            which === 'work'
              ? WORK_TIME_MINUTE_PRESETS.map((preset) => ({ label: `${preset} min`, value: preset * 60 }))
              : RECOVERY_SECOND_PRESETS.map((preset) => ({ label: formatSeconds(preset), value: preset }))
          }
          current={seconds}
          min={which === 'work' ? LIMITS.workMinutes.min * 60 : LIMITS.recoverySeconds.min}
          max={which === 'work' ? LIMITS.workMinutes.max * 60 : LIMITS.recoverySeconds.max}
          step={which === 'work' ? LIMITS.workMinutes.step * 60 : LIMITS.recoverySeconds.step}
          onChange={(value) => updateSpec({ [which]: { kind: 'duration', minutes: value / 60 } })}
          onClose={() => setSheet(null)}
        />
      );
    }

    const display = kmToDisplay(target.km, unit);
    const limits = DISTANCE_LIMITS[unit];
    return (
      <ValueSheet
        visible
        title={title}
        valueLabel={formatStepDistance(target.km * 1000, unit)}
        segments={[
          { key: 'duration', label: 'Time' },
          { key: 'distance', label: 'Distance' },
        ]}
        segment="distance"
        onSegmentChange={(key) => {
          if (key === 'duration') {
            updateSpec({ [which]: { kind: 'duration', minutes: which === 'work' ? 2 : 1.5 } });
          }
        }}
        presets={workDistancePresets(unit)}
        current={display}
        min={0.1}
        max={limits.max}
        step={0.1}
        onChange={(value) => updateSpec({ [which]: { kind: 'distance', km: displayToKm(value, unit) } })}
        onClose={() => setSheet(null)}
      />
    );
  }
}

function previewLine(kind: StructuredKind, spec: StructuredSpec, unit: DistanceUnit): string {
  const parts: string[] = [];
  if (spec.warmupMinutes > 0) parts.push(`${spec.warmupMinutes} min warm-up`);
  const work = `${formatTarget(spec.work, unit)} ${WORK_LABELS[kind].work}`;
  if (spec.reps > 1) {
    parts.push(`${spec.reps} × (${work} / ${formatTarget(spec.recovery, unit)} ${WORK_LABELS[kind].recovery})`);
  } else {
    parts.push(work);
  }
  if (spec.cooldownMinutes > 0) parts.push(`${spec.cooldownMinutes} min cool-down`);
  return parts.join(' · ');
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {children}
    </ScrollView>
  );
}

function ValueChip({
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
      onPress={() => {
        selectionFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.valueChip,
        { backgroundColor: selected ? theme.accent : theme.fill },
        pressed && !selected && styles.pressed,
      ]}>
      <Text variant="body" tabular color={selected ? 'accentForeground' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

function BuilderRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}. Change.`}
      style={({ pressed }) => [
        styles.builderRow,
        { borderBottomColor: theme.divider },
        pressed && styles.pressed,
      ]}>
      <Text variant="body" color="textSecondary">
        {label}
      </Text>
      <View style={styles.builderValue}>
        <Text variant="body" tabular>
          {value}
        </Text>
        <SymbolView name="chevron.right" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
      </View>
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
    maxHeight: '72%',
  },
  panelContent: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    gap: spacing.md,
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
  valueChip: {
    minWidth: 56,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.small,
    borderCurve: 'continuous',
  },
  builder: {
    gap: 0,
  },
  builderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouchTarget + spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  builderValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
});
