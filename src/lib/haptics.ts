import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Thin wrapper around expo-haptics so screens never call the library directly.
 * Haptics are physical confirmation for meaningful actions only — never for
 * decorative motion.
 */
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

function run(action: () => Promise<void>) {
  if (!supported) {
    return;
  }
  action().catch(() => {
    // Haptics are best-effort; ignore failures (e.g. unsupported hardware).
  });
}

export function selectionFeedback() {
  run(() => Haptics.selectionAsync());
}

export function impactLight() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function impactMedium() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function successFeedback() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
