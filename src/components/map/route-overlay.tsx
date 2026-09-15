import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { Coordinate, RouteCandidate } from '@/services/routing';
import { motion, spacing, useTheme } from '@/theme';

import { LocationMarker } from './location-marker';
import { boundsOf, project } from './projection';
import { RoutePath } from './route-path';
import { SearchPulse } from './search-pulse';

const MAP_PADDING = spacing.huge;

export type RouteOverlayProps = {
  origin: Coordinate;
  routes: RouteCandidate[];
  selectedRouteId?: string;
  onSelectRoute?: (id: string) => void;
  /** Show the expanding search radius while ROAM is finding routes. */
  searching?: boolean;
  /** Changing this value replays the location marker's entrance animation. */
  recenterSignal?: number;
};

/**
 * Projects route geometry into the map area and draws it. The selected route is
 * lime and dominant; the others are neutral and lighter. Also renders the
 * current-location marker and the search pulse.
 */
export function RouteOverlay({
  origin,
  routes,
  selectedRouteId,
  onSelectRoute,
  searching = false,
  recenterSignal = 0,
}: RouteOverlayProps) {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const bounds = useMemo(
    () => boundsOf([origin, ...routes.flatMap((route) => route.geometry)]),
    [origin, routes],
  );

  const projectedRoutes = useMemo(() => {
    if (size.width === 0 || size.height === 0) {
      return [];
    }
    return routes.map((route, index) => ({
      route,
      index,
      points: project(route.geometry, bounds, size.width, size.height, MAP_PADDING),
    }));
  }, [routes, bounds, size]);

  const originPoint = useMemo(() => {
    if (size.width === 0 || size.height === 0) {
      return null;
    }
    return project([origin], bounds, size.width, size.height, MAP_PADDING)[0];
  }, [origin, bounds, size]);

  // Render the selected route last so it sits on top.
  const ordered = [
    ...projectedRoutes.filter((entry) => entry.route.id !== selectedRouteId),
    ...projectedRoutes.filter((entry) => entry.route.id === selectedRouteId),
  ];

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}>
      {ordered.map(({ route, index, points }) => (
        <RoutePath
          key={route.id}
          points={points}
          inactiveColor={theme.textSecondary}
          activeColor={theme.accent}
          haloColor={theme.text}
          baseWidth={3}
          activeWidth={6}
          baseOpacity={0.45}
          activeOpacity={1}
          selected={route.id === selectedRouteId}
          drawDelayMs={index * motion.routeStaggerDuration}
          onPress={onSelectRoute ? () => onSelectRoute(route.id) : undefined}
        />
      ))}

      {searching && originPoint ? <SearchPulse x={originPoint.x} y={originPoint.y} /> : null}

      {originPoint ? (
        <LocationMarker x={originPoint.x} y={originPoint.y} replaySignal={recenterSignal} />
      ) : null}
    </View>
  );
}
