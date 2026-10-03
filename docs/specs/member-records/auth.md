---
module: member-records/auth
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 2
frozen_on: 2026-10-03
owner: Arun
depends_on: [member-records/data-model, member-records/api-contract, member-records/ux, member-records/performance]
---
# Member records · Sign-in (one shared login, simple JWT)

## Summary

One username + password for the whole gym (D-012, no roles). A phone or tablet stays signed in as long as it
is used at least once a week; the owner can change the password and sign out every device. Simple and safe: a
15-minute access token plus a rotating sign-in token, both in cookies the page's scripts cannot read, on the
same web address as the app (D-018). Done = a trainer signs in once on the gym tablet and is not bothered again
while it is in use, and a stranger cannot guess their way in.

## Owns

Rules BR-REC-01, 02, 25…44, 171 · endpoints E01–E06 · tables `app_account`, `auth_sessions`, `login_attempts` ·
screens S1 Login, S17 Settings → Account · `frontend/src/proxy.ts` · command `bootstrap-admin` (`--reset`, `--unlock`).

## Who can do what

| Action | Allowed |
|---|---|
| sign in, sign out, change password, sign out all devices | the shared login |
| create the login, reset a forgotten password, end a lock early | developer, with a server command |

## Flow

| From | Action | To | Rule |
|---|---|---|---|
| Signed out | right username + password | Signed in | BR-REC-01 |
| Signed out | 5 wrong tries within 15 min, from any device | Login locked for everyone for 15 min | BR-REC-01, 28, 29 |
| Locked | 15 min pass · developer runs `--unlock` | Signed out (can try again) | BR-REC-171 |
| Signed in | 15 min pass | Still signed in (silent refresh) | BR-REC-32, 40, 41 |
| Signed in | sign out · password changed elsewhere · unused 7 days · stolen-token signal | Signed out | BR-REC-31, 32, 34, 35 |

## Rules

