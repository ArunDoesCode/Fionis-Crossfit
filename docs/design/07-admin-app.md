# 07 Admin app (`apps/web` route `/admin`)

Desktop/tablet-first web for trainers and owners. All access via the API (Hono RPC client). Role guard in middleware: `trainer|owner` only.

## Screens

| Screen | Purpose |
|---|---|
| **Live control** (home) | Today's sessions as cards. Big **START / END / SHOW RESULTS** buttons for the active session, **Undo** (within 5 min), live counts (checked in, submitted, pending), TV-online indicator. Trainer banner message to TV optional |
| Exceptions | Outlier-flagged results, present-without-result, "add missed attendee" search. One-tap accept or correct |
| Results editor | Session results table; correct value/division/finished or exclude with required reason; audit trail; shows board preview after edit |
| Workouts | Library; editor with movements list, scoring type, divisions, benchmark link, **timer config builder** (for time / AMRAP / EMOM / intervals) with live `RingTimer` preview using `packages/domain` `timerState`; publish; new-version action for locked workouts |
| Schedule | Session templates; week planner (assign workout to each session); copy last week |
| Members | Invite (creates user + sends OTP), role, status, visibility flag |
| TV / Displays | Online status from heartbeat, TV login instructions, test-message button |
| Settings | Gym name, timezone, collect minutes, streak threshold, accent color, TV volume |
| Audit | Recent corrections and lifecycle changes |

## Rules

- Trainer happy path must be three taps: open Live control → START → END. Everything else is optional.
- Destructive or corrective actions require a reason (results) or confirm (cancel/undo).
- Forms validate with shared zod schemas; server errors shown inline.
- TanStack Query with short stale times; Live control polls `/admin/sessions/:id/live` every 5 s plus refetch on action.

## Acceptance checklist

- Create workout with each timer mode; preview matches TV behavior.
- Run a full session from Live control with the TV lab/real TV and two test members.
- Correct a result; board, PR and awards update; audit row exists.
