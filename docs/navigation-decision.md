# Navigation decision (#106, #113)

## The question

Should ROAM have a persistent bottom tab bar, and around which destinations?

## Previous decision (superseded)

ROAM originally shipped with **no tab bar**: a single stack with Home as a hub,
everything else pushed from it. `docs/navigation-decision.md` later confirmed
that decision, arguing that two of the four proposed destinations (Explore,
Training) did not exist yet, so a tab bar would spend permanent map-height
chrome on placeholders.

That reasoning was sound at the time. It no longer holds, for two reasons:

1. **The product direction changed.** ROAM is now a running app built around
   training, routes, recording and personal progress — not a route-discovery
   MVP with one journey. Four peer destinations are the honest shape of that.
2. **The destinations now exist as real surfaces.** Explore and Training were
   the objection; Maps and Record are real screens today, and Profile is real.
   The tabs point at content, not at placeholders.

## Decision

**A native bottom tab bar with four destinations** (epic #113):

| Tab | Surface | Issue |
| --- | --- | --- |
| **Home** | Training plan and schedule; identity and the week at a glance; Start run | #114 |
| **Maps** | Route workspace: saved routes, generation, route details | #115 |
| **Record** | Fast run start, plus starting a saved route | #116 |
| **Profile** | Identity, activity history and analytics | #117 |

### Why native, not custom

`NativeTabs` renders a real `UITabBar`. ROAM inherits Apple's behaviour,
materials, accessibility and the iOS 26 Liquid Glass treatment instead of
imitating them, and the floating bar costs less usable height than the
hand-rolled bar the original decision was measuring.

The tint is the brand's **dark green** (`accentText`), not the lime accent: the
lime is a fill colour (1.42:1 on the light canvas) and fails as a foreground on
a light tab bar.

## Structure

Each destination owns a nested stack (#119), so a secondary screen pushes
*within* its tab and the tab bar stays visible. Tab state (the selected stack
position) is preserved when switching tabs and back.

```
src/app/
  (tabs)/
    _layout.tsx            NativeTabs: (home), maps, record, profile
    (home)/                Home stack — index, plan (modal), schedule
    maps/                  Routes stack — index, favorites
    record/                Record stack — index
    profile/               Profile stack — index, history, run-detail,
                           settings, account
  _layout.tsx              root stack
  onboarding.tsx           full-screen first run
  routes.tsx               full-screen route selection
  run.tsx                  active run
  run-summary.tsx          post-run
  generate-route.tsx       full-screen route generation
  generating.tsx           full-screen generation animation
  shared-route.tsx         share-link entry
  location-search.tsx      modal
```

Home is a route group `(home)` so its URL stays `/`; `plan` and `schedule`
live under it and keep `/plan` and `/schedule`. Activity is no longer a separate
tab — it is the History screen under Profile. Record took the freed slot
(#116).

Flows that deliberately leave the shell: onboarding, route selection, route
generation and its animation, the active run and its summary, share-link entry,
and the location-search modal.

## Follow-up

- Deep links to the moved browsing screens now carry the tab prefix
  (`/profile/settings`, `/maps/favorites`). Shared routes and interrupted-run
  recovery are unaffected; they stay at the root.
