# Findings — member-records/setup (review of `origin/main...abc209f`, test-runner green)

Review round 1: 0 blocker, 1 major, 7 minor. test-runner: all green vs baseline (backend 1350, frontend 1083), test integrity pass.

| # | sev | area | finding | decision |
|---|---|---|---|---|
| R-1 | major | admin | `ConfirmSheet` nested in the edit sheet pushes two `useBackToClose` entries: Back at the confirm leaves it open, then Cancel closes the parent and the typed values are lost (checked against `lib/hooks/useBackToClose.ts`) | **fix now** (frontend-dev): confirm becomes a second step inside the same sheet, one history entry, values kept |
| R-2 | minor | spec | spec still `frozen` after build clarifications C1–C11 | **ask the user at hand-over** (confirm C1–C12; logged in the spec changelog) |
| R-3 | minor | backend | E07 (a GET) inserts the settings row when missing | **fix now** (backend-dev): read path returns the defaults without writing; E08 keeps creating the row |
| R-4 | minor | admin | iOS decimal keypad has no minus: a coach cannot type a negative "please check below" (Flexibility −30) | **fix now if possible without a shared file** (frontend-dev, setup-owned control); else GitHub issue for a shared `NumberField` option |
| R-5 | minor | admin | measurement sheet is flat (as the setup.md wireframe), BR-REC-134 says optional fields under "More details" | **accept** → spec C12 (flat order kept) |
| R-6 | minor | cross-stream | writes invalidate only `setupKeys.all`; Home due query could show old rows up to 30 s (BR-REC-70 "at once") | **map note** for due-list (Stream E): `staleTime: 0` on the Home due query |
| R-7 | minor | tests | BR-REC-70/71 UI wiring has only pure-helper tests (no DOM library, issue #9) | **manual checklist** by test-writer at hand-over |
| R-8 | minor | docs | stale text in contract.md, plan.md, map (ThemeToggle vs ThemeChoice, "501", "C1–C10") | **fix** in the knowledge update |

Also filed as GitHub issues (shared files, not setup's): `ResponsiveSheet` desktop dialog does not scroll or cap its height (setup works around it with `SheetBody`); `useBackToClose` is not stack-aware; `DurationField` returns `null` for an out-of-range box (a mistyped Time check range reads as empty).
