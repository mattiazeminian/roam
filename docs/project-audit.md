# ROAM — Project Audit

> **Historical.** An audit of the `create-expo-app` starter before any ROAM
> feature existed, on 2026-09-15. Kept for context; see `product.md` and
> `architecture.md` for the current state.

Date: 2026-09-15
Repo state: initial commit (`4d8eb94 Initial commit`), working tree clean before audit.

ROAM is an iOS-first Expo/React Native running route discovery app. No product
features have been implemented yet. The repository is a freshly generated
`create-expo-app` starter (Expo SDK 57 / React Native 0.86 template) with Expo
branding still in place.

## 1. Current stack

| Layer | Version (package.json / installed) |
| --- | --- |
| Expo SDK | `expo ~57.0.22` (installed 57.0.22) |
| React Native | `0.86.3` |
| React | `19.2.3` (`react-dom` 19.2.3) |
| Expo Router | `~57.0.21` (installed 57.0.21) |
| TypeScript | `~6.0.3` (installed 6.0.3) |
| Reanimated / Worklets | `4.5.1` / `0.10.1` |
| React Native Web | `~0.21.0` |
| Node / npm | v22.18.0 / 11.5.2 |
| Xcode (local) | 26.6 (Build 17F113) |

Other runtime dependencies: `@expo/ui`, `expo-constants`, `expo-device`,
`expo-font`, `expo-glass-effect`, `expo-image`, `expo-linking`,
`expo-splash-screen`, `expo-status-bar`, `expo-symbols`, `expo-system-ui`,
`expo-web-browser`, `react-native-gesture-handler`, `react-native-safe-area-context`,
`react-native-screens`.

Not present (correct for this stage): maps, GPS/location, database/persistence,
AI, health/watch integrations, navigation-state libraries, styling frameworks.

## 2. Project structure

```
.
├── app.json                 # Expo config (app name, icons, plugins, experiments)
├── package.json             # main: expo-router/entry; scripts
├── tsconfig.json            # strict TS, @/* and @/assets/* path aliases
├── expo-env.d.ts            # generated, gitignored
├── assets/
│   ├── expo.icon/           # Apple Icon Composer icon (Xcode 26+)
│   └── images/              # starter icons, splash, tab icons, Expo branding
├── scripts/reset-project.js # starter reset helper
├── src/
│   ├── app/                 # Expo Router routes (root = src/app)
│   │   ├── _layout.tsx      # ThemeProvider + animated splash + native tabs
│   │   ├── index.tsx        # "Welcome to Expo" home tab
│   │   └── explore.tsx      # Explore tab (starter docs)
│   ├── components/          # themed primitives + starter widgets
│   ├── constants/theme.ts   # Colors, Fonts, Spacing, layout constants
│   ├── hooks/               # use-theme, use-color-scheme (+ .web variant)
│   └── global.css           # web font CSS variables
├── .vscode/                 # editor settings + Expo extension recommendation
└── docs/project-audit.md    # this file
```

Notes:
- Expo Router root is auto-detected as `src/app` (confirmed by Metro output:
  "Using src/app as the root directory for Expo Router").
- Platform-specific component files exist: `app-tabs.web.tsx`,
  `animated-icon.web.tsx`, `use-color-scheme.web.ts`.

## 3. Important configuration

- **Entry point:** `"main": "expo-router/entry"` in `package.json`.
- **App config:** `app.json` — name/slug `roam`, scheme `roam`, portrait only,
  `userInterfaceStyle: automatic`.
  - iOS icon: `./assets/expo.icon` (Apple Icon Composer format).
  - Android adaptive icon + web favicon configured.
  - Plugins: `expo-router`, `expo-splash-screen` (background `#208AEF`).
  - Experiments: `typedRoutes: true`, `reactCompiler: true`.
- **TypeScript:** extends `expo/tsconfig.base`, `strict: true`, path aliases
  `@/* -> ./src/*` and `@/assets/* -> ./assets/*`.
- **Generated route types:** `.expo/types/router.d.ts` matches current routes
  (`/`, `/explore`, `/_sitemap`).
