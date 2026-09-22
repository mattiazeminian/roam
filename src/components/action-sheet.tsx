import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { radii, spacing, useTheme } from '@/theme';

export type ActionSheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * A native-style action sheet (#action sheet polish).
 *
 * A titled group of full-width rows on an elevated surface, with the destructive
 * action in the danger ink, and Cancel as its own group below — the shape iOS
 * uses, rather than a stack of pill buttons. Rows are separated by hairlines so
 * the sheet reads as a list of choices, not as primary actions.
 */
export function ActionSheet({
  visible,
  title,
  message,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const hasHeader = Boolean(title || message);

  return (
    <Modal
      visible={visible}
      transparent
      // Keep the overlay in the same window layer as the app. Native modal
      // transitions animate the transparent root itself, which makes the scrim
      // visibly rise from the bottom before the sheet is settled.
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

        <View style={[styles.container, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View
            style={[
              styles.group,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle },
            ]}>
            {hasHeader ? (
              <View style={[styles.header, { borderBottomColor: theme.divider }]}>
                {title ? (
                  <Text variant="heading" style={styles.center}>
                    {title}
                  </Text>
                ) : null}
                {message ? (
                  <Text variant="caption" color="textSecondary" style={styles.center}>
                    {message}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {actions.map((action, index) => (
              <Pressable
                key={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                disabled={action.disabled}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: action.disabled }}
                style={({ pressed }) => [
                  styles.action,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.divider },
                  action.disabled && styles.disabled,
                  pressed && !action.disabled && { backgroundColor: theme.fill },
                ]}>
                <Text
                  variant="body"
                  color={action.destructive ? 'danger' : 'text'}
                  style={styles.center}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => [
              styles.group,
              styles.cancel,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle },
              pressed && { backgroundColor: theme.fill },
            ]}>
            <Text variant="heading" style={styles.center}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  container: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  group: {
    borderRadius: radii.large,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  action: {
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  cancel: {
    minHeight: 56,
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
});
