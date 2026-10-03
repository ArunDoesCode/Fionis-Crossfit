# 01 Architecture

## Components

```text
┌───────────────────┐  ┌──────────────────┐  ┌────────────────────────┐
│ Member app        │  │ Admin (web)      │  │ TV (web, Chrome kiosk) │
│ Expo / RN         │  │ Next.js /admin   │  │ Next.js /tv            │
│ iOS + Android     │  │ trainer + owner  │  │ role=display           │
└────────┬──────────┘  └────────┬─────────┘  └───────┬───────▲────────┘
         │ HTTPS (Bearer JWT)   │ HTTPS               │ GET    │ Realtime
         │                      │                     │ snapshot│ INSERT on
         └──────────┬───────────┘                     │        │ tv_events
                    ▼                                 ▼        │
            ┌────────────────────────────────────────────┐     │
            │ apps/api  (Hono, Node, always-on)          │     │
            │  auth · validation · idempotency           │     │
            │  orchestration → packages/domain (pure)    │     │
            │  jobs (croner + advisory lock) · push ·    │     │
            │  stripe webhook (phase 7)                  │     │
            └───────────────┬────────────────────────────┘     │
                            │ service role / direct PG         │
                            ▼                                  │
            ┌────────────────────────────────────────────┐     │
            │ Supabase: Postgres · Auth · Realtime ──────┼─────┘
            └────────────────────────────────────────────┘
                            │
                     Expo Push API · (later) Stripe
```

## Responsibilities

| Layer | Owns | Must not |
|---|---|---|
| `packages/domain` | Scoring, timer state, baseline/index, board computation, PR, streaks, achievements, validation rules | Do I/O, read clock, know about HTTP/DB |
| `packages/contracts` | zod schemas for requests, responses, events, TvState | Contain logic |
| `apps/api` | Auth, authz, idempotency, transactions, calling domain, writing rows and `tv_events`, jobs, push | Duplicate domain rules |
| Postgres | Tables, constraints, unique keys, indexes, `updated_at`, status-transition guard, read policies for display | Business rules, ranking, awards |
| `apps/web` `/admin` | Trainer/owner UI via API | Write DB directly |
| `apps/web` `/tv` | Render scenes from store; animate from events | Compute ranking; write anything except heartbeat |
| `apps/member` | Data entry and history via API | Compute ranking/PR; read tables |

## Tech stack

| Area | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Monorepo | pnpm workspaces, Turborepo |
| API | Hono, `@hono/zod-validator`, `@hono/node-server`, `jose` (JWT verify), pino; Hono RPC client (`hc`) gives typed calls to web and member |
| DB access | Drizzle ORM + postgres.js; Supabase transaction pooler needs `prepare: false` |
| DB/Auth/Realtime | Supabase (Postgres, Auth, Realtime Postgres Changes) |
| Jobs | `croner` in-process + `pg_try_advisory_lock` guard |
| Push | Expo push service (`https://exp.host/--/api/v2/push/send`), tokens in `push_tokens` |
| Web | Next.js App Router, Tailwind, shadcn/ui, TanStack Query |
| TV animation | `motion` (`motion/react`) for layout/presence, Web Animations API for credits, `canvas-confetti`, inline SVG trophies, Web Audio API |
| Member app | Expo (current stable SDK, New Architecture), `expo-router` + `expo-router/unstable-native-tabs`, `expo-glass-effect`, `expo-blur`, `expo-camera`, `expo-notifications`, `expo-secure-store`, `react-native-mmkv`, `@shopify/flash-list`, `react-native-reanimated`, TanStack Query (persisted), victory-native or react-native-gifted-charts |
| Validation | zod (shared) |
| Observability | Sentry (api, web, member), pino logs |
| Tests | Vitest, pgTAP, Playwright (web/tv), Maestro (member) |
| CI/CD | GitHub Actions; EAS Build/Update; Vercel (web); Fly.io or Railway (api) |

Verify current stable versions of Expo SDK, React Native, Next.js and the native-tabs API at project start and pin them in the lockfile. `unstable-native-tabs` may change between SDKs.

## Data flow examples

**Result submitted**

```text
Member app → POST /v1/sessions/:id/result (Idempotency-Key)
  API: auth → validate (domain.validateSubmission) → BEGIN
       advisory lock(session) → insert result
       load history → domain.computeBoard → upsert session_board
       domain.evaluateResultAwards → insert achievements_awarded
       insert tv_events: result_submitted, board_updated, achievement×N
       COMMIT
  Supabase Realtime → TV receives INSERTs → reducer updates store → animations
  API → 200 {result, delta, awards}
```

**TV boot/reconnect**

```text
GET /v1/tv/snapshot → TvState (includes lastEventId)
subscribe Realtime(tv_events, gym_id=eq.X)
apply events with id > lastEventId; dedupe by id
every 30s: GET /v1/tv/snapshot, compare lastEventId, reconcile if drifted
```

## Hosting and environments

- `apps/api`: Docker image, Fly.io or Railway, **same region as the Supabase project**, min 1 instance always on, health check `/healthz`.
- `apps/web`: Vercel.
- `apps/member`: EAS Build; TestFlight + Play internal track; EAS Update for JS patches.
- Environments: `local` (`supabase start`), `staging`, `prod`. Migrations only via CI/CLI.
- Universal links domain hosts `apple-app-site-association` and `assetlinks.json` (served by `apps/web`).

## Concurrency model

- All state-changing operations on a session run in one DB transaction holding `pg_advisory_xact_lock(hashtext(session_id::text))`. This serializes result submissions, board recompute and lifecycle transitions per session.
- Board recompute is a pure function of DB state; running it twice is harmless.
- Jobs take `pg_try_advisory_lock(<job key>)`; if not acquired they skip.

## Security model

- Supabase Auth issues JWTs. API verifies signature and claims, loads `profiles` row (role, gym_id, status), and authorizes every request. Roles: `member`, `trainer`, `owner`, `display`.
- Public signups disabled. `shouldCreateUser: false` on OTP. Members are created by `POST /v1/admin/members`.
- RLS enabled on all tables. Only `display` gets SELECT on `tv_events` (own gym). No client INSERT/UPDATE/DELETE policies exist.
- Secrets only in API env. Client bundles contain only the Supabase URL and anon key.
- `show_on_board=false` members appear as "Athlete" everywhere data is sent to other members or the TV.
