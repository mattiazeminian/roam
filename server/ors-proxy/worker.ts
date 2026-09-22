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

export interface Env {
  ORS_API_KEY: string;
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
