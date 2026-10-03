# Stream 0 — findings

## Test change requests (test-writer only)
| # | Test | Spec rule it contradicts | Change |
|---|---|---|---|
| T-1 ✅ | `backend/tests/app.test.ts` "CORS allows the configured APP_ORIGIN" | BR-REC-36 (auth.md): "The app and the API share one web address: the browser calls `/api/…` and Next.js forwards it to the API, which is not reachable from the internet directly (D-018)." + D-019 (4) "Backend CORS is removed". | Replace with a same-origin expectation (no CORS headers / no preflight handling), or drop it. |
| T-2 ✅ | `backend/tests/scripts/seed-perf.test.ts` full 1,000-member run inside `bun test` (≈ 10-min timeout, ~400k rows on every run) | BR-REC-170 Check column: "Script guard test; row counts printed" — the full data set is not a test requirement. | Keep the guard tests; prove the data-set shape on a small run through `PerfSeedOptions` (member count) and assert the default count is 1,000 without inserting it. Keep `bun test` fast. |
| T-3 ✅ | `frontend/tests/lib/domain/membership.test.ts:51` and `backend/tests/lib/domain/membership.test.ts:63` `expect(result?.daysLeft).toBe(-offset)` | BR-REC-52 "ending today counts" + contract.md `membershipStatus`: "`daysLeft` = days from today to end (0 = today, < 0 ended)"; the fixture case today = endOn and the "period ending today" test expect `0`. At offset 0 the loop expects `-0`, and `toBe` uses Object.is, so no implementation passes both. | Compare with `+0` at offset 0 (e.g. `toBe(0 - offset)` or `offset === 0 ? 0 : -offset`) in both packages. |

## Clarified during build (recorded in the spec changelogs)
- `parseDuration` accepts only `m:ss` / `h:mm:ss`; a bare number such as "95" → null (BR-REC-12 "typed as mm:ss").
- BR-REC-52: "within the lead days" is inclusive — 14 days left with lead 14 → Ends soon.
