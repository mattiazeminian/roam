import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlassSurface } from '@/components/glass-surface';
import { HoldButton } from '@/components/hold-button';
import { MapCanvas } from '@/components/map/map-canvas';
import { MapControl } from '@/components/map-control';
import { Metric, MetricRow } from '@/components/metric';
import { ControlPanel } from '@/components/control-panel';
import { Text } from '@/components/text';
import { impactMedium } from '@/lib/haptics';
import { cumulativeDistances, sliceAlongPath } from '@/services/geo';
import { useRun } from '@/services/run-context';
import { formatDuration } from '@/services/run-session';
import { useFormatters } from '@/services/settings-context';
import { layout, radii, spacing, useTheme } from '@/theme';

/**
 * Active Run — the map is the screen; the readout sits on the sheet.
 *
 * Distance, time and pace only. Everything shown comes from the GPS track, and
 * progress along the planned route comes from position, never from elapsed
 * time.
 */
export default function ActiveRunScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    status,
    route,
    distanceMeters,
    activeSeconds,
    paceMinPerKm,
    track,
    progressMeters,
    degradedSignal,
    position,
    pause,
    resume,
    finish,
  } = useRun();

  const fmt = useFormatters();
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [followBroken, setFollowBroken] = useState(false);

  // A finished run hands off to the summary; an idle one means there is no
  // session (a reload, or a deep link), so fall back to Home.
  useEffect(() => {
    if (status === 'finished') {
      router.replace('/run-summary');
    } else if (status === 'idle') {
      router.replace('/');
    }
  }, [status]);

  const completedGeometry = useMemo(() => {
    if (!route || route.geometry.length < 2 || progressMeters <= 0) {
      return undefined;
    }
    const cumulative = cumulativeDistances(route.geometry);
    return sliceAlongPath(route.geometry, cumulative, progressMeters);
  }, [route, progressMeters]);

  const handleRecenter = useCallback(() => {
    setFollowBroken(false);
    setRecenterSignal((value) => value + 1);
  }, []);

  const isPaused = status === 'paused';

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <MapCanvas
        origin={position}
        routes={route ? [route] : []}
        // Deliberately not marked selected: during a run the plan is the
        // reference, not the subject. It stays thin and neutral so the accent
        // completed portion drawn over it is what the runner actually reads.
        cameraMode="follow"
        recenterSignal={recenterSignal}
        track={track}
        completedGeometry={completedGeometry}
        onFollowBroken={() => setFollowBroken(true)}
      />

      <View
        style={[
          styles.topRow,
          { top: insets.top + spacing.xs, paddingHorizontal: layout.screenMargin },
        ]}
        pointerEvents="box-none">
        <View style={styles.status}>
          {isPaused ? (
            <GlassSurface radius={radii.pill} style={styles.pill}>
              <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
              <Text variant="micro" color="text">
                Paused
              </Text>
            </GlassSurface>
          ) : null}

          {degradedSignal ? (
            // Never imply the track is accurate when the fixes are not.
            <GlassSurface radius={radii.pill} style={styles.pill}>
              <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
              <Text variant="micro" color="textSecondary" accessibilityLiveRegion="polite">
                Weak GPS
              </Text>
            </GlassSurface>
          ) : null}
        </View>

        {followBroken ? (
          <MapControl
            symbol="location"
            accessibilityLabel="Recenter on your position"
            onPress={handleRecenter}
          />
        ) : null}
      </View>

      <View style={styles.sheetAnchor}>
        <ControlPanel style={styles.sheet}>
          <Metric
            label="Distance"
            value={fmt.distance(distanceMeters)}
            unit={fmt.unitLabel}
            emphasis="hero"
            accessibilityLabel={`Distance ${fmt.distance(distanceMeters)} ${fmt.unitSpoken}`}
          />

          <MetricRow>
            <Metric
              fill
              label="Time"
              value={formatDuration(activeSeconds)}
              accessibilityLabel={`Time ${formatDuration(activeSeconds)}`}
            />
            <Metric
              fill
              label="Pace"
              value={fmt.paceWithUnit(paceMinPerKm)}
              accessibilityLabel={fmt.paceSpoken(paceMinPerKm)}
            />
          </MetricRow>

          <View style={styles.controls}>
            {isPaused ? (
              <Button
                label="Resume"
                variant="accent"
                onPress={() => {
                  impactMedium();
                  resume();
                }}
              />
            ) : (
              <Button
                label="Pause"
                variant="secondary"
                onPress={() => {
                  impactMedium();
                  pause();
                }}
              />
            )}
            <HoldButton
              label="Hold to finish"
              holdingLabel="Keep holding…"
              accessibilityLabel="Finish run"
              onComplete={finish}
            />
          </View>
        </ControlPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  status: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: layout.indicatorSize,
    height: layout.indicatorSize,
    borderRadius: layout.indicatorSize / 2,
  },
  sheetAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    gap: spacing.lg,
  },
  controls: {
    gap: spacing.xs,
  },
});
