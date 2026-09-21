# Training rules (#68)

The rules that turn a plan into a week, and a week into a single suggestion.
They are **deterministic, inspectable and testable** — given the same inputs
they produce the same output — and they use only data ROAM actually has.

This document exists so the rules cannot be invented by accident inside a
screen, and so it is obvious what ROAM will and will not claim.

## Inputs

Everything a rule may read, and nothing else:

| Input | Source |
| --- | --- |
| Goal kind, target distance, race date | `TrainingPlan.goal` (#67) |
| Runs per week | `TrainingPlan.runsPerWeek` (#67) |
| Preferred weekdays | `TrainingPlan.preferredDays` (#67) |
| Level | `TrainingPlan.level` (#67) |
| Recent mileage | recorded runs (`SavedRun`) |
| Recent workouts and their outcomes | `PlannedWorkout.status` (#67) |
| Today's date | the device clock |

Not inputs, because ROAM does not have them or cannot use them honestly:
heart rate, heart-rate zones, VO2 max, injury history, age, weight, sleep,
weather, terrain difficulty scores.

## Rule 1 — The shape of a week

A week is composed from **roles**, then mapped onto the runner's chosen days.

| Runs per week | Composition |
| --- | --- |
| 1 | one **easy** run, plus a **long** run on the weekend |
| 2 | one **easy**, one **long** |
| 3 | **easy**, **short** or **tempo**, **long** |
| 4 | **easy**, **easy**, **short** or **tempo**, **long** |
| 5 | **easy** ×2, **recovery**, **short** or **tempo**, **long** |
| 6+ | as 5, with the extra sessions as **easy** |

Invariants, in the order they are applied:

1. Exactly one **long** run per week when there are two or more runs.
2. A hard session (**tempo** or **intervals**) is never scheduled the day
   before or after the long run, and never on consecutive days.
3. At most **two** hard sessions per week at level `regular` or below, **three**
   at `experienced`.
4. A **recovery** run follows a hard session when the runner runs three or more
   times a week.
5. **Intervals** are introduced only at `regular` and above, and only for a
   `race` or `distance` goal.

`short` and `tempo` are alternatives for the same slot; the choice is made by
Rule 4, not by preference.

## Rule 2 — Which days

The runner's `preferredDays` are the days that may hold a session. Mapping:

- The **long** run takes the last preferred day of the week (the weekend day
  when one is chosen).
- Hard sessions are placed as far from the long run as the chosen days allow.
- Easy and recovery runs fill the remaining preferred days, earliest first.

If `runsPerWeek` exceeds the number of preferred days, the extra sessions are
placed on the days nearest the existing ones rather than dropped — and the week
is reported as **over-full** rather than silently reduced.

## Rule 3 — How far

Distances are derived from the runner's own recent running, never from a
generic table.

```
baseline   = median distance of the runner's last 10 recorded runs,
             or the plan's target distance, or 5 km if there is no history
easy       = baseline
recovery   = 0.5 × baseline, floor 2 km
short      = 0.75 × baseline
long       = baseline × (1.3 at level new/occasional, 1.5 at regular, 1.7 at experienced)
tempo      = baseline × 1.1
intervals  = baseline × 0.8
```

All values are rounded to the nearest 0.5 km and floored at 2 km.

For a `distance` or `race` goal with a date, distances scale so the long run
reaches at least 80% of the target before race week. That is arithmetic on the
runner's own target, not a predicted finish time.

## Rule 4 — Progression

Evaluated weekly, on the completed week, using only recorded outcomes:

| Condition | Action |
| --- | --- |
| ≥ 80% of sessions completed, and no session marked `skipped` twice in a row | **advance**: long run +5%, up to the goal ceiling |
| 50–79% completed | **hold**: repeat the same week |
| < 50% completed, or the same session skipped twice | **reduce**: long run −10%, floor at baseline |
| A *reduce* immediately after an *advance* week | **step back**: hold before advancing again |

Progression never exceeds the goal: a `distance` goal of 10 km does not produce
a 12 km long run, and a half-marathon plan does not exceed 21.1 km.

Every change is stated to the runner in one line ("Long run up to 8 km"), and
can be overridden (too hard / too easy / not now). An override is remembered and
is not undone by the next evaluation.

## Rule 5 — The next suggestion

The suggestion for today is the scheduled workout for today, in this order:

1. A workout scheduled for today, whatever its type.
2. Nothing scheduled today → the next scheduled workout, shown as upcoming
   (never moved onto today).
3. A missed workout from the last **two** days → offered as a catch-up, clearly
   labelled as missed, never silently rescheduled.
4. No plan → no suggestion; the runner is offered a plain run instead.

A completed day immediately shows as completed. A day that passes without a
recorded run is marked `skipped` only after the day ends, so a run finished late
in the evening still counts.

## What ROAM will not do

- **No heart-rate zones, no VO2 max, no calorie or "load" targets.** These need
  data ROAM does not measure, and inferring them would be fabrication.
- **No injury, medical or recovery advice**, and no claims that a session
  improves a physiological marker.
- **No predicted race times.** Progress is described in the runner's own
  distance and frequency, not in an outcome ROAM cannot know.
- **No hidden weighting.** Every rule above is the whole rule; if a behaviour is
  not written here, it does not happen.

## Testing

Each rule is a pure function over the inputs above, so it is unit-tested
directly:

- week composition for every `runsPerWeek` and level,
- hard-session spacing around the long run,
- distance derivation from a known run history, and from none,
- progression for each condition, including the step-back case,
- a runner override surviving the next evaluation,
- the "over-full week" report when preferred days are too few.
