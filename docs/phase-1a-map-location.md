# ROAM — Phase 1A: Real Map + Location

> **Historical.** Phase notes from 2026-09-15. The map and location are long
> since implemented and much has changed; kept as a record of that phase.

Date: 2026-09-15
Status: implemented **and verified on the iOS 26 simulator** with a real Mapbox
public token. TypeScript, Expo Doctor and the iOS export pass. A development
build is required to run it (see §6).

This phase replaces the hand-drawn map placeholder and the hardcoded origin with
a real **Mapbox** map and real **foreground location** (`expo-location`), while
rendering the existing mock route geometry. Routing (OpenRouteService) and run
tracking are **not** part of this phase.

## 1. What was implemented

- **Real map (Mapbox).** `@rnmapbox/maps` renders the map, camera, user-location
  marker and route polylines behind a single `MapCanvas` component.
- **Real foreground location.** `expo-location` requests permission on launch,
  fetches a first fix and subscribes to foreground updates.
- **Single location source.** `MOCK_ORIGIN` was removed from the screens; Home,
  Route Selection and Active Run read the user's location from one provider.
- **Existing mock geometry on the real map.** The current deterministic route
  generator is unchanged and its coordinates are drawn as Mapbox line layers.
- **Preserved UI/UX.** The Home layout, distance control, route carousel, tab
  bar, typography, colour system, motion and accessibility work are untouched.
  Route selection is still carousel-driven; selecting a route does not move the
  camera.

### Behaviour by screen

- **Home** — map centered on the current location (zoom 14); the location pill
  reflects status (`Current location` / `Locating…` / `Location off` /
  `Location unavailable`); `Find routes` is disabled until a location exists.
- **Route Selection** — camera fits all candidates (with insets that keep the
  carousel clear); the carousel remains the selector.
- **Active Run** — unchanged placeholder, now on the real map with real origin.

## 2. Files changed

Phase 1A specifically:

- `app.json` — bundle id, `@rnmapbox/maps` plugin, `expo-location` plugin.
- `package.json`, `package-lock.json` — two dependencies added (`expo prebuild`
  also rewrote the `ios`/`android` scripts from `expo start --ios` to
  `expo run:ios`; this is correct now that the project has custom native code).
- `src/services/location.ts` — **new**, the location abstraction.
- `src/services/location-context.tsx` — **new**, React provider + `useLocation`.
- `src/components/map/map-canvas.tsx` — **new**, the Mapbox boundary.
- `src/app/_layout.tsx` — wraps the app in `LocationProvider`.
- `src/app/(tabs)/index.tsx` — real location + `MapCanvas` + location states.
- `src/app/routes.tsx` — real origin; `MapCanvas` with `cameraMode="fit"`.
- `src/app/run.tsx` — real origin; `MapCanvas`.
- `src/services/routing.ts` — `MOCK_ORIGIN` removed; internal fallback renamed.

Unrelated files also appear modified in the working tree (`button`,
`distance-control`, `text`, `theme/*`, `map/location-marker`, `map/route-path`,
`map/search-pulse`, `map-palette`, the deleted `route-info-panel`, the new
`route-carousel`). Those are the **previously completed, still-uncommitted** UI +
accessibility work, not part of Phase 1A.

## 3. Dependencies added

Only the two required:

- `@rnmapbox/maps@^10.3.5` — native Mapbox Maps SDK for React Native.
- `expo-location@~57.0.17` — foreground location (SDK-compatible version).

No state-management library, UI library or second map library was added.

## 4. Configuration added

`app.json`:

- `expo.ios.bundleIdentifier = "com.mattiazeminian.roam"` — the id already present
  in the generated `ios/` project.
- `plugins`: `"@rnmapbox/maps"` and
  `["expo-location", { "locationWhenInUsePermission": "ROAM uses your location to find running routes near you." }]`.

Resolved config (verified with `npx expo config --type prebuild`) includes the
bundle identifier and the location permission string. No background-location
configuration was added.

Secrets: **no token is hardcoded.** Two public build-time variables are read from
the environment:

- `EXPO_PUBLIC_MAPBOX_TOKEN` — client-side Mapbox public token. Must be scoped to
  the ROAM bundle id (`com.mattiazeminian.roam`) in the Mapbox account, and is
  expected to be public in the shipped app.
- `EXPO_PUBLIC_MAPBOX_STYLE_URL` — *optional* custom monochrome style URL
  (authored in Mapbox Studio). When unset, `light-v11` / `dark-v11` are used.

Neither is committed (`.env` / `.env.*` are already gitignored).

## 5. How Mapbox is configured

- The `@rnmapbox/maps` Expo config plugin is registered in `app.json`. The
  build-time **download token is no longer required** (Mapbox removed the
  requirement; confirmed in the plugin source and podspec).
- At runtime, `MapCanvas` calls `Mapbox.setAccessToken(EXPO_PUBLIC_MAPBOX_TOKEN)`
  once, guarded by a token check.
- `MapCanvas` is the only file that loads `@rnmapbox/maps`, and it does so
  **lazily** (a guarded `require`, only when a token is configured). This is
  deliberate: the native module throws at import time when it is not linked, so
  an eager `import` would crash the whole app in Expo Go or a build that predates
  the plugin. Screens pass the same contract the old overlay used:

  ```text
  screens → MapCanvas → Mapbox
  MapCanvas props: origin, routes, selectedRouteId, searching,
                   recenterSignal, padding, cameraMode ('center' | 'fit')
  ```

