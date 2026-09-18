# ROAM — Brand

## Positioning

ROAM is a running **route discovery** app, not a fitness tracker.

> Choose how far you want to run. ROAM finds the way.

The product answers one question at a time. It is a navigation instrument that
happens to be used while running. Distance, time and pace matter because they
describe a route, not because they are a score.

Tagline: **Run somewhere new.**

## Personality

Quiet · precise · exploratory · physical · minimal · confident · practical.

ROAM behaves like a well-made tool: it does not celebrate, congratulate or
nudge. It states what is true and gets out of the way.

## Visual principles

1. **The map is the interface.** Everything else is a control or an annotation
   on top of it.
2. **Structure with lines, not layers.** 1px borders and dividers define
   regions. Avoid cards, elevation and shadows.
3. **Monochrome by default.** The map is the only place color is allowed.
4. **Square geometry.** Corners are 0 by default; 4px is the absolute maximum.
5. **Generous whitespace.** Space is what makes a small amount of information
   feel calm.
6. **Hierarchy over decoration.** Type scale and spacing carry the design.
7. **Restrained motion.** Motion clarifies an interaction or it does not exist.

## Color direction

The interface is black, white, gray and exactly one accent: **ROAM lime**
(`#B7FF00`). No blue, orange or purple accents, no gradients, no multi-color
fitness palettes.

- Black `#000000` and white `#FFFFFF` are the primary pair.
- Gray `#6B6B6B` carries secondary text.
- A small set of neutral grays provides dividers, surfaces and disabled states.
- ROAM lime marks what is **active, selected, current, ready or "go"** — the
  selected preset, the chosen route, the current location, the primary action.

The approximate ratio is **90% neutral, 10% lime**. Lime is used as a fill, a
line or a marker, never as small text on a light background. Text placed on lime
is always black (`accentForeground`), which keeps contrast high.

Color scheme follows the system (light/dark). The map is exempt from the UI
palette and is defined separately in `docs/map-style.md`.

## Typography

Native system typography (San Francisco on iOS). No custom font dependency.

The scale is deliberately small: `display`, `large`, `title`, `heading`,
`body`, `label`, `caption`. Large sizes are tight and confident. Labels and
captions are slightly tracked so they read as technical annotations. Numeric
values use tabular figures so distance, time and pace align in columns.

## Geometry

- Default border radius: **0**.
- Maximum radius: **4px**, only when a corner genuinely needs softening.
- Borders: **1px**, black (white in dark mode).
- No pill buttons, no large rounded cards.

## App icon

The mark is a route drawn as an **R**: one rounded lime path that reads as both
the initial and a loop with a start point (the dot). It sits on near-black
(`#0E0F0C`) so the lime carries the whole identity, and the silhouette survives
down to the 40px sizes a phone actually shows.

Deliberately avoided: a running figure, a shoe, a map pin, or a generic
direction arrow.

- Assets live in `assets/images/`: `icon.png` (iOS, 1024), `android-icon-foreground/background/monochrome.png`
  (adaptive), `favicon.png`, `splash-icon.png`.
- The Android foreground keeps the mark inside the adaptive safe zone; the
  monochrome layer is a single flat colour for system tinting.
- The Expo Icon Composer asset was removed, so iOS uses `icon.png` directly.
  Dark and tinted icon variants (iOS 18+) remain a follow-up.

## Interaction principles

- Every control should feel like a physical object: solid, square, immediate.
- Feedback is immediate — a pressed control scales down slightly (≈0.97) and
  shifts its fill; nothing bounces.
- Haptics confirm meaningful actions only (preset change, route selection,
  finding routes, starting a run). Never on decorative motion.
- Motion communicates state: routes draw themselves in, selection strengthens,
  the distance value eases. No continuous or ornamental animation.
- Never block the map. Controls sit at the edges of the screen and stay small.
- One decision per screen, in this order: *Where am I? How far do I want to
  run? Where should I go? Start. Track. Save.*
- ROAM should never feel like a dashboard.
