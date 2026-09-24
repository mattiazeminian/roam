# ROAM website package

Use this folder as the complete content package for the ROAM project on
`www.mattiazeminian.com`.

## Prompt

Create a concise UX/UI case study for **ROAM**, a mobile running app designed
around one question: **where should I run today?**

Use a premium dark editorial style: near-black backgrounds, electric lime
accent, large condensed numerals, quiet dividers, generous whitespace, and
real product screens. Keep the page recruiter-facing, visual, and concise.

Build these sections:

1. Hero — “ROAM” plus: “A running app for people who know the distance, but not
   the route.” Use the strongest Home / Today screen as the main device visual.
2. Problem — runners often know how far they want to run, but not where to go.
3. Product — ROAM generates a runnable route from the runner’s current
   location, then tracks and records the run.
4. Experience — Home / Today, Start Run, Routes, Active Run, Activity / Run
   Detail.
5. Design decisions — Today-first hierarchy, Start Run as the primary action,
   useful maps only, readable metrics, and navigation: Home / Routes / Activity
   / Profile.
6. What was built — use the feature list below.
7. Constraints — explain provider, GPS, permissions, connectivity, and route
   quality as remaining production considerations.
8. Footer — “Designed and built by Mattia Zeminian.”

Use `images/roam-mark.png` as the brand mark and `images/roam-gradient.png`
as a subtle supporting texture. The primary visuals are the iOS screenshots
captured from a real device run and stored in `images/` (see the order below).
Add one silent 3–5 second loop showing Home → Start Run → generated route.

Do not describe ROAM as a social network or a generic fitness dashboard. Avoid
long paragraphs, exaggerated claims, fake metrics, or invented features.

## What has been done

- Primary navigation: Home, Routes, Activity, Profile.
- Record preserved as a non-tab Start Run flow.
- Today-first Home with training context and recent activity.
- Distance-based route generation from the runner’s current location.
- Generated route options, saved routes, route editing, sharing, and route
  detail.
- Active run tracking with route progress, recovery, and run summary.
- History, personal records, activity detail, training plan, and shoe tracking.
- Dark visual system with lime accent states, editorial typography, and clear
  numeric hierarchy.

## Honest limitations

- Route generation depends on external map/routing providers.
- GPS permissions, connectivity, and provider availability need production QA.
- Route-shape ranking is still being refined across loops, out-and-backs, and
  real street constraints.
- The product is a strong working prototype progressing toward production.

## Recommended image order

1. `home-today.png` — hero image. Home / Today with the active plan.
2. `start-run.png` — primary action and distance selection.
3. `routes.png` — generated route geometry and options.
4. `active-run.png` — live metrics and progress.
5. `activity-detail.png` — recorded run, shoe and map.

Supporting stills also captured from the same run, for the walkthrough and
section backgrounds:

- `generate-route.png` — the distance/finish form.
- `plan.png` — the training plan and the week ahead.
- `profile.png` — the runner, totals and trends.
- `profile-shoes.png` — recent runs and the shoe cabinet (brand marks).
- `saved-routes.png` — saved routes and account.

## Use in Codex

Tell Codex:

> Use the folder `docs/portfolio/roam/` as the complete content and visual
> package for the ROAM case study on `www.mattiazeminian.com`. Follow its
> README, use the supplied images, keep the copy concise, and present ROAM as a
> premium UX/UI product case study for recruiters.
