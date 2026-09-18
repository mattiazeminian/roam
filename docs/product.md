# ROAM — Product

Status: current. Supersedes the original MVP framing that listed accounts,
training, Health, sharing and Apple Watch as non-goals.

## What ROAM is

ROAM is a running app. It tracks runs, supports training, and helps a runner
find somewhere worth running. Route discovery is one capability, not the
product.

The core loop:

> **Open → Start Run → Run → Finish → Understand the run → Know what's next.**

A runner who does not want a generated route must still be able to start running
immediately. A runner who does want one must be able to get one without
friction. Route generation supports the run; it never gates it.

## The two journeys

Both start from Home, and neither may gate the other.

1. **Run now.** Open → Start Run → run → finish. A route is not required. What
   was actually run is recorded, and can be saved as a route afterwards — so
   somewhere you discovered becomes somewhere you can run again.
2. **Plan, then run.** Explore → generate a route → save it. Later, at run time,
   choose it from saved routes and run it directly.

Home therefore always offers Start Run first, surfaces the runner's own
statistics and identity, and offers saved routes as an optional way in.

## Core problem

Runners repeat the same loops because finding a good route of a given length
takes effort. Existing apps assume you already know where you are going and
focus on the run afterwards. Planning a new route is manual, slow and easy to
get wrong.

But that is only one of the problems ROAM addresses. A running app that cannot
start a run without a route is a route generator, not a running app.

## Core solution

1. **Run** — start immediately, track it properly, understand it afterwards.
2. **Route discovery** — choose how far, get a route a human runner would
   actually choose, then run it.
3. **Training** — set a goal, get a structured week, follow it.
4. **Health & profile** — connect Apple Health where it genuinely helps, keep a
   runner profile that is honest about what it is.

## Design hierarchy

1. Can I start running right now?
2. Where to run, if I want somewhere new.
3. What should I be doing this week?
4. What have I done?

The map is the dominant surface where a route or a run is in play. ROAM is not a
dashboard.

## Primary action

**Start Run.** One tap from open. Everything else is secondary to it.

## Principles

- **Route first, when there is a route.** The route is the strongest element on
  the map; the map stays monochrome and the accent is reserved.
- **One decision per screen.** ROAM should feel simpler than the alternatives,
  not more capable.
- **Local-first.** A run is never lost because of a network failure. Route
  generation is the one networked step, and it must never block running.
- **Nothing fabricated.** Distances, records, popularity, elevation, running
  level and any health value come from real data or are not shown. Absence is
  stated, never filled with an estimate.
- **No gamification.** No streaks, badges, leaderboards or celebration for its
  own sake.
- **No medical claims.** Training guidance is deterministic, rule-based and
  explains itself. ROAM does not prescribe, diagnose or predict.
- **Restraint.** Typography-led, generous spacing, native iOS behaviour,
  meaningful motion, Reduce Motion respected.

## Explicit non-goals

- Social feeds, followers and leaderboards. Sharing exists; a network does not.
- Turn-by-turn voice navigation.
- Calorie counting and body-composition features.
- An "AI coach". Guidance is deterministic and inspectable.
- Any metric that cannot be computed honestly from data ROAM actually has.

## Roadmap

Milestones in GitHub are the source of truth; this is the shape:

- **v0.1 — Run** — the core loop: start immediately, track, finish, understand.
- **v0.2 — Routes** — route quality that a runner would choose, and the map
  that presents it.
- **v0.3 — Training** — goals, planned workouts, structure.
- **v0.4 — Health & Profile** — onboarding, running profile, Apple Health.
- **v0.5 — Social & Sharing** — sharing beyond the app.
- **v0.6 — Advanced** — Apple Watch, Live Activities, analytics, offline.

## Related documents

- `architecture.md` — how the app is put together.
- `map-style.md` — the map's visual direction.
- `design-system.md` / `brand.md` — visual language.

Historical documents (kept for context, not current guidance) are marked as
such in place.
