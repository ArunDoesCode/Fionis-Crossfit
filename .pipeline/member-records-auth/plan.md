# Plan — member-records/auth (Stream A)

Spec: `docs/specs/member-records/auth.md` v1 (frozen 2026-10-03), index `docs/specs/member-records.md` v2 →
Parallel build plan, Stream A. Branch: `claude/member-records-parallel-build-f18292` (own session/worktree, D-017).
Rules: BR-REC-01, 02, 25…44, 171 (23) · Endpoints E01–E06 · Tables `app_account`, `auth_sessions`,
`login_attempts` (built by Stream 0) · Screens S1 `/login`, S17 `/admin/settings/account`.

## Status
**Paused 2026-10-03 — waiting for Stream 0 (M0) on `main`.** At planning time `origin/main` = d326c6f (spec only):
no tables, no member-records routes, empty contract. User chose "plan now, pause". Resume with
`/feature member-records/auth --resume` once Stream 0 is merged.

**Stacked on Stream 0 (user decision 2026-10-03):** no waiting for a Stream 0 PR. When the foundation session
(`claude/member-records-foundation-57e849`, local branch) has committed its build (its plan S3 ticked), merge that
branch into this one and build auth on top; never edit Stream 0 files, never rebase theirs. Re-merge its later
commits before the PR. One PR = Stream 0 + auth (shrinks to auth only if the Stream 0 PR merges first).
Foundation's D-019 already adds the `sid` claim to `lib/token.ts`; auth builds on that version.

