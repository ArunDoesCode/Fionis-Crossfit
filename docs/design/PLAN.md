# CrossFit Gym App: Plan (index)

Status: draft v2, design only. Written to be handed to a coding agent. Start with `AGENTS.md`.

## Vision

The gym floor is the interface. A **TV** runs the session: workout of the day, big animated interval/ring timer, live check-in, then a highly animated **leaderboard** that re-ranks as each athlete enters a result, flashes **achievements** (trophy, name, athlete), and finally rolls **movie-style credits** with every athlete's result. The **member app** is a fast, native data-entry and history tool. The **admin** lets trainers plan workouts and run sessions with minimal work.

Principles:
1. Trainer intervention is the exception: configure → START → END → review flags.
2. The phone appears only at the edges (check in, enter result).
3. Submitted ≠ official. Trainers can correct; boards use official values.
4. Ranking is relative to each athlete's own history ("who did best today vs usual"), with a raw board alongside.
5. Foolproof by construction: idempotent writes, offline-tolerant entry, constrained inputs, server-enforced state machine.

## Reading order

| File | Contents |
|---|---|
| `AGENTS.md` | Rules, commands, conventions for agents |
| `docs/01-architecture.md` | Components, stack, repo layout, hosting, decisions |
| `docs/02-domain.md` | State machine, scoring, ranking, PR, streaks, achievements, timers |
| `docs/03-data-model.md` | Full SQL schema, indexes, RLS |
| `docs/04-api.md` | Endpoints, schemas, errors, idempotency, TV snapshot and events |
| `docs/05-tv-spec.md` | TV scenes, animations, event queue, credits, performance, mock lab |
| `docs/06-member-app.md` | Member screens, flows, offline, Liquid Glass / Material design system |
| `docs/07-admin-app.md` | Admin screens |
| `docs/08-quality.md` | Performance budgets, failure modes, testing, CI, environments |
| `TASKS.md` | Ordered milestones and atomic tasks with acceptance criteria |

## Decision log (settled)

| # | Decision | Why |
|---|---|---|
| D1 | **Hono (TypeScript) API is the only writer and holds all orchestration.** Postgres is store + constraints + read policies. This supersedes the earlier "logic in Postgres functions" draft. | Team knows a separate backend; TypeScript is easier to test, debug, version and extend than PL/pgSQL; payments, push and achievements are integration-heavy |
| D2 | **Business rules are pure functions in `packages/domain`.** API loads data, calls them, writes results. | Unit-testable without a DB; reused by admin preview and TV timer; agents can work on them in isolation |
| D3 | API runs as a **Node container, always-on, one region co-located with the Supabase project** (Fly.io or Railway). Code stays portable (Hono) to Workers later. | Avoids cross-region DB latency and cold starts; simplest mental model |
| D4 | Member app and admin use the **API for all reads and writes**. TV uses **Realtime on `tv_events` only** plus `/v1/tv/snapshot`. | One access path; RLS shrinks to a couple of policies |
| D5 | Monorepo: pnpm workspaces + Turborepo | Shared contracts/domain across api, web, member |
| D6 | Auth: Supabase Auth, email OTP, **public signups disabled**; owner/admin creates members via API | Invite-only, no passwords, no deep-link fragility |
| D7 | Member app: **Expo (React Native)**, native tabs, Liquid Glass on iOS 26+, Material 3 Expressive on Android | iOS PWA launch/splash/push limits; see `docs/06` |
| D8 | TV is **event-driven for animation, snapshot-driven for state** (`tv_events` table, replayable) | Reconnect-safe; no missed or duplicated flashes |
| D9 | Drizzle ORM + postgres.js over Supabase pooler; SQL migrations are truth, schema generated via introspection | Typed queries, real transactions and advisory locks |
| D10 | Multi-gym ready: `gym_id` on every table from day one | Planned expansion |
| D11 | Scheduled jobs run in-process (`croner`) guarded by a Postgres advisory lock; handlers idempotent | No extra infra; safe if instances scale |

## Open questions (agent uses the default unless told otherwise)

| Question | Default |
|---|---|
| Time-capped athletes in performance ranking | Excluded from perf index; shown as "CAP +N reps" after ranked athletes |
| One-off WODs with no `benchmark_id` | Raw board only; no baseline or PR |
| One shared app vs one per gym | One shared app, gym resolved from profile |
| Payments provider | Stripe (phase 7); confirm country availability before starting |
| Booking/capacity before payments | After payments |
| TV hardware | Mini PC (Intel N100 class) running Chrome kiosk; Fire Stick 4K supported via `?perf=low` |
| Sound on TV | On, with "tap to enable" fallback and admin volume setting |
| Credits loop | Plays once after results, then ambient |

## Phases

0 Foundations → 1 Domain package → 2 Data + API → 3 Admin → 4 TV → 5 Member app → 6 Hardening and pilot → 7 Engagement and payments. Details and acceptance criteria in `TASKS.md`.

## Decisions made by agent

(append here)
