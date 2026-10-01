/**
 * ROAM's minimal OpenRouteService proxy (#63).
 *
 * Deploy this module as a Cloudflare Worker (or adapt the same contract to
 * another serverless runtime). ORS_API_KEY is a server-side secret and must
 * never be exposed as an EXPO_PUBLIC_* variable.
 */

const ORS_ENDPOINT =
  'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';
const ROUTE_PATH = '/directions/foot-walking/geojson';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_COORDINATES = 8;

export interface Env {
  ORS_API_KEY: string;
}

type RouteRequest = { coordinates?: unknown };

/**
 * The public proxy accepts only the small coordinate lists ROAM can generate.
 * This keeps an exposed proxy URL from being used as a general ORS relay.
 */
export function isValidRouteRequest(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const coordinates = (value as RouteRequest).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 1 || coordinates.length > MAX_COORDINATES) {
    return false;
  }
  return coordinates.every((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) {
      return false;
    }
    const [longitude, latitude] = coordinate;
    return (
      typeof longitude === 'number' &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90
    );
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== ROUTE_PATH) {
      return new Response('Not found', { status: 404 });
    }
    if (!env.ORS_API_KEY) {
      return new Response('Routing service is not configured', { status: 503 });
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response('Request too large', { status: 413 });
    }

    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return new Response('Request too large', { status: 413 });
    }

    let routeRequest: unknown;
    try {
      routeRequest = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return new Response('Request body must be valid JSON', { status: 400 });
    }
    if (!isValidRouteRequest(routeRequest)) {
      return new Response('Invalid route request', { status: 400 });
    }

    let upstream: Response;
    try {
      upstream = await fetch(ORS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: env.ORS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/geo+json',
        },
        body,
      });
    } catch {
      return new Response('Upstream routing service unavailable', { status: 502 });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/geo+json',
        'Cache-Control': 'no-store',
      },
    });
  },
};
