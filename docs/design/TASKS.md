# TASKS

Work top to bottom. One task = one PR-sized commit. Tick `[x]` when done and note deviations under the task. Every task must also satisfy the Definition of Done in `docs/08-quality.md`.

Legend: **Docs** = read first. **Accept** = acceptance criteria. **Verify** = commands/evidence.

---

## M0 Foundations

- [ ] **T0.1 Monorepo scaffold**
  Docs: `AGENTS.md`, `docs/01`.
  Do: pnpm workspaces + Turborepo; `apps/{api,web,member}`, `packages/{contracts,domain,db,ui-tokens}`; shared `tsconfig.base.json` (strict), ESLint, Prettier, Vitest; root scripts from `AGENTS.md` (stubs allowed for db/e2e).
  Accept: `pnpm install && pnpm lint && pnpm typecheck && pnpm test` pass on empty packages.
- [ ] **T0.2 Local Supabase**
  Do: `supabase init`; config: signups disabled, email OTP on; `seed.sql` placeholder; `pnpm db:start|db:reset|db:test|db:pull`.
  Accept: `pnpm db:reset` succeeds from a clean machine.
- [ ] **T0.3 CI**
  Do: GitHub Actions per `docs/08` (lint, typecheck, unit, db reset + pgTAP placeholder).
  Accept: CI green on main.
- [ ] **T0.4 Env modules**
  Do: zod-validated env loaders for api/web/member; `.env.example` files.
  Accept: apps fail fast with a readable message on missing env.

## M1 Domain package (`packages/domain`, pure, test-first)

Docs: `docs/02-domain.md`. No I/O, no clock reads. Fixtures in `packages/domain/fixtures/`.

- [ ] **T1.1 Scoring**: types, `scoreSort`, `direction`, `formatValue`, `parseValue`, `deltaText`.
  Accept: table tests for every scoring type incl. capped time and rounds+reps ordering.
- [ ] **T1.2 Timer**: `timerState` for `for_time`, `amrap`, `emom`, `intervals`, countdown, finish boundaries.
  Accept: tests at exact boundaries (start, phase edges, end), rest=0 phases, cap and no-cap.
- [ ] **T1.3 Baseline and index**: `computeBaseline`, `perfIndex`.
  Accept: < 2 priors → null; median of last 3; window 365 d; capped/excluded ignored; division isolation.
- [ ] **T1.4 Board**: `computeBoard` (ranked, unranked, pending ordering; raw ranks per division; tie-breaks).
  Accept: golden fixtures (6, 18, 30 athletes) match expected boards; deterministic.
- [ ] **T1.5 PR detection**: `detectPr` (`BASELINE_SET`, `PR`, capped never PR).
- [ ] **T1.6 Streaks and stats**: `computeStreak` (ISO weeks in gym timezone, threshold, freeze, current-week rule).
  Accept: DST boundary and year-boundary tests.
- [ ] **T1.7 Achievements**: catalog constants + `evaluateCheckinAwards`, `evaluateResultAwards`, `evaluateSessionAwards`, `diffAwards` (for revocation).
  Accept: each catalog row in `docs/02 §8` has a passing and a failing test; revocation diff covered.
- [ ] **T1.8 Validation**: `validateSubmission` (hard errors, outlier detection).
  Accept: every rule in `docs/02 §3` covered.

## M2 Data and API

- [ ] **T2.1 Migration 0001 core schema**: all tables/types/indexes from `docs/03`, `updated_at` trigger, status transition guard.
  Accept: `pnpm db:reset` ok; pgTAP verifies guard allows/denies the listed transitions.
- [ ] **T2.2 RLS and pgTAP**: enable RLS everywhere; display-only select on `tv_events`.
  Accept: pgTAP proves anon/member cannot read or write any table; display reads only own gym's events.
- [ ] **T2.3 Seed data**: 1 gym, owner, trainer, display user, 20 members, global benchmarks (Fran, Grace, Helen, Cindy, Back Squat 1RM, Deadlift 1RM…), workouts for each timer mode, 8 weeks of past sessions/results/attendance giving realistic baselines, achievement defs from `docs/02 §8`.
  Accept: seed runs; a fresh `computeBoard` over a seeded session produces a mix of ranked/unranked/pending.
