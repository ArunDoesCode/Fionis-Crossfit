# member-records/progress · contract (E35–E39)

Spec: `docs/specs/member-records/progress.md` v2 (rules + build clarifications P1–P14). Endpoint table: `api-contract.md`.
Schemas: `backend/src/types/progress.types.ts` → `.contracts/openapi.json` → `frontend/src/types/api.generated.ts`.
All five need a sign-in (401 `UNAUTHORIZED` without), are GET, write nothing and write no change-log row.

## Endpoints
| ID | Path | Query / params | 200 `data` | Errors |
|---|---|---|---|---|
| E35 | GET `/api/members/:memberId/report-card` | — | `reportCardSchema` | 400 bad id, 404 unknown member (archived → 200) |
| E36 | GET `/api/reports/progress` | `metricId` (required), `joinedFrom`, `joinedTo` (YYYY-MM), `plan`, `sex`, `ageBand` | `progressStatsSchema` | 400, 404 unknown measurement |
| E37 | GET `/api/reports/leaderboard` | `metricId`, `sex` (required), `page`, `pageSize` (default 10, max 100) | list of `leaderboardItemSchema` + `meta` | 400, 404 unknown measurement, then 400 `NO_DIRECTION` |
| E38 | GET `/api/reports/active-by-plan` | — | `activeByPlanSchema` | — |
| E39 | GET `/api/exports/:file` | `file` ∈ `members.csv`, `memberships.csv`, `measurements.csv` | CSV text (not JSON) | 404 `NOT_FOUND` for any other `file` |

## Behaviour a test can rely on
"Today" = the gym's day: `gymToday(now, gym_settings.timezone)`; a missing settings row uses the schema defaults (gym name, Asia/Kolkata, lead days 14).
A **reading** = one `measurements` row with its assessment's `assessed_on` (= `measured_on`) and `is_estimated`. Values are numbers (seconds for times).

**E35 report card** (BR-REC-22, 106–108, P2, P3)
- `gymName` from settings; `printedOn` = today; `member.age` = `ageOn(dateOfBirth, today)`; `plan` and `membershipStatus` from the latest
  membership period (latest `startOn`) via `membershipStatus` with `expiryLeadDays` (a period not started yet → `active`).
- `types`: every assessment (on or off) with ≥ 1 reading for this member, in setup order (`sort_order`); inside, every measurement (on or off) with
  ≥ 1 reading, in setup order. Never-recorded ones are left out; an assessment without any reading is left out.
- Per measurement: `first` (earliest date), `latest` (most recent), `best` (BR-REC-107: highest for `higher`, lowest for `lower`, tie → earliest
  date; `null` for `none`), `change` = latest − first rounded to 3 decimals (`null` when `readings` < 2), `readings` = count, `points` = the last
  12 readings oldest first. Each reading is `{ value, on, isEstimated }`.
- `segmental`: the latest assessment (by date, then setup order) of this member having ≥ 1 value of a measurement with a report-table group;
  `groups` = the distinct groups of that assessment type's measurements that are on or have a value in that assessment, in measurement setup
  order, each `{ name, unit, decimals }` taken from its first measurement; `rows` = `whole_body`, `arms`, `trunk`, `legs` (always all four, this
  order), `values[groupName]` = that assessment's value for (group, part) or `null`; `on` / `isEstimated` of that assessment. `null` when none.

**E36 gym progress** (BR-REC-23, 110–114, P1, P4, P5)
- Population: members with `archived_at` null matching every given filter: `joinedFrom` ≤ month(joined_on) ≤ `joinedTo` (each optional,
  inclusive; from after to → nobody), plan of the latest period, `sex`, `ageBand(dateOfBirth, today)`.
- Per member: count, first and latest reading of `metricId`. `n` = members with count ≥ 2; `notCounted` = count = 1; count 0 ignored.
- `avgChange` = mean(latest − first) over the n members, rounded to 3 decimals; `null` when n = 0.
- `changeOutcome(first, latest, better)` per member (P5); `better = none` → `improved = noChange = worse = 0`.
- `metric` = `{ id, name, unit, datatype, decimals, better }`. A turned-off measurement still answers. Computed live on every call (no cache):
  a value inserted just before the call is counted.

