# ROAM — Map Style Redesign (#152)

Status: **direction chosen — Minimal.** The audit and variants below are the
gate #152 asked for. The Minimal basemap is implemented as a generated Mapbox
style in `src/components/map/map-style.ts`, driven by
`src/components/map/map-palette.ts`; see `docs/map-style.md` for the current
system. Remaining items (start/finish markers, selected-only framing, trace
hue) are tracked in the implementation plan below and are not yet done.

Mapbox stays the provider. ORS, route generation, GPS tracking and route
accuracy logic are untouched.

## 1. What exists today

One component, `src/components/map/map-canvas.tsx`, draws every map surface.
Only it knows about Mapbox. Screens pass props; the canvas chooses camera mode
and draws route, track, progress, markers and search pulse.

### Surfaces

| Surface | File | Camera | Route roles | Interactive | Padding (t/r/b/l) |
| --- | --- | --- | --- | --- | --- |
| Routes (discovery) | `src/app/routes.tsx` | `fit` (`autoFit` off while editing) | candidates, one selected | yes (+ waypoints) | per screen |
| Record / Start Run | `src/app/(tabs)/record/index.tsx` | `center` + recenter | none | yes | 96 / 48 / 320 / 48 |
| Maps (saved routes) | `src/app/(tabs)/maps/index.tsx` | `center` | all saved, none selected | yes | `insets.top+88` / 48 / 220 / 48 |
| Home run preview | `src/app/(tabs)/(home)/index.tsx` | `fit` | one run route, selected | no | 12 all |
| Active Run | `src/app/run.tsx` | `follow` + recenter | plan neutral + completed accent + track | yes | default 48 |
| Run Summary | `src/app/run-summary.tsx` | `fit` | run route selected + track | no | 32 all |
| Run Detail | `src/app/(tabs)/profile/run-detail.tsx` | `fit` | run route selected + track | no | 32 all |
| Share card | `src/components/share-card.tsx` | `fit` | run route selected + track | no | 24 all |

### Drawing as it is coded

- **Basemap**: `MAPBOX_STYLE_URL` if set, else the Mapbox **defaults**
  `mapbox/light-v11` / `mapbox/dark-v11` (`map-canvas.tsx:25-26,169-170`).
- **Land background**: `map.land` behind the style (`#F1F1EE` light / `#141612`
  dark), from `map-palette.ts`.
- **Selected route**: line 5px, opacity 1, `accent` lime; casing 10px,
  `#163300` (light) / `#0A0B08` (dark), opacity 0.9.
- **Alternative route**: line 2.5px, opacity 0.65, `routeSecondary`; casing
  6px, opacity 0.6.
- **Track**: 4px, opacity 0.92, `track` (near-black on light, near-white on
  dark), casing `+3px`.
- **Completed progress**: 5px, opacity 1, `completed` (mid-green).
- **Markers**: 28px ring + 12px accent dot; draggable 44px ring + accent dot;
  waypoint a rounded square. No heading cone, no avatar.
- **Search pulse**: 140px lime expanding radius while generating.
- **Camera**: `center` zoom 14, `follow` zoom 16, `fit` via `fitBounds` 500ms.
- **Gestures**: pitch and compass disabled; rotate/scroll/zoom follow
  `interactive`. No pitch anywhere. Follow breaks on gesture, recenter restores.

## 2. Audit findings

Ordered by impact.

1. **The basemap is not actually ROAM's.** The palette in `map-palette.ts`
   describes a custom monochrome style, but the style itself is the Mapbox
   default Light/Dark unless `EXPO_PUBLIC_MAPBOX_STYLE_URL` is set. Default
   Light/Dark are colourful and label-heavy, which is the opposite of the
   documented intent. **This is the single largest gap.**
2. **No terrain, hillshade, contours, water or park treatment is defined.**
   Water is whatever the default style paints (usually blue), contradicting
   "water is a neutral, never blue".
3. **No start/finish markers.** `MapCanvas` draws origin and track but no
   start/finish distinction; loops and point-to-point read the same. Run
   detail/summary have no start/finish affordance.
