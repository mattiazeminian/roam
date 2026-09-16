/**
 * Place search.
 *
 * Wraps Mapbox forward geocoding so screens never call the API directly. Used
 * to start a run somewhere other than where you are standing.
 */

import type { Coordinate } from './routing';

export type Place = {
  id: string;
  /** Short name, e.g. "Central Park". */
  name: string;
  /** Disambiguating context, e.g. "New York, New York, United States". */
  context: string;
  coordinate: Coordinate;
};

export type GeocodingErrorCode = 'missing-key' | 'network' | 'no-results';

export class GeocodingError extends Error {
  readonly code: GeocodingErrorCode;

  constructor(code: GeocodingErrorCode, message: string) {
    super(message);
    this.name = 'GeocodingError';
    this.code = code;
  }
}

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/forward';
const REVERSE_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/reverse';
const REQUEST_TIMEOUT_MS = 10_000;

type Feature = {
  id?: unknown;
  properties?: {
    mapbox_id?: unknown;
    name?: unknown;
    place_formatted?: unknown;
    full_address?: unknown;
    coordinates?: { longitude?: unknown; latitude?: unknown };
  };
};

/**
 * Name the place at a coordinate.
 *
 * Used after the start pin is dragged, so the chosen point gets a real label
 * instead of a pair of numbers. Returns null rather than throwing: a moved pin
 * is still perfectly usable without a name, so this must never block it.
 */
export async function describeCoordinate(coordinate: Coordinate): Promise<string | null> {
  if (!MAPBOX_TOKEN) {
    return null;
  }

  const params = new URLSearchParams({
    longitude: String(coordinate.longitude),
    latitude: String(coordinate.latitude),
    limit: '1',
    access_token: MAPBOX_TOKEN,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${REVERSE_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { features?: Feature[] };
    const name = payload.features?.[0]?.properties?.name;
    return typeof name === 'string' && name.length > 0 ? name : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Search for places matching `query`.
 *
 * `near` biases results towards the runner rather than returning the most
 * famous match globally — searching "park" should surface the one down the
 * road first.
 */
export async function searchPlaces(
  query: string,
  near?: Coordinate | null,
  signal?: AbortSignal,
): Promise<Place[]> {
  if (!MAPBOX_TOKEN) {
    throw new GeocodingError('missing-key', 'Place search is not configured.');
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    limit: '6',
    access_token: MAPBOX_TOKEN,
  });
  if (near) {
    params.set('proximity', `${near.longitude},${near.latitude}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Abort either when the caller cancels (a newer keystroke) or on timeout.
  signal?.addEventListener('abort', () => controller.abort());

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: controller.signal });
  } catch {
    throw new GeocodingError('network', 'Could not reach place search.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new GeocodingError('network', 'Place search returned an error.');
  }

  let payload: { features?: Feature[] };
  try {
    payload = (await response.json()) as { features?: Feature[] };
  } catch {
    throw new GeocodingError('network', 'Place search returned an unreadable response.');
  }

  const places: Place[] = [];
  for (const [index, feature] of (payload.features ?? []).entries()) {
    const properties = feature.properties ?? {};
    const longitude = properties.coordinates?.longitude;
    const latitude = properties.coordinates?.latitude;
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      continue;
    }
    const name = typeof properties.name === 'string' ? properties.name : null;
    if (!name) {
      continue;
    }
    places.push({
      id: typeof properties.mapbox_id === 'string' ? properties.mapbox_id : `place-${index}`,
      name,
      context:
        typeof properties.place_formatted === 'string'
          ? properties.place_formatted
          : typeof properties.full_address === 'string'
            ? properties.full_address
            : '',
      coordinate: { latitude, longitude },
    });
  }

  return places;
}
