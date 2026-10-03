# member-records/auth · contract (E01–E06, `bootstrap-admin`)

Spec: `docs/specs/member-records/auth.md` v1 + `api-contract.md` v1. Descriptors: `backend/src/routes/auth.ts`, schemas:
`backend/src/types/auth.types.ts` (exported `USERNAME_MAX_LENGTH` 64, `PASSWORD_MIN_LENGTH` 8, `PASSWORD_MAX_LENGTH` 128).
Generated: `backend/.contracts/*`, `frontend/src/types/api.generated.ts`. Handlers answer 501 until Stream A builds them.

## All six endpoints
- Base `/api/auth/...`. Success `{ success: true, data }`, always 200 (no 201). Error `{ success: false, message, code, details? }`.
- Check order: Origin (403 `CSRF_ORIGIN`, every POST incl. E01–E03; a missing or other `Origin` is refused) → auth (401 `UNAUTHORIZED`, E04–E06)
  → body validation (400 `INVALID_JSON` / `VALIDATION_ERROR`, `details.issues[{ path, message }]`) → rate limit (E01, E02) → handler.
- E01–E03 are public; E04–E06 are `any-authenticated` (access cookie or `Authorization: Bearer`).

## Endpoints
| ID | Method + path | Request | `data` | Errors (beyond 403 / 400 above) |
|---|---|---|---|---|
| E01 | POST `/login` | body `{ username 1–64, password 1–128, remember: boolean }` (all required) | `{ username, remember, expiresAt }` + 2 cookies | 401 `INVALID_CREDENTIALS` · 429 `LOGIN_LOCKED` · 429 `RATE_LIMITED` |
| E02 | POST `/refresh` | no body; `refresh_token` cookie | `{ expiresAt }` + 2 cookies | 401 `SESSION_EXPIRED` · 429 `RATE_LIMITED` |
| E03 | POST `/logout` | no body | `{}`; cookies cleared | none; 200 even with no sign-in to end |
| E04 | POST `/logout-all` | no body | `{ signedOut: int ≥ 0 }`; cookies cleared | 401 |
| E05 | GET `/me` | — | `{ username, remember, expiresAt }` | 401 |
| E06 | POST `/password` | body `{ currentPassword 1–128, newPassword 8–128 }` | `{}` | 400 `CURRENT_PASSWORD_WRONG` · 429 `LOGIN_LOCKED` · 401 |
`expiresAt` = ISO UTC, = `auth_sessions.expires_at`: `remember` → last use + `REFRESH_TOKEN_TTL_SECONDS` (7 days, slides on E01/E02);
not `remember` → sign-in time + `SESSION_SHORT_TTL_SECONDS` (12 h cap, refresh does not extend it).

## Behaviour a test can rely on
- **Lock (BR-REC-01, 28, 29, 171):** one global counter. Wrong username, wrong password (E01) and wrong `currentPassword` (E06) each count;
  tries older than 15 min drop off; a correct sign-in clears the count. The 5th wrong try is still 401 / 400; it starts a 15-min lock;
  the 6th try is 429 `LOGIN_LOCKED` even with the right password and never extends the lock. 429 body `details.retryAfterSeconds` =
  seconds left, rounded up, ≥ 1; header `Retry-After: <same number>`. Wrong user and wrong password: same 401 status, code and message.
  A lock does not stop E02, E03, E04, E05 or any signed-in request. Usernames match case-insensitively (stored lower-case).
- **E06:** a `newPassword` outside 8–128 → 400 `VALIDATION_ERROR`, `details.issues[0].path = ["newPassword"]`. Wrong current → 400
  `CURRENT_PASSWORD_WRONG`, never 401. Success: all other sign-ins revoked (`password_change`), this one stays, its cookies unchanged.
  While locked → 429 (checked before the password). A 429 does not sign anyone out.
- **E02 (BR-REC-32):** rotates the refresh token; the replaced token still works for 60 s after its replacement; later use →
  401 `SESSION_EXPIRED` and the sign-in is revoked `reuse`. Also 401 for missing / unknown / expired / revoked token. Works while locked.
