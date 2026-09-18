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

- `src/app/(tabs)/` — the four destinations, behind the tab bar.
- `src/app/*` outside the group — flows that deliberately leave the shell:
  `onboarding`, `routes` (route selection), `run`, `run-summary`,
  `shared-route`, `location-search` (modal), and the browsing screens pushed
  over the tabs (`history`, `favorites`, `run-detail`, `settings`, `account`).

## Open follow-up

Browsing screens pushed from the root stack cover the tab bar. Apple's own
behaviour keeps the tab bar and pushes *within* the tab. Giving each tab its own
nested stack is a follow-up, not part of the shell that shipped here.
