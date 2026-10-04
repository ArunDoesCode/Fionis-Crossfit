# Plan — member-records/due-list (Stream E)

Spec: `docs/specs/member-records/due-list.md` v2 (frozen 2026-10-03; v2 = build clarifications C1–C13, owner answers Q4, Q5),
index `docs/specs/member-records.md` v2 → Parallel build plan, Stream E. Branch: `claude/due-date-engine-overdue-871ad4`
(own session/worktree, D-017; PR to `main` at M3 when the user asks). Started from `main` 8e3d569 (M2: B and C merged).
Rules: BR-REC-15…18, 93…105 (17) · Endpoints E31–E34 · Table `due_overrides` (built by Stream 0) · Pure `computeDue` ·
Screens S2 Home due sections, S3 `/admin/due`, row sheet, member page "Assessments" block.

## Already built by Stream 0
`due_overrides` table + checks · E31–E34 registered (501) with schemas in `types/due.types.ts` · `API_ROUTES.DUE.LIST`,
`MEMBERS.DUE`, `MEMBERS.DUE_ACTION` · `SNOOZE_TOO_FAR` text · words `dueSoon`, `assessSoon`, `remindMeLater` · `lib/domain/dates.ts`
(`addInterval`, `addMonths`, `daysBetween`, `gymToday`; BR-REC-93, 94, 105 tested there) · slots `DueSections`, `DueBlock` ·
route folder `admin/due` (loading/error only).

## File ownership (index → Shared files)
Due-list owns: `backend/src/{types,routes,controller,service,repository}/due*`, new `backend/src/lib/domain/due.ts` ·
`frontend/src/{lib/api,lib/validators,components/views,components/pages}/due/**`, new `frontend/src/lib/due/**`,
`components/pages/home/DueSections.tsx`, `components/pages/member/DueBlock.tsx`, route `frontend/src/app/(app)/admin/due/**`.
Read-only: everything else (`backend/src/db/**`, `routes/{end-points,index,mount-route}.ts`, shared libs, other streams' files;
calling their exported functions, e.g. `setupService.getSettings`, is fine). Generated: `.contracts/*`, `api.generated.ts`.
Tests: `backend/tests/due/**`, `frontend/tests/due/**` (test-writer only).

## Build order
Like setup: one contract step for E31–E34 + `computeDue` + admin interfaces, then red tests (backend and frontend
test-writers on disjoint folders, in parallel), then backend-dev ∥ frontend-dev for all slices; slices are the checkpoints.

- [x] **0. Contract** — `computeDue` signature, E31–E34 behaviour, schema tweaks if any (`types/due.types.ts`), `contract:generate`,
  `types:api`, `contract.md` (+ admin interfaces by the coordinator) — b16cc4f
  Decisions taken with the contract: engine = `computeDue` + `dueListRows` + `memberDueItems` + `isListedInDueList` (C3 unit-testable);
  last tie-break `memberId`; E31 unknown/off `typeId` → empty page; no settings row → Asia/Kolkata, 7; E34 with nothing set still logs
  `due_override.clear`; error order schema 400 → 404 → `until` checks.
- [x] **Red tests** — backend `tests/due/**`, frontend `tests/due/**`
- [x] **1. Due engine** — BR-REC-15, 16, 93, 94, 95, 96, 105 (C1, C2; due examples 1–9, 14)
  - backend: `lib/domain/due.ts` `computeDue` (pure, `today` + lead days as arguments)
- [x] **2. Home and Due list** — BR-REC-16, 17, 97, 101, 102, 104 (C3, C5, C11, C12; cases 10, 11, 16)
  - backend: E31 (3 queries + `computeDue`, sort, page in memory; archived/Ended left out)
  - admin: Home Overdue + Due soon sections (count, 5 rows, See all, empty line), S3 `/admin/due` (tabs, filter chips, 25/page,
    Show more), row tap → S10, row "⋯" sheet
- [x] **3. Assess soon / Remind me later** — BR-REC-18, 98, 99, 100 (C4, C6–C9; cases 12, 13, 15)
  - backend: E33 (upsert, `SNOOZE_TOO_FAR`, change log), E34 (delete, change log), override ending worked out on read
  - admin: row sheet actions (1 week, 2 weeks, 1 month, Pick a date), optimistic update + undo toast
- [x] **4. Member page block** — BR-REC-103, 100 (C10)
  - backend: E32
  - admin: `DueBlock` lines with status, Record / Assess soon / Remind me later / remove per line

## Baseline (2026-10-04, before any change)
All green: backend typecheck, lint, `bun test` 1855 pass, `contract:check` (41 routes); `check-fixtures.sh`; frontend typecheck,
lint, `bun test` 1407 pass.

## Notes
- Own DBs `gym_due` (dev) and `gym_due_test` (`backend/.env` from `.env.example`; API `PORT=4005`, `APP_ORIGIN` 3005; frontend
  `API_URL` → 4005). Same schema as `main`; never `db:push` another session's database.
- Parallel sessions: assessments (D) in `member-record-assessment-696977` (DBs `gym_assess*`), progress (F) maybe later. E reads
  `assessments`/`measurements` rows directly; tests insert them with Drizzle (D's E25–E30 are not needed). S10
  `/admin/members/[memberId]/assess?type=` is D's route: a 404 until D merges is accepted.
- Override ending (C6) is derived when reading, so D's save code needs no change.

## Status
Planning done; contract next.
