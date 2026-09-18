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
import { analyzeRoute, scoreRoute } from './route-quality';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type RouteCandidate = {
  id: string;
  /** Distance in kilometers, from the provider's route summary. */
  distanceKm: number;
  /** Running-time estimate derived from the runner's pace setting (or a default). */
  estimatedMinutes: number;
  /** Loop geometry as a closed list of coordinates (first === last). */
  geometry: Coordinate[];
  /** Short factual descriptors. Only values actually derived from the route. */
  characteristics: string[];
  /** Total climb in meters, when the provider returned elevation data. */
  ascentMeters?: number;
  /**
   * Structured path attributes from the provider's per-segment data (#14).
   * Separate from `characteristics`, which is the human-readable projection of
   * these. Absent when the provider returned no path data at all.
   */
  attributes?: RouteAttributes;
  /**
   * Ordered intermediate points the route was recalculated through (#16).
   * Additive: a route generated without them has none, and every existing
   * consumer keeps working. The start/finish are not included — `geometry`
   * already begins and ends at them.
   */
  waypoints?: Coordinate[];
  /**
   * Where a one-way route ends (#17). Absent on a loop, which is the default:
   * `geometry` closing on its own start is what "loop" means here.
   */
  finish?: Coordinate;
};

/**
 * Factual, per-segment attributes derived from the provider's own path data
 * (ORS `extra_info`). Each percentage is of total route distance, and `null`
 * means the provider did not return usable data for that dimension — never
 * inferred, and never defaulted to zero, because "unknown" and "none" are
 * different claims.
 */
export type RouteAttributes = {
  /** Percent on pedestrian ways: footway, path, track, steps, cycleway. */
  footwayPercent: number | null;
  /** Percent on roads and streets: state road, road, street. */
  roadPercent: number | null;
  /** Percent on a recognised unsealed surface: gravel, dirt, grass, sand, … */
  unpavedPercent: number | null;
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
  | 'invalid-origin'
  /** The waypoint list for a recalculation was empty or wholly invalid (#16). */
  | 'invalid-waypoints'
  /** Every candidate produced was rejected by the hard tolerance ceiling —
   *  distinct from `no-routes`, where the provider produced nothing at all. */
  | 'no-close-route';

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

/** How many candidates a search ultimately returns. */
const CANDIDATE_COUNT = 3;

/**
 * Point counts ORS's `round_trip` accepts without changing the loop's
 * character too much. Trimmed from an original `[4..8]` after measurement: a
 * live sweep at fixed request lengths (3 seeds per point count, 3 km and 5 km
 * targets) showed overshoot growing with point count —
 *
 *   points=4  → average +9%  over the requested length
 *   points=5  → average +10%
 *   points=6  → average +12%
 *   points=7  → average +19%
 *   points=8  → average +20%
 *
 * — consistent with how ORS's round-trip algorithm works: each point is a
 * real via-point the router must physically reach through the street network,
 * so more points means more real-world detours compounding on top of each
 * other, not just a more circular *shape*. 8 was cut entirely; 4–7 keeps
 * meaningful variety while capping the worst of this effect.
 */
const POINT_COUNT_RANGE = [4, 5, 6, 7] as const;

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Build a fresh, randomised set of request variants for one search.
 *
 * This used to be a fixed constant (`seed: 1, 7, 13`), which meant the same
 * origin and distance always returned the exact same three loops — directly
 * against ROAM's "run somewhere new" promise (see issue #7). Randomising the
 * seed and point count per call fixes that, while keeping point counts
 * bounded and distinct within the one request so the resulting candidates
 * stay comparable in quality to each other.
 */
export function randomVariants(count: number): { seed: number; points: number }[] {
  const points = shuffle([...POINT_COUNT_RANGE]).slice(0, count);
  return points.map((pointCount) => ({ seed: randomSeed(), points: pointCount }));
}

/** ORS accepts any integer seed; this range is comfortably within it. */
function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * A variant for the second pass, distinct from ones already used this search
 * where possible. Bounded rather than looping until success: with 5 point
 * counts and normally 3 already used, an unused one is found almost
 * immediately, but nothing here should be able to hang the search.
 */
function pickUnusedVariant(
  usedSeeds: ReadonlySet<number>,
  usedPoints: ReadonlySet<number>,
  maxAttempts = 10,
): { seed: number; points: number } {
  let candidate = randomVariants(1)[0];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!usedSeeds.has(candidate.seed) && !usedPoints.has(candidate.points)) {
      return candidate;
    }
    candidate = randomVariants(1)[0];
  }
  return candidate;
}