**E37 leaderboard** (BR-REC-115, P6) — 404 unknown `metricId`, then 400 `NO_DIRECTION` when its `better` is `none`.
Entries: non-archived members of `sex` with ≥ 1 reading; `value` / `on` = their latest reading. Order best first (`higher` desc, `lower` asc);
equal values → earlier `on`, then `fullName` (case-insensitive), then `memberId`. `rank` = 1 + number of entries with a strictly better value
(1, 2, 2, 4), global across pages. `meta.total` = number of ranked members.

**E38 active by plan** (BR-REC-116, P7) — non-archived members whose latest period's `membershipStatus` is `active` or `expiring`, counted
by that period's plan (`half_annual` → `halfAnnual`); `total` = the sum.

**E39 CSV** (BR-REC-24, 117–119, P8–P10)
- Headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<stem>-<today>.csv"` (e.g.
  `measurements-2026-10-03.csv`), `Cache-Control: private, no-store`. Never gzip-compressed by the API. Sent before the rows are read; rows
  are read in batches and streamed.
- Body: BOM `﻿`, the header row, then one line per row; every line (header and last row included) ends `\r\n`.
- Columns and order: P8 in the spec (`CSV_HEADERS` below). Archived members are included (`archived` = `yes`). Every stored value of every
  measurement (on or off) is exported. Row order: `lower(full_name)`, member id, then `start_on` (memberships) or date, assessment setup
  order, measurement setup order (measurements).
- Cell encoding: `csvCell` below.

## Pure functions (backend; no I/O, no clock — test them directly)
`backend/src/lib/domain/report.ts`
```ts
type Better = "higher" | "lower" | "none";
interface ReadingIn { value: number; on: string; isEstimated: boolean }          // `on` = YYYY-MM-DD; any order in, never two on one date
bestReading(readings: ReadingIn[], better: Better): ReadingIn | null             // BR-REC-107
summariseReadings(readings: ReadingIn[], better: Better):                       // ≥ 1 reading (empty → throws RangeError)
  { first; latest; best: ReadingIn | null; change: number | null; readings: number; points: ReadingIn[] }   // P2
reportCard(input: ReportCardInput): ReportCard                                  // E35 `data` exactly (ReportCard from progress.types.ts)
interface ReportCardInput {
  gymName: string; today: string;
  member: { fullName: string; dateOfBirth: string; sex: "male" | "female"; joinedOn: string };
  membership: { plan: Plan; status: "active" | "expiring" | "expired" };        // already worked out from the latest period
  types: { id: string; name: string; sortOrder: number;                         // the whole catalog, on and off, any order
           metrics: { id: string; name: string; unit: string; datatype: "number" | "duration"; decimals: 0 | 1 | 2; better: Better;
                      sortOrder: number; isActive: boolean; tableGroup: string | null; tablePart: TablePart | null }[] }[];
  values: { assessmentId: string; typeId: string; metricId: string; on: string; isEstimated: boolean; value: number }[];  // all of this member's values
}
changeOutcome(first: number, latest: number, better: Better): "improved" | "noChange" | "worse" | null   // P5; null for "none"
progressStats(better: Better, members: { count: number; first: number; latest: number }[]):
  { n; notCounted; avgChange: number | null; improved; noChange; worse }        // P4/P5; entries with count 0 are ignored
ageBand(dateOfBirth: string, today: string): AgeBand                            // BR-REC-114: under20 | 20to29 | … | 60plus
rankLeaderboard<T extends { memberId: string; fullName: string; value: number; on: string }>(
  entries: T[], better: "higher" | "lower"): (T & { rank: number })[]           // P6 order and ranks
countActiveByPlan(members: { plan: Plan; status: "active" | "expiring" | "expired" }[]): ActiveByPlan   // P7
```
`backend/src/service/progressCsv.ts`
```ts
CSV_BOM = "﻿"
CSV_HEADERS: Record<ExportFile, readonly string[]>   // P8 column names, in order
csvCell(value: string | number | boolean | null): string
  // null → ""; boolean → "yes" / "no"; number → plain decimal (String(n), e.g. 94.5, 122, -1.5);
  // then the guard (P9): text starting with = + - @ or a tab gets a leading '  ("-1.5" → "'-1.5", "+9198…" → "'+9198…");
  // then quoting: text with a comma, ", CR or LF → wrapped in "…" with inner " doubled ("a,b" → "\"a,b\"").
csvLine(cells: (string | number | boolean | null)[]): string   // cells through csvCell, joined by ",", plus "\r\n"
displayValue(value: number, datatype: "number" | "duration", decimals: 0 | 1 | 2): string   // 122 duration → "2:02"; 3930 duration → "1:05:30" (P13, formatDuration); 94 @1 → "94.0"
exportFileName(file: ExportFile, today: string): string        // ("measurements.csv", "2026-10-03") → "measurements-2026-10-03.csv"
```

