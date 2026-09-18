# ROAM — Brand

Status: current as of #141's audit. Previously described an abandoned
black/white/zero-radius direction — square geometry, no cards, `#B7FF00` — that
does not match what shipped. Rewritten against the actual tokens in
`src/theme/*.ts`, which are the source of truth; this document names their
roles rather than inventing a parallel palette.

## Positioning

ROAM is a running app. It tracks runs, supports training, and helps a runner
find somewhere worth running — matching `docs/product.md`. Route discovery is
one capability, not the whole product; it supports the run, it never gates it.

> Open → Start Run → Run → Finish → Understand the run → Know what's next.

Tagline: **Run somewhere new.**

## Personality

Quiet · precise · exploratory · physical · minimal · confident · practical.

ROAM behaves like a well-made tool: it does not celebrate, congratulate or
nudge. It states what is true and gets out of the way — no streaks, badges or
fabricated scores anywhere in the product, training included.

## Visual principles

1. **The map is the interface** on the screens where a route is the subject
   (Home's plan preview, Routes, an active run). Elsewhere, content and
   structure carry the screen.
2. **Structure with lines and quiet surfaces, not shadows.** Borders, dividers
   and a lightly-tinted card background (`colors.surface`) define regions;
   depth comes from a ring or a flat fill, not elevation shadows.
3. **One accent color.** Green (`colors.accent`) is a *fill*, never a
   foreground on the light canvas — see Color below. Everything else is
   neutral.
4. **Restrained radii.** See Geometry — rounded, not square, but never bubbly.
5. **Generous whitespace.** Space is what makes a small amount of information
   feel calm.
6. **Hierarchy over decoration.** Type scale and spacing carry the design, not
   gradients or ornamental motion.
7. **Restrained motion.** Motion clarifies an interaction or it does not
   exist.

## Color

Tokens live in `src/theme/colors.ts`; this section names their roles rather
than restating values that will drift out of sync again if duplicated.

- **Canvas** — a warm off-white (`palette.offWhite`), not pure white, so nothing
  glares. Near-black (`palette.nearBlack`) is the inverse background.
- **Accent** — green (`palette.green`, `colors.accent`). A *fill* only: buttons,
  selection, the active route, progress. Measured at 1.42:1 on the light
  canvas, so it is never used as small text there.
- **Emphasis in type** — a dark green (`palette.greenDark`, `colors.accentText`,
  13.44:1 on the canvas) carries the brand into the big numbers — the live
  distance, a personal record — without putting the low-contrast accent on
  text.
- **Secondary text** — a warm dark gray (`palette.warmDark`, 9.05:1), not the
  lighter `palette.gray`, which fails AA on the canvas and is reserved for
  disabled states only.
- **Materials** — a translucent glass fill (`colors.glass`) for floating
  controls over the map; a flat, lightly-tinted surface (`colors.surface`) for
  grouped content elsewhere. No drop shadows; where depth is needed it comes
  from a 1px ring (`colors.border`/`borderSubtle`) instead.

No blue, orange or purple accents, no gradients, no multi-color fitness
palette. Text placed on the accent fill is always black
(`colors.accentForeground`), which keeps contrast high.

Color scheme follows the system (light/dark) wherever the app defines a dark
palette; the map itself is exempt and defined separately in
`docs/map-style.md`.

## Typography

Native system typography (San Francisco on iOS). No custom font dependency —
see `src/theme/typography.ts` for the full scale (`metric`, `hero`, `display`,
`large`, `title`, `heading`, `body`, `label`, `micro`). The scale is built
around the numbers ROAM is about — distance, time, pace — with a `metric` tier
for the one value a screen is centrally about and a quiet `micro` label
underneath it. Large sizes carry negative letter-spacing so they read as one
shape, not loose digits. Numeric values use tabular figures so distance, time
and pace align in columns.

## Geometry

Tokens live in `src/theme/borders.ts`.

- Radii are **restrained, not square**: `small` (12) for buttons and inline
  controls, `medium` (16) for cards, `large` (20) for a sheet's top corners,
  `pill` reserved for genuinely round controls (chips, circular map buttons,
  the primary action buttons).
- Borders are used sparingly — 1px hairlines and dividers, not structural
  boxes around every surface. Depth comes from materials and spacing first.

## App icon

The mark is a route drawn as an **R**: one rounded lime path that reads as
both the initial and a loop with a start point (a dot). It sits on near-black
so the accent carries the whole identity, and the silhouette is designed to
survive down to the smallest sizes a phone actually shows (shipped in #46).

Deliberately avoided: a running figure, a shoe, a map pin, or a generic
direction arrow.

Assets live in `assets/images/`:

- `icon.png` — iOS light appearance (1024): near-black ground, lime mark.
- `icon-tinted.png` — iOS 18 tinted appearance: the mark as a monochrome
  silhouette on transparency, so the system applies the user's tint. Generated
  from the same mark, never redrawn.
- `android-icon-foreground/background/monochrome.png` — adaptive icon; the
  foreground keeps the mark inside the safe zone, the monochrome layer is a
  single flat colour for themed icons.
- `mark-lime.png`, `mark-green.png` — the mark alone on transparency, for in-app
  use on dark and light surfaces respectively.
- `splash-icon.png` — the launch lock-up: the mark with the ROAM wordmark
  beneath it, shown on the near-black ground.
- `favicon.png`.

## Splash

The launch screen is the lock-up on the brand ground. The native splash holds
until the first frame is painted, then a short in-app animation (#141) takes
over: the lock-up zooms in, holds, and the whole screen eases away. It is a
quiet beat, not a show. The status bar is light over the dark launch and dark
once the app is up.

iOS appearances are wired in `app.json` under `ios.icon` (**#118**): **light**
and **tinted** are explicit. **Dark** is deliberately omitted so it falls back
to the light icon — the mark is already dark-first, and a second identical asset
would be noise rather than a distinct appearance.

## Wordmark

Uppercase `ROAM` with wide tracking in the app's own sans, weight 700 — no
custom font. It lives in `src/components/wordmark.tsx`.

The mark and the wordmark travel **separately**: the mark carries the icon and
appears alone where space is tight, while the wordmark appears rarely as a quiet
brand moment — first-run onboarding and Settings → About. They are not locked up
into one logo, and the wordmark is never placed across the product.

## Interaction principles

- Every control should feel like a physical, immediate object; a pressed
  control scales down slightly (≈0.97) and shifts its fill — nothing bounces.
- Haptics confirm meaningful actions only (selection, route found, run
  started/finished). Never on decorative motion.
- Motion communicates state: routes draw themselves in, selection strengthens,
  a value eases in. No continuous or ornamental animation.
- Never block the map on the screens where it's the interface. Controls sit
  at the edges of the screen and stay small.
- ROAM should never feel like a dashboard — even the training surfaces (Home,
  Profile) lead with one clear next action, not a wall of metrics.
