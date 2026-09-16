# ROAM — Implementation Audit

Date: 2026-09-15
Scope: read-only audit of the current prototype against the goal of a real,
working iOS route-discovery MVP. No source, config, or dependency was changed.

> **Status update (Phase 1A).** Since this audit, the map and location layers
> have been implemented: real Mapbox map (`@rnmapbox/maps`) behind `MapCanvas`,
> real foreground location (`expo-location`) behind `services/location.ts`, and
> `MOCK_ORIGIN` removed from the screens. Location and Maps in the matrix below
> are therefore no longer MOCKED. Routing, run tracking and persistence remain as
> described. See `docs/phase-1a-map-location.md` for the current state.

## 1. Executive summary

ROAM is currently a **well-built, self-contained prototype of the visual and
interaction layer** with a **fully mocked data layer**. The app runs on iOS 26,
navigation, the native tab bar, Liquid Glass materials, haptics, motion and the
design system are real and coherent; the distance selector and the route
carousel are genuine, working interactions. Everything below the UI — location,
map, routing, run tracking, persistence — is either mocked or absent.

Concretely:

- The **route discovery loop is mocked end-to-end**: a fixed origin (Lisbon),
  synthetic loop geometry, and a deterministic fake service.
- The **run itself does not exist**: `Active Run` is a placeholder, there is no
  run model, no tracking, no summary, and no saved history.
- There is **no persistence layer** of any kind.
- There is **no real map** — a hand-drawn placeholder surface with a custom
  projection stands in for one.
- The **architecture is a sound foundation** to build on: routing is already
  isolated behind a replaceable seam, the route model is realistic, and screens
  are thin. What is missing is a shared app-state layer for location/session and
  the real provider integrations.

Verification: `tsc --noEmit` clean, `expo-doctor` 21/21, iOS export succeeds
(3.5 MB Hermes bundle). The earlier route-generation crash remains fixed
(`'worklet'` directive present in `src/components/map/route-path.tsx:95`).

The main risks are not technical debt but **missing capabilities** and a few
**configuration gaps** (no bundle identifier in app config, no location
permissions, no ESLint config, dead dependencies/code, and a generated `ios/`
folder that has drifted from `app.json`).

## 2. Current implementation matrix

| Area | Status | Notes |
| --- | --- | --- |
| Home | PARTIAL | Map + location + distance + Find Routes render and respond. Distance selection is fully real (presets 3/5/7/10, +/−, inline numeric input with validation and clamping). Location and routes are mocked. |
| Route Selection | PARTIAL | Real interaction: 2–3 routes drawn together, Route 1 auto-selected, map↔carousel sync from a single `selectedIndex`, lime/thicker selected vs neutral/thinner others, tap-card-to-select, Start Run. Routes themselves are mocked. |
| Active Run | MISSING | `src/app/run.tsx` is a placeholder that re-derives the mock route from URL params and shows "Live tracking is not implemented yet." No GPS, timer, distance, pace, pause/resume/stop, or track recording. |
| Summary (Run Complete) | MISSING | No screen or model. `product.md` lists it; nothing exists. |
| History | MISSING | `src/app/(tabs)/history.tsx` is an honest empty state. No saved runs, no detail screen, no records. |
| Location | MOCKED | Hardcoded `MOCK_ORIGIN` (Lisbon, `38.7223, -9.1393`) in `src/services/routing.ts`. No `expo-location`, no permission flow, no updates, no error states. |
| Maps | MOCKED | Custom `MapSurface` placeholder (abstract streets/buildings/labels) + custom equirectangular projection (`projection.ts`) + rotated-`View` polylines (`route-path.tsx`). No map library, no pan/zoom, no real tiles. Camera "fit" is a manual bounds→insets projection. |
| Routing | MOCKED | Deterministic synthetic loops via `generateRoutes` / `findRoutes` behind a documented replaceable seam. `characteristics` are fixed strings. |
| Persistence | MISSING | No AsyncStorage/SQLite/file store. Only a module-level in-memory `lastResult` cache in `routing.ts`. |
| Accessibility | PARTIAL | Contrast, Dynamic-Type caps, Reduce Motion, labels, selected states and touch targets have been implemented and audited; not verified on device with VoiceOver/large text. |
| Navigation | REAL | Expo Router; root `Stack` with `(tabs)` + full-screen `routes`/`run`. |
| Tab bar | REAL | Native `UITabBar` via `expo-router/unstable-native-tabs`; Home + History; no custom drag. |
| Liquid Glass | REAL | Genuine `expo-glass-effect` `GlassView` on iOS 26 with a documented solid fallback. |
| Design system | REAL | `src/theme` tokens (colors, typography, spacing, borders, motion, layout) + primitives (`Text`, `Button`, `GlassSurface`, `MapControl`, `Divider`). |
| Haptics / Motion | REAL | `src/lib/haptics.ts` wrapper; Reanimated press spring, route draw-in, carousel emphasis; Reduce-Motion aware. |
| Tests | MISSING | None. |
| Lint | MISSING | `lint` script exists but no `eslint.config.js`; first run would auto-install ESLint and mutate `package.json`. |

