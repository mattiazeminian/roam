# ROAM

ROAM turns a single input — desired distance — into runnable routes starting
from wherever you are, then tracks and records the run. It's about *where to
go*, not scoreboards, streaks or social features. See
[`docs/product.md`](docs/product.md) for the full product thinking.

## Stack

- Expo SDK 57 / React Native, TypeScript (strict), `expo-router`
- OpenRouteService for route generation, Mapbox for map rendering
- `expo-file-system` for local, offline-first run/route persistence — no
  backend, no account required to use the app
- Jest (`jest-expo`) for the service-layer test suite

## Prerequisites

- Node.js (see `.nvmrc`/`package.json` engines if present, otherwise a
  current LTS)
- Xcode and CocoaPods, for the iOS development build
- An OpenRouteService API key ([free signup](https://openrouteservice.org/dev/#/signup))
- A Mapbox access token

**Expo Go is not supported.** ROAM uses native modules (Mapbox, location,
background tracking, Sign in with Apple) that require a development build.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in the two keys below
```

`.env.local`:

```
EXPO_PUBLIC_MAPBOX_TOKEN=...
EXPO_PUBLIC_ORS_API_KEY=...
```

Restart with `npx expo start --dev-client --clear` after changing either
value so the new value is picked up.

## Running the app

```bash
npx expo run:ios       # builds and installs the dev client on a simulator/device
npx expo start --dev-client   # subsequent JS-only iterations
```

If a native dependency changes (check `git diff` on `package.json` for new
`expo-*`/native packages), the installed dev client goes stale and the app
will crash on launch trying to load a module that isn't compiled in. Fix:

```bash
cd ios && pod install
npx expo run:ios
```

## Testing and linting

```bash
npm test          # jest — service-layer unit/integration tests
npx tsc --noEmit   # type check
npx expo lint      # lint
```

CI (`.github/workflows/ci.yml`) runs all three on every push/PR.

## Project docs

- [`docs/product.md`](docs/product.md) — product thinking and core problem
- [`docs/brand.md`](docs/brand.md) — brand direction
- [`docs/design-system.md`](docs/design-system.md), [`docs/design.md`](docs/design.md) — design system and UI decisions
- [`docs/map-provider-decision.md`](docs/map-provider-decision.md), [`docs/map-style.md`](docs/map-style.md) — mapping choices
- [`docs/project-audit.md`](docs/project-audit.md), [`docs/implementation-audit.md`](docs/implementation-audit.md) — past audits

## Backlog

Work is tracked as GitHub issues, grouped into milestones (`v0.1` core
running, `v0.2` better routes, `v0.3` account, `v0.4` sharing, `v0.5` Apple
Watch). See the repository's [Issues](../../issues) tab.
