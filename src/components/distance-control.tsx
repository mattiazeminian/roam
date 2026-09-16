import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/text';
import { usePressScale } from '@/hooks/use-press-scale';
import { impactLight, selectionFeedback } from '@/lib/haptics';
import { distancePresets, displayToKm, kmToDisplay } from '@/services/settings';
import { useFormatters } from '@/services/settings-context';
import { layout, motion, radii, spacing, typography, useTheme } from '@/theme';

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
 * Distance selection.
 *
 * The value is the hero and sits on the sheet's left axis; the steppers are a
 * compact pair on the opposite side. They used to flank the number as two large
 * circles, which made three controls compete for one decision and read like a
 * web spinner rather than an iOS control.
 *
 * Three ways in, no instructional text: tap the number to type it, step by one,
 * or take a preset.
 */
export function DistanceControl({ valueKm, onChange, disabled = false }: DistanceControlProps) {
  const theme = useTheme();
  const fmt = useFormatters();
  // The stored value is always kilometers; only what is shown changes with the
  // unit, so switching units can never alter the route that gets requested.
  const shown = kmToDisplay(valueKm, fmt.unit);
  const presets = distancePresets(fmt.unit);
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const valueProgress = useSharedValue(1);
  const previousValue = useRef(valueKm);

  useEffect(() => {
    if (previousValue.current !== valueKm) {
      previousValue.current = valueKm;
      if (reduceMotion) {
        valueProgress.value = 1;
      } else {
        valueProgress.value = 0;
        valueProgress.value = withTiming(1, {
          duration: motion.fastDuration,
          easing: Easing.out(Easing.quad),
        });
      }
    }
  }, [valueKm, valueProgress, reduceMotion]);

  const valueStyle = useAnimatedStyle(() => {
    const progress = valueProgress.value;
    return {
      opacity: 0.55 + progress * 0.45,
      transform: [{ translateY: (1 - progress) * 6 }],
    };
  });

  const beginEdit = () => {
    if (disabled) {
      return;
    }
    setDraft(shown.toFixed(1));
    setIsEditing(true);
  };

  const handleDraftChange = (text: string) => {
    const cleaned = sanitizeDraft(text);
    setDraft(cleaned);
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const km = displayToKm(parsed, fmt.unit);
    if (km >= MIN_DISTANCE_KM && km <= MAX_DISTANCE_KM) {
      onChange(Math.round(km * 10) / 10);
    }
  };

  const finishEdit = () => {
    setIsEditing(false);
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      return;
    }
    onChange(clampDistance(displayToKm(parsed, fmt.unit)));
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
    onChange(clampDistance(displayToKm(preset, fmt.unit)));
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text variant="micro" color="textSecondary">
          Distance
        </Text>

        {isEditing ? (
          <Pressable
            onPress={() => {
              finishEdit();
              Keyboard.dismiss();
            }}
            accessibilityRole="button"
            accessibilityLabel="Done editing distance"
            hitSlop={12}>
            <Text variant="heading" color="accent">
              Done
            </Text>
          </Pressable>
        ) : (
          <View style={styles.steppers}>
            <StepButton
              symbol="minus"
              accessibilityLabel="Decrease distance"
              onPress={decrease}
              disabled={disabled || valueKm <= MIN_DISTANCE_KM}
            />
            <StepButton
              symbol="plus"
              accessibilityLabel="Increase distance"
              onPress={increase}
              disabled={disabled || valueKm >= MAX_DISTANCE_KM}
            />
          </View>
        )}
      </View>

      {isEditing ? (
        <View style={styles.valueRow}>
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
            maxFontSizeMultiplier={1}
            accessibilityLabel={`Distance in ${fmt.unitSpoken}`}
            style={[styles.input, { color: theme.accent }]}
          />
          <Text variant="title" color="textSecondary" style={styles.unit}>
            {fmt.unitLabel}
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
            text: `${shown.toFixed(1)} ${fmt.unitSpoken}`,
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
          <Animated.View style={[styles.valueRow, valueStyle]}>
            <Text variant="metric" color="accent" tabular>
              {shown.toFixed(1)}
            </Text>
            <Text variant="title" color="textSecondary" style={styles.unit}>
              {fmt.unitLabel}
            </Text>
          </Animated.View>
        </Pressable>
      )}

      <View style={styles.presets}>
        {presets.map((preset) => (
          <PresetButton
            key={preset}
            value={preset}
            unitLabel={fmt.unitLabel}
            selected={Math.abs(shown - preset) < 0.05}
            onPress={() => selectPreset(preset)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * A stepper.
 *
 * The glyph is an SF Symbol rather than a "+"/"−" text character: text is laid
 * out on a baseline inside a line box, so centering the box does not centre the
 * mark, and the two glyphs have different optical centres from each other. A
 * symbol is centred on its own frame and matches the rest of the app's icons.
 */
function StepButton({
  symbol,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  symbol: 'plus' | 'minus';
  accessibilityLabel: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const press = usePressScale(0.94);

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
        // The visible circle is 40pt; hitSlop brings the target to 44pt.
        hitSlop={4}
        style={({ pressed }) => [
          styles.step,
          {
            backgroundColor: pressed && !disabled ? theme.fillPressed : theme.fill,
            opacity: disabled ? 0.35 : 1,
          },
        ]}>
        <SymbolView
          name={symbol}
          size={layout.iconSize}
          weight="semibold"
          tintColor={disabled ? theme.textDisabled : theme.text}
        />
      </Pressable>
    </Animated.View>
  );
}

function PresetButton({
  value,
  unitLabel,
  selected,
  onPress,
  disabled,
}: {
  value: number;
  unitLabel: string;
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
        accessibilityLabel={`${value} ${unitLabel}`}
        accessibilityState={{ selected, disabled }}
        style={({ pressed }) => [
          styles.preset,
          {
            backgroundColor: selected
              ? theme.accent
              : pressed && !disabled
                ? theme.fillPressed
                : theme.fill,
            opacity: disabled ? 0.35 : 1,
          },
        ]}>
        {/* Tertiary rather than secondary: on the translucent fill, secondary
            grey lands at ~4.3:1 and misses AA. */}
        <Text variant="label" color={selected ? 'accentForeground' : 'textTertiary'}>
          {`${value} ${unitLabel}`}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  steppers: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  input: {
    ...typography.metric,
    padding: 0,
    minWidth: 150,
  },
  unit: {
    paddingBottom: spacing.xs,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  presetWrapper: {
    flex: 1,
  },
  preset: {
    height: layout.controlHeightCompact,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