## Admin app (frontend; BR-REC-22…24, 106…119, UX BR-REC-120…140)
- **Routes:** S12 `/admin/members/[memberId]/report`, S13 `/admin/reports`, S18 `/admin/settings/export`. Each page is a thin server file →
  `components/views/progress/*View` → `components/pages/progress/*`. Existing `loading.tsx` / `error.tsx` stay (adjust only to match the layout).
- **Freshness (BR-REC-110):** every progress query has `staleTime: 0` (refetch on every open).
- **S12:** header block (member · age · sex · plan (status) · joined; gym name + printed date in the print/desktop layout); one section per
  assessment; phone: one card per measurement (latest value + date, "first … · best …", change line, `Sparkline` of `points`; under 2 readings:
  the value only + "(1 reading)"); desktop ≥ 1024 px and print: a table First · Latest · Best · Change · Trend; segmental table with its date
  (≈ when estimated), "–" for empty cells, rows = body parts (P3). Main action "Print" → `window.print()`. Print: A4 portrait, the shell (tabs,
  side nav, header buttons, offline banner) hidden **without editing shell files** (CSS scoped to the progress view, e.g. `@media print`
  visibility rules), black on white, up to 30 measurements on one page (BR-REC-109). Numbers in the mono font (BR-REC-123). 404 → `EmptyState`.
- **S13:** measurement picker (measurements that are on, grouped by assessment), filters Joined from–to (month), plan, sex, age band, all in the
  URL (P11); default measurement per P11 (replace the URL with `metric=` once picked so it can be bookmarked). Results: average change
  (`signedValueText`), `notCountedText`, Improved / No change / Worse counts + a bar from `outcomeShares` (for "No direction": the average only).
  Leaderboard with Male / Female tabs (default Male), top 10, "Show more" loads the next page (infinite query); hidden with a short line for
  "No direction". Active members by plan + total. Desktop: filters in one row, results and leaderboard side by side, 1080 px max.
  At most 4 API calls, started together when `metric` is in the URL (E09 catalog, E36, E37, E38).
- **S18:** three rows Members / Memberships / Measurements, each a "Download CSV" button and the line "Opens in Excel or Google Sheets".
  Tap → `downloadExport(file)`: one E05 call through `api` (refreshes the sign-in when needed), then a plain browser download of the E39 URL
  (hidden `<a href download>` click; no fetch of the body). Errors → toast via `messageForCode`.

