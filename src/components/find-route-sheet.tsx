import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ControlPanel } from '@/components/control-panel';
import { DistanceControl } from '@/components/distance-control';
import { Text } from '@/components/text';
import { layout, spacing, useTheme } from '@/theme';

export type FindRouteSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Where the route starts, and the way to change it. */
  startLabel: string;
  hasCustomStart: boolean;
  onChangeStart: () => void;
  /** Where it ends, or null for a loop. */
  finishLabel: string | null;
  onChangeFinish: () => void;
  onClearFinish: () => void;
  distanceKm: number;
  onChangeDistance: (km: number) => void;
  /** A search is in flight. */
  busy: boolean;
  errorMessage: string | null;
  onSubmit: () => void;
};

/**
 * The route choices, in a sheet rather than on the screen.
 *
 * Choosing a route is a decision, not a destination, so it should not occupy
 * the surface a runner opens the app on. Both Home and Maps present the same
 * choices, so the sheet lives here rather than being written twice.
 */
export function FindRouteSheet({
  visible,
  onClose,
  startLabel,
  hasCustomStart,
  onChangeStart,
  finishLabel,
  onChangeFinish,
  onClearFinish,
  distanceKm,
  onChangeDistance,
  busy,
  errorMessage,
  onSubmit,
}: FindRouteSheetProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
      />
      <View style={styles.anchor}>
        <ControlPanel style={styles.sheet}>
          <View style={styles.header}>
            <Text variant="title">Find a route</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={spacing.sm}>
              <Text variant="body" color="accentText">
                Close
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onChangeStart}
            accessibilityRole="button"
            accessibilityLabel={`Starting from ${startLabel}. Change starting point.`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <SymbolView
              name={hasCustomStart ? 'mappin.circle.fill' : 'location.fill'}
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
            <Text variant="label" color="textTertiary" numberOfLines={1} style={styles.rowLabel}>
              {startLabel}
            </Text>
            <SymbolView
              name="chevron.right"
              size={layout.iconSizeSmall}
              tintColor={theme.textSecondary}
            />
          </Pressable>

          <DistanceControl valueKm={distanceKm} onChange={onChangeDistance} disabled={busy} />

          <View style={styles.finishRow}>
            <Pressable
              onPress={onChangeFinish}
              accessibilityRole="button"
              accessibilityLabel={
                finishLabel
                  ? `Finishing at ${finishLabel}. Change finish point.`
                  : 'Loop, finishing back where you started. Choose a finish point.'
              }
              style={({ pressed }) => [styles.row, styles.finishTarget, pressed && styles.pressed]}>
              <SymbolView
                name={finishLabel ? 'flag' : 'arrow.triangle.2.circlepath'}
                size={layout.iconSizeSmall}
                tintColor={theme.textSecondary}
              />
              <Text variant="label" color="textTertiary" numberOfLines={1} style={styles.rowLabel}>
                {finishLabel ? `Finish · ${finishLabel}` : 'Loop · back to start'}
              </Text>
              <SymbolView
                name="chevron.right"
                size={layout.iconSizeSmall}
                tintColor={theme.textSecondary}
              />
            </Pressable>
            {finishLabel ? (
              <Pressable
                onPress={onClearFinish}
                accessibilityRole="button"
                accessibilityLabel="Make it a loop instead"
                hitSlop={spacing.sm}
                style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
                <SymbolView
                  name="xmark.circle.fill"
                  size={layout.iconSizeSmall}
                  tintColor={theme.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>

          {errorMessage ? (
            <Text variant="label" color="textSecondary" accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
          ) : null}

          <Button
            label={busy ? 'Finding your way' : errorMessage ? 'Try again' : 'Find routes'}
            variant="accent"
            onPress={onSubmit}
            disabled={busy}
            loading={busy}
          />
        </ControlPanel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14, 15, 12, 0.25)',
  },
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouchTarget,
    marginBottom: -spacing.xs,
  },
  rowLabel: {
    flex: 1,
  },
  finishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  finishTarget: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
