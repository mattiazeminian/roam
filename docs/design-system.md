# ROAM — Visual System v2

Status: **current**. This is the single statement of ROAM's visual language and
supersedes every scattered note about type, colour, materials, motion and
density. `brand.md` names the identity; this document names the system that
enforces it. `design.md` (the Wise analysis the first palette was derived from)
is **historical reference only** — it does not describe ROAM and must not be
followed.

The tokens are the source of truth. All tokens live in `src/theme/`; components
import from `@/theme` only and never hardcode a colour, radius, duration or
spacing value.

```
src/theme/
├── colors.ts      # palette + semantic colour tokens + the setup theme
├── typography.ts  # font families + type scale + tabular figures
├── spacing.ts     # 4pt spacing scale
├── borders.ts     # border widths + radii
├── layout.ts      # control sizes, margins, map preview height
├── motion.ts      # named motion roles and durations
├── use-theme.ts   # resolves the semantic colour set
└── index.ts       # barrel export
```

## 1. Principles

Ordered by priority. When two pull against each other, the higher one wins.

1. **Hierarchy** — every screen says one thing first.
2. **Spacing** — space groups and separates before a border or a card does.
3. **Typography** — the type scale carries the design; colour is a fill.
4. **Information density** — enough to be useful, no more. ROAM is not a
   dashboard.
5. **Interaction clarity** — a control looks like what it does.
6. **Consistency** — one system, applied everywhere.
7. **Visual polish** — only once the above hold.
8. **Motion** — last, and only to explain a state change.

This is **better design, not more UI**. See §8 for the anti-patterns this
explicitly rejects.

## 2. Colour

### Raw palette

Internal to `colors.ts`; components never reference it.

`nearBlack` `#0E0F0C` · `offWhite` `#FBFBF9` · `white` `#FFFFFF` ·
`green` `#CDF24B` · `greenPastel` `#E4FF9E` · `greenDeep` `#B6DD2B` ·
`greenDark` `#163300` · `greenMint` `#F2FCD8` · `warmDark` `#454745` ·
`gray` `#868685` · `lightSurface` `#E8EBE6`

### Semantic tokens (use these)

| Token | Use |
| --- | --- |
| `background` | screen canvas (warm off-white) |
| `surface` | grouped/secondary surface |
| `surfaceElevated` | sheets and anything above content |
| `border` | structural hairline/1px borders |
| `borderSubtle` | low-emphasis borders and tracks |
| `divider` | horizontal rules |
| `text` | primary text |
| `textSecondary` | secondary copy (warm dark, AA) |
| `textDisabled` | disabled text only |
| `disabled` | disabled fills/borders |
| `danger` | destructive actions only (delete, discard, remove) |
| `inverse` / `inverseBackground` | text on / fill of inverted surfaces |
| `accent` | the lime **fill**: buttons, selection, the active route, progress |
| `accentForeground` | what sits on the accent (near-black) |
| `accentText` | emphasis in **type** where a green ink is wanted |
| `accentPressed` | pressed accent fill |
| `accentTrack` | inactive track of a progress control on the accent fill |
| `accentMuted` | soft lime wash for badges and progress tracks |
| `selected` / `active` / `pressed` | selection, ready state, pressed fill |
| `fill` / `fillPressed` | quiet neutral fills for secondary controls |
| `fillSubtle` | the quietest neutral fill (e.g. an inert inset) |
| `track` | inactive progress track and resting marks |
| `overlay` | a translucent readout floating over the map |
| `glass` / `glassBorder` | material for floating controls over the map |
| `shadow` / `scrim` | depth and modal dimming |

### Rules

- **The accent is a fill, never a foreground.** `#CDF24B` on the canvas is
  1.42:1, so lime text on a light ground is unreadable. Anything sitting *on*
  lime is `accentForeground` (near-black, 17.4:1). Emphasis in type uses
  `accentText` (near-black), which keeps the brand present in the big numbers
  without putting lime on white.
- **One accent.** No blue, orange or purple accents, no multi-colour fitness
  palette, no gradients used decoratively. The single exception is `danger`,
  which marks destruction (delete, discard, remove) and nothing else.
- **Colour never carries meaning alone.** Selection, state and error must also
  be legible from shape, weight, label or position. The lime is not the only
  signal that something is selected.