### Flow walk-through (as shipped)

1. **Open → Home**: map placeholder + "Current location" pill + location control
   + distance panel + Find Routes + native tab bar. Location is the mock origin.
2. **Choose distance**: presets / +− / tap the value to type an exact distance
   (decimal-pad, inline, keyboard-aware lift). REAL.
3. **Find Routes**: 1.1 s simulated generation with status copy and a lime search
   pulse, then `router.push('/routes?distance=…')`. MOCKED data.
4. **Route Selection**: routes drawn together, Route 1 auto-selected; horizontal
   carousel with peeking neighbor cards; swipe or tap to change route; map,
   card and CTA all derive from `selectedIndex`. MOCKED geometry.
5. **Start Run**: `router.push('/run?routeId=…&target=…')` → placeholder. MISSING.
6. **Finish / Summary / Save / History**: do not exist.

## 3. Architecture assessment

### What is solid

- **Clean layering.** `src/app` (routes/screens) → `src/components` (UI) →
  `src/hooks`, `src/lib` (platform utils) → `src/services` (data) → `src/theme`
  (tokens). Screens are thin; there is no business logic inside the map
  primitives.
- **Routing is already isolated.** `findRoutes(request): Promise<RouteCandidate[]>`
  is the single seam a real provider can replace without touching screens. The
  synthetic generator and a module cache sit behind it.
- **The route model is realistic and sufficient:**
  `{ id, distanceKm, estimatedMinutes, geometry: Coordinate[], characteristics }`.
  It maps cleanly onto real provider output (geometry + distance + duration);
  `characteristics` is free-form and optional.
- **Map rendering is abstracted.** `RouteOverlay` takes `origin` + `routes` +
  `selectedRouteId` + `padding` and is provider-agnostic; `RoutePath` handles
  selected/unselected styling and is reusable. Map state (bounds, insets,
  projection) is computed in one place.
- **No premature global state.** Everything is deliberately local to the screen
  that needs it.

### State map (current)

| State | Where it lives | Lifetime |
| --- | --- | --- |
| Distance | `useState` in `(tabs)/index.tsx` (passed to `DistanceControl`) | Until Home unmounts |
| Generated routes | module-level `lastResult` in `routing.ts`; re-derived in `routes.tsx` via `getLastRoutes`/`generateRoutes` | Process lifetime |
| Selected route index | `useState` in `routes.tsx` | Until Route Selection unmounts |
| Current location | constant `MOCK_ORIGIN` | Compile-time |
| Active run / GPS / elapsed / pause | — | — |
| Completed runs / history | — | — |

### What will become problematic

