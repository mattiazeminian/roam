import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import type { Camera as MapboxCamera } from '@rnmapbox/maps';

import { Text } from '@/components/text';
import type { Coordinate, RouteCandidate } from '@/services/routing';
import { useTheme } from '@/theme';

import { useMapPalette } from './map-palette';
import { buildMinimalMapStyle } from './map-style';
import { runEndpoints } from './endpoints';
import { boundsOf, type MapInsets } from './projection';
import { SearchPulse } from './search-pulse';

type MapboxModule = typeof import('@rnmapbox/maps');

/**
 * Mapbox access token. Client-side public token, scoped to the app bundle id.
 * Supplied via `EXPO_PUBLIC_MAPBOX_TOKEN`; never hardcoded.
 */
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
/** Optional custom monochrome style, authored in Mapbox Studio. */
const MAPBOX_STYLE_URL = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? '';

/**
 * Mapbox is required lazily, and only when a token is configured. The native
 * module throws at import time when it is not linked (Expo Go, or a build that
 * predates the config plugin), so an eager `import` would crash the whole app.
 * With this guard, an unlinked or unconfigured environment reports that the map
 * is unavailable instead.
 */
let cachedMapbox: MapboxModule | null | undefined;

function getMapbox(): MapboxModule | null {
  if (cachedMapbox !== undefined) {
    return cachedMapbox;
  }
  if (!MAPBOX_TOKEN || Platform.OS === 'web') {
    cachedMapbox = null;
    return cachedMapbox;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('@rnmapbox/maps') as MapboxModule;
    loaded.default.setAccessToken(MAPBOX_TOKEN);
    cachedMapbox = loaded;
  } catch {
    cachedMapbox = null;
  }
  return cachedMapbox;
}

export type MapCanvasProps = {
  /** The user's current location, or null while unavailable. */
  origin?: Coordinate | null;
  routes: RouteCandidate[];
  selectedRouteId?: string;
  /** Show the restrained search radius while routes are being found. */
  searching?: boolean;
  /** Changing this value recenters the camera on the current location. */
  recenterSignal?: number;
  /** Edge insets the camera keeps clear of overlaying UI. */
  padding?: Partial<MapInsets>;
  /**
   * `center` follows the location (Home), `fit` frames all routes (selection),
   * `follow` keeps the runner centered during an active run.
   */
  cameraMode?: 'center' | 'fit' | 'follow';
  /**
   * Whether the map answers gestures. A recorded run's map is a still picture
   * of where it went, not a surface to explore, so previews turn this off.
   */
  interactive?: boolean;
  /** The runner's recorded GPS path, drawn during an active run. */
  track?: Coordinate[];
  /** The portion of the planned route already covered, drawn in the accent. */
  completedGeometry?: Coordinate[];
  /**
   * Mark where the recorded track began and ended. A completed run's map is
   * about the run, not about where the runner is standing now, so it shows
   * start/finish instead of a "current location" dot.
   */
  showEndpoints?: boolean;
  /**
   * Called when the user pans away from the runner in `follow` mode, so the
   * screen can offer a recenter control instead of fighting the gesture.
   */
  onFollowBroken?: () => void;
  /**
   * Makes the origin marker draggable. Called with the coordinate it is
   * dropped on, so the start of a run can be placed by hand.
   */
  onOriginMoved?: (coordinate: Coordinate) => void;
  /** Editable waypoints, drawn as draggable pins when provided (#31). */
  waypoints?: Coordinate[];
  /** A tap on the map (edit mode): the coordinate that was tapped. */
  onMapPress?: (coordinate: Coordinate) => void;
  /** A waypoint pin was dragged to a new position. */
  onWaypointMoved?: (index: number, coordinate: Coordinate) => void;
  /**
   * Whether the camera should reframe when the routes change. False during
   * editing, so recalculating a route does not move the map under the runner's
   * finger on every drop.
   */
  autoFit?: boolean;
};

