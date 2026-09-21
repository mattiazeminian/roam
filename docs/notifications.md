# ROAM — Notification policy (#78)

Status: policy decided; implementation not shipped. Reminders require
`expo-notifications` and a native rebuild, so this document fixes the rules
first. Nothing here is built until it can follow them.

## Stance

ROAM does not celebrate, nag or shame. A reminder exists only to help a runner
remember a session they asked to be reminded about. If a reminder cannot be
useful without being noisy, it is not sent.

## What may be sent

At most **one reminder per planned session**, and only these:

| Reminder | When | Copy (factual) |
| --- | --- | --- |
| Session today | On the day, at the runner's chosen time | "Easy run · 5 km is planned today." |
| Session moved | When the runner reschedules a session | "Your long run moved to Saturday." |

Nothing else. Specifically, never:

- a "you haven't run" or "don't lose your streak" message,
- a summary, a congratulation, or a milestone for its own sake,
- more than one reminder for the same session,
- a reminder for a session the runner has already completed or skipped.

## When

- **Opt-in, off by default.** Reminders are enabled by the runner, per plan.
- **One time of day**, chosen by the runner, defaulting to nothing until set.
- **Quiet hours respected.** Never outside the runner's chosen window; if none
  is set, never before 07:00 or after 21:00 local time.
- **Focus modes respected.** The notification is scheduled as a normal local
  notification, so the system's Focus and Do Not Disturb handling applies.
- **A completed session cancels its reminder.** Completing or skipping a
  workout removes its pending notification.

## Permissions

- Asked **at the point of opting in**, not at launch, and only when the runner
  turns reminders on for a plan. This is the one place a permission prompt
  appears.
- **Denial degrades silently.** If permission is denied, the toggle turns
  itself off, the app states plainly that reminders are unavailable, and
  nothing else changes. No repeated prompting, no blocking screen.

## Where it lives

- A single **Reminders** toggle in Settings, with the time, once a plan exists.
- The training surface never shows a permission prompt inline.

## What is not decided here

- Whether reminders are per-session or per-plan is a Settings detail; the
  policy above holds either way.
- Server-push is out of scope: ROAM has no backend, and every reminder here is
  a local notification scheduled on the device.
