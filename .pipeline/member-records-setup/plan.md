# Plan — member-records/setup (Stream C)

Spec: `docs/specs/member-records/setup.md` v2 (frozen 2026-10-03; v2 = build clarifications C1–C10), index
`docs/specs/member-records.md` v2 → Parallel build plan, Stream C. Branch: `claude/member-records-setup-8ce4cb`
(own session/worktree, D-017; PR to `main` at M2 when the user asks).
Rules: BR-REC-10, 11, 13, 14, 60…72 (17) · Endpoints E07–E15 · Tables `gym_settings`, `assessment_types`, `metrics`
(built by Stream 0) · Screens S14 `/admin/settings`, S15 `/admin/settings/assessments` + `/[typeId]`, S16 `/admin/settings/general`.

## Already built by Stream 0 (tests in `backend/tests/scripts/seed.test.ts`)
Seed catalog BR-REC-10 (seed part), 13, 65 (seed part), 68 · E07/E09 `etagMiddleware` wired (BR-REC-160) · all E07–E15
registered (501) with schemas in `types/setup.types.ts` · `API_ROUTES.SETTINGS/ASSESSMENT_TYPES/METRICS` · error texts
`NAME_TAKEN`, `METRIC_LOCKED` · `ThemeToggle` · route folders `settings/{assessments,general}` with loading/error only.

## File ownership (index → Shared files)
Setup owns: `backend/src/{types,routes,controller,service,repository}/setup*`, new `backend/src/lib/domain/metric-value.ts` (C9) ·
`frontend/src/{lib/api,components/views,components/pages}/setup/**`, `frontend/src/lib/validators/setup.ts`, `frontend/src/lib/setup/**` ·
routes `frontend/src/app/(app)/admin/settings/page.tsx`, `settings/assessments/**`, `settings/general/**`.
Read-only: `backend/src/db/**`, `routes/{end-points,index,mount-route}.ts`, `lib/{audit,idempotency,origin-check,etag,server-timing}.ts`,
`lib/domain/{dates,duration,membership}.ts`, `frontend/src/{lib/api/{routes,client}.ts,lib/messages/**,lib/format.ts,lib/domain/**,lib/hooks/**,components/common/**,components/shells/**}`,
layouts. New shadcn primitives only via the shadcn CLI. Generated (re-run, never hand-merge): `backend/.contracts/*`, `frontend/src/types/api.generated.ts`.
Tests: `backend/tests/setup/**`, `frontend/tests/setup/**` (test-writer only).

## Build order
Like auth: one contract step for E07–E15 + admin interfaces, then red tests (backend and frontend test-writers on disjoint
folders, in parallel), then backend-dev ∥ frontend-dev for all three slices; slices below are the checkpoints.

- [x] **0. Contract** — field rules in `types/setup.types.ts` (C1–C3, C7, C8), `contract:generate`, `types:api`, `contract.md` (+ admin interfaces, rounding signature) — 2cae9bf
  Decisions taken with the contract: E11 answers all measurements (on and off); check ranges bounded to ±999,999,999.999 (fits `numeric(12,3)`); E14 error order 404 → C8 400 → `METRIC_LOCKED` → `NAME_TAKEN`; catalog loaded with `pageSize=100`.
- [x] **Red tests** — backend `tests/setup/**` (fca6f76), frontend `tests/setup/**` (afce7df)
- [x] **1. Settings** — BR-REC-60, 72 (E07 ETag)
  - backend: E07 (row read; ETag), E08 (C1 checks, change log `settings.update`)
  - admin: S14 Settings hub (rows Assessments › · Reminders & gym › · Account › · Export data › · Theme System/Light/Dark), S16 Reminders & gym form
- [x] **2. Assessments** — BR-REC-10, 13, 61, 66, 67, 70, 72 (E09 ETag)
  - backend: E09 (C5 filter, C6 `hasValues`, setup order), E10 (added last, `NAME_TAKEN`), E11 (rename, repeat, On/Off), E12 (C7)
  - admin: S15 list (rows "Every 2 months", Off badge, Move up/down, + Add assessment), assessment sheet (name, repeat, On), repeat-change confirm (BR-REC-70)
- [x] **3. Measurements** — BR-REC-10, 11, 14, 62, 63, 64, 65, 66, 67, 69, 71
  - backend: E13, E14 (C3 Time normalisation, C4 `METRIC_LOCKED`, C8 pair checks), E15 (C7), `roundMetricValue` (C9); no unit conversion anywhere (BR-REC-69)
  - admin: S15 detail (rows name · unit · better or own repeat, Off, Move up/down, + Add measurement), measurement sheet
    (kind/unit locked when `hasValues`, decimals, better, please-check range, own repeat, report table, On), better-change confirm (BR-REC-71)

## Baseline (2026-10-04, before any change)
All green: backend typecheck, lint, `bun test` 809 pass, `contract:check` (41 routes); frontend typecheck, lint, `bun test` 749 pass,
`types:api` current; `check-fixtures.sh`.

## Notes
- Own test DB `gym_setup_test` (`backend/.env`, created by the coordinator from `.env.example`; API `PORT=4002`, frontend `API_URL` → 4002).
  Dev DB `gym` is shared with the members session; same schema (`db:push` = no changes). Never `db:push` a different schema.
- Other member-records worktrees exist (e.g. `member-records-feature-8fca5b`, likely Stream B); setup shares no files with members.

## Status
**Built and verified 2026-10-04; ready for hand-over** (user asks for the PR). Commits: contract 2cae9bf · tests afce7df, fca6f76 · backend c2f01e6 ·
admin abc209f · fix round 1 (R-1 88e8ee5, R-3 2a3931e) · fix round 2 (R-9, R-10 1dd728c; C13 spec 81328c9 + test 6df8aad). Review: 2 rounds,
1 major (R-1) fixed, minors fixed or filed (#18, #19, #21); see `findings.md`. Tests: backend 1383, frontend 1083 (baseline 809 / 749).
Manual checklist: `checklist.md`. Open for the owner: confirm spec clarifications C1–C13 (R-2).
