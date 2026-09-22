import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { radii, spacing, useAppearance, useTheme } from '@/theme';

export type FormField = {
  key: string;
  label: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  defaultValue?: string;
  /** An optional field does not block submission when empty. */
  optional?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
};

export type FormSheetProps = {
  title: string;
  message?: string;
  fields: FormField[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
};

/**
 * A small sheet for entering one or a few short facts.
 *
 * Deliberately Roam's own control rather than `Alert.prompt`: the system prompt
 * cannot be styled, cannot show more than one field, and looks nothing like the
 * rest of the app. The parent mounts this only while it is open, so the fields
 * always start from their defaults and there is no stale state to clear.
 */
export function FormSheet({
  title,
  message,
  fields,
  submitLabel = 'Save',
  onSubmit,
  onClose,
}: FormSheetProps) {
  const theme = useTheme();
  const scheme = useAppearance();
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.key] = field.defaultValue ?? '';
    }
    return initial;
  });
  const [focused, setFocused] = useState<string | null>(null);

  const canSubmit = fields.every(
    (field) => field.optional || (values[field.key]?.trim().length ?? 0) > 0,
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          {message ? (
            <Text variant="body" color="textSecondary">
              {message}
            </Text>
          ) : null}

          <View style={styles.fields}>
            {fields.map((field) => {
              const isFocused = focused === field.key;
              return (
                <View key={field.key} style={styles.field}>
                  <Text variant="micro" color="textSecondary">
                    {field.label.toUpperCase()}
                  </Text>
                  <TextInput
                    value={values[field.key] ?? ''}
                    onChangeText={(text) =>
                      setValues((current) => ({ ...current, [field.key]: text }))
                    }
                    placeholder={field.placeholder}
                    placeholderTextColor={theme.textDisabled}
                    keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
                    keyboardType={field.keyboardType}
                    maxLength={field.maxLength}
                    autoFocus={field.autoFocus}
                    onFocus={() => setFocused(field.key)}
                    onBlur={() => setFocused(null)}
                    accessibilityLabel={field.label}
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        backgroundColor: theme.background,
                        borderColor: isFocused ? theme.accentText : theme.border,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.grow} />
            <Button
              label={submitLabel}
              variant="accent"
              disabled={!canSubmit}
              onPress={() => onSubmit(values)}
              style={styles.grow}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radii.medium,
    borderTopRightRadius: radii.medium,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: radii.pill,
    marginBottom: spacing.xs,
  },
  fields: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  field: {
    gap: spacing.xxs,
  },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.sm,
    fontSize: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  grow: {
    flex: 1,
  },
});