- **Secondary copy clears AA.** `textSecondary` (9.05:1) is used instead of the
  lighter `gray`, which is reserved for disabled states.

Measured contrast (WCAG AA, 4.5:1 normal text):

| Pair | Ratio |
| --- | --- |
| `text` on `background` | 21.0:1 |
| `textSecondary` on `background` | 9.05:1 |
| `accentForeground` on `accent` | 17.4:1 |
| `inverse` on `inverseBackground` | 21.0:1 |

`textDisabled` is exempt from the minimum (WCAG 1.4.3) and is intentionally
faint.

### The setup theme

First-run setup (`onboarding.tsx`, `onboarding-shell.tsx`) sits on a fixed
light ground regardless of system appearance. It uses the `setup` token group
in `colors.ts` rather than the semantic set above, so its light values are named
once instead of inlined per style.

## 3. Typography

Native system typeface; no custom font dependency. `Text` applies a variant, a
colour token and optional `mono` / `tabular` modifiers.

| Variant | Size | Line height | Weight | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| `metric` | 64 | 76 | 700 | -2.5 | the one number a screen is about |
| `hero` | 56 | 66 | 700 | -2 | a screen's single heading |
| `display` | 34 | 40 | 700 | -1 | secondary metrics under a `metric` |
| `large` | 30 | 36 | 700 | -0.6 | a section or sheet heading |
| `title` | 22 | 28 | 600 | -0.4 | row and block titles |
| `heading` | 17 | 22 | 600 | -0.2 | small headings |
| `body` | 16 | 22 | 400 | -0.2 | body copy |
| `label` | 13 | 18 | 500 | 0 | control and inline labels |
| `caption` | 12 | 16 | 500 | 0 | supporting copy |
| `micro` | 11 | 14 | 600 | +1.1 | the only uppercase: the label naming a value |

- Display sizes carry negative tracking so they read as one shape, not loose
  digits.
- **Negative tracking clips the last glyph — never let it.** Tracking trims the
  *advance* of the final character, not its ink, so the ink overhangs the text
  box and is cut on the right (most visible on a big numeral or a trailing
  unit, e.g. the `0` in `5.0 km`). Two rules follow, and both are load-bearing:
  1. `Text` gives the overhang back as trailing padding automatically
     (`trackingSlack` in `src/components/text.tsx`). Render text through
     `<Text>`; do not use raw `RNText` for anything with a display variant.
  2. A big number and its unit must keep room to the right, and the unit is the
     most fragile part. Never put `overflow: 'hidden'` on a number's container.
     Prefer a baseline-aligned sibling unit; if the unit is nested inside a
     value that uses `adjustsFontSizeToFit` (as the hero `Metric` does), the
     outer text must clear the slack above or the unit is what clips. If a
     single glyph is the whole value (the start countdown), reset its tracking
     (`letterSpacing: 0`) instead of relying on the padding.
- Every display line box is taller than the face's ascent + descent (~1.17em),
  so a numeral can never clip vertically; the same is **not** true if you set a
  tighter `lineHeight` at a point of use.
- Use `tabular` for every distance, time and pace value so columns align and a
  running clock does not shift width.
- `mono` is for technical values only, sparingly.
- `micro` is uppercased by the variant. Nothing else is uppercased except at a
  point of use (e.g. button text).

## 4. Spacing & density

4pt base scale: `none` 0 · `xxs` 4 · `xs` 8 · `sm` 12 · `md` 16 · `lg` 20 ·
`xl` 24 · `xxl` 32 · `xxxl` 40 · `huge` 48 · `giant` 64.

- Prefer larger tokens. When in doubt, add space rather than a border.
- `layout.screenMargin` (16) is the single horizontal page margin, used by both
  list content and controls floating over the map, so they line up.
- `layout` owns control sizes (`controlHeight` 52, `controlHeightCompact` 44,
  `controlSizeCircular` 48, `minTouchTarget` 44) and the map preview height.
  Screens inside the tab bar add no clearance of their own: `NativeTabs`
  applies the bar's bottom content inset to the first scroll view on iOS.
- Density stays low. A screen leads with one clear action, not a wall of
  metrics.

## 5. Geometry & elevation