4. **`track` and `completed` can both draw.** On Active Run with a planned
   route, the neutral track sits under the accent completed line — intentional —
   but on a free run there is only the track, in near-black/near-white, which is
   the least "activity" colour on the map. The recorded trace should read as
   activity even without a plan.
5. **Mini-maps use the same padding as full maps.** Home (12), share (24),
   summary/detail (32) differ for no stated reason; none account for the
   overlay readout on Home covering the route.
6. **`fit` frames every candidate together**, so a single selected route in a
   wide candidate set is zoomed out to accommodate alternatives the user did not
   pick. Selection changes the line, not the frame.
7. **Follow zoom 16 vs center zoom 14** is hardcoded; no rule ties zoom to
   speed or route scale.
8. **Only two route weights exist** (selected/alternative). There is no
   "remaining vs completed" distinction on the *plan* during a run beyond the
   accent overdraw, and no selected-alternative hierarchy beyond one level.
9. **Light/dark map is a palette swap**, not two designed treatments; dark is
   documented as "the light one is not simply darkened" but is authored as
   exactly that.
10. **POIs, business labels and minor labels are whatever the default style
    shows.** They compete with the route.

## 3. Reference language

- **Strava** — route is a saturated single hue on a muted basemap; completed vs
  remaining is a strong two-tone on the *same* line; start/finish are small,
  unambiguous dots; segments are the only extra accent. Active-run map is
  glanceable, high-contrast, low-label.
- **Nike Run Club** — near-monochrome basemap, one accent for the trace, heavy
  use of terrain/hillshade as subtle texture rather than colour.
- **Runna** — planned route dominant, alternatives subdued, clean framing with
  generous padding, no POI noise.
- **Apple Maps / Apple Fitness** — calm camera, gentle recenter, controls at
  edges, no forced pitch; dark map is a genuine second design, not an inversion.

Shared lesson: **context is desaturated and quiet; activity is saturated and
singular; the camera is calm and predictable.**

## 4. Proposed ROAM map design system

One small, explicit layer set. No abstraction beyond what two variants need.

### Semantic roles

| Role | Meaning |
| --- | --- |
| `context` | land, water, parks, roads, buildings, labels — all recessive |
| `planned` | the route as a reference (thin, neutral) |
| `remaining` | planned portion not yet covered |
| `completed` | planned portion covered |
| `trace` | recorded GPS path |
| `selected` / `alternative` | route candidates |
| `start` / `finish` | endpoints |
| `location` | current position + accuracy |
| `waypoint` | an editable point on the route |

### Colour rules

- Exactly **one saturated hue** on the map: the lime `accent` (route, trace,
  completed, location). Everything else is a neutral ramp.
- **Water is never blue.** Parks are a neutral-green tint, not a colour block.
- Roads form a 3-step neutral ramp (minor / major / motorway).
- Labels are one neutral, minimal set; no POI or business labels.
- Start and finish are distinguished by **shape**, not colour: start = filled
  dot, finish = ring (or square), both neutral-cased. Loops collapse to a single
  marker labelled "Start / Finish".

### Stroke rules

| Role | Width | Casing | Notes |
| --- | --- | --- | --- |
| selected | 5 | +5 | full opacity, lime |
| alternative | 2.5 | +3.5 | 0.6 opacity, neutral |
| planned (reference) | 3 | none | 0.5 opacity, neutral |
| remaining | 3 | none | neutral, dashed at low zoom only if it survives |
| completed | 5 | +4 | lime, full |
| trace | 4 | +3 | activity hue, full |

Joins/caps round. No chevrons. No decorative glow or gradient.

### Camera rules

- `fit`: pad 40, max zoom clamp so a tiny loop is not blown up; frame **only the
  selected route** plus origin, not every candidate.
- `center`: zoom 15 (was 14) — one step closer to street context.
- `follow`: zoom 16, calm 600ms ease; manual pan suspends follow, recenter
  restores; never auto-snap back.
- No pitch, no rotation by default (unchanged).

## 5. Two variants

Both are authored as a Mapbox Studio style per appearance (four style URLs
total, or one style with expressions), plus the matching `map-palette.ts`
values. Both keep the semantic roles above; they differ only in how much
*geography* is allowed through.

