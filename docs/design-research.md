# ROAM Design Research

Research-only document. No screenshots or third-party assets are reproduced
here. No implementation was changed.

## Method

- **Skill:** `ui-ux-pro-max`, complete workflow. Stack detected as React Native
  0.86 / Expo SDK 57 from `package.json` + `app.json`, so `--stack react-native`
  and the `web` (app-interface) domain were applied.
- **Searches run:** `--design-system` (minimal/swiss, variance 2, motion 2,
  density 3); `--domain ux` (navigation, map controls, distance input, loading
  feedback, lists, primary action, gestures); `--domain web` (bottom tabs, safe
  areas, dynamic type); `--stack react-native` (overlays, sheets, permissions,
  lists); `--domain style` (monochrome/minimal, swiss); `--domain product`
  (running GPS, parking finder, road trip, travel); `--domain icons`.
- **Dataset gaps (reported as 0 results, not fabricated):** `product` for
  "maps", `web` for "map location permission", `react-native` for "bottom
  sheet modal". Map-specific guidance in the dataset is thin, so those sections
  lean on established platform patterns and are marked as such.
- **Mobbin:** **not available in this environment.** No Mobbin MCP server is
  configured (global `opencode.jsonc` is empty, no project config, no `mobbin`
  binary). Section 9 therefore summarizes pattern families from the skill
  dataset plus established, widely-observable mobile conventions — not live
  Mobbin inspection. If Mobbin becomes available, re-run section 9 against real
  references.
- **Key dataset finding:** the product profile "Running & Cycling GPS"
  recommends *Dark Mode (OLED) + Vibrant & Block-based* with "energetic orange +
  pace zones (green/yellow/red)". That is precisely the generic fitness
  aesthetic ROAM rejects. Meanwhile "Parking Finder", "Ride Hailing" and
  "Public Transit Guide" all recommend *Minimalism & Swiss Style* with a
  **neutral map**. ROAM should follow the map-utility branch, not the fitness
  branch.

---

## 1. Product UX patterns

**Appropriate for ROAM**

- **Map-first, one primary control.** The map is the base layer; controls are
  small annotations at the edges. No dashboard, no metric grid on Home.
- **Progressive disclosure, one decision per screen.** Distance → routes → run →
  summary. This matches `product.md` and the dataset's guidance on clear
  primary action and loading feedback.
- **Bottom-anchored controls in thumb reach.** The primary action and the
  distance control live at the bottom, inside the safe area.
- **Async feedback without noise.** Route generation is a real wait: show a
  restrained progress state and disable the action while it runs (dataset:
  "Loading Buttons" — disable during async; "Loading States" — never freeze the
  UI).
- **Predictable navigation.** Back must preserve state and never exit the app
  unexpectedly (dataset severity: **Critical**). Modals/sheets need an obvious
  close action (severity: **High**). Returning to a screen restores scroll and
  selection state.
- **Quiet confirmation.** Haptics for start/pause/stop and destructive confirm;
  no celebratory animation.
- **Local-first.** Runs and history are usable with no network; degrade quietly.

**Navigation model recommendation**

The MVP has six destinations, but a bottom tab bar would compete with the map
for the most valuable screen space and push ROAM toward a "dashboard" feel.
Recommendation:

- **Root: Home (map).** Full-bleed map, no header.
- **Push: Route selection** and **Active run** as full-screen routes — both need
  maximum map area and a clear back path.
- **Sheet/modal: Run summary** after a run, with explicit Save / Discard.
- **History and Records** reachable from a single small control on Home (and
  from the summary), not from a persistent tab bar.

If a tab bar is later proven necessary, cap it at three items (Run / History /
Records) and keep it visually minimal — but the default should be no tab bar.
This is a product decision to validate, not a settled fact.

**Patterns to avoid at the product level:** social feeds, leaderboards,
streaks, daily-goal rings, and any screen whose main content is a grid of
numbers.

