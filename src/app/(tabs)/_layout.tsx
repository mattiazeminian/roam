import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/theme';

/**
 * The four destinations: Home, Maps, Record, Profile.
 *
 * This is the platform's own tab bar, not a reimplementation — `NativeTabs`
 * renders a real `UITabBar`, so ROAM inherits Apple's behaviour, materials,
 * accessibility and Liquid Glass treatment rather than imitating them. The tint
 * is the brand's dark green rather than the lime accent, because the lime is a
 * fill colour and fails contrast as a foreground on a light tab bar.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <NativeTabs tintColor={theme.accentText}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* The file stays `maps.tsx` because `(tabs)/routes.tsx` would collide
          with the route-selection screen's own `/routes` URL. */}
      <NativeTabs.Trigger name="maps">
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'point.topleft.down.to.point.bottomright.curvepath',
            selected: 'point.topleft.down.to.point.bottomright.curvepath.fill',
          }}
        />
        <NativeTabs.Trigger.Label>Routes</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