const DEFAULT_INSETS: MapInsets = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * The app's single map surface. Screens talk to `MapCanvas`; only this file
 * knows about Mapbox.
 *
 * When Mapbox is unavailable — no token, web, or a build without the native
 * module — it says so. An earlier version drew a plausible-looking placeholder
 * map instead, which made a misconfigured build look like a working one (#49).
 */
export function MapCanvas(props: MapCanvasProps) {
  const mapbox = getMapbox();
  if (!mapbox) {
    return <MapUnavailable />;
  }
  return <MapboxCanvas mapbox={mapbox} {...props} />;
}

function MapUnavailable() {
  const theme = useTheme();
  return (
    <View style={[styles.unavailable, { backgroundColor: theme.background }]}>
      <Text variant="caption" color="textSecondary" style={styles.unavailableText}>
        Map unavailable. Roam needs a Mapbox token and a development build.
      </Text>
    </View>
  );
}

function MapboxCanvas({
  mapbox,
  origin = null,
  routes,
  selectedRouteId,
  searching = false,
  recenterSignal = 0,
  padding,
  cameraMode = 'center',
  interactive = true,
  track,
  completedGeometry,
  showEndpoints = false,
  onFollowBroken,
  onOriginMoved,
  waypoints,
  onMapPress,
  onWaypointMoved,
  autoFit = true,
}: MapCanvasProps & { mapbox: MapboxModule }) {
  const map = useMapPalette();
  const cameraRef = useRef<MapboxCamera | null>(null);
  const didInitialCenter = useRef(false);
  const lastRecenterSignal = useRef(recenterSignal);
  /** Follow mode yields to the user: a pan suspends it until they recenter. */
  const following = useRef(true);
  /**
   * The camera can only be driven once the style has loaded. Without this the
   * first fit silently no-ops on a camera that is not mounted yet, and since
   * the effect only re-runs when the routes change it is never retried — which
   * leaves the map sitting at its default world view with the route as a speck.
   */
  const [mapReady, setMapReady] = useState(false);

  const insets = useMemo<MapInsets>(() => ({ ...DEFAULT_INSETS, ...padding }), [padding]);
  // A Studio style wins if configured; otherwise the app draws its own Minimal
  // basemap, generated from the same palette as the route and markers (#152).
  const styleJSON = useMemo(() => buildMinimalMapStyle(map), [map]);
  const endpoints = useMemo(
    () => (showEndpoints && track ? runEndpoints(track) : null),
    [showEndpoints, track],
  );

  // Frame the routes, the origin and any recorded track. Runs only when the
  // route set changes, so selecting a different route never moves the camera.
  // Including the track matters for a completed free run, which has no route
  // and would otherwise be framed to its last fix alone.
  useEffect(() => {
    if (cameraMode !== 'fit' || !mapReady || !autoFit) {
      return;
    }
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    const points = [
      ...routes.flatMap((route) => route.geometry),
      ...(track ?? []),
      ...(completedGeometry ?? []),
    ];
    if (points.length === 0) {
      // Nothing to frame yet. Rather than leave the map at the default world
      // view — which reads as "the map is broken", especially when routing
      // comes back empty — sit on the runner until there is geometry to fit.
      if (origin) {
        camera.setCamera({
          centerCoordinate: [origin.longitude, origin.latitude],
          zoomLevel: 14,
          animationDuration: 500,
        });
      }
      return;
    }
    const bounds = boundsOf(origin ? [origin, ...points] : points);
    camera.fitBounds(
      [bounds.maxLon, bounds.maxLat],
      [bounds.minLon, bounds.minLat],
      [insets.top, insets.right, insets.bottom, insets.left],
      500,
    );
  }, [cameraMode, routes, origin, insets, mapReady, autoFit, track, completedGeometry]);

  // Center on the location on first fix and when the locate control is used.
  // Later position updates never move the camera on their own.
  useEffect(() => {
    if (cameraMode !== 'center') {
      return;
    }
    const camera = cameraRef.current;
    if (!camera || !origin) {
      return;
    }
    const recentered = recenterSignal !== lastRecenterSignal.current;
    if (!didInitialCenter.current || recentered) {
      didInitialCenter.current = true;
      lastRecenterSignal.current = recenterSignal;
      camera.setCamera({
        centerCoordinate: [origin.longitude, origin.latitude],
        zoomLevel: 14,
        animationDuration: 500,
      });
    }
  }, [cameraMode, origin, recenterSignal]);

  // Follow the runner during an active run. Suspended while the user is
  // inspecting the map manually, and resumed by the recenter control.
  useEffect(() => {
    if (cameraMode !== 'follow' || !origin) {
      return;
    }
    if (recenterSignal !== lastRecenterSignal.current) {
      lastRecenterSignal.current = recenterSignal;
      following.current = true;
    }
    if (!following.current) {
      return;
    }
    cameraRef.current?.setCamera({
      centerCoordinate: [origin.longitude, origin.latitude],
      zoomLevel: 16,
      animationDuration: 600,
    });
  }, [cameraMode, origin, recenterSignal]);

  const handleCameraChanged = useCallback(
    (state: { gestures?: { isGestureActive?: boolean } }) => {
      if (cameraMode !== 'follow' || !state.gestures?.isGestureActive) {
        return;
      }
      if (following.current) {
        following.current = false;
        onFollowBroken?.();
      }
    },
    [cameraMode, onFollowBroken],
  );

  return (
    <mapbox.MapView
      style={[StyleSheet.absoluteFill, { backgroundColor: map.land }]}
      styleURL={MAPBOX_STYLE_URL || undefined}
      styleJSON={MAPBOX_STYLE_URL ? undefined : styleJSON}
      compassEnabled={false}
      scaleBarEnabled={false}
      pitchEnabled={false}
      onCameraChanged={handleCameraChanged}
      onDidFinishLoadingMap={() => setMapReady(true)}
      onPress={
        onMapPress
          ? (feature) => {
              const coordinates = (feature as { geometry?: { coordinates?: number[] } })
                ?.geometry?.coordinates;
              if (!coordinates || coordinates.length < 2) {
                return;
              }
              const [longitude, latitude] = coordinates;
              if (typeof longitude === 'number' && typeof latitude === 'number') {
                onMapPress({ latitude, longitude });
              }
            }
          : undefined
      }
      rotateEnabled={interactive}
      scrollEnabled={interactive}
      zoomEnabled={interactive}>
      <mapbox.Camera ref={cameraRef} />

      {/* Unselected routes first, so the selected one always draws on top
          regardless of the order the provider returned them in. */}
      {routes
        .filter((route) => route.id !== selectedRouteId)
        .map((route) => (
          <MapRouteLine
            key={route.id}
            mapbox={mapbox}
            route={route}
            selected={false}
            casingColor={map.routeCasing}
            selectedColor={map.routeActive}
            neutralColor={map.routeSecondary}
          />
        ))}
      {routes
        .filter((route) => route.id === selectedRouteId)
        .map((route) => (
          <MapRouteLine
            key={route.id}
            mapbox={mapbox}
            route={route}
            selected
            casingColor={map.routeCasing}
            selectedColor={map.routeActive}
            neutralColor={map.routeSecondary}
          />
        ))}

      {/* Editable waypoints (#31). PointAnnotation because only it supports
          dragging — the same trade-off already made for the origin pin. */}
      {waypoints?.map((waypoint, index) => (
        <mapbox.PointAnnotation
          key={`roam-waypoint-${index}`}
          id={`roam-waypoint-${index}`}
          coordinate={[waypoint.longitude, waypoint.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          draggable={onWaypointMoved !== undefined}
          onDragEnd={(payload) => {
            const coordinates = (payload as { geometry?: { coordinates?: number[] } })
              ?.geometry?.coordinates;
            if (!coordinates || coordinates.length < 2) {
              return;
            }
            const [longitude, latitude] = coordinates;
            if (typeof longitude === 'number' && typeof latitude === 'number') {
              onWaypointMoved?.(index, { latitude, longitude });
            }
          }}>
          <WaypointDot />
        </mapbox.PointAnnotation>
      ))}

      {/* The runner's actual movement, distinct from the planned line. */}
      {track && track.length >= 2 ? (
        <MapLine
          mapbox={mapbox}
          id="roam-run-track"
          points={track}
          color={map.track}
          casingColor={map.routeCasing}
          width={4}
          opacity={0.92}
        />
      ) : null}

      {/* The covered portion of the plan, drawn over it in the accent. */}
      {completedGeometry && completedGeometry.length >= 2 ? (
        <MapLine
          mapbox={mapbox}
          id="roam-run-progress"
          points={completedGeometry}
          color={map.completed}
          casingColor={map.routeCasing}
          width={5}
          opacity={1}
        />
      ) : null}

      {/* Where the run began and ended. A loop is one marker, not two stacked
          on the same spot. */}
      {endpoints?.loop ? (
        <mapbox.MarkerView
          coordinate={[endpoints.start.longitude, endpoints.start.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          allowOverlap>
          <StartFinishMarker role="loop" />
        </mapbox.MarkerView>
      ) : endpoints ? (
        <>
          <mapbox.MarkerView
            coordinate={[endpoints.start.longitude, endpoints.start.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap>
            <StartFinishMarker role="start" />
          </mapbox.MarkerView>
          <mapbox.MarkerView
            coordinate={[endpoints.finish.longitude, endpoints.finish.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap>
            <StartFinishMarker role="finish" />
          </mapbox.MarkerView>
        </>
      ) : null}

      {searching && origin ? (
        <mapbox.MarkerView
          coordinate={[origin.longitude, origin.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          allowOverlap>
          <View style={styles.pulse} pointerEvents="none">
            <SearchPulse x={70} y={70} />
          </View>
        </mapbox.MarkerView>
      ) : null}

      {origin && onOriginMoved ? (
        // PointAnnotation rather than MarkerView: only it supports dragging.
        // It is heavier, so it is used only where the pin is actually movable.
        <mapbox.PointAnnotation
          id="roam-origin-pin"
          coordinate={[origin.longitude, origin.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          draggable
          onDragEnd={(payload) => {
            const coordinates = (payload as { geometry?: { coordinates?: number[] } })?.geometry
              ?.coordinates;
            if (!coordinates || coordinates.length < 2) {
              return;
            }
            const [longitude, latitude] = coordinates;
            if (typeof longitude === 'number' && typeof latitude === 'number') {
              onOriginMoved({ latitude, longitude });
            }
          }}>
          <LocationDot draggable ringColor={map.locationRing} />
        </mapbox.PointAnnotation>
      ) : origin ? (
        <mapbox.MarkerView
          coordinate={[origin.longitude, origin.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          allowOverlap>
          <LocationDot ringColor={map.locationRing} />
        </mapbox.MarkerView>
      ) : null}
    </mapbox.MapView>
  );
}

/**
 * One route on the map.
 *
 * Selection is carried by weight and opacity as well as color, so the chosen
 * route is still obvious without relying on hue. A dark-green casing sits under
 * the line to give the lime an edge against the light land — the route stays
 * accented without the light halo this replaced. See docs/map-style.md.
 */
function MapRouteLine({
  mapbox,
  route,
  selected,
  casingColor,
  selectedColor,
  neutralColor,
}: {
  mapbox: MapboxModule;
  route: RouteCandidate;
  selected: boolean;
  casingColor: string;
  selectedColor: string;
  neutralColor: string;
}) {
  const shape = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: route.geometry.map((point) => [point.longitude, point.latitude]),
      },
    }),
    [route],
  );

  return (
    <mapbox.ShapeSource id={`roam-route-${route.id}`} shape={shape}>
      <mapbox.LineLayer
        id={`roam-route-${route.id}-casing`}
        style={{
          lineColor: casingColor,
          lineWidth: selected ? 10 : 6,
          lineOpacity: selected ? 0.9 : 0.6,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <mapbox.LineLayer
        id={`roam-route-${route.id}-line`}
        style={{
          lineColor: selected ? selectedColor : neutralColor,
          lineWidth: selected ? 5 : 2.5,
          lineOpacity: selected ? 1 : 0.65,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </mapbox.ShapeSource>
  );
}

/** A single styled polyline. Shared by the planned route, track and progress. */
function MapLine({
  mapbox,
  id,
  points,
  color,
  casingColor,
  width,
  opacity,
}: {
  mapbox: MapboxModule;
  id: string;
  points: Coordinate[];
  color: string;
  casingColor?: string;
  width: number;
  opacity: number;
}) {
  const shape = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: points.map((point) => [point.longitude, point.latitude]),
      },
    }),
    [points],
  );

  return (
    <mapbox.ShapeSource id={`${id}-source`} shape={shape}>
      <>
        {casingColor ? (
          <mapbox.LineLayer
            id={`${id}-casing`}
            style={{
              lineColor: casingColor,
              lineWidth: width + 3,
              lineOpacity: opacity * 0.75,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ) : null}
        <mapbox.LineLayer
          id={id}
          style={{
            lineColor: color,
            lineWidth: width,
            lineOpacity: opacity,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      </>
    </mapbox.ShapeSource>
  );
}

function LocationDot({ draggable = false, ringColor }: { draggable?: boolean; ringColor?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={draggable ? 'Start point. Drag to move.' : 'Your current location'}
      // A draggable pin is bigger and carries a ring in the accent, so it reads
      // as something you can grab rather than as a read-only position dot.
      style={draggable ? styles.markerDraggable : styles.marker}
      pointerEvents="none">
      <View
        style={[
          draggable ? styles.markerRingDraggable : styles.markerRing,
          { borderColor: draggable ? theme.accent : ringColor ?? theme.textSecondary },
        ]}
      />
      <View style={[styles.markerDot, { backgroundColor: theme.accent, borderColor: theme.text }]} />
    </View>
  );
}

/**
 * A draggable waypoint handle. Deliberately a rounded square rather than the
 * origin's circle, so "a point on the route" and "where the run starts" cannot
 * be confused at a glance.
 */
function WaypointDot() {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Route point. Drag to move."
      style={styles.markerDraggable}
      pointerEvents="none">
      <View style={[styles.waypointRing, { borderColor: theme.accent }]} />
      <View
        style={[
          styles.waypointCore,
          { backgroundColor: theme.background, borderColor: theme.accent },
        ]}
      />
    </View>
  );
}

/**
 * A completed run's start and finish. Start is a filled dot, finish is a hollow
 * ring, so the two are distinct by shape and fill rather than colour alone; a
 * loop is marked once, as both.
 */
function StartFinishMarker({ role }: { role: 'start' | 'finish' | 'loop' }) {
  const theme = useTheme();
  const label =
    role === 'start' ? 'Start' : role === 'finish' ? 'Finish' : 'Start and finish. Closed loop.';
  return (
    <View accessible accessibilityLabel={label} style={styles.endpoint} pointerEvents="none">
      <View style={[styles.endpointRing, { borderColor: theme.text }]} />
      <View
        style={[
          role === 'finish' ? styles.endpointFinish : styles.endpointStart,
          {
            backgroundColor: role === 'finish' ? theme.background : theme.accent,
            borderColor: theme.text,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  unavailable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  unavailableText: {
    textAlign: 'center',
    maxWidth: 260,
  },
  pulse: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerRing: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
  },
  markerDraggable: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerRingDraggable: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  waypointRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
  },
  waypointCore: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 2,
  },
  endpoint: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endpointRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  endpointStart: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  // A hollow ring for the finish: same footprint, no fill, so it cannot be
  // mistaken for the start at a glance.
  endpointFinish: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
});
