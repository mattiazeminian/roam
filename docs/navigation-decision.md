# Navigation decision (#106)

## The question

ROAM shipped with no tab bar: a single stack with Home as a hub, everything
else (routes, run, history, favorites, settings, account) pushed from it.
That was a deliberate trade-off, documented in `src/app/_layout.tsx`'s
original comment: *"The product is one journey... a two-item tab bar spent
permanent chrome on a destination used a fraction of the time, and cost the
map 68pt on the screen that matters most."*

The product has since grown a second and third pillar — a route-quality
system and a training system are being built out (issues #52–78), plus
account/profile work (#79–91). #106 asks whether the no-tabs decision still
holds now that the product is heading toward four peer destinations: **Run,
Explore, Training, History/Profile**.

## The decision

**Not yet. Keep the stack model for now; revisit once Training and a real
Profile screen actually exist.**

This directly evaluates the four proposed destinations against what the
codebase contains today (as of this issue):

| Proposed tab | Real content today? |
|---|---|
| **Run** | Yes — Home, with Start Run as its primary action (#33, #34). |
| **Explore** | No dedicated screen. Route discovery lives *inside* Home (origin/distance/finish pickers, "Find routes") — there is no separate "Explore" surface to point a tab at without inventing one from scratch, which is out of this issue's scope. |
| **Training** | Does not exist. Issues #67–78 (data model, plan, schedule, recommendations, execution, history) are entirely unbuilt. |
| **History/Profile** | Half-real. History is a genuine, complete screen. "Profile" as a peer destination is not — #21 shipped a thin name-and-stats addition to the existing Account screen; the actual "Profile screen: identity, stats and saved routes" (#89) that would justify a tab is itself blocked on Training's rule set and Apple Health (#83, #84).

Building a tab bar today would mean two of its four items — Explore and
Training — are either invented on the spot or empty shells. That fails this
same issue's own acceptance criterion: *"No destination becomes a dead
end."* A tab that opens to nothing, or to a screen built only to fill the
tab, is a dead end with extra steps.

### The map-height trade-off, addressed

The original 68pt cost argument still holds, and is *stronger* today, not
weaker: Start Run is now the very first thing on Home (#33, #34), so the map
is doing more load-bearing work for the core loop than it was when this
project started. Spending permanent vertical chrome on a tab bar is a cost
best paid when there are genuine peer destinations to justify it — paying it
now, for two real destinations and two placeholders, is the worse trade, not
a neutral one.

### Why this isn't "skip the issue"

The parts of #106 that don't depend on Training/Profile existing are real
and are addressed now, without a tab bar:

- **Start Run reachable in one tap from the default landing state** — already
  true: Home is the landing surface after onboarding, and Start Run is the
  first control on it (#34).
- **No destination becomes a dead end** — verified against every pushed
  screen (`history`, `favorites`, `run-detail`, `settings`, `account`): each
  has an explicit `router.back()` (or, for the two replace-based flows —
  onboarding and the finished-run summary — a deliberate forward-only path
  with no back gesture, which is the existing, intentional design, not an
  oversight).
- **Deep links resolve correctly** — `shared-route.tsx` (`roam://` links) and
  the interrupted-run recovery handoff are untouched by this decision; they
  don't route through anything a tab bar would change.
- **History is already reachable in one tap** from Home's map controls (the
  clock icon), which is most of what a persistent "History" tab would have
  bought — without the permanent map-height cost.

What is genuinely deferred: **Training and History/Profile as first-class
tab destinations.** That criterion cannot be honestly satisfied before
Training exists. Revisit this document once #67–78 (training) and #89
(profile screen) have landed — at that point there will be three or four
*real* destinations, and the map-height cost becomes the right trade to pay.

## Re-evaluation trigger

Revisit this decision when either:
- A training plan/schedule is real enough to be a destination someone opens
  repeatedly (roughly: #70 "Generate a weekly schedule from a plan" and #77
  "Training screen: the week at a glance" have shipped), or
- The full profile screen (#89) ships, giving "History/Profile" real content
  beyond a stats blurb.

At that point, re-open this document (or a successor) and decide the tab set
against what actually exists then, not against what's planned.
