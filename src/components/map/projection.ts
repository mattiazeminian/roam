import type { Coordinate } from '@/services/routing';

export type Point = { x: number; y: number };

export type GeoBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

/** Minimum span so a single point still projects to the center of the view. */
const MIN_SPAN = 0.0005;

export function boundsOf(coordinates: Coordinate[]): GeoBounds {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  for (const coordinate of coordinates) {
    minLat = Math.min(minLat, coordinate.latitude);
    maxLat = Math.max(maxLat, coordinate.latitude);
    minLon = Math.min(minLon, coordinate.longitude);
    maxLon = Math.max(maxLon, coordinate.longitude);
  }

  if (!Number.isFinite(minLat)) {
    return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
  }

  if (maxLat - minLat < MIN_SPAN) {
    const mid = (minLat + maxLat) / 2;
    minLat = mid - MIN_SPAN / 2;
    maxLat = mid + MIN_SPAN / 2;
  }
  if (maxLon - minLon < MIN_SPAN) {
    const mid = (minLon + maxLon) / 2;
    minLon = mid - MIN_SPAN / 2;
    maxLon = mid + MIN_SPAN / 2;
  }

  return { minLat, maxLat, minLon, maxLon };
}

/** Edge insets the map camera must keep clear of overlaying UI. */
export type MapInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Aspect-preserving equirectangular projection into a view of `width` x
 * `height`, fitted inside `insets`. Asymmetric insets let the camera keep the
 * route clear of a bottom surface. This stands in for a real map camera until a
 * map provider is added.
 */
export function project(
  coordinates: Coordinate[],
  bounds: GeoBounds,
  width: number,
  height: number,
  insets: MapInsets,
): Point[] {
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;

  const availableWidth = Math.max(1, width - insets.left - insets.right);
  const availableHeight = Math.max(1, height - insets.top - insets.bottom);
  const scale = Math.min(availableWidth / lonSpan, availableHeight / latSpan);

  const contentWidth = lonSpan * scale;
  const contentHeight = latSpan * scale;

  const offsetX = insets.left + (availableWidth - contentWidth) / 2;
  const offsetY = insets.top + (availableHeight - contentHeight) / 2;

  return coordinates.map((coordinate) => ({
    x: offsetX + (coordinate.longitude - bounds.minLon) * scale,
    y: offsetY + (bounds.maxLat - coordinate.latitude) * scale,
  }));
}