### Variant A — **Minimal**

> Very quiet basemap; the route is the only object.

- Land `#F2F2EF`; water `#EDEDE9` (a hair darker, never blue); parks `#ECEDE7`.
- Buildings hidden below z14, then `#E7E8E4`.
- Roads: minor `#E0E1DC`, major `#CFD0CA`, motorway `#C4C5BF`.
- Labels: only place names + major streets, `#777972`, at z13+.
- Terrain/hillshade: **off**.
- Route hierarchy unchanged from today; trace `#1C1F18`.
- Dark: land `#111310`, water `#0D0F0C`, roads `#23271F`/`#30352B`, labels
  `#8B9184`, trace `#F2F5EB`.

Best for: dense city running, route-first product identity, performance.

### Variant B — **Outdoor**

> Slightly stronger parks, trails, terrain and geographic depth.

- Land `#F1F1EC`; water `#E4E7E2`; parks `#E3E8DA`; forest `#DDE4D2`.
- Buildings `#E6E7E1` from z13.
- Roads as Minimal, plus a **trail** class `#D6DAC9` (dashed) from z12.
- Contours every 20 m, `#E4E4DD` at 0.5 opacity, z12+; hillshade subtle, land
  only, no 3D.
- Labels: + trails, peaks, water names; still no POIs.
- Dark: land `#10120E`; water `#0B0E0D`; parks `#151A12`; forest `#131910`;
  contours `#1E211A`; hillshade retained at low strength.

Best for: trails, routes with elevation, a more "running geography" feel.

### Comparison

| | Minimal | Outdoor |
| --- | --- | --- |
| Route dominance | strongest | strong |
| Context richness | lowest | moderate |
| Terrain | none | subtle |
| Trails | roads only | distinct |
| Perf risk | lowest | low (contours/hillshade) |
| City runs | best | fine |
| Trail runs | fine | best |

## 6. Recommendation

Ship **Variant A (Minimal)** as the base, with the **terrain/trail layers of
Variant B gated to zoom ≥ 12 and to routes that actually have elevation**
(`docs/training-rules.md` elevation is already available). This gives the
route-first identity in the city, where most runs happen, without giving up
trail legibility. Revisit a user-facing toggle only if real trail runs show a
need.

Rationale: the product's whole thesis is "grayscale map, lime route." Minimal is
that thesis executed honestly; Outdoor risks context competing with activity on
the screens (Active Run, Route Discovery) where glanceability matters most.

## 7. Implementation plan (direction: Minimal)

1. ✅ Author the Minimal basemap in code (`map-style.ts`), light + dark,
   generated from the palette; keep `EXPO_PUBLIC_MAPBOX_STYLE_URL` as a Studio
   override.
2. ✅ Extend `map-palette.ts` with the context ramp (water, park, motorway,
   label halo) for both appearances.
3. ✅ Add start/finish markers (`endpoints.ts`, `StartFinishMarker`); a loop
   collapses to one marker. Completed-run surfaces no longer pass `origin`,
   which used to draw a "current location" dot at the finish.
4. ◐ `fit` now includes the recorded track, fixing completed free runs that
   were framed to their last fix; framing is still every route, not just the
   selected one.
5. ⬜ Draw trace in the activity hue when there is no plan.
6. ⬜ Tune `center` to zoom 15; keep `follow` 16.
7. ⬜ Audit each surface's padding against its overlay (Home readout covers the
   route today).
8. ✅ Start/finish/location markers keep accessible labels; start and finish
   differ by shape and fill, not colour alone.

## 8. Performance & accessibility constraints

- Avoid per-frame GeoJSON rebuilds; keep `useMemo` on shapes (already done).
- Contours/hillshade only where zoom-gated; measure Active Run frame time.
- Controls keep ≥44pt targets, accessible labels and a visible state.
- Preserve Light/Dark/System and the "route colour is not the only signal" rule.

## 9. Open questions

- Is a custom Studio style acceptable to maintain, or should the base stay a
  Mapbox style plus a palette overlay?
- Should elevation-based terrain be automatic per route, or a user setting?
- Does the completed/remaining split apply to Route Discovery, or Active Run
  only (progress is only reliable there)?
