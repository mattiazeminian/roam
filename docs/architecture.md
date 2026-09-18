# ROAM — Architecture

Status: current. A short map of how the app is put together; not a substitute
for reading the code.

## Stack

- Expo SDK 57 / React Native, TypeScript (strict), Expo Router.
- Reanimated + gesture-handler for motion and map interaction.
- `expo-location` + `expo-task-manager` for foreground and background tracking.
- `@rnmapbox/maps` for the map; OpenRouteService (ORS) for route generation.
- `expo-file-system` for all persistence — no database, no backend.
- Jest (`jest-expo`) for the service-layer suite; CI runs type-check, lint and
  tests on push and PR.

## App structure

Routes live in `src/app/` (Expo Router), rendered in a single stack:

- `index` — Home: map, Start Run, and route-discovery controls.
- `onboarding` — first-run introduction and profile setup.
- `routes` — route selection, manual editing, save/share.
- `run` — the active run.
- `run-summary` — post-run, save or discard.
- `history`, `run-detail` — saved runs.
- `favorites` — saved routes.
- `settings`, `account` — preferences and identity.
- `shared-route` — a route opened from a share link.
- `location-search` — choosing a start or finish place.

## Providers

`src/app/_layout.tsx` nests, outermost first:

```
SettingsProvider → AccountProvider → LocationProvider → RouteProvider → RunProvider
```

- **Settings** — preferences (units, pace, default distance, onboarding flag).
- **Account** — optional Apple identity, local and unverified until sync exists.
- **Location** — permission, current position, start/finish overrides. Holds the
  permission request until onboarding is complete.
- **Route** — search results, selection, manual edits and undo.
- **Run** — the live session: tracker, publishing, persistence, recovery.

## Services (`src/services/`)

- **Routing** — `routing.ts` talks to ORS only; nothing above it knows ORS
  exists. Route candidates, quality attributes, waypoint recalculation and
  one-way routing live here.
- **Run model** — `run-session.ts` is pure and synchronous: GPS filtering,
  distance, pace, progress, off-route, completion, splits, records.
  `run-context.tsx` feeds it and publishes a throttled snapshot.
- **Location** — `location.ts` is the only place `expo-location` is called;
  `background-location.ts` registers the background task.
- **Persistence** — `run-storage.ts`, `route-storage.ts`, `settings.ts`,
  `profile.ts`, `account.ts`: one JSON file per object under the document
  directory, parsed defensively so a corrupt file cannot break a screen.
- **Identity/derivation** — `route-identity.ts` (stable route key),
  `route-popularity.ts` (the runner's own history).
- **Sharing** — `route-share.ts` (polyline-encoded links), `run-share.ts`.

## Data model

`SavedRun` carries distance, duration, average pace, the recorded track and — 
since #32 — a per-point timestamp array, which makes true split records
possible. `RouteCandidate` carries distance, estimate, geometry, factual path
attributes and optional waypoints/finish.

## Principles in the code

- The tracker is pure and tested; providers hold state, not logic.
- Storage is additive and tolerant: new optional fields must not break old
  files.
- Nothing is fabricated: missing data is represented as absence, never a zero
  or an estimate.

## Known gaps

- No backend. Cloud sync (#22) and a route proxy to remove the client-side ORS
  key (#63) are unbuilt.
- No HealthKit integration yet (v0.4).
- The run state machine is being formalised (#35).
- Background location is implemented but not device-verified (#30).