- **Radii** (`borders.ts`): `xs` 4 for small marks (a chart bar, a badge),
  `small` 12 for buttons and inline controls, `medium` 16 for cards and
  previews, `large` 20 for a sheet's top corners, `pill` for genuinely round
  controls (chips, circular map buttons, circles).
  Use `borderCurve: 'continuous'` with a radius on iOS. Restrained, never
  bubbly; no square-zero geometry.
- **Borders** (`borderWidths`): `hairline` (`StyleSheet.hairlineWidth`) and
  `thin` (1) for structure and dividers. Use them sparingly.
- **Elevation** comes from a 1px ring (`border` / `borderSubtle`) or a flat
  fill, **not** drop shadows. `shadow` exists for the rare case a surface must
  lift over the map.
- **Materials**:
  - `glass` — translucent fill for floating controls over the map only.
  - `overlay` — a translucent readout over the map.
  - `surface` — a flat, lightly-tinted fill for grouped content off the map.
  - Do not put glass on ordinary screens. Glass is for controls that must sit
    over live map content; everywhere else, use a fill or a ring.

## 6. Motion

Motion is short and purposeful; it always communicates a state change. Four
named roles — if an animation cannot say which one it is, it is decoration and
is removed.

| Role | Token | Use |
| --- | --- | --- |
| `micro` | `microDuration` 160 | a control acknowledging a touch, cancels, small fades |
| `state` | `fastDuration` 150 | a value or selection changing |
| `transition` | `mediumDuration` 260 | a region or screen replacing another |
| `trace` | `routeDrawDuration` 720 / `routeStaggerDuration` 140 | a route drawing itself |

- Press: scale `1 → 0.97 → 1` (`pressScale`, `pressInDuration` 90 /
  `pressOutDuration` 150, `pressSpring`). No bounce.
- Durations in `motion.ts` are the only timing values in the codebase.
- **Reduce Motion is respected everywhere.** Components read
  `useReducedMotion()` (Reanimated) and fall back to an instant or static
  state; see `generating.tsx`, `plan.tsx`, `distance-control.tsx`,
  `hold-button.tsx`, `search-pulse.tsx`.
- Haptics (`src/lib/haptics.ts`, via `expo-haptics`) confirm meaningful actions
  only — selection, route found, run started/finished. Never on decorative
  motion.

## 7. Component principles

- Keep the primitive set small. Current primitives: `Text`, `Button`, `Divider`,
  `Card`, `Row`, `SectionHeader`, `Badge`, `EmptyState`, `Appear`, plus the
  shared shells (`OnboardingShell`, `FormSheet`, `GlassSurface`, `MapControl`).
  Add one only when a pattern repeats three times.
- Screens compose these; they must not restate a card or a grouped row locally
  (#137). If a screen needs a new shape, it belongs here.
- No premature abstraction.
- Components take `style` passthrough and compose via the `style` array.
- Structure comes from `Divider`, `borderWidths` and spacing — not from cards
  or shadows. A "card" is a tinted surface with a ring, used only where content
  genuinely groups.
- Icons come from the platform (`expo-symbols` / SF Symbols) and stay
  monochrome. No emoji as UI.

## 8. Anti-patterns

Reject these in review:

- Decorative gradients, glows, or colour used for its own sake.
- Glass or blur on ordinary screens; glass as a general "premium" material.
- Drop shadows as the default way to separate surfaces.
- More cards, larger radii, or heavier borders to solve a hierarchy problem.
- Animation that does not express a state change, or any continuous/ornamental
  motion.
- Lime as text on a light ground; colour as the sole carrier of meaning.
- Dashboard-style walls of metrics; gamification (streaks, badges,
  leaderboards) or celebration for its own sake.
- Hardcoded colours, radii, durations or spacing in components — if a value is
  needed, it belongs in `src/theme/`.
- Copying another product's identity. Strava, Apple Fitness, Nike Run Club and
  modern iOS apps are UX references only.

## Related documents

- `brand.md` — identity, positioning, icon, wordmark.
- `map-style.md` / `map-provider-decision.md` — the map's own visual system,
  exempt from this document and defined separately.
- `design.md` — historical Wise analysis; not current guidance.
- `product.md` / `architecture.md` — what ROAM is and how it is built.
