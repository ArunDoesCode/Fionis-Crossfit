---
module: member-records/assessments
spec: docs/specs/member-records/assessments.md
last_verified_commit: 9d78023
last_verified_on: 2026-10-04
depends_on: [member-records/setup, member-records/members]
---

# Member records · assessments (Stream D) — as-built sub-map

> Index and cross-stream traps: [member-records.md](../member-records.md). Rules BR-REC-12, 19–21, 73–92; clarifications `assess-D1…D21` (assessments.md → Build clarifications); decisions D-024.

## Summary and API
Recording and editing a member's assessment results: entry form with previous values, change lines and "please check" warnings, drafts, history list
and detail sheet, member-page Recent block. Screens S10 Record assessment (+ choose and check-values sheets), S11 All assessments (+ detail sheet).
E29 (move date) is API only, its screen is #32. Also made the shared field fixes `NumberField` `allowNegative` (#21) and `DurationField` `status` (#19).
Endpoints: E25 entry form · E26 save (create or edit by member + type + date) · E27 list · E28 detail · E29 move date (no screen) · E30 delete.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| backend | `backend/src/{routes/assessments,controller/assessmentsController,service/assessmentsService,service/assessmentsRules,repository/assessmentsRepository}.ts`, `types/assessments.types.ts` | `assessmentsService.{entryForm,save,list,get,update,remove}(…, now)`; pure `hasForeignMetric`, `valueIssues`, `roundEntries`, `planSave`, `leavesNoValues`, `listedMetrics`, `assessmentSnapshot`; repository `readTimezone`, `lockMember`, `findStored`, `previousValues`, `memberIdOf` |
| admin lib | `frontend/src/lib/assessments/**`, `lib/{numberText,durationStatus}.ts` | pure `parseNumberText`, `checkPlausibility`, `describeChange`, `buildSaveValues`, draft store (`draftKey`, `saveDraft`, `loadDraft`, `dropExpiredDrafts`), `entryReducer`/`isChanged` (`entryState.ts`); hooks `useSaveFlow`, `useLeaveGuard`, `useEntryLoader`, `useDraftAutosave`, `useDeferredDate`; words `ASSESSMENT_TEXT` |
| admin api | `frontend/src/lib/api/assessments/{fetchers,queries,listQueries}.ts` | `assessmentKeys` `['assessments']`, `entryFormQueryOptions` (`staleTime: 0`), `invalidateAssessmentData`, `useEntryForm`, `useSaveAssessment`; S11: `useAssessmentList`, `useRecentAssessments`, `useAssessment`, `useDeleteAssessment`, `useUpdateAssessment` (unused until #32) |
| admin ui | `frontend/src/components/{views,pages}/assessments/**`, routes `app/(app)/admin/members/[memberId]/{assess,assessments}/**` | `EntryScreen`, `ChooseAssessmentSheet`, `CheckValuesSheet`, `AssessmentSheet`, `LeaveDialog` |
| slot | `frontend/src/components/pages/member/MemberBlocks.tsx (RecentBlock)` | latest 3 assessments (E27 `pageSize=3`), takes `{ memberId }` |

## Gotchas
- E26/E29 lock the member row first (assess-D6, index → Lock order); E29 and E30 get the member id with `memberIdOf` before locking. The repository's own `readTimezone` is needed only for `DATE_IN_FUTURE` (E26/E29).
- `NO_VALUES` is `leavesNoValues(plan)` after `planSave`: it looks at the stored state after the save, not at the body (assess-D2). `save` writes only the entries sent: an untouched stored value is never re-rounded (setup-C9); do not widen `writes` to every stored value.
- Every save and edit must touch `assessments.updated_at` (`updateAssessment`, Drizzle `$onUpdate`): Assess soon / Remind me later end on it (due-C6, [#24](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/24)).
- The service lower-cases every measurement id of a body; change-log rows hold full snapshots `{ date, isEstimated, values }` (not a diff) and a repeat save still writes a row (assess-D7). `ASSESSMENT_DATE_TAKEN` and `METRIC_NOT_IN_TYPE` carry no `details`; `DATE_IN_FUTURE` has `details.field = "date"`. API says `date`; columns are `assessed_on` / `measured_on`. The Number-limit text exists twice (`NUMBER_MESSAGE` in `assessmentsRules.ts`, `VALUE_MESSAGE` in `types/assessments.types.ts`): change both. E25 of an off assessment lists only measurements holding a value in `existing` (assess-D4). E27 `valueCount` is a correlated sub-select (cheap for the Recent block's 3 rows).
- Admin: the form is a pure reducer (`entryState.ts`), not RHF + Zod (D-024): a Number is text until Save and `buildSaveValues` validates. An edit sends only changed fields (`unchanged` flag): never "send everything"; stored Numbers show every stored digit (`storedNumberText`); Save with nothing changed sends no request (all in `useSaveFlow.finish`).
- `queries.ts` must not import `members/queries` or `listQueries` (bundle: `/assess`); `MEMBERS_ROOT` duplicates `memberKeys.all()`. Its quiet `useMemberDue` reads E32 under the due stream's key `['due','member',id]` (same data, own types; no retry, no toast: a failure just drops the status words, assess-D11).
- History: `ResponsiveSheet` keeps an extra entry (`useBackToClose`): choosing in the chooser or leaving after Save waits for it (`afterHistorySettles`); the leave question is an `AlertDialog` (no history entry) and the guard keeps one sentinel entry while dirty. `canGoBackInApp()` uses the Navigation API, else `history.length` (Safari). Draft clearing and exit live only in `finish`: a new success path must call it.
- `placeholderData` keep-previous must compare key positions exactly; cached entry-form data must not count as loaded (`!isFetching && !isPlaceholderData`); E27 answers an empty list for an unknown member (only E18 says "not found"); E28 values carry no `decimals` (take them from the E09 catalog). A stored value with more digits than the current decimals still shows the inline "Please check" line, computed on the rounded text (display only).
- `/assess` page JS: 35–37 KB gzip without and 49–51 KB with the two shared base-ui chunks (BR-REC-146 says 40 KB per screen: G decides the method).

## Tests and open issues
`backend/tests/assessments/` (+ `support/suite.ts`), `frontend/tests/assessments/`, `frontend/tests/lib/{numberText,durationStatus}.test.ts`.
Manual: `.pipeline/member-records-assessments/checklist.md` (S10, S11, Recent block; keypad, history/Back, drafts, leave guard on a phone).
Open issues: [#32](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/32) screen for E29 (BR-REC-87 sentence not shown) · [#24](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/24) `updated_at` on every save (due-C6) · [#19](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/19) / [#21](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/21) setup callers still to adopt the shared field fixes.

## History
2026-10-04 · #35 (`ff98ca5`) · Stream D built: E25–E30, S10, S11, Recent block, shared field fixes (#19, #21); assessments.md v2 (D1–D21); D-024.
