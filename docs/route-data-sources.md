# ROAM — Route Data Sources

Status: decision document. Answers one question for the route-quality work:
**for each signal we want, can we actually know it, and from where?**

Its job is to stop route quality turning into invented data. A signal that is
not available is written down as unavailable, and the product does not claim it.

## Sources available to ROAM

1. **The ORS response itself** (already requested). `foot-walking` returns:
   - `geometry` — the polyline, with elevation when requested.
   - `summary` — distance, duration, ascent, descent.
   - `segments` — per-step instructions, distance, duration, way-point indices.
   - `extras` — per-segment data when `extra_info` is requested.
2. **ORS `extra_info` values** (per segment, with a distance summary):
   - `surface` — paved, asphalt, concrete, gravel, dirt, grass, … (verified live).
   - `waytype` — state road, road, street, path, track, cycleway, footway, steps, ferry, construction (verified live).
   - `waycategory` — road-category grouping (motorway … path).
   - `steepness` — signed grade bands.
   - `suitability` — a 0–10 composite.
   - `osmid` — the OpenStreetMap way id for each segment.
   - `green` / `noise` — available in covered regions only; not guaranteed.
   - `traildifficulty`, `tollways`, `roadaccessrestrictions`, `countryinfo`.
3. **OSM via Overpass** — query OSM tags directly (crucially, by `osmid` from
   `extra_info`), for things ORS does not surface.
4. **Mapbox** — tiles and map-matching; road class and some context.

## Signal-by-signal

| Signal | Available? | Source | Notes |
| --- | --- | --- | --- |
| Backtracking / out-and-back | **Yes** | Own geometry | Detect overlapping reversed segments from the polyline. No provider needed. |
| Direction changes / zig-zags | **Yes** | Own geometry | Turn count and density over distance. |
| Self-intersection / loop shape | **Yes** | Own geometry | Compactness, elongation, crossings of the line with itself. |
| Surface (paved/unpaved) | **Yes** | ORS `surface` | Already used for labels (#14). |
| Way type (footway, path, road, steps) | **Yes** | ORS `waytype` | Already used for labels (#14). |
| Road hierarchy / major-road exposure | **Yes** | ORS `waytype` + `waycategory` | A proportion of route distance, never a safety verdict. |
| Elevation / hills | **Yes** | ORS `ascent`/`descent`, geometry `elevation` | Provider-computed; reliable for the planned route. |
| Parks / green space | **Partial** | ORS `green` (region-dependent) or OSM `landuse=*` via Overpass | Coverage is uneven; must degrade to "unknown", not "none". |
| Trails / paths | **Yes** | ORS `waytype` (path, track) | |
| Crossings | **No (ORS)** / **Yes (OSM)** | OSM `highway=crossing`, `footway=crossing` via Overpass by `osmid` | Extra request per route; rate-limited. |
| Bridges | **No (ORS)** / **Yes (OSM)** | OSM `bridge=*` via Overpass | Same cost profile as crossings. |
| Water | **No** | OSM `natural=water` via Overpass, or Mapbox tiles | Not in the ORS response. |
| Sidewalks | **Unreliable** | OSM `sidewalk=*` | Mapped inconsistently across cities; cannot be depended on. **Do not claim it.** |
| Dead ends | **Approximate** | OSM topology via Overpass | Expensive to determine correctly; treat as unavailable for now. |
| Urban density | **Approximate** | OSM building density via Overpass, or Mapbox | Rough signal only; no strong need yet. |
| Pedestrian suitability | **Avoid** | ORS `suitability` | It is a 0–10 composite — exactly the kind of unexplained verdict the product must not surface. Prefer the explicit waytype/surface signals. |

## What this means for the build

- **Tier 1 — free, already in hand.** Geometry-derived signals (backtracking,
  turns, shape) and the ORS extras already requested (`surface`, `waytype`)
  cover the majority of the quality complaint, at no extra cost. The
  quality score (#52) should be built almost entirely from these.
- **Tier 2 — ORS, cheap to add.** `waycategory` and the raw `elevation` array
  add road hierarchy and terrain with no new provider.
- **Tier 3 — OSM via Overpass, a real decision.** Crossings, bridges and water
  need OSM lookups keyed by `osmid`. They add a second provider, a second
  failure mode, latency, and a rate-limit budget. They should land only after
  Tier 1 is measured, and only behind caching.
- **Never.** Sidewalk quality, "safety", and any composite verdict. OSM does
  not carry the first, and the product must not imply the second.

## Cost and licensing

- **ORS** — quota per API key; already the app's routing dependency. Extra
  `extra_info` fields are free in the sense that they ride along with a request
  already being made.
- **Overpass** — free, but with a fair-use policy and no uptime guarantee. Not
  appropriate for per-request production traffic without aggressive caching.
- **OSM data** — ODbL; requires attribution (already present in Settings) and
  share-alike obligations on derived databases.
- **Mapbox** — per-request billing under Mapbox terms; the app already pays for
  map tiles.

## Explicit non-claims

ROAM will not state or imply that a route is **safe**, **quiet**, **accessible**,
or suitable for a given runner. It reports what the data says — proportion of
footway, proportion of major road, surface type — and leaves the judgement to
the runner.