- **No shared session state.** Distance, routes, selected route and (soon)
  location are spread across screens and the `lastResult` module cache. The
  active run needs `origin + selected route + start time`, and History needs
  persisted runs — none of this has a home yet. A small app-state layer (React
  context or a lightweight store) is needed before run tracking.
- **Route data is re-derived from URL params.** `routes.tsx` and `run.tsx` both
  call `generateRoutes(...)` with the same deterministic seed to reconstruct
  routes. This works only because the mock is deterministic; a real async
  provider breaks it. Routes must be passed via shared state (or a store), not
  regenerated.
- **`MOCK_ORIGIN` is imported by every map screen.** Real location must replace
  this constant and flow through one place.
- **No run model.** Everything for tracking/saving has to be introduced.

### Route model vs. needs

The current shape is sufficient for provider-backed routes. Open questions:
whether `characteristics` stays (mock-only today) or becomes derived metadata,
and whether `estimatedMinutes` should be renamed to a duration in seconds for
precision. No new fields are required to start.

### Run model (to be introduced)

Not present. The MVP needs a minimal local model, e.g.
`{ id, date, routeId?, distanceM, durationS, averagePaceSPerKm, track: Coordinate[] }`.
Do not over-engineer beyond this.

## 4. Technical blockers

These are real and must be resolved before/while building the MVP — none are
large:

1. **No bundle identifier in `app.json`.** `ios.bundleIdentifier` is unset,
   yet a generated `ios/` project on disk has `com.mattiazeminian.roam` baked in
   (config drift). A dev build / EAS / device install needs a declared id.
2. **No location permission configuration.** No `NSLocationWhenInUseUsageDescription`
   and no `expo-location` plugin in `app.json`. iOS will reject location prompts
   without these.
3. **No location/map/persistence packages installed.** `expo-location`, a map
   provider, and a persistence layer are all absent (see §8).
4. **Dead code paths that must be decided on before real maps:** `RouteOverlay`'s
   `onSelectRoute` and `RoutePath`'s hit-area `onPress` are no longer used
   (selection moved to the carousel). They should be removed or intentionally
   retained.
5. **No ESLint config.** `npm run lint` (`expo lint`) will auto-install ESLint and
   modify `package.json`/lockfile on first run; `use-color-scheme.web.ts` also has
   a `set-state-in-effect` that the default config flags. Decide to either commit
   an ESLint config or remove the script.
6. **Unused starter dependencies.** `@expo/ui`, `expo-image`, `expo-web-browser`,
   `expo-device`, `expo-system-ui` (and `expo-font`) are declared but never
   imported. `expo-splash-screen` is only used via its `app.json` plugin.
   Peer deps required by `expo-router` (`expo-constants`, `expo-linking`,
   `react-native-gesture-handler`, `react-native-web`/`react-dom`,
   `react-native-reanimated`, `react-native-safe-area-context`,
   `react-native-screens`) must stay.
7. **Debuggability of the map placeholder.** Real route geometry, camera fitting
   and provider integration will replace `MapSurface`/`projection.ts`; the
   `RouteCandidate` model and selection state should be preserved.

## 5. Product blockers

Things that stop ROAM from feeling like a real product rather than a prototype:

1. **No real location.** "Where am I?" is the first step of the product and is
   currently a hardcoded Lisbon coordinate.
2. **No real route generation.** The core promise — "ROAM finds the way" — is
   simulated. Real loop discovery is the product.
3. **No run experience.** There is no tracking, no live metrics, no finish, no
   save. The app currently ends at "Start Run".
4. **No persistence / history.** Runs cannot be saved or revisited; `History`
   and `Records` are empty by construction.
5. **No real map.** A navigation/route product needs a navigable map with the
   custom monochrome style described in `docs/map-style.md`.
6. **Branding is still Expo.** App name `roam` (lowercase), Expo app icon,
   Expo-blue splash (`#208AEF`), default Expo README. This is the first thing a
   user sees.
