# ROAM — Product

## Core problem

Runners who want to run a specific distance often repeat the same loops because
finding a good route of the right length takes effort. Existing running apps
assume you already know where you are going and focus on tracking afterwards.
Planning a new route of a given distance is manual, slow and easy to get wrong.

## Core solution

> Choose how far you want to run. ROAM finds the way.

ROAM turns a single input — desired distance — into suitable running routes from
the user's current location. The user picks one, runs it, and ROAM records the
run locally. ROAM is about *where to go*, not about scoreboards.

## Design hierarchy

Every screen respects this order:

1. Where am I?
2. How far do I want to run?
3. Where should I go?
4. Start running.
5. Track the run.
6. Save it.

The map is generally the dominant visual surface. ROAM should never feel like a
dashboard.

## MVP scope

In scope:

- Show the user's location on a map.
- Let the user choose a running distance.
- Generate suitable running routes.
- Let the user select a route.
- Track the actual run.
- Save runs locally.
- Show basic run history and personal records.

Out of scope for the MVP (explicit non-goals):

- Social features: feeds, friends, sharing, leaderboards.
- Accounts, authentication or any backend.
- Cloud sync.
- Coaching, training plans or adaptive workouts.
- Gamification: streaks, badges, achievements, confetti.
- Nutrition, heart-rate or wearable integrations.
- Apple Watch support.
- Music or audio guidance.
- Turn-by-turn voice navigation.
- AI-generated anything.
- Live segments or competitive ranking.

## MVP screens

1. **Home** — the map, current location, and the distance choice.
2. **Route selection** — candidate routes for the chosen distance, presented on
   the map.
3. **Active run** — the selected route, current position, and the minimal live
   metrics (distance, time, pace).
4. **Run complete** — summary of the finished run, save or discard.
5. **History** — list of saved runs.
6. **Records** — personal records derived from saved runs.

These screens are not implemented yet. The current codebase contains only the
design foundation and a temporary placeholder screen.

## Principles

- One decision per screen.
- Local-first; a run is never lost because of a network failure.
- Monochrome interface; the map is the only chromatic surface.
- No gamification, ever.
- Fast to open, fast to start a run.
