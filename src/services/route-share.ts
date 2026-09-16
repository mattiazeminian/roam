/**
 * Sharing a route as a link (#23).
 *
 * A route has to survive a trip through a URL, so the geometry is encoded with
 * the standard polyline algorithm rather than as JSON — the same encoding maps
 * and routing services use, roughly a tenth the size, and pure enough to test
 * without a device.
 *
 * The link carries only what reconstructs the route: distance, the estimate,
 * the factual labels, and the line itself. No identifier, no account, nothing
 * about the sender.
 */

import type { Coordinate, RouteCandidate } from './routing';

/** The app's URL scheme, matching `scheme` in app.json. */
const LINK_PREFIX = 'roam://shared-route?';

/** Polyline encoding works in units of 1e-5 degrees (~1.1 m). */
const PRECISION = 1e5;

function encodeNumber(value: number): string {
  // Zig-zag: small negatives become small positives.
  let remaining = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (remaining >= 0x20) {
    output += String.fromCharCode((0x20 | (remaining & 0x1f)) + 63);
    remaining >>= 5;
  }
  return output + String.fromCharCode(remaining + 63);
}

/** Google's polyline algorithm, as used by Google Maps and ORS. */
export function encodePolyline(points: Coordinate[]): string {
  let lastLatitude = 0;
  let lastLongitude = 0;
  let encoded = '';

  for (const point of points) {
    const latitude = Math.round(point.latitude * PRECISION);
    const longitude = Math.round(point.longitude * PRECISION);
    encoded += encodeNumber(latitude - lastLatitude);
    encoded += encodeNumber(longitude - lastLongitude);
    lastLatitude = latitude;
    lastLongitude = longitude;
  }

  return encoded;
}

/** The inverse of `encodePolyline`. Malformed input yields what was readable. */
export function decodePolyline(encoded: string): Coordinate[] {
  const points: Coordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      if (index >= encoded.length) {
        return points;
      }
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      if (!Number.isFinite(byte)) {
        return points;
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) {
        return points;
      }
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      if (!Number.isFinite(byte)) {
        return points;
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: latitude / PRECISION, longitude: longitude / PRECISION });
  }

  return points;
}

/** Builds the link a share sends. */
export function routeShareLink(route: RouteCandidate): string {
  const params = [
    `d=${route.distanceKm.toFixed(1)}`,
    `m=${Math.max(1, Math.round(route.estimatedMinutes))}`,
    `c=${encodeURIComponent(route.characteristics.join('|'))}`,
    `g=${encodeURIComponent(encodePolyline(route.geometry))}`,
  ];
  return `${LINK_PREFIX}${params.join('&')}`;
}

/** Query values as Expo Router hands them to a deep-linked screen. */
export type RouteShareParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Rebuilds a route from share parameters, or null when they are not ours or are
 * too damaged to draw. A route that cannot be reconstructed is refused rather
 * than shown with invented geometry.
 */
export function parseRouteShareParams(params: RouteShareParams): RouteCandidate | null {
  const distanceKm = Number(first(params.d));
  const geometry = decodePolyline(first(params.g) ?? '');
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || geometry.length < 2) {
    return null;
  }

  const estimate = Number(first(params.m));
  const characteristics = (first(params.c) ?? '').split('|').filter(Boolean);

  return {
    id: 'route-shared',
    distanceKm,
    estimatedMinutes:
      Number.isFinite(estimate) && estimate > 0 ? estimate : Math.round(distanceKm * 6.6),
    geometry,
    characteristics: characteristics.length > 0 ? characteristics : ['Loop'],
  };
}

/**
 * Rebuilds a route from a full link. Used for links arriving as a plain string;
 * a deep-linked screen already has the query parsed and can pass it straight to
 * `parseRouteShareParams`.
 */
export function parseRouteShareLink(url: string): RouteCandidate | null {
  if (typeof url !== 'string' || !url.startsWith(LINK_PREFIX)) {
    return null;
  }

  const params: RouteShareParams = {};
  for (const pair of url.slice(LINK_PREFIX.length).split('&')) {
    const separator = pair.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    try {
      params[key] = decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return parseRouteShareParams(params);
}
