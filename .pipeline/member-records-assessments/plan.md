# Plan — member-records/assessments (Stream D)

Spec: `docs/specs/member-records/assessments.md` v1 (frozen 2026-10-03), index `docs/specs/member-records.md` v2 →
Parallel build plan, Stream D (M3). Branch: `claude/member-record-assessment-696977` (own session/worktree, D-017; from
`main` 8e3d569 = M2 merged; PR to `main` when the user asks).
Rules: BR-REC-12, 19, 20, 21, 73…92 (24) · Endpoints E25–E30 · Tables `assessments`, `measurements` (built by Stream 0) ·
Screens S10 `/admin/members/[memberId]/assess?type=&date=` (+ choose-assessment and check-values sheets),
S11 `/admin/members/[memberId]/assessments`, member-page "Recent" block · device-side draft store and plausibility check.

## Already built by Stream 0
`parseDuration` / `formatDuration` / `durationFromParts` / `durationToParts` in both packages + golden `duration-cases.json`
(BR-REC-12, 75 maths) · `roundMetricValue` (setup, C9) · E25–E30 registered (501) with schemas in `types/assessments.types.ts` ·
shared `NumberField`, `DurationField`, `DateField`, `ChoiceChips`, `ResponsiveSheet`, `ConfirmSheet` · `RecentBlock` slot.

## File ownership (index → Shared files)
Assessments owns: `backend/src/{types,routes,controller,service,repository}/assessments*` ·
`frontend/src/{lib/api,lib/validators,components/views,components/pages}/assessments/**`, `frontend/src/lib/assessments/**` ·
slot `components/pages/member/RecentBlock.tsx` · routes `app/(app)/admin/members/[memberId]/{assess,assessments}/**`.
Read-only: everything else (Stream 0 shared files, A, B, C, E due-list, F progress). A needed change there → stop and tell
the user (memory: parallel-stream-sessions). Generated: `.contracts/*`, `api.generated.ts` (re-run only).
Tests: `backend/tests/assessments/**`, `frontend/tests/assessments/**` (test-writer only).

## Build order
As setup/members: one contract step for E25–E30 + admin interfaces, then red tests (backend and frontend test-writers on
disjoint folders, in parallel), then backend-dev ∥ frontend-dev; slices below are the checkpoints.

- [x] **0. Contract** — field rules in `types/assessments.types.ts`, `contract:generate`, `types:api`, `contract.md` (+ admin interfaces)
- [x] **Red tests** — backend `tests/assessments/**`, frontend `tests/assessments/**`
- [x] **1. Save** — BR-REC-19, 76 (server rounding), 77, 78, 83, 86, 92 (save part)
  - backend: E26 upsert on (member, type, date) under a member-row lock; `created` / `saved` / `removed`; `NO_VALUES`,
    `DATE_IN_FUTURE` (gym today), `METRIC_NOT_IN_TYPE`; values rounded with `roundMetricValue`; measurements copy member + date
    (BR-REC-166); one change-log row with old → new values.
- [x] **2. Entry form** — BR-REC-20, 74, 81 (+ 12 duration)
  - backend: E25 member, type, active measurements in setup order, `existing` for that date, `previous` = latest value dated
    before the date.
  - admin: S10 Record assessment — fields (number / time), previous + change line, date + About, Q1–Q4 chips (79), ≈ dates (80),
    please-check (21, 82), choose-assessment sheet (73), open saved (74), Save / Save & next date (84), failure line (86), drafts (85),
    leave guard (90), keypad order (91), before-join warning (83).
- [x] **3. History** — BR-REC-87, 88, 89, 92 (edit/move/delete part)
  - backend: E27 list (newest first, type filter, 25/page, `valueCount`), E28 detail, E29 move date / About (409
    `ASSESSMENT_DATE_TAKEN`, values move too), E30 delete (values cascade, `removed`); change-log rows.
  - admin: S11 All assessments (chips, Show more, ≈), assessment detail with Edit (opens S10 at that date) and Delete confirm,
    member-page Recent block.

## Baseline (2026-10-04, before any change)
All green: backend typecheck, lint, `bun test` 1855 pass, `contract:check` (41 routes), `check-fixtures.sh`; frontend
typecheck, lint, `bun test` 1407 pass. Own DBs: dev `gym_assess`, test `gym_assess_test`; API port 4003, web 3003
(due-list stream runs next to us).

## Build choices (coordinator; recorded as D-022)
See `docs/decisions.md` D-022 and the spec's Build clarifications D1–D21.

## Notes
- 2026-10-04: shared `NumberField`/`DurationField` fixes (#21, #19) were committed before their tests (9b5aed7, tests 44f13bd) — a deviation from tests-first for a 110-line shared fix; the tests were written from the spec only.
- 2026-10-04: the first backend test run was blocked by two runs sharing one test database (auth suites are one-row tables): never run two suites on `gym_assess_test` at once.

## Status
**Built and verified 2026-10-04; ready for hand-over** (user asks for the PR). Commits: contract bbac837 · tests 44f13bd, c4a0f2c, 7bd07f0 · backend 840e3dc · admin c91ff22, 06bed7b · fix round 1 8c02e41 (+tests 96e3a57, 5421a08), de5762d · fix round 2 f639041 (+tests 2bb2281, 6013bde). Review: 2 rounds, majors R-1 (untouched values re-rounded), R-3 (tests), R-4 (bundle split) fixed, R-2 decided (E29 API-only, #32); see `findings.md`. Tests: backend 2185 (baseline 1855), admin 2430 (baseline 1407). Manual checklist: `checklist.md`.
- 2026-10-04: the checklist writer was resumed after an API error with a message that summarised behaviour (not pointers only); it re-read the spec and screens itself and flagged it. Checklist steps tagged [note] are open questions for the owner (D19 draft date, clear-only toast wording, year shown for this year's dates).