7. **Accessibility not device-verified.** Implemented, but VoiceOver, large text
   and Reduce Motion have not been exercised on a device.

## 6. Recommended MVP architecture

Keep it deliberately small; reuse what exists.

- **State:** one lightweight app-level layer for the session — `location`,
  `distanceKm`, `routes`, `selectedRouteIndex`, and the active run. React
  context + `useReducer` is enough; a store library is only justified if state
  becomes cross-cutting. Local UI state stays local.
- **Services (keep the seams):**
  - `services/location.ts` — wraps `expo-location`: permission state, current
    fix, foreground updates, and error states. Replaces `MOCK_ORIGIN`.
  - `services/routing.ts` — keep `RouteRequest`/`RouteCandidate` and
    `findRoutes`; swap the body for a real provider + loop algorithm. Keep the
    mock available behind a flag for development.
  - `services/runs.ts` — create/save/list runs; the only writer to persistence.
  - `services/storage.ts` — thin persistence adapter (see §8) so the backing
    store can change without touching screens.
- **Models:** `types/` (or extend `services/routing.ts`) for `Coordinate`,
  `RouteCandidate`, and a new `Run`. Reuse `Coordinate` everywhere.
- **Map:** introduce a `MapCanvas` abstraction with the same props `RouteOverlay`
  already exposes (`origin`, `routes`, `selectedRouteId`, `padding`), so screens
  do not depend on the provider. The provider (`@rnmapbox/maps` most likely)
  replaces `MapSurface` + `projection.ts` + `route-path.tsx` internally.
- **Screens:** keep Home / Route Selection; turn `run.tsx` into the real Active
  Run; add Run Summary; make `history.tsx` data-driven.
- **Theme/a11y:** unchanged — tokens, primitives, haptics and Reduce Motion carry
  forward.

## 7. Implementation roadmap

The repository suggests this order (foundation → data → run → persistence →
device), which differs slightly from the briefed phases because location, map and
routing are tightly coupled and should land together.

### Phase 0 — Repository readiness (small, do first)
- Add `ios.bundleIdentifier`, location permission strings, and the `expo-location`
  plugin to `app.json`; decide the CNG-vs-committed-`ios/` policy.
- Remove dead dependencies and dead code (or explicitly keep); add or drop the
  ESLint config.
- Rebrand: app name, icon, splash, README.
- Introduce the app-state layer and stop re-deriving routes from URL params.

### Phase 1 — Real location
- `expo-location` integration: request/deny/denied-forever/unavailable states,
  first-fix loading, and a single source of location in app state.
- Replace `MOCK_ORIGIN` everywhere.

### Phase 2 — Real map + camera
- Integrate the chosen map provider with the monochrome style from
  `docs/map-style.md`; render the current location and route polylines; implement
  camera fit using the existing insets contract.
- Keep `RouteOverlay`/`RoutePath` selection styling; retire the placeholder.

### Phase 3 — Real route generation
- Implement real loop candidates behind `findRoutes` (provider routing +
  isochrone/round-trip logic to hit a target distance); return 2–3
  `RouteCandidate`s. Add loading/error/empty handling and light caching.
- Route Selection should render real geometry with the existing carousel UX.

### Phase 4 — Run tracking
- New `Run` model + Active Run screen: start time, GPS track recording, live
  distance/duration/pace (tabular figures), pause/resume/stop (hold-to-stop),
  keep-awake, GPS-status affordance. Foreground-only for the MVP.
- Route stays drawn; position updates from the fix stream.

### Phase 5 — Persistence, summary, history
- Run Summary screen (distance hero → duration/pace; Save/Discard).
- Save via `services/runs.ts` + storage adapter. Make History a real list with a
  run detail view; derive Records from saved runs.

