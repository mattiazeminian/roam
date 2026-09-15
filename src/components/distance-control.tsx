import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
  const clamped = Math.min(MAX_DISTANCE_KM, Math.max(MIN_DISTANCE_KM, valueKm));
  return Math.round(clamped * 10) / 10;
}

function sanitizeDraft(text: string) {
  // Numeric keypads use the locale decimal separator (e.g. "," in Italian).
  let cleaned = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  return cleaned.slice(0, 4);
}

/**
 * Distance selection: a hero value that can be adjusted with +/-, chosen from
 * presets, or edited directly with a numeric keyboard. No separate screen.
 */
export function DistanceControl({ valueKm, onChange, disabled = false }: DistanceControlProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

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

  const valueStyle = useAnimatedStyle(() => {
    const progress = valueProgress.value;
    return {
      opacity: progress,
      transform: [{ translateY: (1 - progress) * 10 }, { scale: 0.98 + progress * 0.02 }],
    };
  });

  const beginEdit = () => {
    if (disabled) {
      return;
    }
    setDraft(valueKm.toFixed(1));
    setIsEditing(true);
  };

  const handleDraftChange = (text: string) => {
    const cleaned = sanitizeDraft(text);
    setDraft(cleaned);
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed >= MIN_DISTANCE_KM && parsed <= MAX_DISTANCE_KM) {
      onChange(Math.round(parsed * 10) / 10);
    }
  };

  const finishEdit = () => {
    setIsEditing(false);
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      return;
    }
    onChange(clampDistance(parsed));
  };

  const exitEdit = () => {
    if (isEditing) {
      setIsEditing(false);
      Keyboard.dismiss();
    }
  };

  const decrease = () => {
    exitEdit();
    impactLight();
    onChange(clampDistance(valueKm - DISTANCE_STEP_KM));
  };
  const increase = () => {
    exitEdit();
    impactLight();
    onChange(clampDistance(valueKm + DISTANCE_STEP_KM));
  };
  const selectPreset = (preset: number) => {
    exitEdit();
    selectionFeedback();
    onChange(preset);
  };

  return (
    <>
      <GlassSurface radius={radii.large} style={styles.surface}>
        <View style={styles.labelRow}>
          <Text variant="caption" color="textSecondary">
            DISTANCE
          </Text>
          {isEditing ? (
            <Pressable
              onPress={() => {
                finishEdit();
                Keyboard.dismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel="Done editing distance"
              hitSlop={10}>
              <Text variant="label" color="text" style={styles.doneLabel}>
                Done
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.heroRow}>
          <StepButton
            label="−"
            accessibilityLabel="Decrease distance"
            onPress={decrease}
            disabled={disabled || valueKm <= MIN_DISTANCE_KM}
          />

          <View style={styles.value}>
            {isEditing ? (
              <View style={styles.valueInner}>
                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={handleDraftChange}
                  onBlur={finishEdit}
                  onSubmitEditing={finishEdit}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  autoFocus
                  selectTextOnFocus
                  maxLength={4}
                  accessibilityLabel="Distance in kilometers"
                  style={[styles.input, { color: theme.text }]}
                />
                <Text variant="title" color="textSecondary" style={styles.unit}>
                  km
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={beginEdit}
                disabled={disabled}
                accessibilityRole="adjustable"
                accessibilityLabel="Running distance"
                accessibilityHint="Double tap to type an exact distance"
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
                  <Text variant="hero" tabular>
                    {valueKm.toFixed(1)}
                  </Text>
                  <Text variant="title" color="textSecondary" style={styles.unit}>
                    km
                  </Text>
                </Animated.View>
              </Pressable>
            )}
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

    </>
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
  const press = usePressScale(0.96);

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
            backgroundColor: pressed && !disabled ? theme.fillPressed : theme.fill,
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
  const press = usePressScale(0.97);

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
                ? theme.fillPressed
                : theme.fill,
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 18,
  },
  doneLabel: {
    fontWeight: '600',
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
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  input: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '700',
    letterSpacing: -1.5,
    textAlign: 'center',
    padding: 0,
    minWidth: 120,
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