---

## 2. Home screen

Recommended hierarchy (top to bottom, map is the background):

1. **Map**, full screen, current-location marker visible.
2. **Location name** (optional, small caption) — answers "where am I?" without a
   header bar.
3. **Locate-me control** — small square button (SF Symbol), top-right, above the
   control surface.
4. **Distance control** — bottom, single row: a label ("DISTANCE"), the selected
   value in large tabular type with its unit, and step adjustments.
5. **Primary action** — one full-width square button: **Find routes**. Disabled
   while generating.
6. **Secondary access** — a small, quiet control to **History / Records**.

Interaction: the user adjusts distance, taps Find routes, and route generation
begins. Nothing else competes for attention.

States to design:

- **Permission not granted:** a quiet inline panel on the map with one clear
  action to enable location. Never a blocking modal, never a dead end.
- **Generating:** the primary button shows a busy/disabled state; the map stays
  visible.
- **No routes found:** one plain sentence plus a suggestion to change distance;
  no illustration.
- **GPS weak:** a small status note; never display invented data.

Explicitly absent: greeting, app title, stat tiles, weather, streaks, "welcome
back".

---

## 3. Map interaction

- **Map is the base layer; controls float only at the edges.** Avoid stacking
  multiple cards over the map.
- **One control surface at a time.** A single bottom sheet/bar is the control
  surface; do not combine a tab bar, a sheet, and a floating card.
- **Respect system gestures.** Do not hijack horizontal swipes on main content
  (dataset: "Gesture Conflicts"), and do not override the iOS back-swipe or
  Control Center gestures. Pan/zoom stay standard.
- **Locate-me** is a small square control; it re-centers without a pulsing halo.
- **During route selection:** route lines are the dominant map content; the map
  auto-fits route bounds.
- **During an active run:** follow position by default, but allow manual pan and
  provide a re-center control. Avoid constant re-centering jitter. No heading
  cone unless it clearly aids orientation.
- **Keep the base map quiet** (see `map-style.md`): neutral tones, minimal POIs,
  restrained labels — so the route always wins.
- **Accessibility is a hard requirement here:** a map-only interface is not
  accessible to screen readers. Every map state needs a non-map equivalent
  somewhere (route distance/name as text, the distance value announced, the
  primary action reachable). The dataset's "color is not the only indicator"
  and "meaningful icons need a text alternative" rules apply directly.

Dataset note: map-specific UX coverage was thin (2 generic results), so this
section is a synthesis of platform conventions rather than a database match.

---

## 4. Distance selection

Patterns considered:

| Pattern | Precision | Accessibility | Fit for ROAM |
| --- | --- | --- | --- |
| Continuous slider | Low | Drag-only unless alternatives added | Poor |
| Segmented presets (5/10/21) | Fixed | Good | Partial |
| iOS wheel picker | High | Good | Heavy, dated |
| Numeric keypad | High | Good | Slow, more taps |
| **Stepper + presets** | High | Good | **Recommended** |

**Recommendation: a stepped control, not a slider.**

- A horizontal set of common targets (e.g. 2, 5, 10, 15, 21 km) plus `−` / `+`
  adjustment in 1 km (optionally 0.5 km below 5 km).
- The selected value is the hero: large, tabular figures with the unit set
  smaller beside it. This satisfies the brand rule that distance is core
  information.
- A visible label ("DISTANCE") above the value — never rely on a placeholder
  (dataset: "Input Labels" severity High; "Input Affordance").
- Square geometry, no pill, no colored track.
- **Accessibility:** expose increment/decrement actions and the current value to
  VoiceOver; if a slider is ever added, a stepper alternative is mandatory
  (dataset: WCAG 2.2 "Dragging Movements", severity High).

Product nuance: routes are approximate, so copy should present the choice as a
*target* ("about 5 km") while route results show their actual distance.

---

## 5. Route selection

