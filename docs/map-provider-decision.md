# ROAM — Map Provider Decision (Phase 0)

Date: 2026-09-15
Status: decision. No source, config, or dependency was changed.

This document answers one question: **which map and routing providers should
ROAM build on?** It is based on the current repository
(`docs/implementation-audit.md`), ROAM's product requirements, and current
official provider documentation (checked 2026-09-15; pricing and SDK versions
must be re-confirmed at build time).

## 1. Recommendation

**Split the two concerns. Do not use a single vendor for both.**

- **Map provider: Mapbox** — `@rnmapbox/maps` with a custom monochrome style.
- **Routing provider: OpenRouteService (ORS)** — the `foot-walking` profile with
  `options.round-trip` (`length` + `seed`).
- **Location: `expo-location`** (foreground only for the MVP).
- **Build: a development build** (custom native code), not Expo Go.

Reason in one line: **Mapbox is the best map for ROAM's custom, calm,
route-dominant aesthetic; OpenRouteService is the only mainstream provider that
generates a loop of a *target distance* on its own**, which is literally ROAM's
core promise ("choose how far you want to run. ROAM finds the way").

They are deliberately independent: the map renders whatever coordinates the
routing service returns, so either side can be swapped without touching the
other. The existing `RouteCandidate` model and the `findRoutes` seam already
support this separation.

Runner-up: **Google Maps** (via `react-native-maps` with `PROVIDER_GOOGLE` and a
custom JSON style) is a close, cost-attractive alternative for the map, but its
route layer is less expressive than Mapbox's and its iOS custom styling is more
awkward. **Apple MapKit is not recommended as the primary map** because its
styling cannot meet ROAM's monochrome direction.

## 2. Comparison

### Map providers

Scores are 1–5 (5 = best). Weights: High = 3, Medium = 2, Low = 1.

| Criteria | Weight | Mapbox | Apple MapKit | Google Maps |
| --- | --- | --- | --- | --- |
| Map visual / customization | High | **5** | 2 | 4 |
| Routing suitability (native) | High | 3 | 2 | 4 |
| React Native / Expo compatibility | High | 4 | 3 | 4 |
| iOS experience | High | 4 | **5** | 4 |
| Route geometry support | High | **5** | 4 | **5** |
| Multiple candidate routes | High | 3 | 2 | 4 |
| Implementation complexity | Medium | 3 | 4 | 3 |
| Cost for MVP | Medium | 4 | **5** | 4 |
| Long-term scalability | Medium | **5** | 3 | **5** |
| Offline potential | Low | **5** | 3 | 3 |
| **Weighted total (of 25)** | | **≈ 4.0** | ≈ 3.2 | ≈ 4.1 |

Mapbox and Google are close overall; the score gap comes almost entirely from
"native routing", a criterion we are **decoupling**. Once routing is handled by
ORS, the decision rests on the map-only criteria — custom styling, route-layer
control, iOS fit and offline — where Mapbox leads. Apple wins on native polish
and cost but cannot be styled to ROAM's direction.

Notes per provider:

- **Mapbox** (`@rnmapbox/maps`): full custom JSON style, polyline/line layers
  with expression-based styling (ideal for selected = lime/thicker vs.
  unselected = neutral/thinner), reliable camera API, location puck, and an
  offline tile manager. Requires a config plugin and a **development build**;
  cannot run in Expo Go. A runtime access token is required (`Mapbox.setAccessToken`);
  the build-time "download token" is now deprecated.
- **Apple MapKit** (Apple Maps on iOS via `expo-maps` — currently **alpha** and
  dev-build-only, iOS 17+) or `react-native-maps` (Apple provider, available in
  Expo Go): free, excellent native quality, polylines/markers/camera supported.
  **Custom map styling is not supported** (no arbitrary JSON style; only
  standard/emphasis). `MKDirections` walking routing exists but is **not exposed
  by Expo or react-native-maps**; using it means depending on a small community
  native module, and it still cannot generate target-length loops.
- **Google Maps** (`react-native-maps` with `PROVIDER_GOOGLE`, available in Expo
  Go; or Maps SDK for iOS with extra setup): custom JSON styling works with the
  Google provider on iOS, though Google is steering toward cloud `mapId` styling
  which is documented as not yet working on iOS. Requires Google billing setup
  for routing. Good, but a heavier iOS integration than Mapbox.

### Routing providers