## Admin app interfaces (coordinator — frontend tests and frontend-dev both use these names; pure modules, no DOM)
`metric` below = `{ datatype: 'number' | 'duration'; decimals: 0 | 1 | 2; unit: string; better: 'higher' | 'lower' | 'none' }`.
| Module (`frontend/src/…`) | Export | Behaviour |
|---|---|---|
| `lib/progress/filters.ts` | `type ProgressFilters = { metricId?: string; joinedFrom?: string; joinedTo?: string; plan?: Plan; sex?: Sex; ageBand?: AgeBand }` | |
| | `parseProgressFilters(params: Record<string, string \| string[] \| undefined>): ProgressFilters` | URL keys `metric`, `joinedFrom`, `joinedTo`, `plan`, `sex`, `age` (P11). Keeps a value only when valid: `metric` a UUID, months `YYYY-MM` with month 01–12, plan / sex / age band one of their codes; first entry of an array; anything else dropped. When both months are set and from > to they are swapped. |
| | `progressFiltersSearch(filters: ProgressFilters): string` | `""` when empty, else `"?"` + keys in the order metric, joinedFrom, joinedTo, plan, sex, age (URL keys, encoded); round-trips with `parseProgressFilters` |
| | `toProgressQuery(metricId: string, filters: ProgressFilters)` | E36 query object `{ metricId, joinedFrom?, joinedTo?, plan?, sex?, ageBand? }` with only the set keys |
| | `pickDefaultMetricId(catalog)` | `catalog` = E09 items (types with `metrics[]`, as returned, already in setup order). Among measurements with `isActive` whose assessment `isActive`: the first whose name starts with "body fat" (case-insensitive, after trimming), else the first; `null` when none |
| `lib/progress/text.ts` | `PROGRESS_TEXT` | the screens' own plain words (titles, "Improved", "No change", "Worse", "Show more", "Opens in Excel or Google Sheets", "Download CSV", …) |
| | `AGE_BAND_LABELS: Record<AgeBand, string>` | `under20` "Under 20", `20to29` "20–29", `30to39` "30–39", `40to49` "40–49", `50to59` "50–59", `60plus` "60+" (en dash) |
| | `valueText(value, metric)` | number → `formatValue(value, decimals, unit)` ("94.0 kg"); duration → `formatDuration(Math.round(value))` ("4:10", unit never appended) |
| | `signedValueText(value, metric)` | "+" or "−" (U+2212) + `valueText(abs)`; a value that shows as zero at the metric's precision → `valueText(0)` with no sign |
| | `changeText(change: number \| null, metric)` | `null` → `null`; shows as zero → "No change"; `better: 'none'` → `signedValueText(change)` ("+0.5 cm"); else "↑"/"↓" by sign + " " + `valueText(abs)` + " better" / " worse" by direction ("↓ 4.0 kg better", "↓ 1:10 better", "↑ 2 better" for higher, "↑ 1.2 % worse" for lower) |
| | `readingDateText(on: string, isEstimated: boolean, today: string)` | estimated → "≈ Dec 2025" (month short name + year); else `formatDay(on, today)` |
| | `outcomeShares(counts: { improved: number; noChange: number; worse: number })` | whole percents with the same keys summing to 100 (largest remainder; ties → improved, noChange, worse order); all 0 when the total is 0 |
| | `notCountedText(n: number, notCounted: number)` | "n = 12 · 5 with one reading not counted"; `notCounted` 0 → "n = 12" |
| `lib/api/progress/queries.ts` | `progressKeys` (`all`, `reportCard(memberId)`, `stats(query)`, `leaderboard(metricId, sex)`, `activeByPlan()`) · `reportCardQueryOptions(memberId)` · `progressStatsQueryOptions(query)` · `activeByPlanQueryOptions()` · `leaderboardInfiniteQueryOptions(metricId, sex)` | every option `staleTime: 0`; leaderboard pages of 10 |
| `lib/api/progress/fetchers.ts` | one function per endpoint E35–E38 using `api` + `API_ROUTES` + `apiPath` · `exportHref(file: ExportFile): string` · `downloadExport(file: ExportFile): Promise<void>` | `exportHref('members.csv')` = `NEXT_PUBLIC_API_URL` + `/exports/members.csv` (e.g. `/api/exports/members.csv`); no hard-coded paths |

## Schemas (backend-dev)
All in `backend/src/types/progress.types.ts` (generated client types: `frontend/src/types/api.generated.ts`, `getApiMembersMemberIdReport-card` and siblings).
- E35 `reportCardSchema` (`ReportCard`) · parts `readingSchema`, `reportMetricSchema`, `segmentalGroupSchema`, `segmentalSchema` · E36 `progressQuerySchema`,
  `progressStatsSchema` · E37 `leaderboardQuerySchema`, `leaderboardItemSchema` (+ `paginatedResponse` meta) · E38 `activeByPlanSchema` · E39 `exportParamsSchema`
  (`file` plain string → 404), `exportCsvSchema`; consts `AGE_BANDS`, `EXPORT_FILES`.
- E35 `data` exact shape (`id`s are UUIDs; dates `YYYY-MM-DD`; `decimals` is an int 0–2, typed `number` in the generated TS):
```
{ gymName, printedOn,
  member: { fullName, age, sex, plan, membershipStatus, joinedOn },
  types: [ { id, name,                                              // assessment type; only those with ≥ 1 reading
      metrics: [ { id, name, unit, datatype, decimals, better,
                   first: Reading, latest: Reading, best: Reading | null,
                   change: number | null, readings: int ≥ 1, points: Reading[] ≤ 12 } ] } ],
  segmental: { on, isEstimated,
               groups: [ { name, unit, decimals } ],                // setup order
               rows: [ { part: "whole_body"|"arms"|"trunk"|"legs", values: { [groupName]: number | null } } ] } | null }
Reading = { value: number, on, isEstimated: boolean }
```
- E36 `metric` block is unchanged: `{ id, name, unit, datatype, decimals: int, better }`. Descriptor notes now say E36–E38 are computed live (no cache), E37 errors 404 → 400 `NO_DIRECTION`, E39 headers as above.
