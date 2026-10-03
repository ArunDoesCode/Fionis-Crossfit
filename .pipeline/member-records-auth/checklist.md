# member-records/auth · manual test checklist

Spec: `docs/specs/member-records/auth.md` v1 (BR-REC-01, 02, 25…44, 171) + `ux.md` v1 (rules that touch S1 Login and S17 Account).
Written from the spec rules and `screens.md` (URLs and roles only). `[G]` = golden path, `[N]` = negative path, `[slow]` = needs real waiting,
`[deploy]` = only on the real server (Stream G), `[pilot]` = watch during the gym pilot.
Fix round 1 (review R-9, R-10) added the items tagged `[R-9]` / `[R-10]` in sections 2, 5, 8 and 13 (no DOM test library yet, #9, so these are manual).

## 0. Setup (once)

- [ ] Dev DB up, schema pushed. Backend `cd backend && bun run dev` (port 4000), frontend `cd frontend && bun run dev` (port 3000). `APP_ORIGIN=http://localhost:3000`.
- [ ] Devices: **Desktop** (Chrome, window >= 1024 px), **Phone** (real phone, or Chrome DevTools device mode 360 px), **Tablet** (real, or DevTools 800 px). Two different browser profiles stand in for "two devices" if you have only one machine.
- [ ] Shell helpers for the `curl` steps (the cookie jar file lives in a scratch folder, not in the repo):
  ```
  APP=http://localhost:3000; O="Origin: $APP"; J="Content-Type: application/json"
  login() { curl -si -c jar.txt -X POST $APP/api/auth/login -H "$O" -H "$J" -d "{\"username\":\"${2:-owner}\",\"password\":\"$1\",\"remember\":true}"; }
  ```
  Database peeks: `psql "$DATABASE_URL"` (the `DATABASE_URL` in `backend/.env`).
- Test login used below: username `owner`, password `Gym-pass-1`; "new password" = `Gym-pass-2`.
- After every lock test, run `cd backend && bun run bootstrap-admin --unlock` so the next test starts clean.

## 1. The one login: creating it and resetting it (BR-REC-25, 26, 27) — who: developer, in a terminal

- [ ] [G] Empty dev DB (no login yet): open `/login` on Desktop → no "Create account", no "Sign up", no "Forgot password" link anywhere on the page. (BR-REC-25)
- [ ] [N] Try to make an account over the web: `curl -si -X POST $APP/api/auth/register -H "$O" -H "$J" -d '{"username":"x","password":"Gym-pass-1"}'` and the same for `/api/auth/signup` and `/api/account` → never a 2xx, and `select count(*) from app_account;` is still 0. (BR-REC-25)
- [ ] [G] `bun run bootstrap-admin` with no flags → asks for username, then password with the typing hidden. Enter `owner` / `Gym-pass-1` → success message, exit code 0 (`echo $?`), the password is never printed. (BR-REC-25)
- [ ] [N] Run `bun run bootstrap-admin --username second --password Gym-pass-1` again → refused with a plain message, exit code 1, still exactly one row in `app_account`. (BR-REC-25)
- [ ] [N] Run these on the empty DB **before** the golden create above (they create nothing): password `1234567` (7 chars) → exit 2. 129-character password → exit 2. 65-character username → exit 2. `select count(*) from app_account;` stays 0. (BR-REC-27)
- [ ] [G] Passwords of exactly 8 and exactly 128 characters, `aaaaaaaa`, and one with spaces and an emoji are accepted (sign in with each works). No other complexity rules. (BR-REC-27)
- [ ] [G] `select username, left(password_hash, 10) from app_account;` → username is lower-case, hash starts `$argon2id$`. Search your terminal history, the backend log and `select * from audit_log` for the plain password → not found anywhere. (BR-REC-27, 43)
- [ ] [G] Signed in on Phone and Tablet. Run `bun run bootstrap-admin --reset --password Gym-pass-9` → exit 0. Both devices land on Login on their next page load (delete the `access_token` cookie in DevTools to skip the 15-minute wait). `select revoke_reason, count(*) from auth_sessions group by 1;` → every row `reset`. Old password refused, new one works. (BR-REC-26)
- [ ] [N] `--reset` before any login exists → exit 1. `--reset --username owner` → exit 2. `--unlock --reset` (mixed modes) and an unknown flag → exit 2. Run without a terminal and with a missing value (`... < /dev/null`) → exit 2, no hang. (contract)

## 2. Signing in: golden path, cookies, wrong details (BR-REC-01, 30, 42) — who: the shared login, Phone then Desktop

- [ ] [G] `/login` on Phone: title "Fionis CrossFit", "Sign in to continue", Username, Password with Show/Hide inside the field, "Keep me signed in" ticked by default, full-width Sign in. Enter the right details → lands on `/admin`. (BR-REC-01)
- [ ] [G] Desktop: same card centred, 400 px wide. Theme toggle top right works. Phone: card edge to edge with 16 px padding.
- [ ] [G] Username is not case sensitive: sign in as `OWNER` → works; Account page says "Signed in as owner". (contract)
- [ ] [G] Show/Hide: password turns to readable text and back; the button name read aloud is "Show password" / "Hide password".
- [ ] [N] Right username + wrong password, then wrong username + any password → the **same** line both times: "That username or password is not right." Same colour, same place. Nothing hints at which part was wrong. (BR-REC-01)
- [ ] [N] Compare the raw answers: `login wrong-pass-1` and `login Gym-pass-1 nobody` → same status (401), same `code` (`INVALID_CREDENTIALS`), same `message`. (BR-REC-01)
- [ ] [N] Empty username → "Enter your username" under the field and focus jumps to it; empty password → "Enter your password"; 129 characters in either field → "Use at most 128 characters". (S1)
- [ ] [G] The error line's space is always reserved: fail a sign-in and watch the Sign in button — it does not jump. (S1)
- [ ] [G] Throttle the network (DevTools Slow 3G) and tap Sign in → button reads "Signing in…" with a spinner and is off until the answer arrives; no full-page spinner. (S1, BR-REC-129)
- [ ] [N] [R-9] One tap, one try: Network tab open, throttle Slow 3G, type the right details and press Enter twice quickly; repeat with Enter and then straight away a tap on Sign in → each time exactly one `POST /api/auth/login` in the Network tab, and the button stays off until the answer arrives. (BR-REC-01, S1)
- [ ] [N] [R-9] A double Enter counts as one wrong try: run `bun run bootstrap-admin --unlock`, throttle Slow 3G, type a wrong password and press Enter twice quickly → `select failed_count from login_attempts;` shows 1 (not 2). Then 3 more wrong tries (4 in total) → `failed_count` is 4 and each still says "That username or password is not right."; the 5th wrong try says the same and starts the lock; the 6th says "Too many wrong tries, so sign-in is paused…". (BR-REC-01, 28)
- [ ] [G] Cookies after sign in (DevTools → Application → Cookies): `access_token` and `refresh_token` both HttpOnly, SameSite Lax, Path `/`. `access_token` lives 15 minutes. `Secure` is NOT set on http://localhost (it is in production, see section 14). (BR-REC-30)
- [ ] [G] Console on any page: `document.cookie` → shows neither cookie. (BR-REC-30)
- [ ] [G] The raw refresh token is not in the DB: copy the `refresh_token` value, run `select count(*) from auth_sessions where token_hash = '<value>';` → 0. (BR-REC-30)
- [ ] [G] Signed in on Tablet, open `/login` by typing it → goes straight to `/admin`, no login form flash. (BR-REC-42)

## 3. The lock (BR-REC-01, 28, 29) — who: anyone at Login; use two devices; unlock after each item

- [ ] [G] Five wrong passwords in a row on one device → tries 1-5 each say "That username or password is not right." The 6th try (even with the **right** password) shows "Too many wrong tries, so sign-in is paused. Try again in 15 minutes." (BR-REC-01, 29)
- [ ] [G] curl check of the 6th try: `login Gym-pass-1` → HTTP 429, `code: LOGIN_LOCKED`, `details.retryAfterSeconds` between 1 and 900, and a `Retry-After` header with the same number. (BR-REC-29)
- [ ] [G] Tries add up across devices and usernames: 3 wrong on Tablet + 2 wrong on Phone (one of them with a made-up username) → the 6th try on either device is locked. (BR-REC-28)
- [ ] [G] While locked, try again at intervals (say 1 minute apart) → the minutes count down (14, 13 …, rounded up) and the lock end does **not** move: `retryAfterSeconds` shrinks in step with real time, never jumps back to 900. (BR-REC-29)
- [ ] [G] While locked, the Sign in button stays tappable and the line is the same text on the Phone; it never says which part was wrong. (S1, BR-REC-29)
- [ ] [G] [slow] After 15 minutes the right password signs in. (BR-REC-29)
- [ ] [G] [slow] 4 wrong tries, wait 16 minutes, 1 more wrong try → still "not right" (401), NOT locked; the right password works. (BR-REC-28)
- [ ] [G] Restart the backend while locked (stop, `bun run dev`) → still locked afterwards (the lock lives in the database). (BR-REC-28)
- [ ] [G] 4 wrong tries, then the right password (signs in), then 4 wrong tries → not locked (a correct sign-in cleared the count). (BR-REC-28)
- [ ] [N] While locked, the answer is the same whichever username is typed, and no try appears to extend the lock (compare `retryAfterSeconds` before and after 5 refused tries). (BR-REC-29)
- [ ] [note] With under 60 seconds left the line reads "…Try again in 1 minutes." (the spec fixes the form "N minutes" and says nothing about singular; just tell the owner if it looks odd, not a fail).

## 4. A lock does not stop signed-in devices; the developer can end it (BR-REC-171) — who: Tablet already signed in, a stranger on Phone, developer

- [ ] [G] Tablet signed in. On Phone (signed out) make 5 wrong tries → locked. Tablet: tap through Home, Members, Settings → everything keeps working. Delete the Tablet's `access_token` cookie and tap a link → page still loads (silent refresh works while locked). (BR-REC-171, 40)
- [ ] [G] While locked, Tablet → Sign out works (no lock error). Sign back in is refused until unlocked. (BR-REC-171)
- [ ] [N] While locked, a signed-in Tablet → Account → Change password (even with the right current password) → toast with the BR-REC-29 line; the password is NOT changed; nobody is signed out. (BR-REC-171, 34)
- [ ] [G] Developer runs `bun run bootstrap-admin --unlock` → exit 0. The owner signs in right away (no waiting). `select action, ip, device, at from audit_log where action = 'auth.unlock';` → one row, `session_id` null. (BR-REC-171, 43)
- [ ] [G] `--unlock` when nothing is locked → exit 0, no error. (BR-REC-171)

## 5. Changing the password (BR-REC-02, 27, 34) — who: the shared login, Account page `/admin/settings/account`; need two devices signed in (Desktop = "this", Phone = "other")

- [ ] [G] Account page shows "Signed in as owner", the Change password form (Current password, New password with hint "At least 8 characters"), Sign out, Sign out all devices with "Use this if a phone is lost or a trainer leaves." No Reset button. (S17, BR-REC-134)
- [ ] [N] New password `abc` → "Use at least 8 characters" next to New password (also shown when you leave the field). 129 characters → "Use at most 128 characters". Empty current password → "Enter your current password". The Change password button stays tappable and jumps to the first problem. (BR-REC-02, 27, 134)
- [ ] [N] API: with a signed-in jar, `curl -si -b jar.txt -X POST $APP/api/auth/password -H "$O" -H "$J" -d '{"currentPassword":"Gym-pass-1","newPassword":"abc"}'` → 400 `VALIDATION_ERROR` with `details.issues[0].path` = `["newPassword"]`. (BR-REC-02)
- [ ] [N] Wrong current password → "Current password is not right" next to Current password; nobody is signed out (Phone still works, this device still works). (BR-REC-34)
- [ ] [N] Wrong current password via API → HTTP 400 `CURRENT_PASSWORD_WRONG` (not 401). 5 wrong current passwords count toward the lock: the next try, even with the right current password, gives the lock toast; the Login page is locked for everyone too. Unlock afterwards. (BR-REC-34, 28)
- [ ] [G] Right current password + valid new password → button reads "Saving…" and is off while it runs, then toast "Password changed, and other devices are signed out." and both fields are empty. (S17)
- [ ] [N] [R-9] One tap, one request on Change password: Network tab open, throttle Slow 3G, fill both fields with valid values and press Enter twice quickly in New password (repeat once with Enter and then a tap on the Change password button) → exactly one `POST /api/auth/password`; the button reads "Saving…" and is off until the answer arrives; after the success toast no stray "Current password is not right" appears (a second request would fail that way and count toward the lock). (BR-REC-02, 34)
- [ ] [N] [R-9] A double Enter with a **wrong** current password counts once: note `select failed_count from login_attempts;`, press Enter twice quickly with a wrong current password and a valid new one → "Current password is not right" shows once and `failed_count` went up by exactly 1 (not 2). Unlock afterwards. (BR-REC-34, 28)
- [ ] [G] This device stays signed in: reload the page, open Members → no Login. Its cookies are unchanged (same refresh value in DevTools). (BR-REC-34)
- [ ] [G] The other device (Phone) is signed out: delete its `access_token` cookie (or wait 15 min) and tap a link → Login with "Please sign in again." `select revoke_reason, count(*) from auth_sessions group by 1;` → other sessions `password_change`, this device's row still active. (BR-REC-34, 33)
- [ ] [G] Old password no longer signs in; the new one does. (BR-REC-34)
- [ ] [G] A new password of exactly 8 and exactly 128 characters is accepted; `aaaaaaaa` is accepted. (BR-REC-02, 27)
- [ ] [G] `select left(password_hash, 10) from app_account;` → `$argon2id$` after the change. (BR-REC-27)

## 6. Staying signed in: 7 days, sliding, and the "unticked" case (BR-REC-31, 32, 33) — who: the shared login

- [ ] [G] Sign in with "Keep me signed in" ticked. `curl -s -b jar.txt $APP/api/auth/me` → `remember: true`, `expiresAt` about 7 days from now. DevTools: `refresh_token` shows an expiry about 7 days away. (BR-REC-31)
- [ ] [G] Sliding: `update auth_sessions set expires_at = now() + interval '1 day' where revoked_at is null;` (stands for 6 days unused). Delete the `access_token` cookie and open any page → still signed in, no Login. `/api/auth/me` now shows `expiresAt` about 7 days ahead again. (BR-REC-31, 40)
- [ ] [N] `update auth_sessions set expires_at = now() - interval '1 minute' where revoked_at is null;` (stands for 8 days unused). Delete the `access_token` cookie, open any page → Login (`?reason=expired`, "Please sign in again."). (BR-REC-31)
- [ ] [G] Unticked: sign in with "Keep me signed in" unticked → `/api/auth/me` shows `remember: false` and `expiresAt` about 12 hours from now; `refresh_token` in DevTools shows Expires: "Session". After a refresh (delete `access_token`, reload) `expiresAt` has NOT moved (no extending the 12 h). (BR-REC-31)
- [ ] [G] Unticked: quit the browser completely (not just the tab) and reopen → Login. Note: Chrome with "Continue where you left off" restores session cookies; use a fresh profile or turn that off. (BR-REC-31)
- [ ] [N] Unticked: `update auth_sessions set expires_at = now() - interval '1 minute' where remember = false and revoked_at is null;` → delete the `access_token` cookie, reload → Login. (BR-REC-31)
- [ ] [pilot] The gym tablet used every day is never asked to sign in again for a week. A phone left unused 6 days is still in; at 8 days it shows Login. (BR-REC-31)

## 7. Refresh, rotation and the stolen-token signal (BR-REC-32, 33, 40, 44) — who: developer with `curl`

- [ ] [G] Rotation: `login Gym-pass-1`, note the `refresh_token` value (call it OLD). `curl -si -c jar.txt -b jar.txt -X POST $APP/api/auth/refresh -H "$O"` → 200, two new `Set-Cookie` lines, the new `refresh_token` differs from OLD. (BR-REC-32)
- [ ] [G] Grace: right away, `curl -si -X POST $APP/api/auth/refresh -H "$O" -H "Cookie: refresh_token=OLD"` → 200 (two tabs refreshing at once). (BR-REC-32)
- [ ] [N] Reuse: wait 2 minutes, send OLD again → 401 `SESSION_EXPIRED`. `select revoke_reason from auth_sessions order by created_at desc limit 1;` → `reuse`. The device whose token was replayed is signed out (its newest token no longer refreshes). `audit_log` has `auth.token_reuse`. (BR-REC-32, 43)
- [ ] [N] Refresh with no cookie, a made-up cookie value, an expired session and a signed-out session → each 401 `SESSION_EXPIRED`. (BR-REC-32)
- [ ] [G] Sign out all devices, then use a **copied** access token (copy it from DevTools before signing out): `curl -s $APP/api/auth/me -H "Cookie: access_token=<copied>"` → still 200 until it expires (at most 15 minutes), while a refresh with the old refresh cookie fails **at once** with 401 `SESSION_EXPIRED`. (BR-REC-33)
- [ ] [G] Page guard refresh: Desktop signed in, delete only the `access_token` cookie in DevTools, tap Members (full page load) → the list shows with no Login and no flash; the document request's response headers carry two new `Set-Cookie` lines. (BR-REC-40)
- [ ] [G] Phone idle 2 hours (or delete `access_token` and lock the phone for a while) → tap Members → list shows. (BR-REC-40)
- [ ] [G] Secret rotation (access): sign in, stop backend, change `ACCESS_TOKEN_SECRET` in `backend/.env`, start backend. In the open tab tap a link → it keeps working; Network shows 401(s), then exactly one `POST /api/auth/refresh` 200, then the retries 200. The user sees nothing. (BR-REC-44)
- [ ] [N] Secret rotation (refresh): stop backend, change `REFRESH_TOKEN_SECRET`, start → every device lands on Login on its next use (after access cookie is gone or 15 min). Restore both secrets afterwards. (BR-REC-44)

## 8. An API call gets 401 while using the app (BR-REC-41) — who: signed-in Phone; Tablet changes the password

- [ ] [G] Phone signed in on any page. Developer or Tablet: change the password on Tablet (this signs the Phone's session out). On Phone, delete the `access_token` cookie, tap a link that loads data → "Please sign in again." appears on the Login page, the URL is `/login?next=<the page you were on>&reason=expired`. Sign in → back on that page. (BR-REC-41, 39)
- [ ] [G] If an unsaved assessment draft was on screen (needs the assessments screen, BR-REC-85): it is still there after signing in again. (BR-REC-41)
- [ ] [G] Silent success: Phone signed in, delete `access_token` only, tap a link that loads data → the data shows with no Login; Network shows exactly one refresh then the retry. (BR-REC-41)
- [ ] [G] On a screen that loads several parts at once (Home, once built): delete `access_token`, reload client-side (tap Home in the tabs) → Network shows **one** `POST /api/auth/refresh`, not one per part, and every part loads. (BR-REC-41)
- [ ] [N] Wrong sign-in details on Login (401 `INVALID_CREDENTIALS`) or wrong current password (400) do NOT trigger a refresh: no `/api/auth/refresh` request in the Network tab. (BR-REC-41, contract)
- [ ] [G] Arrive at `/login?reason=expired` directly → "Please sign in again." in normal (not red) colour; after the first Sign in try it is replaced by the real result. (S1)
- [ ] [G] [R-10] Announced: turn a screen reader on (VoiceOver on iPhone Safari, TalkBack on Android Chrome, NVDA or VoiceOver on Desktop) and open `/login?reason=expired` directly → "Please sign in again." is read out as the page opens, without you moving focus. Do it again by arriving the real way (first item of this section: password changed on Tablet, then a tap on Phone) → same, read out once. (BR-REC-41, 137)
- [ ] [N] [R-10] On that same Login page make one Sign in try with a wrong password → the new line "That username or password is not right." is read out when it appears, "Please sign in again." is gone and is not read again. Then open plain `/login` (no `reason`) → no sign-in or error line is read out on arrival. (BR-REC-41, 137)

## 9. Page guard and `next` (BR-REC-39, 40, 42) — who: signed out, then signed in

- [ ] [G] Signed out, open `/admin/members` (and `/admin/settings/account`) → `/login?next=%2Fadmin%2Fmembers`; sign in → lands on `/admin/members`. If member 42 exists, `/admin/members/42` does the same. (BR-REC-39)
- [ ] [G] Signed out, open `/` (Home alias) → `/login` with no `next`; after sign in → `/admin`. (BR-REC-39)
- [ ] [N] Open `/login?next=https://evil.com` and sign in → lands on `/admin`, never on evil.com. Same for `next=//evil.com`, `next=/\evil.com`, `next=javascript:alert(1)`, `next=http://localhost:3000.evil.com`. A path like `next=/admin/members` is kept. (BR-REC-39)
- [ ] [G] Signed out: `curl -si $APP/api/auth/me` → a JSON 401, not a redirect to Login. `/api/*` is never guarded by the page guard. (BR-REC-39)
- [ ] [G] Signed out: `/favicon.ico` and the web manifest load (not redirected to Login); images and `_next/static` files load on the Login page. (BR-REC-39)
- [ ] [G] Signed in (valid access cookie), open `/login` → `/admin`. Signed in with only the refresh cookie (access deleted) open `/login` → also `/admin` (guard refreshes first). (BR-REC-42, 40)
- [ ] [N] Dead refresh cookie: sign in on Desktop and on Phone. On Phone use Sign out all devices. On Desktop delete only the `access_token` cookie and open `/admin` → `/login?next=%2Fadmin&reason=expired` with "Please sign in again." (BR-REC-40, S1)
- [ ] [G] Back button after Sign out → Login, never member data (also check on a real iPhone: Safari restores pages from memory). (BR-REC-35)

## 10. Signing out (BR-REC-35, 133; S17; side bar) — who: the shared login

- [ ] [G] Account → Sign out → no question, button off while it runs, lands on `/login`. Both cookies are gone in DevTools. `select revoke_reason from auth_sessions order by created_at desc limit 1;` → `logout`. (BR-REC-35)
- [ ] [G] Open `/admin` right after → Login (no member data flashed). Press Back → Login or a fresh bounce to Login, never the old page's data. Sign in again as the same login → no data from the previous visit appears before the new data loads (app cache emptied). (BR-REC-35)
- [ ] [G] Desktop >= 1024 px: the left side bar shows the gym name and **Sign out** on every `/admin/**` page (Home, Members, Settings, Account); it behaves exactly like the Account button. Under 1024 px the side bar is gone. (BR-REC-120, side bar)
- [ ] [G] Sign out all devices → a confirm opens: "Sign out all devices?" / "Everyone using this login, including this device, will have to sign in again." with [Cancel] [Sign out all devices]. On Phone it is a bottom sheet, on Desktop a centred dialog; Back / swipe-down / Esc closes it without signing out. (BR-REC-133, 138)
- [ ] [N] Cancel → nothing happens, still signed in. Other actions (Sign out, Change password, Renew etc.) show no "Are you sure?". (BR-REC-133)
- [ ] [G] Confirm → this device lands on Login; with Phone also signed in, its next page load (delete `access_token`) goes to Login; `select revoke_reason, count(*) from auth_sessions group by 1;` → every row `logout_all`, including this device's. The Network tab answer shows `signedOut` = the number of devices that were signed in. (BR-REC-35, 33)
- [ ] [N] Sign-out fails (DevTools → Offline, tap Sign out) → a toast with a plain sentence, you stay on the page, cookies are still there, page data still shown. Same for Sign out all devices. (S17)
- [ ] [G] `curl -si -X POST $APP/api/auth/logout -H "$O"` with no cookies → 200 (nothing to end, no error). (BR-REC-35, contract)

## 11. One web address, no CORS, cross-site writes refused, rate limits (BR-REC-36, 37, 38)

- [ ] [G] Network tab open (filter "Fetch/XHR"), use the app for a minute on Phone/Desktop: every call goes to `/api/...` on the same address as the page (e.g. `localhost:3000/api/...`), and the Method column never shows `OPTIONS`. (BR-REC-36)
- [ ] [N] Cross-site write from another page: in a scratch folder create `evil.html` containing `<form method=post action="http://localhost:3000/api/auth/logout-all"><button>go</button></form>` and serve it on another port (`python3 -m http.server 8080` in that folder). While signed in, open `http://localhost:8080/evil.html`, press go → you see a 403 `CSRF_ORIGIN` answer (localhost on another port is the same "site", so the browser still sends your cookies — only the Origin check protects you), and you are still signed in (`select count(*) from auth_sessions where revoked_at is null;` unchanged). (BR-REC-37)
- [ ] [N] `curl -si -X POST $APP/api/auth/logout-all -b jar.txt` (no Origin) → 403 `CSRF_ORIGIN`. With `-H "Origin: https://evil.example"` → 403. With `-H "$O"` → 200. Also check one non-auth write once members exist (e.g. `POST /api/members` with a foreign Origin → 403). (BR-REC-37)
- [ ] [G] GET requests are not blocked by the origin check: `curl -si $APP/api/auth/me -b jar.txt` (no Origin) → 200. (BR-REC-37)
- [ ] [N] Login rate limit: with the right password, send 11 logins within one minute (`for i in $(seq 11); do login Gym-pass-1 | head -1; done`) → first 10 are 200, the 11th is 429 `RATE_LIMITED` (no `Retry-After` header). It is a different code from `LOGIN_LOCKED`. Wait a minute → works again. (BR-REC-38)
- [ ] [N] On the Login page, tap Sign in rapidly 11 times within a minute → the red line shows the plain sentence for `RATE_LIMITED` (not a code, not the lock sentence). (BR-REC-38, 128)
- [ ] [N] Refresh limit: 31 refreshes in one minute from one address (`for i in $(seq 31); do curl -s -o /dev/null -w '%{http_code}\n' -b jar.txt -c jar.txt -X POST $APP/api/auth/refresh -H "$O"; done`) → the 31st is 429 `RATE_LIMITED`. (BR-REC-38)
- [ ] [N] Spoofed header, local (`TRUST_PROXY_HOPS=0`): repeat the 11-login loop adding a different `-H "X-Forwarded-For: 1.2.3.$i"` each time → the 11th is still 429. The header is ignored. (BR-REC-38)
- [ ] [deploy] Spoofed header on the real server (`TRUST_PROXY_HOPS=1`): same loop with a made-up `X-Forwarded-For` sent from outside → the 11th is still 429 (the limiter keys on the address our own front appended, not on what the browser sent). (BR-REC-38)

## 12. Audit trail (BR-REC-43) — who: developer, database

Run `select action, session_id, ip, device, at from audit_log where action like 'auth.%' order by at desc limit 30;` after the steps above.
- [ ] [G] Rows exist, each with time, network address and a short device text ("Chrome on Android" style, at most 60 characters) for: `auth.login` (success), `auth.login_failed` (wrong password, wrong username, wrong current password in Change password), `auth.locked` (only the try that started the lock, once per lock), `auth.unlock`, `auth.logout`, `auth.logout_all`, `auth.password_changed`, `auth.token_reuse`. Script runs also leave `auth.account_created`, `auth.password_reset`. (BR-REC-43, 171)
- [ ] [N] Make a failed sign-in with a very recognisable password (`Zq-unique-8-needle`) → `select count(*) from audit_log where before::text like '%needle%' or after::text like '%needle%' or action like '%needle%';` → 0, and the same word is not in the backend log. Same for a wrong current password in Change password and for the script's `--password`. (BR-REC-43)
- [ ] [G] `session_id` is empty for failed sign-ins, locks and script rows; filled for logout, logout all, password change. (BR-REC-43)
- [ ] [G] Repeated locking by a stranger is visible: after two locks there are two `auth.locked` rows with the address and device of the stranger's phone. (BR-REC-43, trade-off in spec)

## 13. Look, feel and words on S1 and S17 (ux BR-REC-120…139, tested on Login and Account only)

- [ ] [G] No technical words on either screen or in any error: no "token", "session", "401", "CSRF", no error codes in capitals. Every message is one plain sentence next to the field or a short toast. Check the lines for wrong details, lock, rate limit, expired, wrong current password. (BR-REC-126, 128)
- [ ] [G] Loading shows grey shapes in the real layout: throttle the network and reload `/login` (grey card) and `/admin/settings/account` ("Signed in as" shows its own grey bar). No full-page spinner; a spinner appears only inside the button while it runs. (BR-REC-129, S1, S17)
- [ ] [N] "Signed in as" fails to load (DevTools → Network request blocking on `/api/auth/me`) → "Couldn't load this." with [Try again] in that place only; the Change password form and Sign out still work; unblock and Try again → shows "Signed in as owner". (BR-REC-131, S17)
- [ ] [G] One main action per screen: Account has only "Change password" as main action (right of the header from 1024 px; a full-width 48 px bar at the bottom of the phone with the tab bar hidden because it is a form). Login has only Sign in. (BR-REC-121, 120)
- [ ] [G] Touch targets on Phone are at least 44 x 44 px with 8 px between neighbours: Show/Hide, the tick box row, Sign in, Sign out, Sign out all devices. Inputs and buttons are 48 px tall. (BR-REC-122)
- [ ] [G] Phone: text in inputs is 16 px; focusing a field on a real iPhone does NOT zoom the page. Nothing smaller than 12 px; hints at 14 px. (BR-REC-123)
- [ ] [G] Run axe (browser extension) on `/login` and `/admin/settings/account` in light **and** dark theme → 0 contrast issues, 0 serious issues. The "Please sign in again." line (plain colour) and the red error line both stay readable. (BR-REC-124, 137)
- [ ] [G] Errors are not shown by colour alone: the red error line has words (and icon if any); in a grey-scale view it is still obvious. (BR-REC-125)
- [ ] [G] Keyboard only (Desktop): Tab reaches every control in a sensible order, the focus ring is always visible, Space ticks the box, Esc closes the confirm. (BR-REC-137)
- [ ] [G] Screen reader (VoiceOver on iPhone and TalkBack on Android, Login + Account): every field has its label read out, Show/Hide is "Show password, button", the error line and the toasts are announced when they appear. (BR-REC-137)
- [ ] [G] [R-10] Field errors are tied to their field (screen reader on): Login → tap Sign in with both fields empty → focus jumps to Username and the screen reader reads its label **and** "Enter your username"; move to Password → label and "Enter your password"; type 129 characters in either → label and "Use at most 128 characters". Account → Change password with `abc` in New password → label, the hint "At least 8 characters" and "Use at least 8 characters"; wrong current password → Current password reads "Current password is not right". After you fix a field its error is no longer read. (BR-REC-137, 134, 02)
- [ ] [N] [R-10] A message that appears later is announced without moving focus: while locked, Account → Change password → the lock toast is read out when it shows; Sign out with DevTools → Offline → the failure toast is read out. (BR-REC-137, 29)
- [ ] [G] Browser zoom 200% (and phone text size to the largest): Login and Account need no sideways scrolling. With "reduce motion" on in the system, there is no animation. (BR-REC-137)
- [ ] [G] Phone at 360 px: no sideways scroll on either screen. Desktop at 1920 px: the Account form stays at most 720 px wide, centred; the Login card stays 400 px. (BR-REC-139)
- [ ] [G] Theme: follows the device (light/dark); the toggle on the Login page changes it and keeps it after a reload. (BR-REC-136)
- [ ] [G] Forms: one column, label above the field, required fields marked *, no Reset button; fields are checked when you leave them and on the button. (BR-REC-134)

## 14. On the real server (Stream G, before the pilot) — [deploy]

- [ ] Over HTTPS the cookies also carry `Secure` (DevTools → Application → Cookies). Both still HttpOnly, SameSite Lax, Path `/`. (BR-REC-30)
- [ ] From outside the server (another network): `curl http://<server>:4000/` and the API's port → not reachable. Only the HTTPS address works. (BR-REC-36)
- [ ] Phone idle for 2+ hours (access cookie gone, refresh valid) → tap Members → the list shows, no Login, no 403 `CSRF_ORIGIN` in the Network tab (the page guard's server-side refresh sends the app's own public address as Origin, so Next must see the public address behind the HTTPS front). (BR-REC-40, 37)
- [ ] The 11-login spoof test and `X-Forwarded-For` check from section 11 pass with `TRUST_PROXY_HOPS=1`. (BR-REC-38)
- [ ] The same login works from two phones and a tablet at once; one signing out does not sign out the others; "Sign out all devices" signs all out. (BR-REC-35)
- [ ] Open the app from a WhatsApp link while signed in (cross-site navigation) → arrives signed in on that page, no Login. (BR-REC-30, spec deviation Lax)

## Coverage

| BR | Section(s) | BR | Section(s) | BR | Section(s) |
|---|---|---|---|---|---|
| 01 | 2, 3 | 02 | 5 | 25 | 1 |
| 26 | 1 | 27 | 1, 5 | 28 | 3 |
| 29 | 3 | 171 | 4 | 30 | 2, 14 |
| 31 | 6 | 32 | 7 | 33 | 5, 7, 10 |
| 34 | 5 | 35 | 9, 10 | 36 | 11, 14 |
| 37 | 11 | 38 | 11 | 39 | 8, 9 |
| 40 | 7, 9 | 41 | 8 | 42 | 2, 9 |
| 43 | 12 | 44 | 7 | ux (S1, S17: 120–139 on these screens) | 10, 13 |
