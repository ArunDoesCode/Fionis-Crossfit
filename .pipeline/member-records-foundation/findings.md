# Stream 0 — findings

## Test change requests (test-writer only)
| # | Test | Spec rule it contradicts | Change |
|---|---|---|---|
| T-1 ✅ | `backend/tests/app.test.ts` "CORS allows the configured APP_ORIGIN" | BR-REC-36 (auth.md): "The app and the API share one web address: the browser calls `/api/…` and Next.js forwards it to the API, which is not reachable from the internet directly (D-018)." + D-019 (4) "Backend CORS is removed". | Replace with a same-origin expectation (no CORS headers / no preflight handling), or drop it. |
| T-2 ✅ | `backend/tests/scripts/seed-perf.test.ts` full 1,000-member run inside `bun test` (≈ 10-min timeout, ~400k rows on every run) | BR-REC-170 Check column: "Script guard test; row counts printed" — the full data set is not a test requirement. | Keep the guard tests; prove the data-set shape on a small run through `PerfSeedOptions` (member count) and assert the default count is 1,000 without inserting it. Keep `bun test` fast. |
| T-3 ✅ | `frontend/tests/lib/domain/membership.test.ts:51` and `backend/tests/lib/domain/membership.test.ts:63` `expect(result?.daysLeft).toBe(-offset)` | BR-REC-52 "ending today counts" + contract.md `membershipStatus`: "`daysLeft` = days from today to end (0 = today, < 0 ended)"; the fixture case today = endOn and the "period ending today" test expect `0`. At offset 0 the loop expects `-0`, and `toBe` uses Object.is, so no implementation passes both. | Compare with `+0` at offset 0 (e.g. `toBe(0 - offset)` or `offset === 0 ? 0 : -offset`) in both packages. |
| T-4 ✅ | `backend/tests/routes/contract-conventions.test.ts` "BR-REC-159 a signed-in request … passes the sign-in check on every protected route" mints a token with a random `sid` | api-contract E05 returns `{ username, remember, expiresAt }` — data that only exists on the signed-in session's `auth_sessions` row, so once auth (Stream A) builds E05 a token without a session row is 401 there (reported by the auth stream session). BR-REC-159 is about the sign-in check, not about fake sessions. | Mint the token for a real `app_account` + `auth_sessions` row (cleaned up after), so the loop stays valid when streams replace the 501 handlers. |

