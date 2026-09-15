import { Tabs } from 'expo-router/js-tabs';

import { GlassTabBar } from '@/components/glass-tab-bar';
import { useTheme } from '@/theme';

/**
 * Home and History live in a native-glass tab bar. Route selection and the
 * active run are pushed above this group as full-screen screens.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.background },
        // The custom floating tab bar handles its own layout and insets.
        tabBarStyle: { height: 0 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}
