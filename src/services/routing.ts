/**
 * Routing service.
 *
 * This module is the seam between ROAM and route generation. Today it returns
 * deterministic mock loops; later a real routing service (e.g. Mapbox) can
 * replace `findRoutes` without changing the screens, which only depend on the
 * `RouteCandidate` shape and the `generateRoutes` / `findRoutes` functions.
 */

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type RouteCandidate = {
  id: string;
  distanceKm: number;
  estimatedMinutes: number;
  /** Loop geometry as a closed list of coordinates (first === last). */
  geometry: Coordinate[];
  characteristics: string[];
};

export type RouteRequest = {
  origin: Coordinate;
  targetKm: number;
};

/**
 * Placeholder current location until real location services are added.
 * (Lisbon — an arbitrary, well-known coordinate.)
 */
export const MOCK_ORIGIN: Coordinate = {
  latitude: 38.7223,
  longitude: -9.1393,
};

/** Mock service latency, in milliseconds. */
const MOCK_GENERATION_DELAY_MS = 700;

/** Assumed pace used to derive an estimated duration. */
const PACE_MIN_PER_KM = 6.6;

const ROUTE_VARIANTS = [
  { factor: 1.02, characteristics: ['Loop', 'Quiet streets'] },
  { factor: 1.08, characteristics: ['Loop', 'Riverside'] },
  { factor: 0.96, characteristics: ['Loop', 'Low traffic'] },
] as const;

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;

/** Used when a caller passes an unusable target distance. */
const FALLBACK_TARGET_KM = 5;

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

/** Small deterministic PRNG so the same request yields the same routes. */
function createRandom(seed: number) {
  let state = Math.floor(seed) % 2_147_483_647;
  if (state <= 0) {
    state += 2_147_483_646;
  }
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Local planar offset (meters) converted back to a coordinate. */
function offsetCoordinate(origin: Coordinate, eastMeters: number, northMeters: number): Coordinate {
  const latitude = origin.latitude + northMeters / METERS_PER_DEGREE_LAT;
  const longitude =
    origin.longitude + eastMeters / (METERS_PER_DEGREE_LAT * Math.cos(toRadians(origin.latitude)));
  return { latitude, longitude };
}

function haversineMeters(a: Coordinate, b: Coordinate) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function loopLengthMeters(points: Coordinate[]) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += haversineMeters(points[i], points[i + 1]);
  }
  return total;
}

/**
 * Build an irregular closed loop around the origin whose perimeter approximates
 * the requested distance. Pure and deterministic for a given seed.
 */
function generateLoop(origin: Coordinate, targetKm: number, seed: number): Coordinate[] {
  const random = createRandom(seed);
  const vertexCount = 8;

  const offsets: { east: number; north: number }[] = [];
  for (let i = 0; i < vertexCount; i += 1) {
    const angle = (i / vertexCount) * Math.PI * 2 + (random() - 0.5) * 0.35;
    const radius = 600 * (0.75 + random() * 0.5);
    offsets.push({ east: Math.cos(angle) * radius, north: Math.sin(angle) * radius });
  }
  offsets.push(offsets[0]);

  const unscaled = offsets.map((offset) => offsetCoordinate(origin, offset.east, offset.north));
  const perimeter = loopLengthMeters(unscaled) || 1;
  const scale = (targetKm * 1000) / perimeter;

  return offsets.map((offset) =>
    offsetCoordinate(origin, offset.east * scale, offset.north * scale),
  );
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Pure, synchronous route generation. Used directly by the Route Selection
 * screen (deterministic, so it matches the result produced by `findRoutes`).
 */
export function generateRoutes({ origin, targetKm }: RouteRequest): RouteCandidate[] {
  const target = Number.isFinite(targetKm) && targetKm > 0 ? targetKm : FALLBACK_TARGET_KM;
  const safeOrigin = isValidCoordinate(origin) ? origin : MOCK_ORIGIN;
  const baseSeed = Math.round(target * 1000);

  return ROUTE_VARIANTS.map((variant, index) => {
    const rawKm = roundTo(target * variant.factor, 1);
    const distanceKm = Number.isFinite(rawKm) && rawKm > 0 ? rawKm : target;
    const geometry = sanitizeGeometry(generateLoop(safeOrigin, distanceKm, baseSeed + index * 97));

    return {
      id: `route-${index + 1}`,
      distanceKm,
      estimatedMinutes: Math.max(1, Math.round(distanceKm * PACE_MIN_PER_KM)),
      geometry,
      characteristics: [...variant.characteristics],
    };
  }).filter((route) => route.geometry.length >= 4);
}

let lastResult: { targetKm: number; routes: RouteCandidate[] } | null = null;

/**
 * Replaceable async seam. A real implementation would call a routing API here.
 */
export async function findRoutes(request: RouteRequest): Promise<RouteCandidate[]> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_GENERATION_DELAY_MS));
  const routes = generateRoutes(request);
  lastResult = { targetKm: request.targetKm, routes };
  return routes;
}

/** Returns the most recent result when it matches the requested distance. */
export function getLastRoutes(targetKm: number): RouteCandidate[] | null {
  if (!lastResult || Math.abs(lastResult.targetKm - targetKm) > 0.001) {
    return null;
  }
  return lastResult.routes;
}
