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
      <View style={styles.valueRow}>
        <Text
          variant={isHero ? 'metric' : 'display'}
          // The value a screen is about is the one thing that carries the
          // accent; the supporting metrics stay white so the accent keeps meaning.
          color={isHero ? 'accent' : 'text'}
          tabular
          accessibilityLabel={accessibilityLabel ?? `${label} ${value}`}>
          {value}
        </Text>
        {unit ? (
          <Text variant="title" color="textSecondary" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
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
  },
  fill: {
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  unit: {
    paddingBottom: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    // Equal columns keep Time and Pace on a shared axis across all three
    // screens, instead of drifting with the width of their values.
    gap: spacing.lg,
  },
});
