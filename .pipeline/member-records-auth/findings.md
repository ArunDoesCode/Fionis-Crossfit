# Findings — member-records/auth

Review 1 (reviewer, 2026-10-03, HEAD 405968c): 0 blocker, 2 major, 11 minor. test-runner: all green (backend 781, frontend 735).

| # | Sev | Area | Finding | Decision | Route |
|---|---|---|---|---|---|
| R-1 | major | backend | Replaced token inside the 60 s grace rotates again → drops the first token; cookie-order race signs a device out with a false `reuse` | fix now; spec v2 BR-REC-32 clarified: in-grace use gets an access token only, no second rotation, no new refresh cookie | test-writer (regression + adjust any test pinning a refresh cookie on the in-grace answer, citing BR-REC-32 v2) → backend-dev |
| R-2 | major | admin | Page-guard E02 sends no `X-Forwarded-For` / `User-Agent` → all guard refreshes share one rate-limit bucket (BR-REC-38) and audit rows show the Next server | fix now: forward the incoming `X-Forwarded-For` unchanged and `User-Agent` | test-writer → frontend-dev |
| R-3 | minor | admin | Any failed refresh (5xx, 429, network) is treated as "signed out" | issue — BR-REC-41 literally says "if that fails"; transient handling is an improvement | [#7](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/7) |
| R-4 | minor | admin | Access cookie present + persistent 401 → Login ↔ /admin redirect loop | fix now; spec v2 BR-REC-42 clarified | test-writer → frontend-dev |
| R-5 | minor | spec | Fixed lock window vs "tries older than 15 min drop off" | spec v2 BR-REC-28 clarified (window starts at first wrong try); no code change | — |
| R-6 | minor | spec | `auth.account_created`, `auth.password_reset` unspecced and untested | spec v2 BR-REC-43 lists them; tests added | test-writer |
| R-7 | minor | backend | Decoy hash created lazily → first unknown-username try after restart is slower | fix now | backend-dev |
| R-8 | minor | backend | argon2id cost outside tests is Bun's implicit default | fix now: pin `memoryCost` / `timeCost` | backend-dev |
| R-9 | minor | admin | Double submit (Enter twice) sends two E01 / E06 calls → extra lock counts | fix now | frontend-dev |
| R-10 | minor | admin | a11y: errors not linked with `aria-describedby`; expired line in an always-mounted alert is not announced (BR-REC-137) | fix now | frontend-dev |
| R-11 | minor | spec | `--reset` does not clear the lock | reject — not in BR-REC-26; developer runs `--reset` then `--unlock` (documented in contract) | — |
| R-12 | minor | deploy | Guard `Origin` = `request.nextUrl.origin`; behind the HTTPS front it must be the public origin | issue for Stream G (deploy check) | [#8](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/8) |
| R-13 | minor | tests | No component tests for Login / Account (no DOM test library in the repo) | issue; manual checklist covers it | [#9](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/9) |
| T-1 | — | test-runner | "argon2 minimum cost when NODE_ENV=test" flagged as test-specific production behaviour | reject — the spec requires it (auth.md → Test hooks) | — |

Fix round 1: tests ec91171 → backend 4c8f5ff (R-1, R-7, R-8) → admin 7a4b74a (R-2, R-4, R-9, R-10). Re-check (reviewer): all 7 fixed; 0 blocker, 0 major, 2 minor. test-runner: all green (backend 807, frontend 749); its
TEST-INTEGRITY note on Stream 0 commit 0a3d629 (`scripts/check-fixtures.sh` in a `test(` commit) is rejected — Stream 0's
history, already merged as #10.

| # | Sev | Area | Finding | Decision | Route |
|---|---|---|---|---|---|
| R-14 | minor | tests | In-grace use slides `expires_at` / `last_used_at` (BR-REC-31 "every use starts the 7 days again") but no test pins it | add one test: ticked sign-in, rotate, in-grace use → `expires_at` ≈ 7 days after that use (BR-REC-31, 32 v2) | test-writer |
| R-9/R-10 manual | — | checklist | Single submit and the announced "Please sign in again." have no automated test (no DOM library) | add manual items: Enter twice on Login and Account → one request; screen reader on `/login?reason=expired` announces the line (BR-REC-137) | test-writer (checklist) |
| R-15 | minor | docs | contract.md E02 row / Cookies section say E02 always sets both cookies (contradicts BR-REC-32 v2) | fixed by the coordinator | — |
