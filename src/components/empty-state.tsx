import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { spacing } from '@/theme';

export type EmptyStateProps = {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  /** `center` fills and centres (a whole screen); `start` sits inline in a list. */
  align?: 'center' | 'start';
  style?: StyleProp<ViewStyle>;
};

/**
 * A designed empty state: what is missing, and the one way out (#137, #51).
 * Absence is stated plainly, never dressed up as a celebration.
 */
export function EmptyState({ title, body, action, align = 'center', style }: EmptyStateProps) {
  return (
    <View style={[align === 'center' ? styles.centered : styles.inline, style]}>
      <Text variant="title">{title}</Text>
      {body ? (
        <Text variant="body" color="textSecondary" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          variant="accent"
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  inline: {
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  body: {
    maxWidth: 280,
  },
  action: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
});
