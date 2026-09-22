import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { radii, spacing, useTheme } from '@/theme';

export type ActionSheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

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

  return (
    <Modal
      visible={visible}
      transparent
      // Keep the overlay in the same window layer as the app. Native modal
      // transitions animate the transparent root itself, which makes the
      // scrim visibly rise from the bottom before the sheet is settled.
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
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              borderColor: theme.borderSubtle,
              paddingBottom: insets.bottom + spacing.lg,
            },
          ]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text variant="title">{title}</Text>
          {message ? <Text variant="body" color="textSecondary">{message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((action) => (
              <Button
                key={action.label}
                label={action.label}
                variant={action.destructive ? 'secondary' : 'primary'}
                destructive={action.destructive}
                disabled={action.disabled}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
              />
            ))}
            <Button label="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill },
  sheet: {
    borderTopLeftRadius: radii.medium,
    borderTopRightRadius: radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: radii.pill },
  actions: { gap: spacing.xs, marginTop: spacing.xs },
});
