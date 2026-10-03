# member-records · Stream 0 (Foundation) — plan

Spec: `docs/specs/member-records.md` v2 (frozen) → "Parallel build plan" row **0 Foundation**; sub-specs
`data-model.md`, `api-contract.md`, `ux.md` (v1, frozen) + maths BR-REC-12, 51, 52, 94 + fonts BR-REC-150, 174.
Branch: `claude/member-records-foundation-57e849` (own worktree, D-017). Stop at merge point **M0**.
Baseline (2026-10-03): backend typecheck/lint/test/contract:check, frontend typecheck/lint/test, fixtures — all green.

## Decisions taken for this run (recorded as D-019)
1. Handlers not built yet answer **501 `NOT_IMPLEMENTED`** (placeholder; each stream replaces its own).
2. Access token gets a **`sid`** claim now (idempotency keys and the change log are keyed by session); auth (A) issues real ids.
3. Schema ships as **committed migration files** (`drizzle-kit generate` + reviewed SQL for extensions, exclusion
   constraint, one-row tables, `login_attempts` row, trigram indexes). `db:test:prepare`/`db:reset` migrate; no `db:push`.
4. Backend **CORS removed** (same origin, D-018); writes guarded by the Origin check (BR-REC-37).
5. **BR-REC-127 formatters** and the gym-day "today" helper are shared frontend libs built here (every stream needs them).
6. One union per enum-like column in `backend/src/lib/enums.ts`, used by Drizzle checks and Zod (BR-REC-175).

## Slices
### S1 — Contract  (backend-dev)  [ ]
BR-REC-153, 155, 157, 159, 162, 163, 164, 167, 168, 169, 175
- `lib/enums.ts`; Drizzle schema for all 13 tables (`db/schemas/*`); migration in `src/db/migrations/` with custom SQL;
  `db:migrate`; db scripts switched to migrations; CI backend job migrates.
- `types/<feature>.types.ts` (auth, settings, assessment-types/metrics, members, memberships, assessments, due,
  reports, exports, vitals): Zod request/response for E01–E40; `routes/<feature>.ts` registering all 40 with
  descriptors (E01–E03 public, rest `any-authenticated`; list routes use the shared pagination schema), handlers → 501.
- `end-points.ts`, `routes/index.ts`; `contract:generate`; `types:api` in `frontend/`.
- `.pipeline/member-records-foundation/contract.md`: endpoints + error codes + **shared module signatures**
  (domain maths both packages, middleware exports, audit helper, seed guard, golden-fixture JSON formats).

### S2 — Red tests  (test-writer ×2, zero-context)  [ ]
- backend: schema constraints (163, 164, 167, 168, 169, 175), contract/route drift (153, 155, 157, 159 + E01–E40 present),
  middleware (156 idempotency, 160 ETag, 161 headers/gzip/Server-Timing, 37 Origin), change-log helper (158),
  seed (10, 13, 65, 68) + seed:perf guard (170), domain maths (12, 51, 52, 94); golden fixtures
  `duration-cases.json`, `membership-end-cases.json` in both packages + `scripts/check-fixtures.sh` pairs.
- frontend: domain maths from the same fixtures, formatters (127), error dictionary covers every code (128, 154),
  `API_ROUTES` covers every manifest route.

### S3 — Build  (backend-dev ∥ frontend-dev)  [ ]
- backend: middleware `lib/{idempotency,origin-check,etag,server-timing}.ts` + gzip + `Cache-Control`; `lib/audit.ts`;
  `lib/domain/{dates,duration,membership}.ts`; `sid` claim; CORS out; `scripts/seed.ts`, `scripts/seed-perf.ts`
  (`seed`, `seed:perf`), `db:reset` runs seed; make S2 backend tests green.
- frontend: `/api` rewrite + env `NEXT_PUBLIC_API_URL=/api`; root layout fonts (150, 174); `/` serves Home directly
  (tactic 24); shadcn primitives via CLI; `components/shells/**` (AppShell, BottomTabBar, SideNav) + `components/common/**`
  (ux list); `lib/messages/**` (error dictionary + word list); formatters; `lib/domain/{dates,duration,membership}.ts`;
  full `API_ROUTES`; Home + Member-page frames with empty slots; route folders of the ux screen index with
  `loading.tsx` + `error.tsx`; `frontend/CLAUDE.md` env text + D-016 §14 override; make S2 frontend tests green.

### Verify  [ ]   reviewer + test-runner, max 2 fix loops
### Knowledge  [ ]   map (code locations, font sizes, gaps closed), spec implementation status, STATUS, decisions D-019

## Out (streams A–G)
Endpoint behaviour E01–E40, `bootstrap-admin`, `proxy.ts` changes, feature screens, service worker, CI budget checks.
