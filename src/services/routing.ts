/**
 * Routing service.
 *
 * The seam between ROAM and route generation. Screens depend only on the
 * `RouteCandidate` shape and `findRoutes`; nothing above this module knows that
 * OpenRouteService exists.
 *
 * Route data is never fabricated. Distance comes from the provider's own
 * summary, and geometry is the provider's polyline. When the provider cannot
 * produce routes, this module throws a `RoutingError` so the UI can explain
 * what happened instead of showing invented data.
 */

import { pathLengthMeters } from './geo';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type RouteCandidate = {
  id: string;
  /** Distance in kilometers, from the provider's route summary. */
  distanceKm: number;
  /** Running-time estimate derived from `PACE_MIN_PER_KM` (see below). */
  estimatedMinutes: number;
  /** Loop geometry as a closed list of coordinates (first === last). */
  geometry: Coordinate[];
  /** Short factual descriptors. Only values actually derived from the route. */
  characteristics: string[];
  /** Total climb in meters, when the provider returned elevation data. */
  ascentMeters?: number;
};

export type RouteRequest = {
  origin: Coordinate;
  targetKm: number;
  /** Minutes per kilometer used for the time estimate. See PACE_MIN_PER_KM. */
  paceMinPerKm?: number;
};

export type RoutingErrorCode =
  | 'missing-key'
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'no-routes'
  | 'invalid-origin';

/** A routing failure the UI is expected to explain to the user. */
export class RoutingError extends Error {
  readonly code: RoutingErrorCode;

  constructor(code: RoutingErrorCode, message: string) {
    super(message);
    this.name = 'RoutingError';
    this.code = code;
  }
}

const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY ?? '';
const ORS_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

/**
 * Pedestrian routing is the closest profile to running that ORS offers. Its
 * `summary.duration` is therefore a *walking* estimate, which would badly
 * overstate the time for a runner, so duration is derived from a running pace
 * instead of being read from the response.
 *
 * This is a stated assumption, not provider data. It defaults to a moderate
 * pace and is overridden by the runner's own setting.
 */
const PACE_MIN_PER_KM = 6.6;

/**
 * Each candidate is a separate round-trip request. ORS returns one loop per
 * call, and varying both the seed and the point count is what produces
 * genuinely different geometry rather than three near-identical loops.
 */
const CANDIDATE_VARIANTS = [
  { seed: 1, points: 4 },
  { seed: 7, points: 5 },
  { seed: 13, points: 6 },
] as const;

const REQUEST_TIMEOUT_MS = 20_000;

/** A coordinate is renderable only if it holds two finite, in-range numbers. */
export function isValidCoordinate(value: unknown): value is Coordinate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { latitude, longitude } = value as Coordinate;
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Defensive geometry cleanup: drop invalid coordinates and consecutive
 * duplicates, require at least a triangle, and close the loop. Returns an empty
 * array when nothing renderable remains, so the UI can fail gracefully.
 */
export function sanitizeGeometry(geometry: Coordinate[]): Coordinate[] {
  if (!Array.isArray(geometry)) {
    return [];
  }

  const cleaned: Coordinate[] = [];
  for (const point of geometry) {
    if (!isValidCoordinate(point)) {
      continue;
    }
    const previous = cleaned[cleaned.length - 1];
    if (previous && previous.latitude === point.latitude && previous.longitude === point.longitude) {
      continue;
    }
    cleaned.push({ latitude: point.latitude, longitude: point.longitude });
  }

  if (cleaned.length < 3) {
    return [];
  }

  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first.latitude !== last.latitude || first.longitude !== last.longitude) {
    cleaned.push({ latitude: first.latitude, longitude: first.longitude });
  }

  return cleaned;
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

type OrsFeature = {
  geometry?: { coordinates?: unknown };
  properties?: {
    summary?: { distance?: unknown; duration?: unknown; ascent?: unknown };
    ascent?: unknown;
  };
};

/** ORS returns positions as [longitude, latitude], the opposite of our model. */
function toCoordinates(raw: unknown): Coordinate[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const points: Coordinate[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }
    const [longitude, latitude] = entry;
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      continue;
    }
    points.push({ latitude, longitude });
  }
  return points;
}

