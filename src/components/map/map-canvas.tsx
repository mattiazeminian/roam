import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import type { Camera as MapboxCamera } from '@rnmapbox/maps';

import type { Coordinate, RouteCandidate } from '@/services/routing';
import { useTheme } from '@/theme';

import { useMapPalette } from './map-palette';
import { MapSurface } from './map-surface';
import { boundsOf, type MapInsets } from './projection';
import { RouteOverlay } from './route-overlay';
import { SearchPulse } from './search-pulse';

type MapboxModule = typeof import('@rnmapbox/maps');

/**
 * Mapbox access token. Client-side public token, scoped to the app bundle id.
 * Supplied via `EXPO_PUBLIC_MAPBOX_TOKEN`; never hardcoded.
 */
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
/** Optional custom monochrome style, authored in Mapbox Studio. */
const MAPBOX_STYLE_URL = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? '';

/** The map is quiet and light so the route and the UI carry the contrast. */
const FALLBACK_STYLE = 'mapbox://styles/mapbox/light-v11';

/**
 * Mapbox is required lazily, and only when a token is configured. The native
 * module throws at import time when it is not linked (Expo Go, or a build that
 * predates the config plugin), so an eager `import` would crash the whole app.
 * With this guard, an unlinked or unconfigured environment falls back to the
 * placeholder map instead.
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
  origin: Coordinate | null;
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
  /** The runner's recorded GPS path, drawn during an active run. */
  track?: Coordinate[];
  /** The portion of the planned route already covered, drawn in the accent. */
  completedGeometry?: Coordinate[];
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
};

const DEFAULT_INSETS: MapInsets = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * The app's single map surface. Screens talk to `MapCanvas`; only this file
 * knows about Mapbox. When Mapbox is unavailable — no token, web, or a build
 * without the native module — it renders the placeholder map with the same
 * props, so no screen needs a special case.
 */
export function MapCanvas(props: MapCanvasProps) {
  const mapbox = getMapbox();
  if (!mapbox) {
    return <PlaceholderMap {...props} />;
  }
  return <MapboxCanvas mapbox={mapbox} {...props} />;
}

function PlaceholderMap({
  origin,
  routes,
  selectedRouteId,
  searching,
  recenterSignal,
  padding,
}: MapCanvasProps) {
  return (
    <MapSurface>
      {origin ? (
        <RouteOverlay
          origin={origin}
          routes={routes}
          selectedRouteId={selectedRouteId}
          searching={searching}
          recenterSignal={recenterSignal}
          padding={padding}
        />
      ) : null}
    </MapSurface>
  );
}

function MapboxCanvas({
  mapbox,
  origin,
  routes,
  selectedRouteId,
  searching = false,
  recenterSignal = 0,
  padding,
  cameraMode = 'center',
  track,
  completedGeometry,
  onFollowBroken,
  onOriginMoved,
}: MapCanvasProps & { mapbox: MapboxModule }) {
  const theme = useTheme();
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
  const styleURL = MAPBOX_STYLE_URL || FALLBACK_STYLE;

  // Frame every route, plus the origin. Runs only when the route set changes,
  // so selecting a different route never moves the camera.
  useEffect(() => {
    if (cameraMode !== 'fit' || routes.length === 0 || !mapReady) {
      return;
    }
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    const points = routes.flatMap((route) => route.geometry);
    const bounds = boundsOf(origin ? [origin, ...points] : points);
    camera.fitBounds(
      [bounds.maxLon, bounds.maxLat],
      [bounds.minLon, bounds.minLat],
      [insets.top, insets.right, insets.bottom, insets.left],
      500,
    );
  }, [cameraMode, routes, origin, insets, mapReady]);

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
      styleURL={styleURL}
      compassEnabled={false}
      scaleBarEnabled={false}
      pitchEnabled={false}
      onCameraChanged={handleCameraChanged}
      onDidFinishLoadingMap={() => setMapReady(true)}
      rotateEnabled
      scrollEnabled
      zoomEnabled>
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
            selectedColor={theme.accent}
            neutralColor={theme.textSecondary}
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
            selectedColor={theme.accent}
            neutralColor={theme.textSecondary}
          />
        ))}

      {/* The runner's actual movement, distinct from the planned line. */}
      {track && track.length >= 2 ? (
        <MapLine
          mapbox={mapbox}
          id="roam-run-track"
          points={track}
          color={theme.text}
          width={4}
          opacity={0.55}
        />
      ) : null}

      {/* The covered portion of the plan, drawn over it in the accent. */}
      {completedGeometry && completedGeometry.length >= 2 ? (
        <MapLine
          mapbox={mapbox}
          id="roam-run-progress"
          points={completedGeometry}
          color={theme.accent}
          width={6}
          opacity={1}
        />
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
          <LocationDot draggable />
        </mapbox.PointAnnotation>
      ) : origin ? (
        <mapbox.MarkerView
          coordinate={[origin.longitude, origin.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          allowOverlap>
          <LocationDot />
        </mapbox.MarkerView>
      ) : null}
    </mapbox.MapView>
  );
}

/**
 * One route on the map.
 *
 * Selection is carried by weight and opacity as well as color, so the chosen
 * route is still obvious without relying on hue. A casing in the map's own land
 * color sits under the line to separate it from the road network — the standard
 * cartographic treatment, and far cleaner on a dark map than the light-theme
 * halo this replaced.
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
  width,
  opacity,
}: {
  mapbox: MapboxModule;
  id: string;
  points: Coordinate[];
  color: string;
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
    </mapbox.ShapeSource>
  );
}

function LocationDot({ draggable = false }: { draggable?: boolean }) {
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
          { borderColor: draggable ? theme.accent : theme.textSecondary },
        ]}
      />
      <View style={[styles.markerDot, { backgroundColor: theme.accent, borderColor: theme.text }]} />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
