# Backend — CLAUDE.md

Bun + Hono + Drizzle + Zod v4 + Postgres. REST for admin/member, SSE for the TV.
**The law is `../docs/standards/hono-backend-standards.md`** (layers, single source of truth, errors, routing,
authorization, pagination contract, endpoint intake, contract publication, database, testing, security,
review checklist). Read it before writing code. This file only adds what is specific to this project and
overrides the standard where it says so. Detailed how-to: `.claude/agents/hono-builder.md` and the skills
`api-endpoint-intake`, `pagination-contract`.

## Repo layout (not a monorepo; nothing is imported from `frontend/` or `member/`)
```
backend/
├── src/
│   ├── index.ts            entry: connects DB, starts server, starts jobs
│   ├── app.ts              createApp(): middleware, routers, onError (tests use it)
│   ├── routes/             one router per feature + end-points.ts (path constants) + index.ts
│   ├── controller/  service/  repository/     three strict layers
│   ├── types/              Zod schemas + inferred types per feature (<feature>.types.ts)
│   ├── db/                 client.ts · schemas/ (Drizzle, split by domain) · migrations/
│   ├── jobs/               croner jobs (auto-end, auto-results, auto-close, gen-sessions, reminders, prune)
│   └── lib/                auth-middleware, token, errors, async-handler, env, http, route-registry,
│       └── domain/         PURE functions: scoring, timer duration, baseline, board, PR, streaks, awards
├── tests/                  mirrors src/ (routes, service, repository, lib, types) + fixtures/ + setup-env.ts
├── scripts/                db-reset, prepare-test-db, seed, bootstrap-admin, generate/query-api-manifest
└── docker-compose.yaml     local Postgres 15
```

## Project profile and deviations from the standard
- **Runtime:** Bun. **DB:** local Docker Postgres in dev/test; **Supabase-hosted Postgres in prod** (pooler
  URL, `prepare: false`). Dev uses `db:push`; before the first prod deploy switch to `drizzle-kit generate` →
  review the SQL → commit `drizzle/` → `drizzle-kit migrate` in CI/deploy (standard §10); never `push` to prod. **We use no Supabase Auth, Realtime, Storage or RLS** — authorization is
  middleware only, as the standard says.
- **Auth:** own JWT (`jose`), `Bun.password`; roles and permissions are DB rows; routes check permission keys
  (`session.manage`, `result.correct`, …). Web gets httpOnly cookies; the mobile app gets bearer tokens in the
  body when it sends `X-Client: mobile`. Login method for members (OTP vs password) is decided in the
  `auth-members` spec.
- **Domain code:** ranking, scoring, PR, streak and award rules live in `src/lib/domain/` as pure functions.
  Services load data, call them, and write. They never read the clock or the DB.
- **Idempotency (project addition):** every member-facing write endpoint requires `Idempotency-Key`
  (table `idempotency_keys`, scoped to actor + key + request hash; replay returns the stored response; key
  reuse with a different body → 422). The mobile app queues writes offline, so this is mandatory.
- **Concurrency:** one transaction per business operation; result/session operations take
  `pg_advisory_xact_lock(hashtext(session_id::text))` first; re-check state after the lock.
- **TV feed:** table `tv_events` is an outbox (bigint identity id). Events are inserted in the same
  transaction as the state change. `GET /tv/stream` is SSE with `Last-Event-ID` replay (bounded), fed by one
  shared Postgres `LISTEN` per instance. `GET /tv/snapshot` returns the full `TvState`. Event payload
  schemas are registered in the route registry so they appear in the contract.
- **Jobs:** `croner` in-process, each job guarded by `pg_try_advisory_lock`; handlers idempotent; use the same
  service functions as endpoints.
- **Pagination:** the standard's contract (`page`/`pageSize`/`meta`) applies to every list endpoint.
  Exception: `GET /tv/events` (SSE replay) is cursor-based by event id and is not a list endpoint.
- **Contract:** `bun run contract:generate` writes `.contracts/api-manifest.json` (agent-queryable) **and**
  `.contracts/openapi.json` (source of the clients' generated types). Both are committed; CI runs
  `contract:check`. Frontend and member run `bun run types:api` afterwards.
- **Tests:** BR-named (`BR-RES-04 …`), written by test-writer from the spec. Pure domain functions get
  table-driven unit tests with recorded classes in `tests/fixtures/classes/*.json`. `timer-cases.json` is
  shared byte-identically with `frontend/tests/fixtures/` (see `.claude/pipeline/PROTOCOL.md`).

## Commands
```bash
bun run dev | build | typecheck | lint | fix | test
bun run db:push           # dev DB schema from Drizzle (local only)
bun run db:reset          # wipe + rebuild + seed; refuses non-local hosts and production
bun run db:test:prepare   # create/refresh *_test DB
bun run seed | bootstrap-admin
bun run contract:generate | contract:check | contract:query "<term | METHOD /path>"
```

## Env (validated at startup by `src/lib/env.ts`; documented in `.env.example`)
`DATABASE_URL`, `DATABASE_URL_TEST` (must end `_test`), `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`
(different values), `APP_ORIGIN` (+ extra allowed origins), `EXPO_ACCESS_TOKEN` (push, optional), `SENTRY_DSN` (optional).

## Gym-domain conventions
- Score encoding and `scoreSort` (higher is always better) live in `src/lib/domain/scoring.ts`; one union per
  status/scoring type shared by controller, service, repository.
- Names shown to other members/TV go through one function that applies `showOnBoard` masking — never inline.
- Corrections: `official_*` + `status` + `correctionReason` + audit row, then board recompute and award
  diff (revoke/insert) in the same transaction.