| Provider | Pedestrian | Alternatives | **Target-distance loop** | Geometry | Cost (MVP) |
| --- | --- | --- | --- | --- | --- |
| **OpenRouteService** | ✓ `foot-walking` (+ `green`, `quiet` weightings) | ✓ | **✓ `round-trip` with `length` + `seed`** | GeoJSON | Free 2,000 req/day; self-host = unlimited |
| Mapbox Directions | ✓ `mapbox/walking` (`walking_speed` up to 25 km/h) | ✓ up to 2 | ✗ (needs a custom loop algorithm, e.g. Isochrone + waypoint sampling) | GeoJSON | Free 100,000 req/month, then tiered |
| Google Routes API | ✓ `WALK` (beta; requires a user-facing warning) | ✓ up to 3 (`computeAlternativeRoutes`) | ✗ | Encoded polyline | 10,000 free/month, then ~$5/1,000 |
| Apple `MKDirections` | ✓ walking | ✓ (`requestsAlternateRoutes`) | ✗ | `MKPolyline` (manual extraction) | Free, rate-limited; no official Expo/RN API |

The decisive cell is the **target-distance loop** column. Mapbox, Google and
Apple all compute routes *between two points*; none of them answer "give me a
~7 km loop from here". OpenRouteService does, with a documented `round-trip`
option (`length` in metres, `points` for roundness, `seed` for variation) that
works with the `foot-*` profiles — and its foot profile can bias toward
**green** and **quiet** ways, which is exactly the quality a runner wants.

## 3. Why it fits ROAM

- **Route discovery.** ROAM's product is not "route me from A to B"; it is
  "generate a loop of about N km from where I am." ORS `round-trip` produces that
  loop directly. Multiple candidates come from running the same request with
  different `seed` values (and slightly varied targets), then de-duplicating — no
  custom geometric algorithm required for v1.
- **Running loops.** The `foot-walking` profile plus `green`/`quiet` weightings
  produces pedestrian-friendly routes that avoid fast roads and favour parks and
  quiet streets, matching ROAM's positioning ("run somewhere new", not "run on
  the motorway shoulder").
- **Map aesthetics.** ROAM's brand (`docs/brand.md`, `docs/map-style.md`) requires
  a restrained monochrome map where the **route is the hero**. Only Mapbox (and,
  less flexibly, Google) allows a fully custom style. Apple Maps would force a
  standard, colorful map and break the identity.
- **Route selection.** Mapbox's data-driven line styling maps directly onto
  ROAM's already-designed states — selected route lime/6px with a halo,
  unselected neutral/3px — without hacks. The existing `RouteOverlay` props
  (`origin`, `routes`, `selectedRouteId`, `padding`) translate cleanly to a
  Mapbox `ShapeSource` + `LineLayer`.
- **Future active run.** Mapbox gives a camera API, a location puck, smooth
  position updates, and offline tile packs (useful when a route leaves coverage)
  — the pieces the Active Run screen will need. ORS is only needed for the
  *planning* step, not during the run, so the run itself is map-only.
- **iOS.** Mapbox ships a mature iOS SDK, and the monochrome style makes ROAM feel
  native and calm. The trade-off is that Mapbox requires a development build,
  which ROAM needs anyway for `expo-location`.

## 4. Architecture

The two providers sit behind separate ROAM-owned seams. Screens never import a
provider directly.

```text
UI (Home / Route Selection / Active Run)
        ↓
ROAM map abstraction   (MapCanvas: origin, routes, selectedRouteId, padding)
        ↓
Map provider: Mapbox    (@rnmapbox/maps: MapView, ShapeSource, LineLayer, Camera)

UI (Home "Find Routes")
        ↓
ROAM routing service    (findRoutes(RouteRequest) → RouteCandidate[])
        ↓
Routing provider: OpenRouteService  (foot-walking + round-trip)
```

- **Map abstraction** replaces `MapSurface` + `projection.ts` + `route-path.tsx`
  with a single `MapCanvas` that accepts the same props `RouteOverlay` already
  exposes. The current placeholder stays available behind a flag for development
  and for platforms without the native map.
- **Routing service** keeps the existing `RouteRequest` / `RouteCandidate` types
  and the `findRoutes` function; only its body changes to call ORS and map the
  response (GeoJSON geometry, distance, duration) into `RouteCandidate[]`. The
  mock generator stays behind a development flag.
- **Location** is a third seam (`services/location.ts` wrapping `expo-location`)
  that replaces the hardcoded `MOCK_ORIGIN` and feeds both map and routing.

## 5. Risks