- **E04:** revokes every active sign-in (`logout_all`), this one included; `signedOut` = how many. **E03:** revokes this device (`logout`).
- **E05 (BR-REC-33):** signature only, never checks revocation (a copied access token works until it expires); reads `remember` /
  `expiresAt` from the `auth_sessions` row of the token's `sid`; no such row → 401.
- **Rate limit (BR-REC-38):** E01 10 / min, E02 30 / min per network address → 429 `RATE_LIMITED` (no `Retry-After`). Runs after validation
  and before the lock check. Address = `X-Forwarded-For` entry counted from the right by `TRUST_PROXY_HOPS` (0 = ignore the header).

## Cookies (BR-REC-30, 31)
Both: `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` when `NODE_ENV=production`. Set by E01 and E02 (always both); cleared by E03 and E04 (`Max-Age=0`).
| Cookie | Value | Max-Age |
|---|---|---|
| `access_token` | JWT HS256: `userId`, `userName`, `permissions: []`, `sid`, `iss`, `aud`, `exp` | `ACCESS_TOKEN_TTL_SECONDS` (900) always, so the page guard sees it vanish |
| `refresh_token` | 32 random bytes, base64url; DB keeps only HMAC-SHA256 with `REFRESH_TOKEN_SECRET` | `remember`: `REFRESH_TOKEN_TTL_SECONDS` (604800), renewed on each E02 · not `remember`: none (ends with the browser) |
Rotating `ACCESS_TOKEN_SECRET` → old access token 401 → refresh succeeds (BR-REC-44); rotating `REFRESH_TOKEN_SECRET` signs everyone out.

## Change log (BR-REC-43): `audit_log.action`, one row per event, `session_id` null when none, `ip` + `device` ≤ 60 chars, never the password
`auth.login` · `auth.login_failed` · `auth.locked` (the try that starts the lock) · `auth.unlock` · `auth.logout` · `auth.logout_all` ·
`auth.password_changed` · `auth.token_reuse` (stolen-token signal). A wrong `currentPassword` in E06 logs `auth.login_failed`.

## `bun run bootstrap-admin` (`backend/scripts/bootstrap-admin.ts`; script entry exists, the file comes with slice 1)
Uses `DATABASE_URL` of its own process (tests spawn it with the `*_test` URL). Never prints the password. Creates the `login_attempts` row if missing.
| Command | Does | Exit |
|---|---|---|
| (no flags) | asks for username + password (hidden), creates the one login | 0 ok · 1 a login already exists (BR-REC-25) |
| `--username <u> --password <p>` | same, no prompts | same; 2 if a value breaks the 1–64 / 8–128 rules |
| `--reset [--password <p>]` | new password for the existing login (prompts if no flag), revokes every sign-in `reset` (BR-REC-26) | 0 · 1 no login yet · 2 bad password |
| `--unlock` | clears the lock counter, writes `auth.unlock` (BR-REC-171) | 0 (also when not locked) |
Modes are exclusive (2 if mixed or on unknown flags); `--username` with `--reset` is rejected (2). Prompts only when a value is missing; no TTY and a missing value → 2.

Also written (build, 2026-10-03): audit actions `auth.account_created` and `auth.password_reset` (script; `session_id` null, device
"bootstrap-admin"); script exit code 3 = unexpected failure. Refresh grace keeps one replaced token: a third concurrent refresh with the same
old token gets 401 `SESSION_EXPIRED` without a revoke; a replaced token used after 60 s revokes the sign-in (`reuse`).

