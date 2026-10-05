---
module: member-records/due-list
spec: docs/specs/member-records/due-list.md
last_verified_commit: 9d78023
last_verified_on: 2026-10-04
depends_on: [member-records/setup, member-records/members, member-records/assessments]
---

# Member records · due-list (Stream E) — as-built sub-map

> Index and cross-stream traps: [member-records.md](../member-records.md). Rules BR-REC-15–18, 93–105; clarifications `due-C1…C13` (due-list.md → Build clarifications); decisions D-023.

## Summary and API
Due-date engine and the lists built on it: Home "Overdue" / "Due soon" sections (5 rows each, "See all"), S3 `/admin/due` (two tabs, assessment chips, 25 per page),
the row sheet (Record assessment, Assess soon, Remind me later, Open member) and the member-page "Assessments" block. Overrides live in `due_overrides`.
Endpoints: E31 due list (query `status` = `overdue` | `upcoming`; the S3 URL tab for `upcoming` is `soon`) · E32 one member's due lines · E33 set Assess soon / Remind me later · E34 clear it.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| backend | `backend/src/{routes/due,controller/dueController,service/dueService,repository/dueRepository}.ts`, `types/due.types.ts` | `dueService.{list,memberItems,setAction,clearAction}`; `dueRepository.{listMembers,listCatalog,listLastMeasured,listOverrides,findOverride,upsertOverride,deleteOverride}` |
| domain | `backend/src/lib/domain/due.ts` (pure; `today` and the lead days are arguments) | `computeDue`, `dueListRows` (sorted, not paged), `memberDueItems`, `isListedInDueList` (due-C3) |
| admin lib | `frontend/src/lib/due/{status,remind,links,searchParams,optimistic,target,text,types,useDueSheet}.ts`, `lib/api/due/{fetchers,queries}.ts` | pure `dueRowStatus`, `memberDueStatus`, `remindChoices`, `remindDateIssue`, `recordHref`, `dueListHref`, `sortDueRows`, `applyDueChange`; `dueKeys` (`['due']`), `useDuePreview` (5 rows), `useDueList` (25/page, infinite), `useMemberDue`, `useSetDueAction`, `useClearDueAction` (mutation key `['due-write']`) |
| admin ui | `frontend/src/components/pages/due/*`, `components/views/due/DueListView.tsx`, `app/(app)/admin/due/page.tsx` | `lazySheets.ts (DueSheet)` (one `import()`), `DueSection` (Home), `DueList`/`DueListPanel` (S3), `MemberDueRow` |
| slots | Home `components/views/home/HomeView.tsx`; Member `components/pages/member/MemberBlocks.tsx (DueBlock)` | `DueBlock` takes `{ memberId }` |

## Gotchas
- An override ends when read, not when written: the `due_overrides` row stays; ended = a save of that member + type with `assessments.updated_at >= override.created_at` AND `assessed_on >= set_on` (due-C6; `listOverrides` = LEFT JOIN + `max(assessed_on)` grouped by the key). Assessments must touch `assessments.updated_at` on every save and edit ([#24](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/24)); `created_at` is the API clock, `updated_at` is DB `now()`: the comparison assumes close clocks ([#25](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/25)).
- E31 loads every member (archived too) and `isListedInDueList` is the only place that leaves them out (due-C3); paging is in memory over the sorted list (1,000 members: p95 ≈ 157 ms vs the 300 ms budget).
- Tests have no clock: dates come from `gymToday(new Date(), tz)`, so a run straddling midnight in the gym zone can flake once. `backend/tests/due/support.ts` refuses a test DB holding active members it did not create (every new assessment is due for every active member): run `bun run db:test:prepare`.
- Admin write hooks cancel + snapshot all due queries, apply the change to every cached list (infinite lists are flattened, changed and re-cut to the old page sizes), roll back with `messageForCode` (a failure with no code toasts "Couldn't save this. Try again."; a 401 gets none) and invalidate `dueKeys.all` only when no other due write is still running. `meta.total` is not touched (Home count stale for one round trip, #25).
- A tab switch unmounts the other tab (Base UI `Tabs.Panel`); only a chip change keeps old rows (`keepPreviousData`).
- The row sheet is one `ResponsiveSheet` with a second step for "Remind me later" (index → Sheets and Back); "Record assessment" / "Open member" are `<Link replace>` so Back does not land on a ghost entry; `links.ts` returns `as const` template literals so typed routes pass without casts.
- Admin "today" is the device zone (D-021 7): the server answers 400 `VALIDATION_ERROR` / `SNOOZE_TOO_FAR` for an edge day and the change is undone (due-C8).

## Tests and open issues
`backend/tests/due/` (`support.ts`; domain, E31–E34, override ending, gates), `frontend/tests/due/`.
Manual: `.pipeline/member-records-due-list/checklist.md` (S3, Home sections, row sheet, member block).
Open issues: [#24](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/24) every assessment save must touch `assessments.updated_at` · [#25](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/25) polish: clock source, infinite-list refetch, Home count after an optimistic change.

## History
2026-10-04 · #33 (`863a5ab`) · Stream E built: E31–E34, `computeDue`, Home due sections, S3, row sheet, member block; due-list.md v2 (C1–C13); D-023.
