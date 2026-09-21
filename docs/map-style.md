# ROAM — Map Style

Status: **current** (#47). Mapbox (`@rnmapbox/maps`) is the provider; the
palette, route hierarchy, marker and camera behaviour below are what the app
renders. Values live in `src/components/map/map-palette.ts` (map neutrals) and
`src/theme` (route and marker colour), and the drawing is in
`src/components/map/map-canvas.tsx`. A dependency-free placeholder surface
remains for builds without a token.

The map is the dominant surface of ROAM. It is the one place in the product
where geography is allowed — and even there the treatment is monochrome, so the
route is the only thing in colour.

## Base map

A custom monochrome style, not a default navigation style.

| Element | Value | Notes |
| --- | --- | --- |
| Land | `#F1F1EE` | a touch below the page canvas, so the map reads as a surface, not a hole |
| Building | `#E6E7E3` | texture, not objects |
| Minor road | `#DCDDD8` | thin, quiet |
| Major road | `#C4C5BF` | a clear step above minor roads, still below the route |
| Label | `#6E706C` | small, neutral, minimal set |

- Water is a neutral, never blue. Land and water stay near-identical.
- POIs are minimal to none — no restaurant/shop icon decoration.
- No saturated landuse colours, transit overlays or generic navigation styling.

The map must read as a quiet instrument, not a colourful product screenshot.

## Route hierarchy

The selected route is the strongest element on every map screen; alternatives
are unambiguously subordinate. Selection is carried by **weight and opacity as
well as colour**, so it survives without hue.

| | Colour | Line width | Opacity | Casing |
| --- | --- | --- | --- | --- |
| **Selected** | `accent` (lime) | 5 | 1 | 10, `routeCasing` `#163300`, 0.9 |
| Alternative | `textSecondary` (warm dark) | 2.5 | 0.65 | 6, `routeCasing`, 0.6 |

- A dark-green casing sits under the line so the lime keeps an edge against the
  light land — the line stays accented without a light halo.
- Geometry is smooth and continuous: no arrowheads or direction chevrons.
- Routes draw themselves in progressively on appearance, and interpolate
  neutral → lime on selection (see `motion.ts`, role `trace`).

## Active-run overlays

- The recorded track is drawn in the neutral ink, not the accent.
- The covered portion of the planned route is drawn over it in the accent at
  full opacity, so progress is the one coloured thing while moving.
- The plan itself stays thin and neutral during a run: it is the reference, not
  the subject.

## Current location marker

- Small dot, `accent` fill with a neutral border, inside a ring.
- The ring is neutral (`textSecondary`) for the read-only position; a
  draggable start point uses the accent ring and a larger hit area.
- A waypoint handle is a rounded square, deliberately distinct from the origin
  circle, so "a point on the route" and "where the run starts" never confuse.
- Eases in once when location is available; never pulses on its own.
- During route generation a restrained expanding lime search radius may appear
  around it.
- No avatar and no heading cone.

## Camera behaviour

`MapCanvas` has three modes, chosen per surface:

- **`center`** — Home, Routes and Record open where the runner is. Saved routes
  elsewhere in the world must not drag the camera away from them.
- **`fit`** — a route or a recorded run is framed to its own bounds: route
  selection, run summary, run detail and the share card.
- **`follow`** — the active run tracks the runner. A rightward drag breaks
  follow, and a recenter control restores it.

Padding is passed per screen so the route is never hidden behind a panel or the
tab bar.

## Accessibility

- The map is decorative in the accessibility tree; every fact it carries is
  also stated in text beside it (distance, time, pace, route name).
- The location marker and waypoints expose labels ("Your current location",
  "Start point. Drag to move.").
- Route selection never relies on colour alone — weight, opacity and the
  surrounding list carry it.
- Contrast: the lime route always sits on its dark casing, so it holds against
  the lightest land tone.

## Appearance

The app currently renders light only; the map palette is the light system
above. When a dark appearance is added, the neutrals invert to a near-black
range and the route keeps the lime accent over a light casing, preserving the
same hierarchy and contrast.

## Principles

1. Route first, map second.
2. Grayscale map, lime route.
3. Labels and POIs are optional; the route is not.
4. No decorative map animation. The only map motion is meaningful: the route
   drawing in, the search radius while finding routes, and route selection.
5. Any future overlay (elevation, surface, shade) must be monochrome or clearly
   subordinate to the route.