/**
 * ORS's `round_trip.length` is a *preferred* value, not a target it honours
 * closely — measured against the live API (27 requests: 3 locations of
 * different character — dense Manhattan grid, park-heavy London suburb,
 * sparse rural Tuscany network — × 3 distances × 3 seeds, see issue #7), the
 * returned distance overshot the request in 25 of 27 cases:
 *
 *   ~3 km target  → average +11.0% over
 *   ~5 km target  → average +8.9% over
 *   ~10 km target → average +18.1% over
 *
 * The bias grows with distance but not cleanly linearly on this sample, so
 * distance is bucketed into tiers rather than fit to a curve that would claim
 * more precision than 27 samples support. Each tier is one named, adjustable
 * constant — revisit with a larger sample before trusting it much beyond
 * these ranges. `factor` is what the *requested* length is multiplied by
 * before asking ORS, so a factor of 0.90 means "ask for 90% of what the
 * runner wants, because this provider tends to hand back more than it's given."
 */
const DISTANCE_CORRECTION_TIERS = [
  { maxKm: 4, factor: 0.9 },
  { maxKm: 7, factor: 0.92 },
  { maxKm: Infinity, factor: 0.85 },
] as const;

export function correctionFactorFor(targetKm: number): number {
  const tier =
    DISTANCE_CORRECTION_TIERS.find((candidate) => targetKm <= candidate.maxKm) ??
    DISTANCE_CORRECTION_TIERS[DISTANCE_CORRECTION_TIERS.length - 1];
  return tier.factor;
}

/**
 * A candidate counts as matching the request if it lands within the greater
 * of a relative and an absolute tolerance — a flat percentage alone would be
 * unreasonably tight for a short loop and unreasonably loose for a long one.
 */
const RELATIVE_TOLERANCE = 0.15;
const ABSOLUTE_TOLERANCE_M = 500;

export function toleranceMetersFor(targetM: number): number {
  return Math.max(targetM * RELATIVE_TOLERANCE, ABSOLUTE_TOLERANCE_M);
}

export function isWithinTolerance(distanceM: number, targetM: number): boolean {
  return Math.abs(distanceM - targetM) <= toleranceMetersFor(targetM);
}

/**
 * A hard ceiling, distinct from the soft tolerance above: this is the line
 * between "not a great match" and "not the same request at all."
 *
 * Live testing surfaced a failure mode the soft tolerance was never meant to
 * catch: ORS's round-trip algorithm occasionally lands a via-point somewhere
 * the pedestrian network can't reach directly (observed live: a 7 km request
 * came back as **724 km**, twice, independently, at two different point
 * counts, with the same seed — almost certainly a via-point across water
 * forcing a bridge detour in a city built on islands and rivers). A global
 * correction factor cannot fix that; only rejecting the result can. A soft
 * miss should still be shown, labelled honestly — a hard miss must never
 * reach the runner as if it were a real candidate for their request.
 *
 * Wider than the soft tolerance on purpose: this only exists to catch results
 * that are not recognisably the same request, e.g. a 6 km route for a 3 km
 * ask (measured ratio 2.0, rejected) — not to second-guess an honest 20% miss
 * that the soft tolerance already flags via "Closest available".
 */
const HARD_RELATIVE_TOLERANCE = 0.5;
const HARD_ABSOLUTE_TOLERANCE_M = 1000;

function hardToleranceMetersFor(targetM: number): number {
  return Math.max(targetM * HARD_RELATIVE_TOLERANCE, HARD_ABSOLUTE_TOLERANCE_M);
}

