# ROAM — Map Style

Status: direction, partially implemented. Mapbox is installed and is the map
provider (`@rnmapbox/maps`); the palette and structure below are applied, but
the base-map styling, road hierarchy and terrain treatment are still being
developed — see the "Map visual system v2" issue in the backlog. A
dependency-free placeholder surface remains for builds without a token.

The map is the dominant surface of ROAM. It is the one place in the product
where color and geography are allowed — and even there, the treatment stays
monochrome and restrained.

## Base map

A custom monochrome style, not a default navigation style.

- **Background:** very light neutral, close to white (`#F7F7F7`–`#FFFFFF`). In
  dark mode, invert to a near-black neutral.
- **Water / land:** near-identical neutral tones; water may be a hair darker or
  lighter than land, never blue.
- **Buildings:** very subtle, low-contrast neutral fills. Present as texture,
  not as objects.
- **Minor roads:** thin, light gray lines.
- **Major roads:** slightly stronger, darker gray lines — a clear step above
  minor roads but still subordinate to the route.
- **Labels:** restrained. Small, neutral gray, minimal set. Street names only
  when useful; avoid label clutter.
- **POIs:** minimal to none. No restaurant/shop icon decoration.
- **No** generic colorful navigation aesthetic, no saturated landuse colors, no
  transit overlays.

The map must read as a quiet instrument, not a colorful product screenshot.

## Running route

The route is the most important element on screen and must be visually
dominant.

- **Color:** the selected route is ROAM lime (`#B7FF00`). Unselected candidates
  are neutral (`textSecondary`) at lower weight and opacity.
- **Width:** approximately 5px selected, ~2.5px unselected.
- **Outline/halo:** a neutral halo (black in light mode, white in dark mode) is
  drawn beneath the lime line so it stays legible over any road tone. Lime on a
  very light map needs this outline to hold contrast.
- **Geometry:** smooth, continuous, no arrowheads or direction chevrons by
  default. Routes draw themselves in progressively on appearance.
- Selection is never communicated by color alone: line weight, opacity, the
  list row indicator and labels carry it too.

## Current location marker

- Small.
- Lime center with a subtle lime ring (`accentMuted`).
- Eases in once when location is available; never pulses on its own.
- During route generation, a restrained expanding lime search radius may appear
  around it.
- No avatar, no heading cone unless a run is active and heading genuinely aids
  orientation.

## Principles

1. Route first, map second.
2. Grayscale map, lime route.
3. Labels and POIs are optional; the route is not.
4. No decorative map animations. The only map motion is meaningful: the route
   drawing in, the search radius while finding routes, and route selection.
5. Any future overlay (elevation, surface, shade) must be monochrome or clearly
   subordinate to the route.

## Open questions (for when the map is implemented)

- Exact base-map color values and the dark-mode palette.
- Whether route direction is ever shown, and if so, how minimally.
- How the distance selection control coexists with the map without covering it.