- **Native projects:** `.gitignore` ignores `/ios` and `/android` — Continuous
  Native Generation (CNG); native folders are generated on demand.
- **Styling approach:** React Native `StyleSheet` + a central theme module
  (`src/constants/theme.ts`) exposed via `ThemedText`/`ThemedView` and
  `useTheme()`. Web-only CSS via `src/global.css` and
  `animated-icon.module.css`. No NativeWind/Tamagui/Unistyles.

## 4. Current state / verification

Checked on 2026-09-15:

- `npx expo-doctor` → **21/21 checks passed**.
- `npx tsc --noEmit` → **passes** (no type errors).
- `npx expo export --platform ios` → **iOS bundle succeeds**
  (1521 modules, Hermes `.hbc` produced).
- Xcode 26.6 installed; iOS simulators available (iPhone 16/17 family).
- No native `ios/` folder exists yet; expected with CNG. A simulator run would
  generate it, or use Expo Go / a development build.

Conclusion: **the existing project is healthy and can run on iOS.** The only
user-facing content is the Expo starter.

## 5. Problems found

1. **No ESLint config committed.** The `lint` script exists (`expo lint`) but no
   `eslint.config.js` is tracked, so the first run auto-installs
   `eslint`/`eslint-config-expo` and mutates `package.json`/lockfile. When run,
   it reports one error in starter code:
   `src/hooks/use-color-scheme.web.ts:11` — `react-hooks/set-state-in-effect`
   (`setHasHydrated(true)` called synchronously in an effect).
2. **Starter content, not ROAM.** Screens, components, copy, and assets are all
   Expo template/branding ("Welcome to Expo", Expo logos, docs links, two demo
   tabs).
3. **iOS build identity missing.** No `ios.bundleIdentifier` and no `eas.json`.
   Fine for Expo Go, but a development/EAS build will require them.
4. **Branding not set.** App name/slug are lowercase `roam`; icons, splash, and
   tab icons are Expo assets; README is the default Expo README (no ROAM docs).
5. **No test setup** (no Jest/testing-library config or tests).
6. **Minor:** `expo-system-ui` is a dependency but `app.json` does not set a
   root `backgroundColor`; the root layout component is named `TabLayout` though
   it composes `NativeTabs`.
7. **Unstable API in use:** tabs rely on
   `expo-router/unstable-native-tabs` (iOS-native tab bar). Its API may change
   across SDK 57 patch releases.
8. **React Compiler is enabled** (`experiments.reactCompiler: true`); new code
   must follow compiler-safe React rules (e.g. no conditional hooks, careful
   with refs/mutation).

No broken configuration was found — the issues above are template leftovers and
missing setup, not faults.

## 6. Recommended next steps

Do not start these until product work is explicitly requested.

1. **Set up lint properly:** add an `eslint.config.js` (flat config via
   `eslint-config-expo`), commit lint devDependencies, and fix the
   `use-color-scheme.web.ts` effect error.
2. **Establish ROAM branding:** update `app.json` (display name, slug,
   `ios.bundleIdentifier`, splash/icon assets) and replace the default README.
3. **Remove/replace starter UI:** delete the Expo demo screens, Expo-logo
   animation, and unused starter assets; keep the reusable theme primitives
   (`ThemedText`, `ThemedView`, `useTheme`, `constants/theme.ts`).
4. **Decide the styling system** (keep the current `StyleSheet` + theme module,
   or adopt NativeWind) before building UI, to avoid a costly migration later.
5. **Prepare iOS delivery:** add `eas.json` and an iOS bundle identifier when a
   development build is needed; confirm the Icon Composer icon builds with the
   installed Xcode.
6. **Plan permissions early:** location permission strings
   (`NSLocationWhenInUseUsageDescription`) and map/GPS libraries will be needed
   for the core MVP; add them only when that work begins.
7. **Add testing** once there is logic to test (unit tests for route
   generation/records; keep it lightweight).
8. **Keep the pinned stack** (Expo SDK 57, RN 0.86, React 19.2) aligned via
   `expo install` / `expo-doctor` and consult the versioned docs at
   https://docs.expo.dev/versions/v57.0.0/ before adding libraries.
