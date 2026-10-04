---
module: member-records/auth
spec: docs/specs/member-records/auth.md
last_verified_commit: 9d78023
last_verified_on: 2026-10-04
depends_on: []
---

# Member records · auth (Stream A) — as-built sub-map

> Index and cross-stream traps: [member-records.md](../member-records.md). Rules BR-REC-01, 02, 25–35, 37, 38, 43, 44, 171; decisions D-020.

## Summary and API
One shared login: 15-min access JWT + rotating refresh token in the DB (both httpOnly cookies), one global lock, in-memory rate limiter,
`bootstrap-admin` (create, `--reset`, `--unlock`), page guard `proxy.ts`, Login (S1), Account (S17). E01–E03 are public. Auth owns `token.ts`, `auth-middleware.ts`, `rate-limiter.ts`, `bootstrap-admin.ts` and `proxy.ts` (spec index → Shared files).
Endpoints: E01 login · E02 refresh · E03 logout · E04 logout-all · E05 me · E06 change password. Shapes: `bun run contract:query "POST /api/auth/login"`.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| backend | `backend/src/{routes/auth,controller/authController,service/authService,repository/authRepository}.ts`, `service/authLock.ts` (pure lock rules), `types/auth.types.ts` | `authService.{login,refresh,logout,logoutAll,me,changePassword,createAccount,resetPassword,unlock}(…, meta, now)`; `authRepository.{lockForUpdate,rotateSession,touchSession}` |
| libs | `backend/src/lib/{token,http,auth-middleware,rate-limiter}.ts` | `signAccessToken` (iss/aud pinned), `generateRefreshToken`, `hashRefreshToken` (HMAC hex); `setAccessCookie`, `setRefreshCookie(c, token, remember)`, `clearAuthCookies`, `clientAddress`, `deviceLabel`; `readAccessToken`; `rateLimiter({ windowMs, max })` |
| script | `backend/scripts/bootstrap-admin.ts` | create / `--reset` / `--unlock` the one account |
| admin | `frontend/src/proxy.ts`, `lib/auth/{safeNextPath,loginError,loginUrl,signOut}.ts`, `lib/validators/auth.ts`, `lib/api/auth/{fetchers,queries}.ts`, `components/{views,pages}/auth/*`, routes `app/(auth)/login`, `app/(app)/admin/settings/account` | page guard + server E02; `useMe`, `useLogin`, `useChangePassword`, `useSignOut(All)`; `authKeys.me()`; global 401 handler in `lib/queryClient.ts`; `SignOutButton` shell slot |

## Gotchas
- Lock (BR-REC-28, 29, 171): one global `login_attempts` row (made by `seed`) read `FOR UPDATE`; tries refused while locked are not counted; the counter update and the reuse revoke commit BEFORE the 401/429 is thrown (a throw inside the transaction would roll them back). Trade-off: auth.md → Known trade-off.
- Refresh grace (BR-REC-32): a replaced token within 60 s gets an access cookie only (no rotation, no refresh cookie); after 60 s it revokes with reason `reuse`. E05 reads the `sid` row (revoked too); a random `sid` → 401 (tests: `createSignedInSession()`).
- Rate limiter is in-memory per process; key = `clientAddress` (`TRUST_PROXY_HOPS`, default 0; D-018 production 1: Next 16 rewrites pass `X-Forwarded-For` through). The page guard forwards the visitor's `X-Forwarded-For` and `User-Agent` on its E02 call.
- Page guard: its server E02 must send `Origin` (= `request.nextUrl.origin`; behind the HTTPS front Next must see the public origin, #8); `/login?reason=expired` renders Login even with an access cookie (no loop); only a 401 `UNAUTHORIZED` triggers the client refresh.
- argon2id: 64 MiB / t=2 pinned; minimum cost only under `NODE_ENV=test`; a decoy hash at import keeps unknown-user timing equal.
- `LOGIN_LOCKED` text ends "Try again later."; Login adds the minutes from `details.retryAfterSeconds`.
- Live server tests: `backend/tests/auth/signin` spawns the real API (`bun --no-env-file src/index.ts`); do not run two auth suites at once on one DB (one-row tables).

## Tests and open issues
`backend/tests/auth/signin/` (live API child), `backend/tests/auth/session/` (`createApp().request` + probe child), `frontend/tests/auth/`.
Manual: `.pipeline/member-records-auth/checklist.md` (S1, S17, real-server items).
Open issues: [#7](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/7) transient refresh failures sign the device out · [#8](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/8) page-guard refresh behind the HTTPS front (G) · [#9](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/9) no Login/Account component tests · [#13](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/13) checklist wording.

## History
2026-10-03 · #11 (`ad6a486`) · Stream A built on Stream 0: E01–E06, lock, rotation, rate limits, `bootstrap-admin`, guard, Login, Account; auth.md v2 (4 clarifications); D-020.
