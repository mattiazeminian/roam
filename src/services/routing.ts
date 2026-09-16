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
  /** Running-time estimate derived from the runner's pace setting (or a default). */
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
  | 'invalid-origin'
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

type RawCandidate = { geometry: Coordinate[]; distanceM: number; ascentM?: number };

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
            length: Math.round(requestedLengthM),
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

function describe(ascentMeters: number | undefined, closestAvailable: boolean): string[] {
  const characteristics = ['Loop'];
  if (typeof ascentMeters === 'number' && ascentMeters >= 10) {
    characteristics.push(`${Math.round(ascentMeters)} m climb`);
  }
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

  const ranked = rankByCloseness(safe, targetM).slice(0, CANDIDATE_COUNT);
  const closestAvailable = !ranked.some((candidate) => isWithinTolerance(candidate.distanceM, targetM));

  return ranked.map((candidate, index) => {
    const distanceKm = roundTo(candidate.distanceM / 1000, 1);
    return {
      id: `route-${index + 1}`,
      distanceKm,
      estimatedMinutes: Math.max(1, Math.round(distanceKm * paceMinPerKm)),
      geometry: candidate.geometry,
      characteristics: describe(candidate.ascentM, closestAvailable),
      ascentMeters: candidate.ascentM,
    };
  });
}