- [ ] **T2.4 `packages/db`**: drizzle schema via introspection, client (`prepare:false` for pooler), `withSessionLock(sessionId, fn)` transaction helper.
  Accept: integration test proves two parallel `withSessionLock` calls run serially.
- [ ] **T2.5 `packages/contracts`**: zod schemas for everything in `docs/04` (requests, responses, `TvState`, `BoardRow`, events, errors).
  Accept: example payload fixtures parse; types exported.
- [ ] **T2.6 API skeleton**: Hono app, env, pino, error handler (`docs/04` format), JWT verification (`jose`), profile loading, role guards, idempotency middleware, `/healthz`, CORS, rate limit on write endpoints; `AppType` export.
  Accept: tests for 401/403, idempotent replay, key-reuse 422.
- [ ] **T2.7 Admin CRUD**: workouts (lock + new-version), benchmarks, templates, sessions create/assign/patch.
  Accept: integration tests incl. `WORKOUT_LOCKED`.
- [ ] **T2.8 Lifecycle**: start/end/show-results/close/cancel/undo, `tv_events` emission, jobs `auto-end`, `auto-results`, `auto-close`, `gen-sessions` (croner + advisory lock).
  Accept: state machine tests; job tests with injected clock; double-run job is a no-op.
- [ ] **T2.9 Check-in and attendance**: `POST /check-in`, admin add attendance, `checkin` events, check-in awards, `member_stats` update.
  Accept: window boundaries, idempotent replay, `COMEBACK` and streak awards.
- [ ] **T2.10 Submit result**: full transaction per `docs/04` write-path (validate → upsert → board → PR → awards → events → maybe auto-transition).
  Accept: end-to-end test with 18 athletes; parallel submit test produces consistent board; outlier 409 then confirmed; late submit.
- [ ] **T2.11 Corrections**: `PATCH /admin/results/:id`, exclusion, recompute, revoke awards, `achievement_revoked`, audit log.
  Accept: correcting a PR result removes PR award and updates later PR chain.
- [ ] **T2.12 Member reads**: `/me/context`, `/me/history`, `/me/benchmarks/:id`, `/me/stats`, `/boards`, `/me/achievements`, `/config` (with min version gate).
  Accept: contract tests; `showOnBoard=false` masks names for others.
- [ ] **T2.13 TV endpoints**: `/tv/snapshot` (incl. ambient), `/tv/events`, `/tv/heartbeat`.
  Accept: snapshot equals replay of events from empty state for a scripted class (consistency test).
- [ ] **T2.14 Push**: token registration, Expo push sender, triggers (class reminder, collecting started, recap) with failure handling (invalid tokens pruned).
  Accept: unit tests with mocked Expo API.
- [ ] **T2.15 Full-flow API test**: create workout → schedule → check-in ×18 → start → end → submit ×18 (with PRs/outliers/late) → results → close; asserts board, awards, events order.
  Accept: passes in CI.

## M3 Admin web (`apps/web` `/admin`)

- [ ] **T3.1 Shell**: Next app, Supabase auth (OTP), role guard, Hono RPC client, layout.
- [ ] **T3.2 Workouts editor** with timer-config builder and live `RingTimer` preview (uses `timerState`).
- [ ] **T3.3 Schedule**: templates and week planner, assign workouts.
- [ ] **T3.4 Live control**: START/END/SHOW RESULTS/undo, live counts, TV-online indicator.
  Accept: drives a full session against local API.
- [ ] **T3.5 Exceptions and results editor** (corrections with reason).
- [ ] **T3.6 Members, displays, settings, audit.**
  Accept (M3): Playwright covers create workout → run session → correct result.

## M4 TV (`apps/web` `/tv`) — see `docs/05-tv-spec.md`

Build mock-first: T4.1 and T4.2 must exist before any scene is tuned.

- [ ] **T4.1 TV shell**: 1920×1080 scaler, theme tokens, fonts preloaded, Zustand store + `applyEvent` reducer (unit tested), scene router from `session.status`, cross-fade transitions.
- [ ] **T4.2 Lab + scenario player**: `/tv/lab`, JSON scenarios (`full-class-18`, `small-class-6`, `big-class-30`, `emom-12`, `tabata`, `for-time-capped`), event buttons, speed control, `?mock=`.
  Accept: scenario runs end to end with no backend.