- **Offer a small set: 1–3 candidate routes.** More creates decision paralysis
  and clutters the map.
- **Compare on the map, not in a table.** All candidates are drawn; the selected
  one is visually dominant, the others subdued.
- **Differentiate without color** (brand is monochrome and color is not a safe
  sole indicator): use line weight, opacity, and selection state, plus a text
  label per route. Never rely on hue alone.
- **Bottom sheet list** with one row per route: actual distance (primary,
  tabular), estimated time, and a short shape/identifier. Selecting a row
  highlights its line and fits the map to it.
- **Primary action becomes "Start this route."** Secondary: regenerate or back.
- **Keep it dismissible** (dataset: "Modal Escape", severity High) and never let
  the sheet cover the whole map.
- Omit elevation/surface for the MVP, or show at most one short line of text.
- While generating, keep the map visible and disable actions.

---

## 6. Active run

- **Map dominant**, route highlighted, current-position marker.
- **Exactly three live metrics: distance, time, pace** — large, tabular, high in
  the hierarchy. No heart rate, cadence, calories, elevation, or weather.
- **One primary control: Start / Pause**, large and bottom-anchored. A
  **Stop** action should require a deliberate gesture (e.g. hold-to-confirm) so
  a run is not ended by an accidental tap.
- **Lock control** to prevent stray touches while running (common in run apps);
  keep it small and unobtrusive.
- **Keep the screen awake** during an active run.
- **Feedback:** subtle haptic on start/pause/stop. No animated route drawing, no
  progress rings, no celebration.
- **GPS status** shown quietly; never fabricate or smooth data silently.
- Auto-pause is optional; if included, make its state explicit.
- No live segments, no social overlays, no music controls.

---

## 7. Run summary

Information hierarchy:

1. **Distance** — the largest element.
2. **Duration** and **average pace** — secondary, tabular, aligned.
3. **Route shape** — a small map/route thumbnail (optional; may reuse the map).
4. **Splits** — omit for the MVP unless essentially free; if added later, keep
   monochrome and subordinate.
5. **Primary action: Save.** **Secondary: Discard**, destructive, with a
   confirmation.

Tone: state facts. No "Great job!", no badges, no confetti, no share sheet in
the MVP. A quiet, useful title (e.g. a distance-based route name) is acceptable;
free-text naming is optional and can wait.

---

## 8. History

- **FlatList** (RN dataset: use FlatList for 50+ items, memoize rows, stable
  `keyExtractor`, `useCallback` handlers).
- Reverse-chronological list; optional grouping by month.
- **Row content:** date, distance, duration, pace — tabular figures, separated
  by 1px dividers, **no cards and no shadows**.
- **Empty state:** one quiet line plus a single action to start a run.
- Tap a row → run detail (map + stats). Preserve list scroll position when
  returning (dataset: "Preserve Screen State").
- **Records** can be a small pinned section or a separate screen: a short list
  of derived personal bests (e.g. longest run, fastest 5 km). Derived locally,
  presented as plain rows.
- No charts required. Any future trend view must be monochrome and clearly
  subordinate to the list.

---

## 9. Visual references

Mobbin was unavailable, so this section summarizes **pattern families** observed
across established map-first and activity apps. App names are cited as pattern
references only; no screens, screenshots, or assets are reproduced.

- **Map-first navigation (e.g. Google Maps, Apple Maps, Citymapper):** map fills
  the screen; a bottom sheet is the single control surface; a small locate
  control sits above it; chrome is minimal and neutral. *Transferable:* the
  bottom-sheet-as-control-surface model and the locate control.
- **Outdoor / route discovery (e.g. AllTrails, Komoot, Footpath):** the route
  line is visually dominant; a bottom sheet carries route stats; selection is
  driven from the map. These use color and elevation profiles — *ROAM keeps the
  structure but replaces color with line weight/opacity and monochrome.*
