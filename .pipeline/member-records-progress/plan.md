# Plan — member-records/progress (Stream F)

Spec: `docs/specs/member-records/progress.md` v2 (frozen 2026-10-03; v2 = no server cache (user decision) + build
clarifications P1–P11), index `docs/specs/member-records.md` v2 → Parallel build plan, Stream F. Branch:
`claude/feature-f-progress-report-6c2bbe` (own session/worktree, D-017; PR to `main` at M3 when the user asks).
Rules: BR-REC-22…24, 106…119 (17) · Endpoints E35–E39 · no tables (reads `members`, `membership_periods`,
`assessment_types`, `metrics`, `assessments`, `measurements`, `gym_settings`) · Screens S12 `/admin/members/[memberId]/report`,
S13 `/admin/reports`, S18 `/admin/settings/export`.

## Already built by other streams
Stream 0: E35–E39 registered (501) with schemas in `types/progress.types.ts` (`AGE_BANDS`, `EXPORT_FILES`); `API_ROUTES.MEMBERS.REPORT_CARD`,
`REPORTS.*`, `EXPORTS.FILE`; `Sparkline`; route folders with loading/error (report and reports have a placeholder `page.tsx`, export has none);
Reports tab in the nav. Members (B): the member page's "Report card" button. Setup (C): Settings hub row "Export data".
Assessments (D) builds the writes in parallel: progress tests insert `assessments` / `measurements` rows with Drizzle, never through E26.

## File ownership (index → Shared files)
Progress owns: `backend/src/{types,routes,controller,service,repository}/progress*`, `backend/src/lib/domain/report.ts` ·
`frontend/src/{lib/api,components/views,components/pages}/progress/**`, `frontend/src/lib/progress/**` · routes
`app/(app)/admin/members/[memberId]/report/**`, `app/(app)/admin/reports/**`, `app/(app)/admin/settings/export/**`.
Read-only: everything else (`db/**`, `end-points.ts`, `mount-route.ts`, shared libs, `components/common/**`, `components/shells/**`,
other streams' files — importing their exported functions is fine). New shadcn primitives only via the shadcn CLI.
Generated (re-run, never hand-merge): `backend/.contracts/*`, `frontend/src/types/api.generated.ts`.
Tests: `backend/tests/progress/**`, `frontend/tests/progress/**` (test-writer only).

## Build order
As setup: one contract step for E35–E39 + interfaces, then red tests (backend and frontend test-writers in parallel on disjoint
folders), then backend-dev ∥ frontend-dev for all three slices; slices below are the checkpoints.

- [x] **0. Contract** — `types/progress.types.ts` (E35 `id`/`decimals`, segmental groups), route notes, `contract:generate`, `types:api`, `contract.md` — 998abff
- [x] **Red tests** — backend `tests/progress/**` (41cec8b), frontend `tests/progress/**` (6ef6547)
- [x] **1. Report card** — BR-REC-22, 106, 107, 108, 109
  - backend: E35, pure `reportCard` / `summariseReadings` / `bestReading`
  - admin: S12 — phone: one card per measurement; desktop + print: table; Print button; print layout (A4, shell hidden, black on white)
- [x] **2. Gym progress + leaderboards** — BR-REC-23, 110, 111, 112, 113, 114, 115, 116
  - backend: E36, E37, E38 (live, no cache), pure `progressStats`, `changeOutcome`, `ageBand`, `rankLeaderboard`, `countActiveByPlan`
  - admin: S13 — measurement picker, filters in the URL, average change + n / not counted, outcome bar, Male/Female leaderboard with "Show more", active by plan
- [x] **3. CSV export** — BR-REC-24, 117, 118, 119
  - backend: E39 streamed CSV, pure helpers `service/progressCsv.ts`
  - admin: S18 — three rows with "Download CSV" (fresh sign-in first, then a plain browser download)

## Baseline (2026-10-04, before any change)
All green: backend typecheck, lint, `bun test` 1855 pass, `contract:check` (41 routes), `check-fixtures.sh`; frontend typecheck,
lint, `bun test` 1407 pass.

## Notes
- Own databases `gym_progress` / `gym_progress_test`, API `PORT=4006`, web 3006 (`backend/.env`, `frontend/.env.local`, made by the coordinator).
  Other sessions: due-list (`gym_due*`, 4005), assessments (`gym_assess*`, 4003). Never `db:push` someone else's database.
- User decision 2026-10-04: no server cache (BR-REC-110 v2).

## Status
**Built and verified 2026-10-04; ready for hand-over** (user asks for the PR). Commits: spec v2 a18211c, a3b2867 · contract 998abff · tests 6ef6547 (admin), 41cec8b (backend) ·
admin b972f7a · backend 11abe64 · fix round 1 (R-6, L-1, L-2) 0cd9595 · docs (this commit). Review: 1 round, 0 blocker, 1 major found by the live check (L-1 print, fixed), minors fixed or filed (#26–#31);
see `findings.md`. Tests: backend 2226, frontend 1805 (baseline 1855 / 1407). Manual checklist: `checklist.md`. Owner confirmed P1–P14 and decided O-1 (CSV guard on text only) on 2026-10-04: tests 9bbca11, fix `fix(…): CSV formula guard applies to text only`.