- [ ] **T4.3 Workout scene**: countdown, `RingTimer` (all modes), `WodCard` with active-step highlight, athlete strip, audio cues.
  Accept: visual check for each mode; timer matches `timerState` within one frame.
- [ ] **T4.4 Gather scene**: WOD card, QR panel, attendee strip with fly-in chips, corner toasts for check-in awards, starts-in pill.
- [ ] **T4.5 Live board scene**: `BoardTable`/`BoardRow` with layout animations, row states (pending/just-submitted/rank change/PR/corrected), count-up, pagination for n > 12, VS USUAL / RAW lens toggle.
  Accept: 30-athlete scenario stays legible; reorder spring matches spec.
- [ ] **T4.6 Achievement overlay + queue**: tiered Trophy SVGs, confetti/sparkles/rays, sounds, queue rules (priority, dedupe, overflow merge, revocation).
  Accept: burst of 10 awards plays sequentially without overlap; queue unit tests.
- [ ] **T4.7 Credits scene**: title card, podium, WAAPI roll with sections and dotted leaders, closing card; duration from content height.
  Accept: smooth roll for 6, 18, 30 athletes; ≥ 25 s minimum.
- [ ] **T4.8 Ambient scene**: rotating cards from `ambient` data.
- [ ] **T4.9 Live wiring + resilience**: snapshot boot, Realtime on `tv_events`, gap fetch, 30 s reconcile, backoff, reconnect pill, heartbeat, watchdog reload, `/tv/login`, perf monitor + `?perf=low`.
  Accept: network-kill test holds scene and reconciles without duplicate overlays.
- [ ] **T4.10 Visual regression + hardware checklist**: Playwright screenshots for lab scenes; document tested hardware and results in `docs/05`.

## M5 Member app (`apps/member`) — see `docs/06-member-app.md`

- [ ] **T5.1 Scaffold**: Expo app, `expo-router`, native tabs, tokens, `Surface`/`GlassButton` abstraction (glass/blur/material), splash hold, theme (light/dark).
- [ ] **T5.2 Auth**: email OTP, secure-store session persistence, sign-out, unknown-email message.
- [ ] **T5.3 API client and offline**: Hono RPC client, TanStack Query persisted to MMKV, mutation queue with idempotency keys and "pending sync".
- [ ] **T5.4 Today + check-in**: context states, universal link handler, in-app scanner, confirm screen.
- [ ] **T5.5 Result entry**: constrained inputs per scoring type, division, capped flow, echo confirm, outlier sheet, submitted screen with haptics.
- [ ] **T5.6 History, Benchmark detail, Progress**: lists, charts (Y flip for time), PR markers, streak, achievements shelf.
- [ ] **T5.7 Board screen**: today/week/month/all-time.
- [ ] **T5.8 Push**: permission after first check-in, token registration, handlers, deep link to Today.
- [ ] **T5.9 Profile and forced-update gate.**
- [ ] **T5.10 Maestro e2e** for sign-in → check-in → submit → history, plus offline submit.
  Accept (M5): runs on iOS 26 sim (glass visible), iOS 18, Android emulator; perf budgets measured and recorded.

## M6 Hardening and pilot

- [ ] **T6.1 Observability**: Sentry in api/web/member, alerts on error rate, cron job logging.
- [ ] **T6.2 Load and soak**: 60 simulated athletes submitting within 10 s; TV 4 h soak (memory stable).
- [ ] **T6.3 Security review**: authz matrix tests, rate limits, secrets audit, RLS re-check.
- [ ] **T6.4 Release pipeline**: staging/prod deploy, EAS build + TestFlight/Play internal, universal links verified on device.
- [ ] **T6.5 Pilot**: real gym, 10+ members for 2 weeks; log issues; fix blockers.

## M7 Engagement and payments (after pilot)

- [ ] **T7.1 Weekly/monthly/all-time board queries** (materialized or indexed) and UI polish.
- [ ] **T7.2 Streak/badge UI** expansion and TV milestone moments.
- [ ] **T7.3 Stripe**: plans, Checkout, webhook (`stripe_events` dedupe, signature verify), membership status, soft "expired" flag in admin.
- [ ] **T7.4 Booking/capacity** (only if demanded).
- [ ] **T7.5 Second gym onboarding**: verify `gym_id` isolation tests, per-gym branding.