## Review findings
| # | Sev | Area | Finding | Route | State |
|---|---|---|---|---|---|
| R-0 | major | domain (both) | `membershipStatus` returns Ends soon for a not-yet-started latest period when lead ≥ its length; BR-REC-52 says Active ("Renewed early → Active, not Ends soon") | test-writer (fixture case) → backend-dev + frontend-dev | fixed (round 1) |
| R-1 | blocker | backend middleware | `backend/src/lib/response-headers.ts:50-51` `dataResponseHeaders`: on a real server (Bun.serve) a JSON reply ≤ 1 KB arrives with an EMPTY body when the client sends `Accept-Encoding: gzip` (every browser): the small-body branch reads a clone and returns without resetting `c.res`; the outer `serverTiming()` `c.header()` re-wraps the consumed body. Tests miss it because `app.request()` sends no Accept-Encoding. Reported by the auth stream session. | test-writer (Bun.serve regression, BR-REC-161) → backend-dev | fixed (round 1) |
| RV-1 | major | backend | `lib/response-headers.ts:50` gzip buffers every compressible body (`res.clone().arrayBuffer()`), so a streamed `text/csv` (E39) waits for the whole export; BR-REC-147 CSV first byte ≤ 1 s | backend-dev: compress only JSON with a known body; never buffer streams (CSV goes uncompressed; the HTTPS front may compress, tactic 15) + test-writer regression | fixed (round 1) |
| RV-2 | major | admin | `DurationField.tsx` paste "2:02" into minutes → 202 min (BR-REC-75 "pasting 2:02 fills both") | frontend-dev | fixed (round 1) |
| RV-3 | major | spec/backend | idempotency details not in api-contract (failed request frees its key; duplicate waits ≤ 10 s then 429; stale claim > 60 s taken over); E17/E22 descriptors lack 429; no tests | coordinator: api-contract changelog + BR-REC-165 wording · backend-dev: 429 in descriptors, contract:generate, types:api · test-writer: tests | fixed (round 1) |
| RV-4 | minor | backend | idempotency: answer stored after commit; on store failure the claim is released → retry creates a duplicate | backend-dev: keep the claim on store failure | fixed (round 1) |
| RV-5 | minor | backend | waiting duplicate repeats DELETE+INSERT+SELECT every 50 ms | backend-dev: poll SELECT only, back off | fixed (round 1) |
| RV-6 | minor | backend | nothing calls `measureDb` → Server-Timing `db` always 0 (BR-REC-161) | backend-dev: measure automatically in `db/client.ts` if clean, else document the convention | fixed (round 1) |
| RV-7 | minor | spec | 201 for E10/E13/E22, `details.issues[{path,message}]`, 501 NOT_IMPLEMENTED not in api-contract | coordinator: api-contract changelog | fixed (round 1) |
| RV-8 | minor | admin | OfflineBanner sticky over the sticky PageHeader | frontend-dev | fixed (round 1) |
| RV-9 | minor | admin | `useBackToClose` depends on `close` identity → spurious history.back | frontend-dev | fixed (round 1) |
| RV-10 | minor | admin | BottomTabBar `gap-1` (4 px) vs BR-REC-122 8 px | frontend-dev | fixed (round 1) |
| RV-11 | minor | admin | ResponsiveSheet statically imports Drawer + Dialog + AlertDialog (BR-REC-146) | GitHub issue for Stream G (measure with the bundle check) | issue #4 |
| RV-12 | minor | contract | server-side writes send no `Origin` → 403 (affects auth's page-guard refresh, BR-REC-40) | coordinator: note in contract.md for Stream A | done — auth stream confirms its server-side E02 sends Origin |
| RV-13 | minor | spec | ownership table misses `HomeSearch.tsx` (B), `lib/api/client.ts` (Stream 0); token/auth-middleware edits | coordinator: index table | fixed (round 1) |
| RV-14 | minor | tests | no automated UI checks for shell rules; manual checklist pending | test-writer checklist mode before hand-over | at hand-over |
| RV-15 | minor | spec | "clarified during build" items change meaning (BR-REC-52 ×2, 12, 174, 156) | owner confirms at merge (listed in hand-over) | at hand-over |
| TR-1 | blocker | test | biome format error in `frontend/tests/lib/domain/membership.test.ts` (from c5057d0) | test-writer (format only) | fixed |
| TR-2 | — | domain | 12 frontend R-0 failures = the red regression tests of R-0 (expected) | with R-0 | dup of R-0 |
| TR-3 | blocker→rejected | process | test commit 0a3d629 touched `scripts/check-fixtures.sh` | — | rejected: the script is fixture-parity tooling, not production code; registering the pairs belongs with the fixtures (PROTOCOL "Shared golden fixture": only test-writer edits fixtures) and the brief assigned it |

## Round 2 (review of the round-1 fixes: READY, 0 blocker, 0 major)
| # | Sev | Finding | Resolution |
|---|---|---|---|
| R2-1 | minor | `measureDb` docstring told repositories to wrap queries (double count) | fixed |
| R2-2 | minor | Server-Timing `db` is a sum (can exceed `total`); `db.$count()` untimed | documented (docstring, map) + issue #5 (G) |
| R2-3 | minor | no test proves `db` > 0 for a real query | issue #5 (G) |
| R2-4 | minor | RV-4 only partly closed: duplicate still possible after 60 s or a crash between commit and store | issue #3 comment (B) |
| R2-5 | minor | DurationField: no table test for paste; ":" jump not in a rule | issue #6 (D) |
| R2-6 | minor | offline banner under the notch with `viewport-fit=cover` | issue #6 (G) |

## Clarified during build (recorded in the spec changelogs)
- `parseDuration` accepts only `m:ss` / `h:mm:ss`; a bare number such as "95" → null (BR-REC-12 "typed as mm:ss").
- BR-REC-52: "within the lead days" is inclusive — 14 days left with lead 14 → Ends soon.
- BR-REC-52: a not-yet-started latest period is Active whatever the lead days.
- BR-REC-156: only 2xx answers are stored; a failed request releases its key (a corrected retry runs normally). A duplicate arriving while the first still runs waits ≤ 10 s, then 429 `RATE_LIMITED`.
- BR-REC-174: the font budget counts the `latin` files (performance.md changelog).