export function isWithinHardTolerance(distanceM: number, targetM: number): boolean {
  return Math.abs(distanceM - targetM) <= hardToleranceMetersFor(targetM);
}

/** Closest to the requested distance first. Ties keep their original order. */
export function rankByCloseness<T extends { distanceM: number }>(
  candidates: T[],
  targetM: number,
): T[] {
  return [...candidates].sort(
    (a, b) => Math.abs(a.distanceM - targetM) - Math.abs(b.distanceM - targetM),
  );
}

/**
 * Rank usable candidates by how good a run they are (#52), not by distance
 * alone.
 *
 * Distance is still gated by the caller before this point — a candidate outside
 * tolerance never reaches the ranking — and it remains the largest single
 * component of the score. Ties fall back to closeness, which is exactly what
 * identical geometry produces, so the previous behaviour survives wherever
 * quality is equal.
 */
function rankByQuality(candidates: RawCandidate[], targetM: number): RawCandidate[] {
  const tolerance = toleranceMetersFor(targetM);
  return [...candidates]
    .map((candidate) => ({
      candidate,
      score: scoreRoute(
        analyzeRoute(candidate.geometry),
        candidate.distanceM,
        targetM,
        tolerance,
        candidate.attributes,
      ).total,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Math.abs(a.candidate.distanceM - targetM) - Math.abs(b.candidate.distanceM - targetM),
    )
    .map((entry) => entry.candidate);
}

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
 * duplicates, require a usable minimum, and — for a loop — close the ring.
 * Returns an empty array when nothing renderable remains, so the UI can fail
 * gracefully.
 *
 * `close` is false for a one-way route (#17): appending the first point there
 * would invent a segment back to the start that the runner never takes.
 */
export function sanitizeGeometry(geometry: Coordinate[], close = true): Coordinate[] {
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

  // A loop needs a triangle so there is an area; a one-way is valid as a line.
  if (cleaned.length < (close ? 3 : 2)) {
    return [];
  }

  if (!close) {
    return cleaned;
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
    extras?: unknown;
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

type RawCandidate = {
  geometry: Coordinate[];
  distanceM: number;
  ascentM?: number;
  attributes: RouteAttributes;
};

/** A loop closes on its start; a one-way is an open line (#17). */
type GeometryShape = 'loop' | 'one-way';

/**
 * @param requestedLengthM The length sent to ORS in the request — after the
 *   distance correction has already been applied. Never use this for ranking
 *   or tolerance checks; use the caller's original target for that.
 */
/**
 * The one place a directions request is actually sent and parsed. Both the
 * generated loop and a waypoint recalculation go through here, so status
 * handling, geometry cleanup and attribute parsing cannot drift between them.
 *
 * Returns every route the provider sent: a plain request yields one, but an
 * `alternative_routes` request (one-way routing, #17) yields several.
 */
async function sendDirections(
  body: Record<string, unknown>,
  shape: GeometryShape,
): Promise<RawCandidate[]> {
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
      body: JSON.stringify(body),
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

  const features = Array.isArray(payload.features) ? payload.features : [];
  const minimumPoints = shape === 'loop' ? 4 : 2;
  const candidates: RawCandidate[] = [];

  for (const feature of features) {
    // `close` is what keeps a one-way an open line instead of a fake ring.
    const geometry = sanitizeGeometry(
      toCoordinates(feature?.geometry?.coordinates),
      shape === 'loop',
    );
    if (geometry.length < minimumPoints) {
      continue;
    }

    // Prefer the provider's own summary; fall back to measuring the returned
    // polyline so the displayed distance always describes the drawn geometry.
    const summaryDistance = feature?.properties?.summary?.distance;
    const distanceM =
      typeof summaryDistance === 'number' && Number.isFinite(summaryDistance) && summaryDistance > 0
        ? summaryDistance
        : pathLengthMeters(geometry);

    const rawAscent = feature?.properties?.ascent ?? feature?.properties?.summary?.ascent;
    const ascentM =
      typeof rawAscent === 'number' && Number.isFinite(rawAscent) ? rawAscent : undefined;

    candidates.push({
      geometry,
      distanceM,
      ascentM,
      attributes: pathAttributesFromExtras(feature?.properties?.extras),
    });
  }

  if (candidates.length === 0) {
    throw new RoutingError(
      'no-routes',
      shape === 'loop'
        ? 'The routing service returned no usable loop.'
        : 'The routing service returned no usable route.',
    );
  }

  return candidates;
}

/**
 * The per-segment dimensions ROAM requests. Only these two: `steepness` would
 * duplicate the climb figure already shown, and `suitability` is a 0–10 score,
 * i.e. exactly the composite verdict this app must not surface (#14).
 */
const REQUESTED_EXTRA_INFO = ['waytype', 'surface'];

/**
 * @param requestedLengthM The length sent to ORS in the request — after the
 *   distance correction has already been applied. Never use this for ranking
 *   or tolerance checks; use the caller's original target for that.
 */
async function requestLoop(
  origin: Coordinate,
  requestedLengthM: number,
  variant: { seed: number; points: number },
): Promise<RawCandidate> {
  const [candidate] = await sendDirections(
    {
      coordinates: [[origin.longitude, origin.latitude]],
      elevation: true,
      extra_info: REQUESTED_EXTRA_INFO,
      options: {
        round_trip: {
          length: Math.round(requestedLengthM),
          points: variant.points,
          seed: variant.seed,
        },
      },
    },
    'loop',
  );
  return candidate;
}

export type WaypointsRequest = {
  /** Where the loop starts and ends. */
  origin: Coordinate;
  /** Ordered intermediate points the loop must pass through. */
  waypoints: Coordinate[];
  /** Minutes per kilometer used for the time estimate. See PACE_MIN_PER_KM. */
  paceMinPerKm?: number;
};

/**
 * Recalculate a loop so that it passes through `waypoints` (#16).
 *
 * Deliberately NOT built on ORS's `round_trip`: that option takes a single
 * coordinate plus `length`/`points`/`seed`, and has no way to express *these
 * specific* via-points — which is the entire point of an edit. Instead the
 * coordinates are sent explicitly as `origin → waypoints → origin`, so the
 * returned loop physically visits each one. The consequence is that distance is
 * whatever the street network yields through those points, not a requested
 * length; a caller that cares about distance ranks or re-requests, rather than
 * this function pretending it can hit a target.
 *
 * Invalid waypoints are dropped rather than sent; an empty list is an explicit
 * error, not an empty route.
 */
export async function routeThroughWaypoints({
  origin,
  waypoints,
  paceMinPerKm = PACE_MIN_PER_KM,
}: WaypointsRequest): Promise<RouteCandidate> {
  if (!ORS_API_KEY) {
    throw new RoutingError(
      'missing-key',
      'No routing API key is configured. Add EXPO_PUBLIC_ORS_API_KEY.',
    );
  }
  if (!isValidCoordinate(origin)) {
    throw new RoutingError('invalid-origin', 'Your location is not available yet.');
  }

  const valid = waypoints.filter(isValidCoordinate);
  if (valid.length === 0) {
    throw new RoutingError('invalid-waypoints', 'Add at least one point to route through.');
  }

  const coordinates = [
    [origin.longitude, origin.latitude],
    ...valid.map((point) => [point.longitude, point.latitude]),
    [origin.longitude, origin.latitude],
  ];

  const [result] = await sendDirections(
    {
      coordinates,
      elevation: true,
      extra_info: REQUESTED_EXTRA_INFO,
    },
    'loop',
  );

  const distanceKm = roundTo(result.distanceM / 1000, 1);
  return {
    id: 'route-edited',
    distanceKm,
    estimatedMinutes: Math.max(1, Math.round(distanceKm * paceMinPerKm)),
    geometry: result.geometry,
    characteristics: ['Loop', ...characteristicLabelsFor(result.attributes)],
    ascentMeters: result.ascentM,
    attributes: result.attributes,
    waypoints: valid,
  };
}

export type BetweenRequest = {
  /** Where the run starts. */
  origin: Coordinate;
  /** Where it ends. */
  finish: Coordinate;
  /** The runner's preferred distance, in kilometers. */
  targetKm: number;
  paceMinPerKm?: number;
};

/**
 * Find route(s) from `origin` to `finish` — a one-way run (#17).
 *
 * The distance target is a *preference* here, not a constraint. A
 * point-to-point route is whatever the network offers between those two places,
 * so this asks ORS for alternatives and ranks them by closeness to the target:
 * the honest way to respect the request without inventing detours. Unlike the
 * loop search, a route that misses the target is not rejected — it is a valid
 * way from A to B, just not the length asked for, and is labelled "Closest
 * available" accordingly.
 */
export async function findRoutesBetween({
  origin,
  finish,
  targetKm,
  paceMinPerKm = PACE_MIN_PER_KM,
}: BetweenRequest): Promise<RouteCandidate[]> {
  if (!ORS_API_KEY) {
    throw new RoutingError(
      'missing-key',
      'No routing API key is configured. Add EXPO_PUBLIC_ORS_API_KEY.',
    );
  }
  if (!isValidCoordinate(origin)) {
    throw new RoutingError('invalid-origin', 'Your location is not available yet.');
  }
  if (!isValidCoordinate(finish)) {
    throw new RoutingError('invalid-origin', 'Choose a finish point for the route.');
  }
  if (!Number.isFinite(targetKm) || targetKm <= 0) {
    throw new RoutingError('no-routes', 'Choose a distance before finding routes.');
  }

  const raw = await sendDirections(
    {
      coordinates: [
        [origin.longitude, origin.latitude],
        [finish.longitude, finish.latitude],
      ],
      elevation: true,
      extra_info: REQUESTED_EXTRA_INFO,
      options: {
        alternative_routes: {
          target_count: CANDIDATE_COUNT,
          // ORS's own defaults, stated explicitly so the request is readable
          // rather than depending on undocumented provider behaviour.
          weight_factor: 1.4,
          share_factor: 0.6,
        },
      },
    },
    'one-way',
  );

  const targetM = targetKm * 1000;
  const ranked = rankByCloseness(raw, targetM).slice(0, CANDIDATE_COUNT);
  const closestAvailable = !ranked.some((candidate) =>
    isWithinTolerance(candidate.distanceM, targetM),
  );

  return ranked.map((candidate, index) => {
    const distanceKm = roundTo(candidate.distanceM / 1000, 1);
    return {
      id: `route-${index + 1}`,
      distanceKm,
      estimatedMinutes: Math.max(1, Math.round(distanceKm * paceMinPerKm)),
      geometry: candidate.geometry,
      characteristics: describe(
        'one-way',
        candidate.ascentM,
        closestAvailable,
        candidate.attributes,
      ),
      ascentMeters: candidate.ascentM,
      attributes: candidate.attributes,
      finish,
    };
  });
}

/**
 * ORS `waytype` codes, grouped by what a runner would care about. Names are
 * ORS's own way categories; codes in neither group (unknown, ferry,
 * construction) are deliberately not counted either way.
 */
const WAYTYPE_FOOT = new Set([4, 5, 6, 7, 8]); // Path, Track, Cycleway, Footway, Steps
const WAYTYPE_ROAD = new Set([1, 2, 3]); // State road, Road, Street

/**
 * ORS `surface` codes that are not sealed. Sealed codes are deliberately not
 * listed, so a code this build does not recognise is treated as "not counted"
 * rather than silently called unpaved.
 */
const SURFACE_UNPAVED = new Set([2, 8, 9, 10, 11, 12, 15, 16, 17, 18]);

type OrsExtraEntry = { value?: unknown; amount?: unknown };
type OrsExtras = Record<string, { summary?: OrsExtraEntry[] } | undefined>;

/**
 * Percentage of route distance whose code is in `codes`, or null when the
 * provider returned no readable summary for that dimension. A present but
 * empty summary is a real "0%"; a missing one is unknown.
 */
function percentForCodes(
  extras: OrsExtras,
  key: string,
  codes: ReadonlySet<number>,
): number | null {
  const summary = extras[key]?.summary;
  if (!Array.isArray(summary) || summary.length === 0) {
    return null;
  }
  let percent = 0;
  let readable = false;
  for (const entry of summary) {
    const { value, amount } = entry ?? {};
    if (typeof value !== 'number' || typeof amount !== 'number' || !Number.isFinite(amount)) {
      continue;
    }
    readable = true;
    if (codes.has(value)) {
      percent += amount;
    }
  }
  return readable ? Math.round(percent) : null;
}

/** Reads ORS `extra_info` into the attributes ROAM presents. Never infers. */
export function pathAttributesFromExtras(extras: unknown): RouteAttributes {
  const parsed = (typeof extras === 'object' && extras !== null ? extras : {}) as OrsExtras;
  return {
    footwayPercent: percentForCodes(parsed, 'waytype', WAYTYPE_FOOT),
    roadPercent: percentForCodes(parsed, 'waytype', WAYTYPE_ROAD),
    unpavedPercent: percentForCodes(parsed, 'surface', SURFACE_UNPAVED),
  };
}

const MOSTLY_FOOTWAY_PERCENT = 80;
const SOME_ROAD_PERCENT = 15;
const SOME_UNPAVED_PERCENT = 15;

/**
 * Short, factual labels for the route UI — one discrete claim per fact, never
 * a combined score, and never a statement that a route is safe. Thresholds are
 * stated once here so the copy and the numbers cannot drift apart.
 */
export function characteristicLabelsFor(attributes: RouteAttributes): string[] {
  if (
    attributes.footwayPercent === null &&
    attributes.roadPercent === null &&
    attributes.unpavedPercent === null
  ) {
    return ['Path surface unknown'];
  }

  const labels: string[] = [];
  if (attributes.footwayPercent !== null && attributes.footwayPercent >= MOSTLY_FOOTWAY_PERCENT) {
    labels.push('Mostly footways & paths');
  }
  if (attributes.roadPercent !== null && attributes.roadPercent >= SOME_ROAD_PERCENT) {
    labels.push('Some main-road sections');
  }
  if (attributes.unpavedPercent !== null && attributes.unpavedPercent >= SOME_UNPAVED_PERCENT) {
    labels.push('Partly unpaved');
  }
  return labels;
}

function describe(
  routeType: GeometryShape,
  ascentMeters: number | undefined,
  closestAvailable: boolean,
  attributes: RouteAttributes,
): string[] {
  const characteristics = [routeType === 'loop' ? 'Loop' : 'One-way'];
  if (typeof ascentMeters === 'number' && ascentMeters >= 10) {
    characteristics.push(`${Math.round(ascentMeters)} m climb`);
  }
  characteristics.push(...characteristicLabelsFor(attributes));
  // Honest rather than silent: when nothing landed near the request, every
  // candidate returned is an approximation, not a match, and the app must not
  // imply otherwise (issue #7).
  if (closestAvailable) {
    characteristics.push('Closest available');
  }
  return characteristics;
}

/** Fulfilled results only, in their original order. */
function fulfilledOf<T>(settled: PromiseSettledResult<T>[]): T[] {
  return settled
    .filter((result): result is PromiseFulfilledResult<T> => result.status === 'fulfilled')
    .map((result) => result.value);
}

function firstRoutingError(settled: PromiseSettledResult<unknown>[]): RoutingError | null {
  const rejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  return rejected?.reason instanceof RoutingError ? rejected.reason : null;
}

/** Only requests that landed inside the hard ceiling can be used or trusted. */
function safeOf(candidates: RawCandidate[], targetM: number): RawCandidate[] {
  return candidates.filter((candidate) => isWithinHardTolerance(candidate.distanceM, targetM));
}

/**
 * Find round-trip running routes of approximately `targetKm` starting and
 * ending at `origin`.
 *
 * The requested length sent to ORS is pre-corrected for its measured
 * overshoot (`correctionFactorFor`), and candidates are ranked by closeness to
 * the runner's actual target — never by the corrected length, which is purely
 * an implementation detail of talking to ORS.
 *
 * Every candidate is sanity-checked against `isWithinHardTolerance` before it
 * can be used at all — this is what stops a catastrophic result (measured
 * live: a 7 km request coming back as 724 km) from ever being labelled
 * "closest available" and shown as if it were a real option. A candidate that
 * fails this check is discarded, not softened.
 *
 * If the first pass has at least one usable (hard-tolerance-passing)
 * candidate but none within the tighter soft tolerance, one adaptive request
 * is issued using that candidate's own observed ratio — safe, because it was
 * itself already sanity-checked. If the first pass produces *no* usable
 * candidate at all, adapting off it would mean dividing by a meaningless
 * ratio, so instead a fresh, unadapted retry batch is issued at the original
 * corrected length. If even that produces nothing usable, the search fails
 * explicitly (`no-close-route`) rather than ever presenting a wildly wrong
 * distance as a choice.
 *
 * Request budget: 3 for the first pass, plus at most 3 more for the retry —
 * which only fires on that rare all-rejected path — or 1 more for the
 * adaptive nudge. A search that goes well never spends more than 3; 6 is the
 * true worst case, not a routine one.
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

  const targetM = targetKm * 1000;
  const correctedLengthM = targetM * correctionFactorFor(targetKm);

  const firstPassVariants = randomVariants(CANDIDATE_COUNT);
  const firstPass = await Promise.allSettled(
    firstPassVariants.map((variant) => requestLoop(origin, correctedLengthM, variant)),
  );

  const firstPassAll = fulfilledOf(firstPass);
  if (firstPassAll.length === 0) {
    throw (
      firstRoutingError(firstPass) ??
      new RoutingError('no-routes', 'No running loops were found near you.')
    );
  }

  let safe = safeOf(firstPassAll, targetM);

  if (safe.length === 0) {
    // Nothing from the first pass can be trusted — not even as a basis for
    // adapting the next request. Retry cold, at the same tier-corrected
    // length, with fresh variants, rather than dividing by a ratio computed
    // from a result that was itself thrown out.
    const retryVariants = randomVariants(CANDIDATE_COUNT);
    const retryPass = await Promise.allSettled(
      retryVariants.map((variant) => requestLoop(origin, correctedLengthM, variant)),
    );
    safe = safeOf(fulfilledOf(retryPass), targetM);

    if (safe.length === 0) {
      throw new RoutingError(
        'no-close-route',
        `ROAM couldn't find a route close to ${targetKm.toFixed(1)} km near you. Try a different distance.`,
      );
    }
  } else if (!safe.some((candidate) => isWithinTolerance(candidate.distanceM, targetM))) {
    // At least one usable candidate, but none within the tighter soft
    // tolerance — adapt using its own observed ratio, which reflects this
    // origin's actual street network rather than just the tiered average.
    const closest = rankByCloseness(safe, targetM)[0];
    const observedRatio = closest.distanceM / correctedLengthM;
    if (Number.isFinite(observedRatio) && observedRatio > 0) {
      const adaptiveLengthM = targetM / observedRatio;
      const extraVariant = pickUnusedVariant(
        new Set(firstPassVariants.map((v) => v.seed)),
        new Set(firstPassVariants.map((v) => v.points)),
      );
      const adaptive = await requestLoop(origin, adaptiveLengthM, extraVariant).catch(() => null);
      // The adaptive request is sanity-checked too — an adaptive request can
      // still individually hit the same catastrophic failure mode.
      if (adaptive && isWithinHardTolerance(adaptive.distanceM, targetM)) {
        safe = [...safe, adaptive];
      }
    }
  }

  const ranked = rankByQuality(safe, targetM).slice(0, CANDIDATE_COUNT);
  const closestAvailable = !ranked.some((candidate) => isWithinTolerance(candidate.distanceM, targetM));

  return ranked.map((candidate, index) => {
    const distanceKm = roundTo(candidate.distanceM / 1000, 1);
    return {
      id: `route-${index + 1}`,
      distanceKm,
      estimatedMinutes: Math.max(1, Math.round(distanceKm * paceMinPerKm)),
      geometry: candidate.geometry,
      characteristics: describe('loop', candidate.ascentM, closestAvailable, candidate.attributes),
      ascentMeters: candidate.ascentM,
      attributes: candidate.attributes,
    };
  });
}
