import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { Text } from '@/components/text';
import { usePressScale } from '@/hooks/use-press-scale';
import { impactLight, selectionFeedback } from '@/lib/haptics';
import { layout, motion, radii, spacing, useTheme } from '@/theme';

export const DISTANCE_PRESETS = [3, 5, 7, 10] as const;
export const MIN_DISTANCE_KM = 1;
export const MAX_DISTANCE_KM = 42;
export const DISTANCE_STEP_KM = 1;
export const DEFAULT_DISTANCE_KM = 5;

export type DistanceControlProps = {
  valueKm: number;
  onChange: (valueKm: number) => void;
  disabled?: boolean;
};

function clampDistance(valueKm: number) {
  return Math.min(MAX_DISTANCE_KM, Math.max(MIN_DISTANCE_KM, Math.round(valueKm)));
}

/**
 * Soft, tactile distance selection: a hero value with +/- and rounded presets
 * on a floating glass surface. No freeform slider, so the choice is never
 * ambiguous.
 */
export function DistanceControl({ valueKm, onChange, disabled = false }: DistanceControlProps) {
  const theme = useTheme();

  const valueProgress = useSharedValue(1);
  const previousValue = useRef(valueKm);

  useEffect(() => {
    if (previousValue.current !== valueKm) {
      previousValue.current = valueKm;
      valueProgress.value = 0;
      valueProgress.value = withTiming(1, {
        duration: motion.fastDuration,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [valueKm, valueProgress]);

  const valueStyle = useAnimatedStyle(() => ({
    opacity: valueProgress.value,
    transform: [{ translateY: (1 - valueProgress.value) * 8 }],
  }));

  const decrease = () => {
    impactLight();
    onChange(clampDistance(valueKm - DISTANCE_STEP_KM));
  };
  const increase = () => {
    impactLight();
    onChange(clampDistance(valueKm + DISTANCE_STEP_KM));
  };
  const selectPreset = (preset: number) => {
    selectionFeedback();
    onChange(preset);
  };

  return (
    <GlassSurface radius={radii.large} style={styles.surface}>
      <Text variant="caption" color="textSecondary">
        DISTANCE
      </Text>

      <View style={styles.heroRow}>
        <StepButton
          label="−"
          accessibilityLabel="Decrease distance"
          onPress={decrease}
          disabled={disabled || valueKm <= MIN_DISTANCE_KM}
        />

        <View
          style={styles.value}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Running distance"
          accessibilityValue={{
            min: MIN_DISTANCE_KM,
            max: MAX_DISTANCE_KM,
            now: valueKm,
            text: `${valueKm.toFixed(1)} kilometers`,
          }}
          accessibilityActions={[
            { name: 'increment', label: 'Increase distance' },
            { name: 'decrement', label: 'Decrease distance' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') {
              increase();
            }
            if (event.nativeEvent.actionName === 'decrement') {
              decrease();
            }
          }}>
          <Animated.View style={[styles.valueInner, valueStyle]}>
            <Text variant="display" tabular>
              {valueKm.toFixed(1)}
            </Text>
            <Text variant="title" color="textSecondary" style={styles.unit}>
              km
            </Text>
          </Animated.View>
        </View>

        <StepButton
          label="+"
          accessibilityLabel="Increase distance"
          onPress={increase}
          disabled={disabled || valueKm >= MAX_DISTANCE_KM}
        />
      </View>

      <View style={styles.presets}>
        {DISTANCE_PRESETS.map((preset) => (
          <PresetButton
            key={preset}
            value={preset}
            selected={valueKm === preset}
            onPress={() => selectPreset(preset)}
            disabled={disabled}
          />
        ))}
      </View>
    </GlassSurface>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const press = usePressScale(0.92);

  return (
    <Animated.View style={press.animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.step,
          {
            backgroundColor: pressed && !disabled ? theme.disabled : theme.surface,
            opacity: disabled ? 0.5 : 1,
          },
        ]}>
        <Text variant="title" color={disabled ? 'textDisabled' : 'text'}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function PresetButton({
  value,
  selected,
  onPress,
  disabled,
}: {
  value: number;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const press = usePressScale(0.96);

  return (
    <Animated.View style={[styles.presetWrapper, press.animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${value} kilometers`}
        accessibilityState={{ selected, disabled }}
        style={({ pressed }) => [
          styles.preset,
          {
            backgroundColor: selected
              ? theme.selected
              : pressed && !disabled
                ? theme.disabled
                : theme.surface,
            opacity: disabled ? 0.5 : 1,
          },
        ]}>
        <Text
          variant="label"
          color={selected ? 'accentForeground' : 'text'}
          style={styles.presetLabel}>
          {`${value} km`}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueInner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  unit: {
    paddingBottom: spacing.xxs,
  },
  step: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  presetWrapper: {
    flex: 1,
  },
  preset: {
    height: layout.controlHeight - 8,
    borderRadius: radii.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetLabel: {
    fontWeight: '600',
  },
});