## Env (backend; both new ones have defaults, existing `.env` files keep working)
`SESSION_SHORT_TTL_SECONDS` int > 0, default 43200 · `TRUST_PROXY_HOPS` int ≥ 0, default 0 (D-018 production value 1, see `.env.example`).
Existing: `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `APP_ORIGIN`.

## What other streams and tests may rely on
- `signAccessToken({ userId, userName, permissions: [], sid })` (`lib/token.ts`) keeps its signature; `sid` is a uuid and need not exist in `auth_sessions`
  (only E05 and E02 read the table). Send it as `Cookie: access_token=<jwt>` (`ACCESS_COOKIE`, `lib/auth-middleware.ts`) or `Authorization: Bearer`.
- `requireAuth` reads no database. `Actor = { id, name, sessionId, permissions }`; `sessionId` is the token's `sid`.
- Auth services take `now: Date` as an argument; argon2id runs at minimum cost when `NODE_ENV=test`. Refresh cookie name is the literal `refresh_token`.

## Admin app (frontend; BR-REC-39, 40, 41)
- **Page guard (`proxy.ts`, server side):** no `access_token` and no `refresh_token` → `/login?next=<path>`. Access missing, refresh present →
  `POST <API base>/api/auth/refresh` with headers `Cookie: refresh_token=<value>` and **`Origin: <APP_ORIGIN>`** (a server fetch sends no Origin, so
  set it or get 403). On 200 read `response.headers.getSetCookie()`: copy every `Set-Cookie` to the response **and** put the new `access_token` /
  `refresh_token` values into the forwarded request's `Cookie` header so the page renders signed in. Any other answer → `/login?next=`.
  Matcher excludes `/api`, static files, manifest. Signed in on `/login` → `/admin`.
- **Fetch wrapper (browser):** only a 401 with `code: "UNAUTHORIZED"` triggers a refresh (E01's 401 `INVALID_CREDENTIALS` and E06's 400 never do). One
  `POST /api/auth/refresh` in flight for parallel 401s (same origin: the browser adds cookies and `Origin`), then retry the call once. Refresh answers
  401 → "Please sign in again", keep drafts, go to `/login?next=<current path>`. E03 / E04 success → `queryClient.clear()` then `/login`.
- **Login page:** 401 → "That username or password is not right."; 429 `LOGIN_LOCKED` → "Too many wrong tries, so sign-in is paused. Try again
  in {ceil(details.retryAfterSeconds / 60)} minutes." (the error line is typed, `details.retryAfterSeconds`); the Sign in button stays tappable.
- Every code needs a plain sentence in the error dictionary: `INVALID_CREDENTIALS`, `LOGIN_LOCKED`, `RATE_LIMITED`, `SESSION_EXPIRED`,
  `CURRENT_PASSWORD_WRONG`, `CSRF_ORIGIN`, `UNAUTHORIZED`.

## Admin app interfaces (coordinator, 2026-10-03 — tests and frontend-dev both use these names)
| Module (`frontend/src/…`) | Export | Behaviour |
|---|---|---|
| `lib/validators/auth.ts` | `loginSchema` (`username` 1–64, `password` 1–128, `remember` boolean) · `changePasswordSchema` (`currentPassword` 1–128, `newPassword` 8–128) · `PASSWORD_MIN_LENGTH = 8` · `PASSWORD_MAX_LENGTH = 128` | Zod; 129 characters → issue on `newPassword` with "Use at most 128 characters" (BR-REC-27); under 8 → issue on `newPassword` (BR-REC-02) |
| `lib/auth/safeNextPath.ts` | `safeNextPath(raw: string \| null \| undefined): string` | returns `raw` when it is a path inside the app (starts with one `/`, not `//` or `/\`, no scheme); otherwise `/admin` (BR-REC-39) |
| `lib/auth/loginError.ts` | `loginErrorMessage(err: unknown): string` | 401 → "That username or password is not right."; 429 `LOGIN_LOCKED` → the BR-REC-29 line with minutes = ceil(`details.retryAfterSeconds` / 60); anything else → the error dictionary's text for its code |
| `lib/auth/signOut.ts` | `signOutDevice(queryClient)` · `signOutAllDevices(queryClient)` | POST E03 / E04; on success `queryClient.clear()` then browser navigation to `/login`; on failure no clear, the error is thrown (BR-REC-35) |
- The global 401 handler opens Login by browser navigation (`window.location`), not the router.
- The page guard's `Origin` for its server-side E02 call = the request's own origin (`request.nextUrl.origin`); no new frontend env var.
  Deploy gotcha (Stream G): behind the HTTPS front, Next must see the public origin, or the backend refuses the refresh (403 `CSRF_ORIGIN`).
- The refresh URL is `API_URL` (which already ends in `/api`) + `API_ROUTES` refresh path — no double `/api`.
- "Please sign in again" appears on the Login page after a failed refresh; checked manually.