1. **OpenRouteService free-tier limits.** The public API allows **2,000
   directions requests/day and 40/minute** per key. Each "Find Routes" that
   requests 3 loop candidates costs multiple requests, so a busy test day can hit
   the daily cap. Mitigation: cache per (origin → target) session, request fewer
   candidates, and adopt the **self-hosted ORS** (Docker, unlimited, LGPL-3.0)
   before any real launch.
2. **Two vendors = two accounts, keys, and failure modes.** Mitigation: the
   map/routing split is intentional; if vendor consolidation is ever required,
   Mapbox Directions + a custom isochrone/waypoint loop algorithm is the fallback
   (more work, fewer natural alternatives).
3. **Development-build requirement.** Mapbox cannot run in Expo Go, and
   `expo-maps` is alpha and also dev-build-only. This adds EAS/dev-client setup
   and signing before the first real device test. This is unavoidable for real
   location + maps regardless of provider.
4. **Token security and platform restrictions.** Mapbox runtime tokens are public
   in the app, so they must be **URL/bundle-scoped** to the ROAM bundle id and,
   ideally, rotated; ORS keys are per-developer and should be treated as
   secrets (not committed), ideally proxied later if abused.
5. **Walking-route quality/beta caveats.** ORS quality depends on OpenStreetMap
   foot data and can be poor in some areas; Google explicitly labels walking
   routes as beta. Expect occasional odd loops — the product must present 2–3
   candidates so the user can choose.
6. **Round-trip length is approximate.** ORS documents `length` as a *preferred*
   value; returned loops can differ. ROAM must display the **actual** distance
   (it already does) rather than the requested target.
7. **Mapbox billing semantics.** Maps are billed by **monthly active user**, not
   per tile request, so cost is not linear with usage and is hard to model from
   request counts alone.

## 6. Costs

All figures are from official pages as of 2026-09-15 and **must be re-confirmed**
before committing. Assumptions for the MVP are deliberately small: a private
TestFlight-style cohort (well under 25,000 monthly active users) and route
generation only on explicit "Find Routes" taps (not continuous).

| Provider | Free tier (as documented) | Beyond free | MVP reality (assumed <25k MAU, <100k route requests/mo) |
| --- | --- | --- | --- |
| **Mapbox Maps** | ~25,000 mobile MAU/month | Tiered per-1,000 MAU published rates | **$0** |
| **Mapbox Directions** | ~100,000 requests/month | Tiered (~$2/1,000, dropping with volume) | **$0** |
| **OpenRouteService** | 2,000 directions/day, 40/min | Self-host = unlimited (LGPL-3.0) | **$0**, watch the daily cap |
| **Google Maps** | Maps SDK: free/unlimited map display; Directions/Routes Essentials: 10,000 free/month | ~$5/1,000 after free cap | **$0** |
| **Apple MapKit** | Free (map + MKDirections) | N/A (rate limits apply) | **$0**, but no custom style and no Expo routing API |

For the MVP, the recommended stack (Mapbox + ORS) is **$0** at this scale. The
first cost pressure will be ORS's daily cap (solved by self-hosting, which is
free software) rather than Mapbox's MAU tier.

## 7. Next implementation step

**Stand up the map layer on a development build before touching routing.**

Concretely, in order:

1. Create a Mapbox account and a **public runtime token scoped to the ROAM iOS
   bundle id**; create an OpenRouteService account and a token (or plan a
   self-hosted instance). Keep both out of source control.
2. Add to `app.json`: an `ios.bundleIdentifier`, the `@rnmapbox/maps` config
   plugin (`RNMapboxMapsVersion` pinned), the `expo-location` plugin with the
   `NSLocationWhenInUseUsageDescription` string, and `expo-keep-awake` when the
   run screen lands. Build a **development client** (`eas build --profile
   development` or `expo run:ios`).
3. Introduce `services/location.ts` (real foreground location) and stop reading
   `MOCK_ORIGIN`; feed the real fix into app state.
4. Introduce `MapCanvas` behind the existing `RouteOverlay` prop contract and
   replace `MapSurface`/`projection.ts`/`route-path.tsx` internally with Mapbox
   (`MapView` + one `ShapeSource`/`LineLayer` per route + `Camera` + `UserLocation`),
   applying the monochrome style and the lime-selected / neutral-unselected
   styling. Render the **existing mock route geometry** on the real map first.
5. Only then change `services/routing.ts` to call ORS `foot-walking` with
   `round-trip` and map the response into `RouteCandidate[]`.

Step 4 is the decision-critical milestone: it proves the real map, the custom
style, the route layers, the camera fit and real location all work with ROAM's
existing selection model — with zero routing risk. Routing (step 5) is a
localized change inside one file.
