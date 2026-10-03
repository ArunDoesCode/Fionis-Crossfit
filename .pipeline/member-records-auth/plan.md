# Plan — member-records/auth (Stream A)

Spec: `docs/specs/member-records/auth.md` v1 (frozen 2026-10-03), index `docs/specs/member-records.md` v2 →
Parallel build plan, Stream A. Branch: `claude/member-records-parallel-build-f18292` (own session/worktree, D-017).
Rules: BR-REC-01, 02, 25…44, 171 (23) · Endpoints E01–E06 · Tables `app_account`, `auth_sessions`,
`login_attempts` (built by Stream 0) · Screens S1 `/login`, S17 `/admin/settings/account`.

## Status
**Paused 2026-10-03 — waiting for Stream 0 (M0) on `main`.** At planning time `origin/main` = d326c6f (spec only):
no tables, no member-records routes, empty contract. User chose "plan now, pause". Resume with
`/feature member-records/auth --resume` once Stream 0 is merged.

## Resume checklist (before slice 1)
- [ ] `git fetch && git merge origin/main` (or the app's sync tool); Stream 0 commits present.
- [ ] `cd backend && bun run db:test:prepare` (schema now matches `main`, safe to push); `bun install` in both packages.
- [ ] Re-run the baseline (test-runner); replace the baseline table below.
- [ ] Check Stream 0 delivered what auth builds on (else stop and tell the user):
      tables `app_account` / `auth_sessions` / `login_attempts` (one seeded row) · E01–E06 registered in
      `routes/end-points.ts` with `types/auth.types.ts` · `lib/audit.ts` (change-log writer) · `lib/origin-check.ts`
      (BR-REC-37) · `/api` rewrite in `next.config.ts` (BR-REC-36) · `API_ROUTES.auth.*` in `frontend/src/lib/api/routes.ts` ·
      error-code dictionary has `INVALID_CREDENTIALS`, `LOGIN_LOCKED`, `RATE_LIMITED`, `SESSION_EXPIRED`,
      `CURRENT_PASSWORD_WRONG`, `CSRF_ORIGIN` · shell "Sign out" slot (BR-REC-120) and how it calls auth.
- [ ] Settle the unlisted-file question (below) with the user if still open.
- [ ] Refresh `docs/modules/member-records.md` from the Stream 0 diff (`/map member-records`) — explorer reads the map only.

## File ownership (index → Shared files)
Auth owns: `backend/src/{types,routes,controller,service,repository}/auth*` · `backend/src/lib/{token,auth-middleware,rate-limiter}.ts` ·
`backend/scripts/bootstrap-admin.ts` · `frontend/src/proxy.ts` · `frontend/src/{lib/api,lib/validators,components/views,components/pages}/auth/**` ·
routes `frontend/src/app/(auth)/login/**`, `frontend/src/app/(app)/admin/settings/account/**`.
Read-only (Stream 0): `backend/src/db/**`, `routes/{end-points,index}.ts`, `lib/{audit,idempotency,origin-check,etag,server-timing}.ts`,
`frontend/src/{lib/api/routes.ts,lib/messages/**,components/common/**,components/shells/**}`, `next.config.ts`, layouts.
Generated (re-run, never hand-merge): `backend/.contracts/*`, `frontend/src/types/api.generated.ts`.

### Unlisted files auth may need (owner not named in the index → ask the user before editing)
| File | Why | Rule |
|---|---|---|
| `backend/src/lib/env.ts`, `backend/.env.example` | new `SESSION_SHORT_TTL_SECONDS`, `TRUST_PROXY_HOPS` (APP_ORIGIN exists) | BR-REC-31, 38 |
| `backend/package.json` | `bootstrap-admin` script entry | BR-REC-25, 26, 171 |
| `backend/src/lib/http.ts` | `setRefreshCookie` / `clearRefreshCookie` live here; no access-cookie setter (map gap 3) | BR-REC-30 |
| `frontend/src/lib/api/client.ts` | has one-refresh-in-flight + retry once; missing: "Please sign in again" + Login with `next` | BR-REC-41 |
| `frontend/src/lib/queryClient.ts` | one global 401 handler in the query cache | BR-REC-41 |
Stream 0 may already cover some of these; re-check at resume.

## Slices
Each slice: contract check/fill (backend-dev, `types/auth.types.ts` only) → red tests (test-writer, own commit) →
backend-dev ∥ frontend-dev → `feat(member-records/auth): …`.

- [ ] **1. Login + lock** — BR-REC-25, 27, 01, 28, 29, 171
  - backend: E01 (lock check → argon2id verify → global counter in `login_attempts`, one atomic update; 429 `LOGIN_LOCKED`
    + `Retry-After` + `details.retryAfterSeconds`; same 401 text for wrong user/password), `bootstrap-admin`
    (create, refuse if exists, `--username --password` non-interactive, `--unlock` + audit `auth.unlock`); injected `now`;
    argon2 minimum cost under `NODE_ENV=test`.
  - admin: S1 Login (`/login`, today `LoginView` → `LoginPlaceholder` stub): username, password with show, "Keep me signed in" ticked, reserved error line, locked text.
  - tests: auth service with injected clock (counter across addresses, 15-min window, clear on success, lock not
    extended), E01 route, bootstrap script, hash format.
- [ ] **2. Sessions: cookies, refresh rotation, me** — BR-REC-30, 31, 32, 33, 44
  - backend: E01 sets cookies; `auth_sessions` row (HMAC token hash, remember / 7-day slide / 12 h cap); E02 rotate
    with 60 s grace, reuse → revoke `reuse` + 401 `SESSION_EXPIRED`, works while locked; E05; `token.ts` claims
    `sid`, HS256 pinned; `auth-middleware` reads the access cookie by signature only.
  - admin: none (wired in slice 4).
  - tests: cookie attributes, no raw token in DB, sliding expiry and cap, rotation/grace/reuse, secret rotation.
- [ ] **3. Sign out + password** — BR-REC-02, 34, 35, 26
  - backend: E03, E04 (`{ signedOut }`), E06 (8–128 chars, wrong current → 400 `CURRENT_PASSWORD_WRONG` counts toward
    the lock, revoke others `password_change`, keep this one; 429 while locked); `bootstrap-admin --reset` revokes all `reset`.
  - admin: S17 Account (`/admin/settings/account`): "Signed in as", change password, Sign out, Sign out all devices
    (confirm, BR-REC-133); sign out clears the query cache.
  - tests: E03/E04/E06 services + routes, reset script.
- [ ] **4. Page guard + app refresh** — BR-REC-39, 40, 41, 42
  - admin: `proxy.ts` (no cookies → `/login?next=`; safe `next`; access missing + refresh → server-side E02, copy
    `Set-Cookie` to response and forwarded request; signed in on `/login` → `/admin`; matcher excludes `/api`,
    static, manifest); client 401 → one refresh in flight → retry → Login with `next`, drafts kept.
  - tests: proxy unit tests, fetch-wrapper tests (frontend `bun test`).
- [ ] **5. Edge + change log** — BR-REC-36, 37, 38, 43
  - backend: rate limits (login 10/min, refresh 30/min per address, key from `TRUST_PROXY_HOPS`, spoofed XFF ignored);
    audit rows for every sign-in event (no password, ip + device ≤ 60 chars).
  - 36 / 37 are built by Stream 0 (rewrite, `origin-check.ts`): auth only adds tests; a gap → tell the user.
  - tests: rate limiter, audit grep for the password, Origin refusal on E01–E06, no CORS preflight.

## Baseline (before any change, 2026-10-03, pre-Stream 0 — redo at resume)
All green: backend typecheck, lint, `bun test` (12 tests), `contract:check` (1 route); frontend typecheck, lint;
`check-fixtures.sh`. Frontend `bun test`: no tests yet. No DB prep was run (shared Postgres, see Notes).

## Notes
- Shared Postgres (5433): never `db:push`/`db:test:prepare` while this branch's schema differs from what another
  session pushed — `push --force` drops the other tables. Parallel `bun test` runs in several sessions share
  `gym_test`; auth tests mutate the single `app_account` / `login_attempts` rows.
