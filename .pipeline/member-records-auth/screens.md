
## S1 + S17 + page guard — admin sign-in (frontend-dev, Stream A)

### S1 Login — `/login`
Permission: none (the only screen without a sign-in). Signed in (access cookie) → straight to `/admin` (BR-REC-42), except `/login?reason=expired`, which shows Login even with an access cookie (review R-4).
- Layout: a card, centred, 400 px wide on desktop; on a phone the same card edge to edge (16 px page padding). Title "Fionis CrossFit", line "Sign in to continue". Theme toggle top right.
- Fields (each with its label): **Username**, **Password** with a **Show / Hide** button inside the field (spoken as "Show password" / "Hide password"), tick box **Keep me signed in** (ticked by default).
- **Sign in** button (48 px, full width). Off only while the call runs ("Signing in…" + spinner). Stays tappable while locked. No "create account", no "forgot password" (BR-REC-25).
- One **error line** under the tick box, its space always reserved (2 lines high; no jump):
  - wrong user or wrong password → "That username or password is not right." (never says which; BR-REC-01)
  - locked → "Too many wrong tries, so sign-in is paused. Try again in N minutes." (N = seconds left ÷ 60, rounded up; BR-REC-29)
  - 10 tries in a minute → the dictionary line for `RATE_LIMITED`; anything else → the dictionary line for its code
  - arriving after a failed refresh or an ended sign-in (`?reason=expired`) → "Please sign in again." (plain colour, not red; read out by a screen reader when the page opens) until the first try (BR-REC-41)
  - Enter twice (or Enter then a tap) while the call runs → one request only (R-9)
  - a field error is read out when it appears and is linked to its field (`aria-describedby`; R-10)
- Empty field on Sign in → "Enter your username" / "Enter your password" under the field, focus jumps to the first one; over 128 characters → "Use at most 128 characters".
- Success → the page asked for (`?next=`, only a path inside the app, else `/admin`; BR-REC-39). `?next=https://evil.com` → `/admin`.
- Loading: a grey card in the same layout.

### S17 Account — `/admin/settings/account`
Permission: the shared login (any signed-in visitor; the page guard sends everyone else to Login).
- Header: back arrow to Settings, title "Account", main action **Change password** (right of the header from 1024 px; bar on the bottom edge on phones, tab bar hidden because it is a form).
- "Signed in as **admin**" (E05). Its own grey bar while loading; "Couldn't load this." [Try again] if it fails, the rest of the page keeps working.
- **Change password** form: **Current password**, **New password** with the hint "At least 8 characters". No Reset button.
  - new password under 8 → "Use at least 8 characters"; over 128 → "Use at most 128 characters"; empty current → "Enter your current password"
  - wrong current password → "Current password is not right" next to Current password (counts toward the lock; nobody is signed out)
  - locked → a toast with the BR-REC-29 line; success → toast "Password changed, and other devices are signed out." and the fields empty; this device stays signed in
  - while saving the header button reads "Saving…" and is off; Enter twice sends one request (R-9); field errors are linked to their field (R-10)
- **Sign out** — no question; ends this device's sign-in, empties the app's cached data, opens Login (BR-REC-35). Off while the call runs.
- **Sign out all devices** — opens a confirm: "Sign out all devices?" / "Everyone using this login, including this device, will have to sign in again." [Cancel] [Sign out all devices] (BR-REC-133). Under the button: "Use this if a phone is lost or a trainer leaves."
- If a sign-out call fails: a toast with a plain sentence, nothing is cleared, the page stays.
- Loading and error: Stream 0's `loading.tsx` / `error.tsx` (unchanged).

### Side bar "Sign out" (from 1024 px, every `/admin/**` page)
Same as the **Sign out** button above (E03, no question). Off while the call runs.

### Page guard (`proxy.ts`, every page, no UI)
- No cookies → `/login?next=<page asked for>` (the Home alias `/` has no `next`).
- No access cookie but a refresh cookie → refreshed on the server before the page renders (no Login, no flash); a refused refresh → `/login?next=…&reason=expired`.
- `/api/*`, static files, images and the manifest are never guarded.
- A request that gets a 401 after the one retry opens `/login?next=<current page>&reason=expired` (browser navigation; drafts stay).
