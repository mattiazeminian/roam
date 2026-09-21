import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { layout, radii, setup, spacing, useTheme } from '@/theme';

const GRADIENT = require('../../assets/images/onboarding-gradient.png');

export type OnboardingShellProps = {
  /** Zero-based position, for the progress segments. */
  step: number;
  total: number;
  onBack?: () => void;
  children: ReactNode;
  /** The primary action, pinned near the bottom. */
  footer: ReactNode;
};

/**
 * The frame every setup screen sits in: a near-white ground that warms to lime
 * at the very bottom, a hairline progress trail, the question, and the action.
 * Progress is deliberately quiet — thin segments, no "step 4 of 10".
 */
export function OnboardingShell({ step, total, onBack, children, footer }: OnboardingShellProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Image
        source={GRADIENT}
        style={styles.background}
        resizeMode="stretch"
        accessibilityIgnoresInvertColors
      />
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg },
        ]}>
        {/* Symmetric gutters keep the progress trail optically centred. */}
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={spacing.sm}
              style={({ pressed }) => [styles.gutter, pressed && styles.pressed]}>
              <SymbolView name="chevron.left" size={layout.iconSizeSmall} tintColor={theme.text} />
            </Pressable>
          ) : (
            <View style={styles.gutter} />
          )}
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel="Setup progress"
            accessibilityValue={{ min: 1, max: total, now: step + 1 }}>
            {Array.from({ length: total }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.segment,
                  {
                    backgroundColor: index <= step ? theme.accent : setup.track,
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.gutter} />
        </View>

        <View style={styles.body}>{children}</View>
        <View style={styles.footer}>{footer}</View>
      </View>
    </View>
  );
}

export type SelectionRowProps = {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * One answer. A row on a divider, not a card: the check is the only filled
 * shape, so selected state reads even without colour.
 */
export function SelectionRow({
  label,
  detail,
  selected,
  onPress,
  accessibilityLabel,
}: SelectionRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.borderSubtle },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowText}>
        <Text variant="title">{label}</Text>
        {detail ? (
          <Text variant="body" color="textSecondary">
            {detail}
          </Text>
        ) : null}
      </View>
      <View
        style={[styles.radio, { borderColor: selected ? theme.accent : theme.border }]}>
        {selected ? (
          <View style={[styles.radioDot, { backgroundColor: theme.accent }]} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  background: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.minTouchTarget,
  },
  gutter: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flexDirection: 'row',
    gap: spacing.xxs,
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radii.xs,
  },
  body: {
    flex: 1,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  footer: {
    gap: spacing.md,
    alignItems: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: radii.pill,
  },
  pressed: {
    opacity: 0.6,
  },
});