async function requestLoop(
  origin: Coordinate,
  targetKm: number,
  variant: (typeof CANDIDATE_VARIANTS)[number],
): Promise<{ geometry: Coordinate[]; distanceM: number; ascentM?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ORS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: ORS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json',
      },
      body: JSON.stringify({
        coordinates: [[origin.longitude, origin.latitude]],
        elevation: true,
        options: {
          round_trip: {
            length: Math.round(targetKm * 1000),
            points: variant.points,
            seed: variant.seed,
          },
        },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new RoutingError('network', 'Could not reach the routing service.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw new RoutingError('auth', 'The routing API key was rejected.');
  }
  if (response.status === 429) {
    throw new RoutingError('rate-limit', 'Too many route requests. Try again shortly.');
  }
  if (!response.ok) {
    throw new RoutingError('network', 'The routing service returned an error.');
  }

  let payload: { features?: OrsFeature[] };
  try {
    payload = (await response.json()) as { features?: OrsFeature[] };
  } catch {
    throw new RoutingError('network', 'The routing service returned an unreadable response.');
  }

  const feature = payload.features?.[0];
  const geometry = sanitizeGeometry(toCoordinates(feature?.geometry?.coordinates));
  if (geometry.length < 4) {
    throw new RoutingError('no-routes', 'The routing service returned no usable loop.');
  }

  // Prefer the provider's own summary; fall back to measuring the returned
  // polyline so the displayed distance always describes the drawn geometry.
  const summaryDistance = feature?.properties?.summary?.distance;
  const distanceM =
    typeof summaryDistance === 'number' && Number.isFinite(summaryDistance) && summaryDistance > 0
      ? summaryDistance
      : pathLengthMeters(geometry);

  const rawAscent = feature?.properties?.ascent ?? feature?.properties?.summary?.ascent;
  const ascentM = typeof rawAscent === 'number' && Number.isFinite(rawAscent) ? rawAscent : undefined;

  return { geometry, distanceM, ascentM };
}

function describe(ascentMeters?: number): string[] {
  const characteristics = ['Loop'];
  if (typeof ascentMeters === 'number' && ascentMeters >= 10) {
    characteristics.push(`${Math.round(ascentMeters)} m climb`);
  }
  return characteristics;
}

/**
 * Find round-trip running routes of approximately `targetKm` starting and
 * ending at `origin`.
 *
 * Each variant is one request, issued in parallel. A partial failure still
 * yields routes; only a total failure throws.
 */
export async function findRoutes({
  origin,
  targetKm,
  paceMinPerKm = PACE_MIN_PER_KM,
}: RouteRequest): Promise<RouteCandidate[]> {
  if (!ORS_API_KEY) {
    throw new RoutingError(
      'missing-key',
      'No routing API key is configured. Add EXPO_PUBLIC_ORS_API_KEY.',
    );
  }
  if (!isValidCoordinate(origin)) {
    throw new RoutingError('invalid-origin', 'Your location is not available yet.');
  }
  if (!Number.isFinite(targetKm) || targetKm <= 0) {
    throw new RoutingError('no-routes', 'Choose a distance before finding routes.');
  }

  const settled = await Promise.allSettled(
    CANDIDATE_VARIANTS.map((variant) => requestLoop(origin, targetKm, variant)),
  );

  const routes: RouteCandidate[] = [];
  for (const [index, result] of settled.entries()) {
    if (result.status !== 'fulfilled') {
      continue;
    }
    const { geometry, distanceM, ascentM } = result.value;
    const distanceKm = roundTo(distanceM / 1000, 1);
    routes.push({
      id: `route-${index + 1}`,
      distanceKm,
      estimatedMinutes: Math.max(1, Math.round(distanceKm * paceMinPerKm)),
      geometry,
      characteristics: describe(ascentM),
      ascentMeters: ascentM,
    });
  }

  if (routes.length === 0) {
    // Surface the most specific failure rather than a generic one, so an
    // expired key or a rate limit is not reported as "no routes here".
    const firstError = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )?.reason;
    if (firstError instanceof RoutingError) {
      throw firstError;
    }
    throw new RoutingError('no-routes', 'No running loops were found near you.');
  }

  return routes;
}
