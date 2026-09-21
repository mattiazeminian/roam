import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/theme';

/**
 * The four destinations: Home, Routes, Record, Profile (#113, #116).
 *
 * Each destination is a nested stack (#119), so a secondary screen pushes
 * within its tab and the tab bar stays visible. Home is a group `(home)` so its
 * URL stays `/`.
 *
 * This is the platform's own tab bar, not a reimplementation — `NativeTabs`
 * renders a real `UITabBar`, so Roam inherits Apple's behaviour, materials,
 * accessibility and Liquid Glass treatment rather than imitating them. The tint
 * is near-black rather than the lime accent, because the lime is a fill colour
 * and fails contrast as a foreground on a light tab bar.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <NativeTabs
      // Near-black for the selected item and secondary ink for the rest, so the
      // active destination is unmistakable without the lime (which fails as a
      // foreground on a light bar). Keeping the bar solid at the scroll edge
      // avoids it going transparent mid-scroll.
      tintColor={theme.accentText}
      iconColor={{ default: theme.textSecondary, selected: theme.accentText }}
      labelStyle={{
        default: { color: theme.textSecondary },
        selected: { color: theme.accentText },
      }}
      disableTransparentOnScrollEdge>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* The folder stays `maps/` because `(tabs)/routes` would collide with
          the route-selection screen's own `/routes` URL. */}
      <NativeTabs.Trigger name="maps">
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'point.topleft.down.to.point.bottomright.curvepath',
            selected: 'point.topleft.down.to.point.bottomright.curvepath.fill',
          }}
        />
        <NativeTabs.Trigger.Label>Routes</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="record">
        <NativeTabs.Trigger.Icon sf={{ default: 'figure.run', selected: 'figure.run' }} />
        <NativeTabs.Trigger.Label>Record</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
