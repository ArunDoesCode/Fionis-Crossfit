# M0 Foundations — scaffold checklist

Scaffolding is **exempt from the gate rule** (no module behaviour, only tooling). Everything here must exist
before the first `/spec` → `/feature` cycle. Do it on the working branch `work/m0` in small commits; tick
items as you go. Bootstrap source for the backend and its tooling: `~/codes/ERP-diecast/backend` (copy the
files, then strip ERP domain code — do not import across repos).

## Root
- [ ] `git init`, first commit of this workflow setup, GitHub repo, `main` protected (PR + CI jobs
      `backend`, `frontend`, `member`, `fixtures` required), auto-merge on, delete branches after merge
- [ ] Labels: `P1 P2 P3`, `defect`, `uat-bug`, `idea`, `agent-pipeline`, `mod:<module>` for each module in `docs/STATUS.md`
- [ ] Worktree: `git worktree add .claude/worktrees/work -b work/m0 origin/main`
- [ ] `bash scripts/check-fixtures.sh` passes (no fixtures yet = pass)

## backend/ (Bun + Hono + Drizzle)
- [ ] `package.json` scripts exactly as in `backend/CLAUDE.md` · `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) · `biome.json` · `bunfig.toml` (test preload)
- [ ] `docker-compose.yaml` (Postgres 15), `.env.example`, `src/lib/env.ts` (zod, fails fast)
- [ ] `src/app.ts` (`createApp()` with body limit, explicit CORS, global error handler) separate from `src/index.ts`
- [ ] `src/lib/`: `errors.ts` (AppError family), `async-handler.ts`, `http.ts` (success/failure helpers), `response-schemas.ts`, `route-registry.ts`, `rate-limiter.ts`, `auth-middleware.ts` + `token.ts` skeleton (JWT via `jose`), `permissions.ts` (keys as data)
- [ ] `src/routes/end-points.ts` + `routes/index.ts` + one `health` route registered in the registry
- [ ] `src/db/client.ts` (postgres.js, `prepare:false`), `src/db/schemas/index.ts`, `drizzle.config.ts`; only infrastructure tables for now: `idempotency_keys`, `audit_log`
- [ ] `src/lib/idempotency.ts` middleware (+ table) per `backend/CLAUDE.md`
- [ ] `src/lib/sse.ts` helper (Hono `streamSSE`, `Last-Event-ID`, heartbeat comments) and `src/jobs/runner.ts` (`croner` + `pg_try_advisory_lock`), both with no feature logic
- [ ] `scripts/`: `db-reset.ts` (refuses non-local/prod), `prepare-test-db.ts`, `generate-api-manifest.ts` (**extend** to also write `.contracts/openapi.json`; `--check` verifies both), `query-api-manifest.ts`
- [ ] `tests/setup-env.ts` preload (swap to `DATABASE_URL_TEST`, refuse unless name ends `_test`), `tests/app.test.ts` smoke test via `createApp().request("/health")`, a drift test (every route registered)
- [ ] `bun run typecheck && bun run lint && bun test && bun run contract:check` green

## frontend/ (Next.js 16 — admin + TV)
- [ ] `create-next-app` (App Router, TS, Tailwind 4, Turbopack, `src/`), Bun lockfile, `biome.json`, `tsconfig` strict, `next.config.ts` with `cacheComponents`, `reactCompiler`, `typedRoutes`
- [ ] shadcn init (`components/ui` generated), `components/common/{DataTable,TablePagination,EmptyState,ErrorComponent}`
- [ ] `lib/api/{client,server,errors,routes}.ts`, `lib/{providers.tsx,queryClient.ts,env.ts,utils.ts}`, `proxy.ts`, `app/layout.tsx`, `global-error.tsx`, `not-found.tsx`
- [ ] `types:api` script: `openapi-typescript ../backend/.contracts/openapi.json -o src/types/api.generated.ts`
- [ ] Empty `src/tv/` and `src/lib/timer/` folders with a README line each pointing to the `tv-rendering` skill
- [ ] `tests/` with one trivial `bun test` so CI runs; `.env.example`
- [ ] `bun run typecheck && bun run lint && bun test` green

## member/ (Expo)
- [ ] `create-expo-app` (TypeScript, expo-router), Bun, `biome.json`, `tsconfig` strict, EAS profiles `preview` + `production`
- [ ] `src/lib/api/{client,routes}.ts` (fetch wrapper, `ApiError`, timeout), `src/lib/env.ts`, `types:api` script
- [ ] `src/ui/` skeleton: `tokens.ts`, `Surface` and `GlassButton` with the three renderings (iOS 26 / iOS < 26 / Android) behind one API
- [ ] TanStack Query provider with MMKV persister (`buster` = app version); splash held until ready
- [ ] `bun run typecheck && bun run lint` green; app boots in the iOS simulator and an Android emulator

## Pipeline smoke test (last step)
- [ ] Edit a `.ts` file → the biome hook runs; edit `components/ui/*` or `api.generated.ts` → the guard hook blocks it
- [ ] Introduce a type error and end the turn → the Stop hook blocks until fixed
- [ ] `/status` runs and reports the table in `docs/STATUS.md`
- [ ] Open the first PR (`work/m0`) with label `agent-pipeline`, CI green → merge → update `docs/STATUS.md` → `/spec auth-members`
