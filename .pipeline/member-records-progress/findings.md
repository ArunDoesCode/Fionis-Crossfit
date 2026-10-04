# Findings — member-records/progress (Stream F)

Review round 1 (reviewer + test-runner on `11abe64`/`b972f7a`): **READY, 0 blockers, 0 majors, 8 minors.** Test-runner: all checks green
(backend 2226 pass vs 1855, frontend 1805 vs 1407, `contract:check`, fixtures, test independence).
Not verified by the reviewer: BR-REC-146 bundle size (Stream G's CI check), the one-A4 print (manual, BR-REC-109), perf budgets
(backend-dev measured on the 1,000-member perf seed: E35 ≈ 50 ms, E36 80–140 ms, E37 ≈ 110 ms, E38 ≈ 60 ms warm, CSV first byte 8 ms).

| # | sev | area | finding | decision |
|---|---|---|---|---|
| R-1 | minor | spec | blank line split the P table (P12–P14 loose); contract.md said P1–P11 and lacked P13 | **fix now** (docs, coordinator) |
| R-2 | minor | backend + admin | `joinedFrom=0000-05` passes `isoMonthSchema` and gives a 500 (Postgres rejects the date) instead of 400; frontend `MONTH` regex has the same gap | **issue [#26](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/26)** (needs a schema refine + tests; hand-edited URL only) |
| R-3 | minor | backend | a mid-stream export failure logs the Drizzle message with the keyset cursor (a lower-cased member name) | **issue [#27](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/27)** (same as the global handler today) |
| R-4 | minor | backend | `ReadableStream` wrapper sits in the controller | **issue [#27](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/27)** (works; move to `lib/`) |
| R-5 | minor | admin | with no `metric` in the URL, E36/E37 wait for E09 (BR-REC-149 "no call waits") | **issue [#28](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/28)**; accepted by spec P11 / contract.md |
| R-6 | minor | admin | leaderboard rows link to the member page: not in the spec (scope rule) | **fix now** (remove link; idea → [#29](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/29)) |
| R-7 | minor | backend | the formula guard (P14) skips a leading CR (OWASP lists it) | **reject for now**: spec frozen, the cell is quoted (so it does not start a formula); recorded in [#30](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/30) for the owner |
| R-8 | minor | backend | export is read in separate queries (name keyset), a rename during a long export can skip/repeat a row | **issue [#30](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/30)**, rare at gym scale |
| T-1 | minor | test | BR-REC-119 "starts at once" test seeds 30,000 rows in its own setup; times out (5 s) when the machine is under heavy load (other sessions) | **issue [#31](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/31)** (test-writer: raise the timeout; no spec rule is wrong, so no test change in this run) |

Live check on the real API (perf seed: 1,000 members, 336,640 values; frontend-dev, headless Chrome): S13 numbers equal SQL (default, filtered, active-by-plan, leaderboard ranks),
4 API calls on open, E36 17–23 ms warm, CLS ≤ 0.028; S12 values equal SQL for 102 multi-reading measurements; S18 three downloads start in 41–99 ms,
file names, BOM, CRLF and row counts (1,000 / 4,128 / 336,640) are right.

| # | sev | area | finding | decision |
|---|---|---|---|---|
| L-1 | major | S12 print | BR-REC-109: a 29-measurement card printed on 2 pages (long names wrapped in a 21% column) | **fixed** (print column widths 28/15/15/14.5/17/10.5; 66 PDFs of 30 members, light and dark, A4 + 12 mm margins: all 1 page, ≥ 12 mm spare; a member with only single readings has 1.5 mm spare → owner check) |
| L-2 | minor | S12 print | with "Background graphics" on, dark mode left a dark page margin (inline `color-scheme: dark` beat the print rule) | **fixed** (`color-scheme: light !important`) |
| L-3 | note | S13 | a bookmarked No-direction measurement fires E37 first and gets one 400 `NO_DIRECTION` | **accepted** (R-5 family, [#28](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/28)) |
| L-4 | note | S12 | desktop/print "Latest" cell of a one-reading measurement shows no date | none (matches the spec wording) |
| O-1 | owner | CSV | P9 guards numbers too: the 1,088 negative Flexibility values in the perf seed export as text (`'-0.5`), which breaks sums and charts in Excel | **ask the owner at hand-over** (A keep P9 / B leave real numbers alone, guard text only) |

Fix round 1 (R-1, R-6, L-1, L-2) done; no blocker or major open. Process note: another session's pattern kill (`pkill -f "bun src/index.ts"`) stopped this session's API once; backend-dev did the same to others earlier. Use ports or PIDs.

## O-1 — owner decision 2026-10-04 (answer A): real numbers are not formula-guarded
Spec P9 (progress.md v2) now says: the guard applies to text; numbers are written plain (a negative value stays a number); a text cell that is exactly a
negative number literal (e.g. the `display` "-0.5") is written as is; everything else that starts with `=`, `+`, `-`, `@` or a tab is still prefixed with `'`.
Affected: backend `csv.test.ts` and `e39-export.test.ts` (guard of numbers and negative values) and the checklist section 10 (negative-value and guarded cells).
Owner also confirmed P1–P14 (answer yes).
