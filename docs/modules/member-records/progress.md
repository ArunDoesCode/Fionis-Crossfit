---
module: member-records/progress
spec: docs/specs/member-records/progress.md
last_verified_commit: 9d78023
last_verified_on: 2026-10-04
depends_on: [member-records/setup, member-records/members, member-records/assessments]
---

# Member records · progress (Stream F) — as-built sub-map

> Index and cross-stream traps: [member-records.md](../member-records.md). Rules BR-REC-22–24, 106–119; clarifications `progress-P1…P14` (progress.md → Build clarifications); decisions D-022.

## Summary and API
Reports: member report card (S12, printable), gym progress and leaderboards (S13, reached from Reports), active-by-plan counts, CSV export (S18).
No server cache (BR-REC-110 v2, progress-P1): every call reads the database. Pure maths in `lib/domain/report.ts`; the CSV is streamed.
Endpoints: E35 report card · E36 gym progress for one measurement · E37 leaderboard · E38 active members by plan · E39 CSV export (`members.csv`, `memberships.csv`, `measurements.csv`).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| backend | `backend/src/{routes/progress,controller/progressController,service/progressService,service/progressCsv,repository/progressRepository}.ts`, `types/progress.types.ts` | `progressService.{reportCard,progress,leaderboard,activeByPlan,openExport}(…, now)`; reads `latestPeriod`, `onLatestPeriod`, `nameKey` from `repository/membersSql.ts` |
| domain | `backend/src/lib/domain/report.ts` (pure) | `bestReading`, `summariseReadings`, `reportCard`, `changeOutcome`, `progressStats`, `ageBand`, `ageBandBirthRange`, `rankLeaderboard`, `countActiveByPlan` |
| csv | `backend/src/service/progressCsv.ts` | `csvCell`, `csvLine`, `displayValue`, `exportFileName`, `csvPreamble`, `memberCsvLine` / `membershipCsvLine` / `measurementCsvLine` |
| admin | `frontend/src/{lib/progress/{filters,text}.ts,lib/api/progress/{fetchers,queries}.ts,components/{views,pages}/progress/**}`, routes `app/(app)/admin/{members/[memberId]/report,reports,settings/export}` | `parseProgressFilters`, `progressFiltersSearch`, `toProgressQuery`, `pickDefaultMetricId`, `valueText`/`changeText`; `progressKeys`, `useReportCard`, `useProgressStats`, `useLeaderboard`, `useActiveByPlan`, `useDownloadExport`; `ReportCardView`, `GymProgressView`, `ExportView`, ``PRINT_CSS` in ReportCardView`, `MonthField` |

## Gotchas
- Reading date: E35/E39 use `assessments.assessed_on`, E36/E37 the denormalised `measurements.measured_on` (indexed). E36–E38 leave archived members out; E35 and E39 include them. A member with no period → E35 500, as E18 (members always have one).
- E36 = one grouped query (count, first and latest via ordered `array_agg(...)[1]`) joined to `members` and `latestPeriod`; the age-band filter is birth-date bounds (`ageBandBirthRange`, checked against `ageBand` on 1M cases incl. 29 Feb). E37 = `distinct on (member_id)` latest reading, ranked over the whole list and then paged (ranks continue across pages). E38 status comes from the pure `membershipStatus` (no SQL twin).
- `change`/`avgChange` are whole thousandths, half away from zero, never `-0`; `changeOutcome` compares |change|×100 < |first| in thousandths, so exactly 1% counts as a change (float 0.03 would mis-round; progress-P5). `displayValue` rounds through `roundMetricValue` first (1.005 @2 → 1.01); times use `formatDuration` (progress-P13). CSV order uses `collate "C"` like E16.
- E39: headers + BOM + header row leave before any row is read; rows come in keyset pages of members ordered by `(lower(full_name) collate "C", id)` (measurements 10 members per batch via `measurements_member_metric_date_idx`, memberships 500, members 2,000) into a pull-based `ReadableStream` (backpressure; a client hang-up cancels the reads). Not a DB cursor (may not survive the Supabase transaction pooler), not gzipped. A failure after the headers cuts the download and is logged ([#27](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/27)); no shared snapshot ([#30](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/30)). Perf seed: the whole 37.8 MB file in 8–11 s.
- CSV guard (progress-P9, owner decision O-1): `csvCell` guards TEXT only (leading `= + - @` or tab → `'`); a number is never prefixed; a text that is exactly `/^-\d+(\.\d+)?$/` (the `display` "-0.5") is written as is. It keys on `typeof value === "string"`: a numeric string passed by a caller gets the text rules. A leading CR is not guarded (#30).
- S12 print = inline `<style>` in ``PRINT_CSS` in ReportCardView` (React 19 escapes only `</style`, so attribute selectors survive SSR); it overrides the theme variables in `@media print`, hides the shell by its `data-slot` marks and forces `color-scheme: light !important`. Paper is ~700 px wide so `lg:` never applies: use `print:` variants (`hidden lg:table print:table`). Column widths are `print:w-[…]` on the six `<col>`s of `MeasurementTable` (28/15/15/14.5/17/10.5 %): narrower name columns wrap long names and a 29-measurement card spills onto a 2nd A4 page (BR-REC-109). The segmental table is its own section (E35 has no type id).
- S13 reads filters with `useSearchParams` and writes with `window.history.replaceState` (no page request); the default measurement goes into the URL once the catalog is known (catalog read `useAssessmentTypes(true)`, shared key with setup). With no `metric`, E36/E37 wait for E09 ([#28](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/28)); a "No direction" measurement answers E37 400 `NO_DIRECTION`, shown as a short line.
- `<input type="month">` is missing in desktop Firefox/Safari: `MonthField` falls back to text. Base UI `SelectValue` needs function children to show labels. Generated `decimals` is `number`: `text.ts` clamps to 0|1|2.
- S18 download = one E05 call through `api` (refreshes the sign-in), then a hidden `<a href download>` click on the E39 URL (the browser streams it; nothing is held in JS).

## Tests and open issues
`backend/tests/progress/` (`domain/`, `support/suite.ts`), `frontend/tests/progress/`.
Manual: `.pipeline/member-records-progress/checklist.md` (S12 print check on Chrome Android + desktop, S13, S18 on a phone).
Open issues: [#26](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/26) month `0000-05` gives 500 · [#27](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/27) export log carries a member name; stream wrapper in the controller · [#28](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/28) Reports waits for the catalog · [#29](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/29) leaderboard rows open the member (idea) · [#30](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/30) CSV leading CR, snapshot read · [#31](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/31) BR-REC-119 30,000-row test times out under load.

## History
2026-10-04 · #34 (`9d78023`) · Stream F built: E35–E39, S12, S13, S18, pure `report.ts`, streamed CSV, no server cache; progress.md v2 (P1–P14, owner decision O-1); D-022.
Measured on the 1,000-member perf seed (336,640 values) in the Stream F build: E35 ≈ 50 ms, E36 80–140 ms, E37 ≈ 110 ms, E38 ≈ 60 ms (budget BR-REC-147; re-measure with `bench` in Stream G).