- **Running / activity (e.g. Strava, Nike Run Club, Apple Fitness):** the active
  screen shows very large distance and time with one dominant start/pause
  control and hold-to-stop; summaries emphasize a few hero numbers.
  *Transferable:* the hero-number hierarchy and hold-to-stop. *Rejected:* social
  feeds, segments, rings, badges.
- **Travel / exploration (e.g. Wanderlog, Flighty, Airbnb):** strong type
  hierarchy and generous whitespace; information-dense but calm. *Rejected:*
  rounded cards, hero imagery, and marketing layouts.
- **Apple HIG conventions (platform reference):** SF Symbols, safe-area
  compliance, back-swipe, sheet grabbers, dynamic type, reduced-motion support.
- **Recurring, reusable patterns:** bottom sheet as the primary control surface;
  a small locate control; segmented/stepper number selection; hold-to-confirm
  destructive actions; bottom tab bars capped at 3–5 items.

---

## 10. What ROAM should NOT do

- **The fitness-app aesthetic:** orange/green pace zones, glowing progress
  rings, gradient arcs, heart-rate red. The dataset's own "Running & Cycling
  GPS" recommendation is exactly this — ROAM should not follow it.
- **Gamification:** streaks, badges, achievements, leaderboards, live segments,
  confetti, praise copy.
- **Dashboard patterns:** grids of metric tiles, KPI cards, charts on Home.
- **Decoration:** rounded cards, drop shadows, glassmorphism/blur as ornament,
  gradients, oversized illustrations.
- **Tab-bar overload:** many icons, or any chrome that competes with the map.
- **Color on the map:** blue water, saturated landuse, colored route lines,
  colored route differentiation.
- **The "AI-generated" look:** generic hero sections, gradient text, floating
  rounded cards, emoji as icons, purple/indigo gradients, "insights" panels,
  chat-style UI.
- **Overloaded run screens:** heart rate, cadence, calories, weather, music
  controls.
- **Motion as decoration:** pulsing location halos, animated route drawing that
  delays information, page transitions that carry no meaning.
- **Traps and dead ends:** modals with no close action, blocking permission
  gates, silent async updates, color-only meaning.
- **Social/marketing surfaces:** feeds, profiles, share-first flows.

---

## 11. Recommendations

1. **Visual direction is validated.** The dataset's "Minimalism & Swiss Style"
   (monochrome black/white, radius 0, no shadow, single accent) matches the
   existing `brand.md` and `design-system.md`. Keep the current tokens; no token
   changes are required by this research.
2. **Navigation:** no bottom tab bar for the MVP. Map-root Home; push Route
   selection and Active run; Summary as a sheet; History/Records from a small
   Home control. Treat this as a hypothesis to validate.
3. **Home:** map + bottom distance control + one primary action + locate control.
   Nothing else.
4. **Distance:** stepped control (presets + `−`/`+`), large tabular value, visible
   label, accessible increment/decrement. Not a slider.
5. **Route selection:** 1–3 routes as map overlays, differentiated by weight,
   opacity and labels (never color alone), with a bottom-sheet list and
   "Start this route".
6. **Active run:** three big metrics, one Start/Pause control, hold-to-stop,
   lock control. Nothing more.
7. **Summary:** distance hero, then time/pace; Save/Discard; no praise.
8. **History:** virtualized list, tabular rows, dividers not cards, quiet empty
   state, records pinned.
9. **Accessibility is a gate, not a polish step:** non-map text equivalents for
   routes, 44pt targets, dynamic type, reduced motion, contextual permission
   handling, and no color-only meaning.
10. **Known research gaps:** Mobbin was unavailable; the dataset has no product
    guidance for map apps, no map-permission guidance, and no RN bottom-sheet
    guidance. Validate the navigation model and distance control with a small
    usability test (time-to-first-route, adjustability) before building screens.

**Net change to the current direction: none to the visual system.** The open
questions are structural — navigation model and the distance control — and both
should be validated before any screen is implemented.
