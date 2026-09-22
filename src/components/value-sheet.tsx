import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { impactLight, selectionFeedback } from '@/lib/haptics';
import { motion, radii, spacing, useTheme } from '@/theme';

export type ValuePreset = { label: string; value: number };

export type ValueSheetProps = {
  visible: boolean;
  title: string;
  /** The current value, already formatted for display. */
  valueLabel: string;
  /** Unit shown beside the value, e.g. `km`, `min`, `sec`, `m`. */
  unit?: string;
  presets: ValuePreset[];
  current: number;
  min: number;
  max: number;
  step: number;
  /** Adds a "None" choice that sets the value to 0 (warm-up, cool-down). */
  allowNone?: boolean;
  /** Optional segmented control above the value, e.g. Distance / Time. */
  segments?: { key: string; label: string }[];
  segment?: string;
  onSegmentChange?: (key: string) => void;
  onChange: (value: number) => void;
  onClose: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A short, final step of a number, e.g. 90 → "90", 1.5 → "1.5". */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A bottom sheet for editing one numeric value (#151, #150).
 *
 * Presets are shortcuts at the top; the value itself is edited with a stepper,
 * and there is always a way past the presets. Drag down, tap the scrim or press
 * Done to close — the same dismissal language as the rest of ROAM's sheets.
 */
export function ValueSheet({
  visible,
  title,
  valueLabel,
  unit,
  presets,
  current,
  min,
  max,
  step,
  allowNone = false,
  segments,
  segment,
  onSegmentChange,
  onChange,
  onClose,
}: ValueSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (translateY.value > 120 || event.velocityY > 800) {
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: motion.microDuration });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const nudge = (direction: -1 | 1) => {
    const next = clamp(round(current + direction * step), min, max);
    if (next === current) {
      return;
    }
    impactLight();
    onChange(next);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable
          style={[styles.scrim, { backgroundColor: theme.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              sheetStyle,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.borderSubtle,
                paddingBottom: insets.bottom + spacing.lg,
              },
            ]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />

            <Text variant="micro" color="textSecondary" style={styles.center}>
              {title.toUpperCase()}
            </Text>

            {segments && segment !== undefined && onSegmentChange ? (
              <View style={styles.segments}>
                {segments.map((option) => {
                  const selected = option.key === segment;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (!selected) {
                          selectionFeedback();
                          onSegmentChange(option.key);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={option.label}
                      style={[
                        styles.segment,
                        { backgroundColor: selected ? theme.accent : theme.fill },
                      ]}>
                      <Text
                        variant="label"
                        color={selected ? 'accentForeground' : 'textSecondary'}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.valueRow}>
              <StepButton
                symbol="minus"
                label={`Decrease ${title}`}
                onPress={() => nudge(-1)}
                disabled={current <= min}
              />
              <View style={styles.valueCenter}>
                <Text
                  variant="metric"
                  color="accentText"
                  tabular
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  style={styles.value}>
                  {valueLabel}
                </Text>
                {unit ? (
                  <Text variant="title" color="textSecondary" style={styles.unit}>
                    {unit}
                  </Text>
                ) : null}
              </View>
              <StepButton
                symbol="plus"
                label={`Increase ${title}`}
                onPress={() => nudge(1)}
                disabled={current >= max}
              />
            </View>

            <View style={styles.presets}>
              {presets.map((preset) => {
                const selected = Math.abs(preset.value - current) < step / 2;
                return (
                  <Pressable
                    key={preset.label}
                    onPress={() => {
                      selectionFeedback();
                      onChange(clamp(preset.value, min, max));
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${title} ${preset.label}`}
                    style={[
                      styles.preset,
                      { backgroundColor: selected ? theme.accent : theme.fill },
                    ]}>
                    <Text
                      variant="body"
                      tabular
                      color={selected ? 'accentForeground' : 'text'}>
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
              {allowNone ? (
                <Pressable
                  onPress={() => {
                    selectionFeedback();
                    onChange(0);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current <= 0 }}
                  accessibilityLabel={`No ${title.toLowerCase()}`}
                  style={[
                    styles.preset,
                    { backgroundColor: current <= 0 ? theme.accent : theme.fill },
                  ]}>
                  <Text
                    variant="body"
                    color={current <= 0 ? 'accentForeground' : 'text'}>
                    None
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Button label="Done" variant="accent" onPress={onClose} />
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

function StepButton({
  symbol,
  label,
  onPress,
  disabled,
}: {
  symbol: 'plus' | 'minus';
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.step,
        {
          backgroundColor: pressed && !disabled ? theme.fillPressed : theme.fill,
          opacity: disabled ? 0.35 : 1,
        },
      ]}>
      <SymbolView
        name={symbol}
        size={22}
        weight="semibold"
        tintColor={disabled ? theme.textDisabled : theme.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: radii.pill,
  },
  center: { textAlign: 'center' },
  segments: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: radii.small,
    borderCurve: 'continuous',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  valueCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  value: {
    flexShrink: 1,
  },
  unit: {
    flexShrink: 0,
  },
  step: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  preset: {
    minWidth: 56,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
});