## Resume checklist (before slice 1)
- [x] `git merge claude/member-records-foundation-57e849` — merged its S1 contract (4969dee) early; re-merge S3 build before the backend goes green.
- [x] `cd backend && bun run db:test:prepare` (own DB `gym_auth_test`); `bun install` in both packages.
- [x] Baseline re-checked by backend-dev after merges (non-auth red = Stream 0's own open tests).
- [x] Check Stream 0 delivered what auth builds on (else stop and tell the user):
      tables `app_account` / `auth_sessions` / `login_attempts` (one seeded row) · E01–E06 registered in
      `routes/end-points.ts` with `types/auth.types.ts` · `lib/audit.ts` (change-log writer) · `lib/origin-check.ts`
      (BR-REC-37) · `/api` rewrite in `next.config.ts` (BR-REC-36) · `API_ROUTES.auth.*` in `frontend/src/lib/api/routes.ts` ·
      error-code dictionary has `INVALID_CREDENTIALS`, `LOGIN_LOCKED`, `RATE_LIMITED`, `SESSION_EXPIRED`,
      `CURRENT_PASSWORD_WRONG`, `CSRF_ORIGIN` · shell "Sign out" slot (BR-REC-120) and how it calls auth.
- [x] Test DB: the user points `DATABASE_URL_TEST` in `backend/.env` at this stream's own `*_test` database (decision 2 = A; `.env` is not readable by agents); then `db:test:prepare` creates it.
- [ ] (at hand-over) Refresh `docs/modules/member-records.md` from the Stream 0 diff (`/map member-records`) — explorer reads the map only.

## File ownership (index → Shared files)
Auth owns: `backend/src/{types,routes,controller,service,repository}/auth*` · `backend/src/lib/{token,auth-middleware,rate-limiter}.ts` ·
`backend/scripts/bootstrap-admin.ts` · `frontend/src/proxy.ts` · `frontend/src/{lib/api,lib/validators,components/views,components/pages}/auth/**` ·
routes `frontend/src/app/(auth)/login/**`, `frontend/src/app/(app)/admin/settings/account/**`.
Read-only (Stream 0): `backend/src/db/**`, `routes/{end-points,index}.ts`, `lib/{audit,idempotency,origin-check,etag,server-timing}.ts`,
`frontend/src/{lib/api/routes.ts,lib/messages/**,components/common/**,components/shells/**}`, `next.config.ts`, layouts.
Generated (re-run, never hand-merge): `backend/.contracts/*`, `frontend/src/types/api.generated.ts`.

### Unlisted files auth owns too (user decision 2026-10-03: 1 = A)
| File | Why | Rule |
|---|---|---|
| `backend/src/lib/env.ts`, `backend/.env.example` | new `SESSION_SHORT_TTL_SECONDS`, `TRUST_PROXY_HOPS` (APP_ORIGIN exists) | BR-REC-31, 38 |
| `backend/package.json` | `bootstrap-admin` script entry | BR-REC-25, 26, 171 |
| `backend/src/lib/http.ts` | `setRefreshCookie` / `clearRefreshCookie` live here; no access-cookie setter (map gap 3) | BR-REC-30 |
| `frontend/src/lib/api/client.ts` | has one-refresh-in-flight + retry once; missing: "Please sign in again" + Login with `next` | BR-REC-41 |
| `frontend/src/lib/queryClient.ts` | one global 401 handler in the query cache | BR-REC-41 |
Auth may edit these. If Stream 0 changed one of them, merge carefully and keep Stream 0's additions.

## Slices
Build order changed (2026-10-03, coordinator): one contract step for E01–E06 (716501a); backend red tests for slices
1, 2, 3, 5 written up front by two test-writers on disjoint folders (`backend/tests/auth/signin/**` = BR-REC-01, 02,
25–29, 34, 35, 171; `backend/tests/auth/session/**` = BR-REC-30–33, 37, 38, 43, 44), because the backend cannot go green
before Stream 0's S3 (`writeAudit`, Origin check) anyway. Backend-dev then builds slice by slice. Admin screens (slices
1, 3, 4) wait for Stream 0's frontend S3 (shell, messages, `API_ROUTES`).
Contract decisions accepted (contract.md): `expiresAt` = the sign-in's expiry (not the access token's); E05 checks the
signature only (a revoked session's token still reads /me until it expires, BR-REC-33); `TRUST_PROXY_HOPS` default 0.
Test decisions accepted: BR-REC-28 "service test with injected clock" is covered over HTTP by moving the
`login_attempts` / `auth_sessions` timestamps back (no service names in the contract); `signin/**` runs a real API
child process (unique `X-Forwarded-For`, `TRUST_PROXY_HOPS=1`), `session/**` uses `createApp().request` + a probe child
for env-dependent rules; audit `session_id` = acting/affected session (null for E01 failures and `--unlock`).
Red runs: signin 94 (90 red, 4 pass), session 77 (64 red, 13 pass). Frontend parts of BR-REC-01, 02, 25, 27, 29, 35
(Login copy, Account form, cache clear) go to a frontend test-writer brief with slices 1, 3, 4.
Run the two folders on separate DBs when run in parallel (one-row tables); the normal `bun test` run is serial.

- [x] **1. Login + lock** — BR-REC-25, 27, 01, 28, 29, 171
  - backend: E01 (lock check → argon2id verify → global counter in `login_attempts`, one atomic update; 429 `LOGIN_LOCKED`
    + `Retry-After` + `details.retryAfterSeconds`; same 401 text for wrong user/password), `bootstrap-admin`
    (create, refuse if exists, `--username --password` non-interactive, `--unlock` + audit `auth.unlock`); injected `now`;
    argon2 minimum cost under `NODE_ENV=test`.
  - admin: S1 Login (`/login`, today `LoginView` → `LoginPlaceholder` stub): username, password with show, "Keep me signed in" ticked, reserved error line, locked text.
  - tests: auth service with injected clock (counter across addresses, 15-min window, clear on success, lock not
    extended), E01 route, bootstrap script, hash format.
- [x] **2. Sessions: cookies, refresh rotation, me** — BR-REC-30, 31, 32, 33, 44
  - backend: E01 sets cookies; `auth_sessions` row (HMAC token hash, remember / 7-day slide / 12 h cap); E02 rotate
    with 60 s grace, reuse → revoke `reuse` + 401 `SESSION_EXPIRED`, works while locked; E05; `token.ts` claims
    `sid`, HS256 pinned; `auth-middleware` reads the access cookie by signature only.
  - admin: none (wired in slice 4).
  - tests: cookie attributes, no raw token in DB, sliding expiry and cap, rotation/grace/reuse, secret rotation.
- [x] **3. Sign out + password** — BR-REC-02, 34, 35, 26
  - backend: E03, E04 (`{ signedOut }`), E06 (8–128 chars, wrong current → 400 `CURRENT_PASSWORD_WRONG` counts toward
    the lock, revoke others `password_change`, keep this one; 429 while locked); `bootstrap-admin --reset` revokes all `reset`.
  - admin: S17 Account (`/admin/settings/account`): "Signed in as", change password, Sign out, Sign out all devices
    (confirm, BR-REC-133); sign out clears the query cache.
  - tests: E03/E04/E06 services + routes, reset script.
- [x] **4. Page guard + app refresh** — BR-REC-39, 40, 41, 42
  - admin: `proxy.ts` (no cookies → `/login?next=`; safe `next`; access missing + refresh → server-side E02, copy
    `Set-Cookie` to response and forwarded request; signed in on `/login` → `/admin`; matcher excludes `/api`,
    static, manifest); client 401 → one refresh in flight → retry → Login with `next`, drafts kept.
  - tests: proxy unit tests, fetch-wrapper tests (frontend `bun test`).
- [x] **5. Edge + change log** — BR-REC-36, 37, 38, 43
  - backend: rate limits (login 10/min, refresh 30/min per address, key from `TRUST_PROXY_HOPS`, spoofed XFF ignored);
    audit rows for every sign-in event (no password, ip + device ≤ 60 chars).
  - 36 / 37 are built by Stream 0 (rewrite, `origin-check.ts`): auth only adds tests; a gap → tell the user.
  - tests: rate limiter, audit grep for the password, Origin refusal on E01–E06, no CORS preflight.

## Baseline (before any change, 2026-10-03, pre-Stream 0 — redo at resume)
All green: backend typecheck, lint, `bun test` (12 tests), `contract:check` (1 route); frontend typecheck, lint;
`check-fixtures.sh`. Frontend `bun test`: no tests yet. No DB prep was run (shared Postgres, see Notes).

## Notes
- Shared Postgres (5433): never `db:push`/`db:test:prepare` while this branch's schema differs from what another
  session pushed — `push --force` drops the other tables. Parallel `bun test` runs would share
  `gym_test`; auth tests mutate the single `app_account` / `login_attempts` rows → this stream uses its own test DB
  (user decision 2 = A, set by the user in `backend/.env`).

## Cross-stream (sent to the foundation session with the user's OK, 2026-10-03)
- Blocker in Stream 0 `lib/response-headers.ts:50-51`: responses ≤ 1 KB lose their body under Bun.serve when the client
  accepts gzip → 54 `tests/auth/signin` fail (live-server harness). Fix proposed; waiting for Stream 0, then re-merge.
- Stream 0 test `contract-conventions` BR-REC-159 mints a random `sid`; real E05 answers 401 without a session row →
  user decision: Stream 0 changes the test.
- Slice status: backend 1, 2, 3, 5 built (21e1325, 49df850); `tests/auth/session` 136/136 green; signin green once the fix lands.
- Build done: backend 21e1325 + 49df850, admin 734cf32. Verify next (reviewer + test-runner); signin tests wait for Stream 0 R-1.
- Verify done 2026-10-03: review 1 (2 major, 11 minor) → fix round 1 → re-check all fixed; final checks green (backend 809,
  frontend 749, contract, types, fixtures). Synced with `main` after the M0 squash (c6fcdda, tree unchanged). Knowledge
  update f01d056. **Ready for PR** (user asks).
- PR [#11](https://github.com/ArunDoesCode/Fionis-Crossfit/pull/11) opened 2026-10-03 (label `agent-pipeline`); waiting on CI + the user's review.