### Phase 6 — iPhone testing + polish
- Development build + signing; on-device validation of gestures (carousel,
  keyboard), Liquid Glass, safe areas, haptics, VoiceOver, Dynamic Type and
  Reduce Motion; battery/accuracy pass.

## 8. Dependencies

For each: why, necessity, whether Expo already provides it, and a lighter
alternative. Do not install based on this document alone.

- **`expo-location`** — real current location and run tracking.
  *Necessary.* Expo provides it (SDK 57). Lighter alternative: none meaningful;
  `react-native-geolocation-service` is heavier and less aligned. Background
  tracking would additionally need the background-location config and
  `expo-task-manager`, but is **not** required for a foreground-only MVP.
- **Map provider** — real map + tiles + polyline rendering. *Necessary for the
  product.* No provider is currently installed. Options and trade-offs in §9.
  `expo-maps` (Apple/Google maps, no custom monochrome style) and
  `react-native-maps` are alternatives to `@rnmapbox/maps`; the project's
  `docs/map-style.md` assumes Mapbox's custom styling.
- **Persistence** — save runs locally. *Necessary for History.* No Expo data
  store is installed; `expo-file-system` (57.0.7) is already present
  transitively and could hold a JSON file, but `@react-native-async-storage/async-storage`
  is the simplest key/value fit for a run list, and `expo-sqlite` is the
  structured option if History grows queries. Recommend AsyncStorage for MVP.
- **`expo-keep-awake`** — keep the screen on during a run. *Small but genuine.*
  Not installed; expo provides it. Alternatively `activateKeepAwake` is tiny and
  could be vendored via the OS in a dev build.
- **`expo-haptics` / `expo-glass-effect` / `expo-symbols` / `react-native-reanimated`**
  — already installed and used; keep.
- **Removals (not additions):** `@expo/ui`, `expo-image`, `expo-web-browser`,
  `expo-device`, `expo-system-ui` appear unused; confirm and remove rather than
  leave dead weight. Keep `expo-constants`, `expo-linking`,
  `react-native-gesture-handler`, `react-native-web`, `react-dom`,
  `expo-splash-screen` (peer/plugin requirements).

## 9. Open decisions

Only genuine choices that change the build or architecture:

1. **Map provider.** `@rnmapbox/maps` best matches the requested custom
   monochrome style and route drawing but needs an access token, a dev build and
   a download token at build time. `expo-maps` is the lightest Apple-native option
   but offers limited custom styling. `react-native-maps` sits between. This
   choice shapes Phase 2.
2. **Routing provider + loop algorithm.** Which service generates the loops
   (Mapbox Directions round-trip, isochrone-based candidates, Valhalla, OSRM) and
   how "2–3 options of ~N km" are produced. Affects keys, cost and offline
   behaviour.
3. **Persistence backend.** AsyncStorage (simplest) vs `expo-sqlite` (structured
   queries) vs a JSON file via `expo-file-system`.
4. **Tracking scope.** Foreground-only (simpler, no background entitlements) vs
   background location (survives screen-off, adds permissions and a task
   manager). The MVP can start foreground-only.
5. **Web target.** `app.json` configures a static web output, pulling in
   `react-native-web`/`react-dom`. If web is not a goal, dropping it simplifies
   dependency decisions.
6. **CNG policy.** Keep the generated `ios/` folder gitignored and regenerate via
   prebuild, or commit a native project. This determines where the bundle id and
   permissions are declared.

---

### Audit method (for traceability)

- Inspected all of `src/` (app, components, hooks, lib, services, theme), `app.json`,
  `package.json`, `tsconfig.json`, `expo-env.d.ts`, `.gitignore`, `docs/`, and the
  generated `ios/`. Traced imports to determine real vs. unused code.
- Ran: `git status`/`log`, `tsc --noEmit` (clean), `expo-doctor` (21/21),
  `expo export --platform ios` (succeeds), dependency-presence checks, and
  `grep`-based usage checks for tokens/components. No files were modified other
  than this document.
