import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/theme';

/**
 * Home and History use the platform's native tab bar (UITabBar on iOS), which
 * provides the standard iOS interaction, safe-area handling and Liquid Glass
 * material on iOS 26. Route selection and the active run are pushed above this
 * group as full-screen screens.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <NativeTabs
      iconColor={{ default: theme.textSecondary, selected: theme.accent }}
      labelStyle={{
        default: { color: theme.textSecondary },
        selected: { color: theme.accent },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
