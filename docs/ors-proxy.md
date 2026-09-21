# ROAM — Routing Proxy (#63)

Status: client support shipped; a proxy must be deployed and the direct key
removed before release. This document is the contract the proxy implements and
the client relies on.

## Why

`EXPO_PUBLIC_ORS_API_KEY` is embedded in the JS bundle. Anything prefixed
`EXPO_PUBLIC_` is inlined at build time, so the OpenRouteService key can be
extracted from the app and spent by anyone. The fix is to move the key to a
proxy and let the device talk to the proxy instead.

## Client behaviour

`src/services/routing.ts` reads two variables, in priority order:

1. `EXPO_PUBLIC_ORS_PROXY_URL` — the proxy base URL. When set, the client calls
   `${EXPO_PUBLIC_ORS_PROXY_URL}/directions/foot-walking/geojson` and sends **no**
   `Authorization` header. This is the mode a release build must use.
2. `EXPO_PUBLIC_ORS_API_KEY` — a direct key, used only when the proxy URL is
   unset. Local development only; never a release build.

If neither is set, the client throws `missing-key` without calling out.

## Proxy contract

- **Method / path** — `POST /directions/foot-walking/geojson`. Any other path is
  rejected.
- **Request body** — the ORS directions body, unchanged. The proxy must not
  alter it.
- **Response** — the ORS GeoJSON, unchanged.
- **Status codes are preserved.** The client maps them, so the proxy must pass
  them through rather than collapsing everything to 500:
  - `401` / `403` → `auth` ("The routing API key was rejected.")
  - `429` → `rate-limit`, which arms the client's backoff
  - other non-2xx → `provider`
  - a request that never reaches the network → `offline`
- **The proxy injects the key** as `Authorization: <ORS key>` on the upstream
  request. The key never leaves the server.

## Reference implementation

A minimal Cloudflare Worker (adapt freely to Vercel, Netlify, Lambda, …):

```js
const ORS_KEY = process.env.ORS_API_KEY; // a server-side secret
const UPSTREAM = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/directions/foot-walking/geojson') {
      return new Response('Not found', { status: 404 });
    }
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        Authorization: ORS_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json',
      },
      body: request.body,
    });
    // Preserve status and body so the client's error mapping keeps working.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/geo+json' },
    });
  },
};
```

Set `EXPO_PUBLIC_ORS_PROXY_URL` to the deployed origin (for example
`https://roam-routing.example.workers.dev`) and remove
`EXPO_PUBLIC_ORS_API_KEY` from the build environment.

## Auth and abuse

The app has no accounts, so the proxy is necessarily reachable by anyone who
has the app. A shared client secret cannot be the defence — it is embedded in
the bundle and can be extracted just like the ORS key. The real protections are
server-side:

- **Rate limit per IP** at the proxy, tighter than ORS's own quota.
- **Cache identical requests** (same origin/distance) for a short window. The
  client already caches locally (#62); the proxy should too, so repeats across
  devices cost one upstream call.
- **Restrict** the method, path and body size; reject anything unexpected.
- **Monitor** quota usage and alert before ORS's limit is hit.

These measures bound the damage of an extracted URL rather than pretending it
can be hidden. That is the honest position, and it is why the proxy — not a
client secret — is the thing that holds the key.

## Verification

- [ ] `EXPO_PUBLIC_ORS_PROXY_URL` is set in the release build environment.
- [ ] `EXPO_PUBLIC_ORS_API_KEY` is **unset** in the release build.
- [ ] A bundle grep for the key returns nothing.
- [ ] Route generation works end to end through the proxy.
- [ ] A forced `429` from ORS surfaces as `rate-limit` in the app.
