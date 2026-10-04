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

Fix round 1 → see below once done.