| ID | Rule | Example (given → then) | Check |
|---|---|---|---|
| BR-REC-01 | Every page except login needs the shared login. 5 wrong passwords lock login for 15 minutes; the error never says which part was wrong. | 5 bad tries from any phones → login locked 15 min for everyone | API: 6th try → 429 `LOGIN_LOCKED`; wrong user and wrong password give the same 401 text |
| BR-REC-02 | Password is changed in Setup with the current password; minimum 8 characters. | New "abc" → rejected | API E06 → 400 `VALIDATION_ERROR` on `newPassword` |
| BR-REC-25 | There is exactly one login; the developer creates it with `bun run bootstrap-admin`; there is no sign-up page. | Fresh install → Login page has no "create account" | No public route creates an account; script refuses if one exists |
| BR-REC-26 | A forgotten password is reset by the developer with `bootstrap-admin --reset`, which signs out every device. | Owner forgets password → developer resets → all phones see Login | Script test: all sessions revoked, reason `reset` |
| BR-REC-27 | Passwords are 8–128 characters of any kind (no other complexity rules) and stored only as an argon2id hash. | 129 characters → "Use at most 128 characters" | DB value starts `$argon2id$`; no plain text anywhere |
| BR-REC-28 | The lock is one counter for the whole login (every device, network and typed username), kept in the database so a restart does not reset it; the 15 minutes start at the first wrong try, after which the count starts again from zero; a correct sign-in clears the count. | 3 wrong on the tablet + 2 wrong on a phone → locked; 4 wrong, wait 16 min, 1 wrong → not locked | Service test with injected clock; tries from two addresses add up |
| BR-REC-29 | While locked, every try (even the right password) is refused without extending the lock, and Login says, without naming which part was wrong, "Too many wrong tries, so sign-in is paused. Try again in 9 minutes." (minutes rounded up). | Locked 10:00, try 10:06 → "… Try again in 9 minutes."; at 10:15 the right password works | 429 with `details.retryAfterSeconds` and `Retry-After` header; lock end unchanged by tries |
| BR-REC-171 | A lock only stops new sign-ins and password changes: devices already signed in keep working, and the developer can end a lock at once with `bun run bootstrap-admin --unlock`, which is logged. | Stranger locks login at 10:00 → gym tablet keeps working; developer unlocks → owner signs in at 10:02 | E02 refresh succeeds while locked; script resets the counter; audit row `auth.unlock` |
| BR-REC-30 | Signing in sets two cookies, both httpOnly, Secure in production, SameSite=Lax, Path=/: `access_token` (JWT HS256, 15 min) and `refresh_token` (random 256-bit value; the database keeps only its HMAC). | Page script reads `document.cookie` → sees neither | Cookie attribute test; DB has no raw token |
| BR-REC-31 | "Keep me signed in" is ticked by default: ticked → signed in until 7 days without use (every use starts the 7 days again); unticked → cookie ends when the browser closes and the server ends it after 12 hours. | Tablet used daily → never asked; phone unused 6 days → still in; 8 days → Login | Service test of `expires_at` sliding 7 days and the 12 h cap |
| BR-REC-32 | Each refresh replaces the refresh token; the replaced one still works for 60 seconds (two tabs at once: it gets a new access token and the sign-in is not replaced again); using it later ends that device's sign-in and is logged as a stolen-token signal. | Old token replayed after 2 min → 401 `SESSION_EXPIRED`, session revoked `reuse` | Rotation, grace and reuse tests |
| BR-REC-33 | Access tokens are checked by signature only (no database read), so a signed-out device loses access within 15 minutes at most. | After "Sign out all devices", a copied access token works until it expires, refresh fails at once | Token test |
| BR-REC-34 | Changing the password signs out all other devices and keeps this one signed in; a wrong current password shows "Current password is not right", counts toward the lock and never signs out. | Wrong current password → 400 `CURRENT_PASSWORD_WRONG` | Other sessions revoked `password_change`; this one kept |
| BR-REC-35 | "Sign out" ends this device's sign-in and clears cookies and the app's cached data; "Sign out all devices" ends every sign-in, this one too. | Sign out → back button shows Login, not member data | `queryClient.clear()` called; sessions revoked |
| BR-REC-36 | The app and the API share one web address: the browser calls `/api/…` and Next.js forwards it to the API, which is not reachable from the internet directly (D-018). | Phone opens `/admin` and calls `/api/members` → no CORS preflight | Network tab shows no OPTIONS; API port closed publicly |
| BR-REC-37 | A write request (POST, PUT, PATCH, DELETE) whose `Origin` header is not the app's address is refused; GET requests never change data. | Form on another site posts to `/api/members` → 403 `CSRF_ORIGIN` | Middleware test |
| BR-REC-38 | Login allows 10 requests a minute and refresh 30 a minute per network address, on top of the lock; the address comes from our own proxy's header, not from what the browser sends. | 11th login in a minute → 429 `RATE_LIMITED` | Spoofed `X-Forwarded-For` does not change the key |
| BR-REC-39 | Opening any page without a sign-in goes to Login, then back to the page asked for; `next` must be a path inside the app, otherwise Home. The page guard never runs on `/api/*`. | `/admin/members/42` → Login → `/admin/members/42`; `next=https://evil.com` → Home | `proxy.ts` test; matcher excludes `/api` |
| BR-REC-40 | If the access cookie has expired but the refresh cookie is valid, the page guard refreshes on the server before the page renders, so no Login or flash appears. | Phone idle 2 hours → tap Members → list shows | Proxy test: new cookies on response and forwarded request |
| BR-REC-41 | When an API call gets 401, the app refreshes once and retries; if that fails it shows "Please sign in again", keeps unsaved assessment drafts (BR-REC-85) and opens Login with the current page as `next`. | Password changed on tablet → phone's next tap → Login, draft kept | One refresh in flight for parallel 401s |
| BR-REC-42 | Opening Login while signed in goes straight to Home, except when the app just sent the device there because its sign-in ended (BR-REC-41). | Signed-in tablet opens `/login` → `/admin` | Proxy test |
| BR-REC-43 | Sign-in events go to the change log (success, wrong password, lock, unlock, sign out, sign out all, password change, stolen-token signal, login created and password reset by the developer's command) with time, network address and device type, never the password. | Wrong password → `auth.login_failed` row without the typed text | Audit test greps for the password |
| BR-REC-44 | Changing the access secret is seamless (devices refresh); changing the refresh secret signs every device out and is only for a leaked secret. | Rotate `ACCESS_TOKEN_SECRET` → users notice nothing | Test: old access token → 401 → refresh succeeds |

## Known trade-off (Q1 = B, accepted 2026-10-03)

One lock for the whole login means anyone who opens the Login page can lock it for 15 minutes with 5 wrong
tries, and do it again. Accepted to keep it simple. What limits the harm, at no extra logic: signed-in devices
keep working (BR-REC-171) and stay in for 7 days of non-use; the lock ends by itself; the developer can end it
with `--unlock`; every wrong try and lock is in the change log with network address and device (BR-REC-43), so
repeated locking is visible. If it ever happens for real, a per-address lock is a spec change (Not now).

## How it is built (decided; D-015, D-018)

- **Cookies:** `access_token` claims `userId`, `userName`, `permissions: []`, `sid` (session id), `iss`,
  `aud`, `exp`; HS256 pinned. `refresh_token` = 32 random bytes, base64url; cookie max-age 7 days, renewed on each refresh.
- **Deviation from nextjs-standards §8.1:** the refresh cookie is Path=/ and SameSite=Lax (not Strict, not
  scoped to the refresh path) because the page guard must read it on page loads, and opening the app from a
  WhatsApp link is a cross-site navigation; cross-site writes are stopped by BR-REC-37.
- **Lock store:** the single row of `login_attempts`, changed with one atomic update; unknown usernames count
  too; when a lock ends (time or `--unlock`) the count starts from zero.
- **Address chain (D-018):** browser → HTTPS front → Next.js → API on the same server. Cookies are first-party;
  `APP_ORIGIN` is the one public address; the rate limiter's key uses `TRUST_PROXY_HOPS` set to this chain
  (checked with a spoofed header on the real server).
- **Page guard (`proxy.ts`):** no cookies → Login; access missing + refresh present → server-side E02, copy
  `Set-Cookie` to the response and the forwarded request; matcher excludes `/api`, static files, manifest.
- **App:** existing fetch wrapper (one refresh in flight) + one global 401 handler in the query cache.
- **Env (backend):** `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` (exist), `ACCESS_TOKEN_TTL_SECONDS=900`,
  `REFRESH_TOKEN_TTL_SECONDS=604800` (7 days, the scaffold default), new `SESSION_SHORT_TTL_SECONDS=43200`,
  `TRUST_PROXY_HOPS`, `APP_ORIGIN`. **Env (frontend):** `NEXT_PUBLIC_API_URL=/api` (a path, not a full URL),
  `API_URL` = the API's internal address on the same server, used by rewrites, server fetches and the page guard.
- **Test hooks:** `signAccessToken` mints tokens for other streams' tests; the auth service takes `now` as an
  argument; argon2 at minimum cost when `NODE_ENV=test`; `bootstrap-admin --username --password` runs without prompts.

## Screens

S1 Login (`/login`). Desktop: the same card, centred, 400 px wide. Locked: the error line shows the BR-REC-29
text; Sign in stays tappable.

```
+--------------------------------+
|        Fionis CrossFit         |
|      Sign in to continue       |
| Username                       |
| [ admin                      ] |
| Password                       |
| [ ••••••••            (show) ] |
| [x] Keep me signed in          |
| That username or password is   |  <- error line, space always reserved
| not right.                     |
| [           Sign in          ] |
+--------------------------------+
```

S17 Settings → Account (`/admin/settings/account`): "Signed in as admin" · Change password (Current
password, New password "At least 8 characters", [Change password]) · [Sign out] · [Sign out all devices] with
"Use this if a phone is lost or a trainer leaves."

## Not now

Personal logins and roles, list of signed-in devices, email "forgot password", two-step codes, changing the
username, a lock per network address.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | The 5-tries lock applies to… | **A** one network + username / B the whole login, everywhere | **B** (keep it simple): one global lock; trade-off above |
| Q2 | "Keep me signed in" lasts… | **A** 30 days since last use / B 7 days / C 90 days | **B** 7 days since last use (sliding) |
| Q3 | "Keep me signed in" unticked signs out… | **A** after 12 hours or when the browser closes / B only when the browser closes | **A** |

## Implementation status (2026-10-03, branch `claude/member-records-parallel-build-f18292`)

All 23 rules built. Backend tests: `backend/tests/auth/{signin,session}/`; admin tests: `frontend/tests/auth/`; manual: `.pipeline/member-records-auth/checklist.md`.
| BR-REC | Test file(s) |
|---|---|
| 01, 28, 29 | `signin/login-lock.test.ts`; `frontend/tests/auth/{proxy,locked-line,login-error}.test.ts` |
| 02, 27, 34 | `signin/password.test.ts`; `frontend/tests/auth/validators.test.ts` |
| 25, 26 | `signin/bootstrap-admin.test.ts`, `signin/bootstrap-audit.test.ts` |
| 30, 31 | `session/{cookies,lifetime}.test.ts` |
| 32 | `session/rotation.test.ts` |
| 33, 44 | `session/access-token.test.ts` |
| 35 | `signin/sign-out.test.ts`; `frontend/tests/auth/sign-out.test.ts` |
| 36 | Stream 0 `backend/tests/app.test.ts` (same origin, no CORS) |
| 37 | `session/csrf-origin.test.ts` |
| 38 | `session/rate-limit.test.ts`; `frontend/tests/auth/proxy.test.ts` (visitor headers) |
| 39, 40, 42 | `frontend/tests/auth/{proxy,safe-next-path}.test.ts` |
| 41 | `frontend/tests/auth/{fetch-wrapper,query-cache-401}.test.ts` |
| 43 | `session/audit.test.ts`, `signin/bootstrap-audit.test.ts` |
| 171 | `signin/lock-signed-in-and-unlock.test.ts` |
Screens S1 and S17 have no automated UI test (no DOM test library, #9); covered by the manual checklist.

## Changelog

- 2026-10-03 v0 — draft, split out of member-records v2; carries BR-REC-01, 02 from v1 unchanged
- 2026-10-03 v0 — answers folded: global lock (BR-REC-28, 29 reworded, new BR-REC-171, trade-off section);
  7-day sliding sign-in (BR-REC-31, env); hosting chain D-018; S17 wireframe shortened to one line
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-03 v2 — clarified during build (review R-1, R-4, R-5, R-6; no change of intent): BR-REC-28 window starts at
  the first wrong try (one counter row); BR-REC-32 a replaced token inside the grace gets an access token only, no second
  rotation; BR-REC-42 does not apply right after BR-REC-41 sent the device to Login; BR-REC-43 also logs the two
  developer-command events.
