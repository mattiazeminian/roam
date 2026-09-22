import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { spacing } from '@/theme';

export type MetricProps = {
  label: string;
  value: string;
  /** Spoken form, when the written value would be read as punctuation. */
  accessibilityLabel?: string;
  /** Unit rendered next to a `hero` value, e.g. `km`. */
  unit?: string;
  emphasis?: 'hero' | 'regular';
  /** Take an equal share of a `MetricRow`, so columns share a left axis. */
  fill?: boolean;
};

/**
 * One labelled number.
 *
 * Active Run, Run Complete and Run Detail all present the same distance / time
 * / pace triplet, so the label style, baseline alignment and tabular figures
 * live here instead of being restated on each screen.
 */
export function Metric({
  label,
  value,
  accessibilityLabel,
  unit,
  emphasis = 'regular',
  fill = false,
}: MetricProps) {
  const isHero = emphasis === 'hero';

  return (
    <View style={[styles.root, fill && styles.fill]}>
      <Text variant="micro" color="textSecondary">
        {label}
      </Text>
      <Text
        variant={isHero ? 'metric' : 'display'}
        // The value a screen is about is the one thing that carries the
        // accent; the supporting metrics stay white so the accent keeps meaning.
        color={isHero ? 'accentText' : 'text'}
        tabular
        // Shrink rather than clip: a value as long as `1:07:00` beside another
        // metric can exceed its column on a narrow screen, and a truncated
        // number is worse than a slightly smaller one.
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.value}
        accessibilityLabel={accessibilityLabel ?? `${label} ${value}${unit ? ` ${unit}` : ''}`}>
        {value}
        {/* The unit is nested, not a sibling: a sibling baseline-aligned against
            a value that shrinks with `adjustsFontSizeToFit` drifts below the
            number and can be cropped. Nested, it always shares the baseline. */}
        {unit ? <Text variant="title" color="textSecondary">{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}

/** The secondary metrics under a hero value. Columns share a left axis. */
export function MetricRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
    minWidth: 0,
  },
  fill: {
    flex: 1,
  },
  value: {
    flexShrink: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    // Equal columns keep Time and Pace on a shared axis across all three
    // screens, instead of drifting with the width of their values.
    gap: spacing.lg,
  },
});