- Route styling mirrors the existing visual language: selected route
  `theme.accent` (lime) at 5 px over a `theme.text` halo at 8 px; unselected
  `theme.textSecondary` at 3 px, 0.5 opacity. Selection is never colour-only —
  the carousel card and `accessibilityState.selected` carry it too.
- The camera is imperative (`Camera` ref): Home centers on the location on first
  fix and on the locate control; Route Selection fits all routes when the route
  set changes. Position updates do **not** move the camera, so it never fights
  the user.

## 6. How location works

`src/services/location.ts` (no UI, no routing):

- `getForegroundPermission()` — reads status without prompting.
- `requestForegroundPermission()` — prompts only while `undetermined`; iOS never
  re-prompts once denied.
- `getCurrentCoordinate()` — one balanced-accuracy fix.
- `watchCoordinate()` — foreground updates (10 m interval), returning a
  removable subscription.

`src/services/location-context.tsx` provides `{ status, coordinate, refresh }`:

- `status`: `'requesting' | 'available' | 'denied' | 'unavailable'`.
- On mount it checks permission, requests it if undetermined, fetches a fix, then
  watches. There is **no fake fallback** — if location is unavailable,
  `coordinate` is `null` and the UI says so.
- Denied state: the Home pill becomes `Location off` and opens iOS Settings; a
  short inline line reads "Location is required to find nearby routes." No custom
  onboarding, no repeated prompts.

## 7. How to run the development build

Mapbox is native code, so **Expo Go is not supported** and the currently installed
build is stale (it predates `expo-location` and Mapbox). A rebuild is required.

1. Set the token (e.g. in a local `.env`, or exported in the shell):

   ```sh
   EXPO_PUBLIC_MAPBOX_TOKEN=pk.xxxxxxxx   # scoped to com.mattiazeminian.roam
   # optional:
   EXPO_PUBLIC_MAPBOX_STYLE_URL=mapbox://styles/<user>/<style-id>
   ```

2. Rebuild and launch on a device or simulator:

   ```sh
   npx expo run:ios                 # local build (prebuild + Xcode)
   # or, for a device / cloud build:
   npx expo prebuild --clean && eas build --profile development --platform ios
   ```

   The prebuild applies the `@rnmapbox/maps` and `expo-location` plugins and, on
   first run, regenerates `ios/` from `app.json`.

3. Without a token — or in a build where the native module is not linked (for
   example Expo Go) — the app still runs: `MapCanvas` renders the placeholder
   surface with the same routes and the real location marker. Mapbox is loaded
   lazily behind a guard, so an unlinked build falls back instead of crashing.
   This is an explicit fallback, **not** a fake location.

## 8. Known limitations

- **Verified on the iOS 26 simulator, not yet on a physical iPhone.** With a real
  token: the Mapbox map renders, the native permission dialog shows the ROAM
  message, the camera centers on the real fix, the lime marker sits at the real
  position, `Find routes` generates and the Route Selection carousel draws the
  mock loops on the real map with the lime/neutral styling. A device pass is
  still owed.
- **Minor Mapbox log warning** on first layout: `Invalid size is used for setting
  the map view, fall back to the default size {64, 64}` (the map view measures at
  0 before layout). Harmless in testing; worth confirming it does not cause a
  visible flash on device.
- **Map style is not yet the bespoke monochrome style.** `light-v11` / `dark-v11`
  are used by default; the custom style from `docs/map-style.md` still has to be
  authored in Mapbox Studio and supplied via `EXPO_PUBLIC_MAPBOX_STYLE_URL`.
  Until then the map is muted but not fully monochrome.
- **Route lines are declarative layers, not the animated draw-in.** Mapbox
  `LineLayer` cannot be driven by the existing Reanimated draw-in, so routes
  appear rather than drawing progressively; selection emphasis is a style change.
  Restoring the draw-in (or an equivalent) is a Phase 1B concern.
- **The search pulse** is rendered via a `MarkerView`; its behaviour over the
  native map should be confirmed on device.
- **Route styling is expressed twice** — once in `MapCanvas` (Mapbox layers) and
  once in `RouteOverlay`/`RoutePath` (placeholder fallback). Kept intentionally
  for the transitional phase; the placeholder can be removed once Mapbox is
  proven.
- **`@rnmapbox/maps` 10.3.5** is the version Expo resolved. New-Architecture
  compatibility with React Native 0.86 must be confirmed in the dev build.
- **Expo Go is not supported.** Running the JS through Expo Go (or any build
  without the plugin) previously produced an eager-import crash
  (`@rnmapbox/maps native code not available`). The lazy load now makes that
  environment fall back to the placeholder; the real map still requires a
  development build (`npx expo run:ios`) with the token set.
- **Home no longer re-pushes routes with a stale origin**: Route Selection reads
  the cached generation; if the cache is missing and there is no location, it
  renders no routes rather than a fake set.

## 9. What remains for Phase 1B

- Author and wire the custom monochrome Mapbox style; add the dark variant.
- Restore the route draw-in animation (or an equivalent progressive reveal) and
  confirm the search pulse on device.
- Replace the mock generator with **OpenRouteService** behind the existing
  `findRoutes` seam (target-distance `round-trip`, foot profile).
- Remove the placeholder map path once Mapbox is proven on device.
- Then move on to run tracking (a `Run` model, GPS track, timer, pace) per the
  roadmap, followed by persistence, summary and history.
