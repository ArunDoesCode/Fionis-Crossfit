# Findings — member-records/members

Review round 1 (reviewer, 9244b2c..bb38aa0 + test-runner: all green, 0 new failures vs baseline).

| # | Sev | Area | Finding | Decision |
|---|---|---|---|---|
| R-1 | major | admin/perf | `PeriodSheet` and `ConfirmSheet` imported statically: Home, member page and S4 ship ~67 KB gz (form, zod, drawer/dialog) before any tap (tactic 4, BR-REC-146) | **fix now** (frontend-dev): load on demand with `next/dynamic`, preload on pointer-down |
| R-2 | major | admin | Membership history (only way to Edit a period) shows only with > 1 period; a typo in the first plan/start cannot be fixed (BR-REC-09, 55) | **fix now**: show from 1 period; update screens.md |
| R-3 | minor | admin/perf | `useRefreshMembers` sets the detail then invalidates it too → redundant GET after Archive/Restore | **fix now** (cheap, same file) |
| R-4 | minor | admin/perf | Search does not cancel older requests (tactic 9, owner members) | **fix now**: forward `signal` |
| R-5 | minor | admin/perf | Tactic 1 (server-side start of data calls, `HydrationBoundary`) not applied; used nowhere in the repo | **issue** → Stream G decides once for all streams |
| R-6 | minor | backend | E16 `q` has no max length | **fix now** (backend-dev): `.max(100)`; regenerate contract |
| R-7 | minor | spec | api-contract E19 row lacks 400 `START_BEFORE_JOIN` | **docs** at hand-over (api-contract changelog, no rule changed) |

Fix round 1 (9e2ae8c, 34fdbd7): R-1, R-2, R-3, R-4, R-6 closed (round 2 reviewer: READY, 0 blocker, 0 major; test-runner green, bundle −58…−68 KB gz).

Review round 2 — minors:
| # | Sev | Area | Finding | Decision |
|---|---|---|---|---|
| R-8 | minor | admin | first tap mounts the lazy sheet already open → no slide-up/fade on the first open per page | **fix now** (fix round 2): mount closed, open after first paint |
| R-9 | minor | admin | (a) no feedback / E18 fetch starts only after the chunk loads; (b) a failed chunk load kills Renew until reload | **fix now**: prefetch E18 on pointer-down; on a failed load toast "Couldn't load this" and allow a retry tap |
| R-10 | minor | admin | R-6 cap has no client twin: a pasted 120-character search → 400 "Couldn't load this" with a dead Try again | **fix now**: `clampSearchText` (contract.md), used where `q` is built |
| R-11 | minor | spec/test | api-contract E16 row said 2+; no test for 101 characters | row fixed (docs); regression tests by test-writer (backend 100/101, admin clamp) |

Fix round 2 is the last (max 2 iterations); then test-runner + a focused review of the fix diff.
