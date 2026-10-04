# member-records/due-list · contract (E31–E34)

Spec: `docs/specs/member-records/due-list.md` v2 (incl. build clarifications C1–C13) + `api-contract.md` v1 (BR-REC-153…159).
Descriptors: `backend/src/routes/due.ts`; schemas: `backend/src/types/due.types.ts`; pure engine: `backend/src/lib/domain/due.ts` (below);
data model: `data-model.md` (`due_overrides`, `assessments`, `measurements`). Generated: `backend/.contracts/*`,
`frontend/src/types/api.generated.ts` (done). Handlers are still 501 `NOT_IMPLEMENTED`; this contract is what they must do.

## All four endpoints
- Base `/api`. Success `{ success: true, data }` (E31 adds `meta { page, pageSize, total, totalPages }`). Status 200 for all four (E33 is an upsert, not 201).
  Error `{ success: false, message, code, details? }`.
- All are `any-authenticated` (cookie `access_token` or `Authorization: Bearer`; the shared login, no permission keys, BR-REC-159). No `Idempotency-Key` on any
  of them (BR-REC-156 covers E17, E22 only); E33 and E34 are idempotent by nature (same call twice = same state).
- Check order: Origin (403 `CSRF_ORIGIN` on E33, E34; a missing or other `Origin` is refused) → auth (401 `UNAUTHORIZED`) → params / query / JSON body
  validation (400 `INVALID_JSON` or `VALIDATION_ERROR`, `details.issues[{ path, message }]`) → handler: 404, then the E33 `until` checks. So a bad body is 400
  even when the id in the path does not exist; tests trigger one error at a time.
- Ids (`memberId`, `typeId`) are any 8-4-4-4-12 hex uuid: malformed → 400, well-formed but unknown → 404 (E32–E34) or an empty list (E31 `typeId`).
- "Today" is the gym day: the settings time zone (`gym_settings.timezone`) at request time (BR-REC-93); "Due soon days" = `gym_settings.upcomingLeadDays`. Both are read per
  request; no `gym_settings` row → `Asia/Kolkata` and 7 (the Setup defaults). There is no clock override: tests build dates from `gymToday(new Date(), timezone)`.
- Naming: the E31 query value is `upcoming`; the S3 page URL tab is `soon` (`/admin/due?tab=overdue|soon`, C11).

## Endpoints
| ID | Method + path | Request | `data` | Errors (beyond 403 / 401 / 400 above) |
|---|---|---|---|---|
| E31 | GET `/due` | query `status` `overdue`\|`upcoming` (required), `typeId` uuid (optional), `page` ≥ 1 (1), `pageSize` 1–100 (10) | `DueListItem[]` + `meta` | — |
| E32 | GET `/members/:memberId/due` | — | `MemberDueItem[]` (plain array, no `meta`) | 404 `NOT_FOUND` |
| E33 | PUT `/members/:memberId/due-actions/:typeId` | body `{ action: "flag" }` or `{ action: "snooze", until: "YYYY-MM-DD" }` | `{ kind, setOn, untilOn }` | 404 · 400 `VALIDATION_ERROR` (`until` not after today) · 400 `SNOOZE_TOO_FAR` |
| E34 | DELETE `/members/:memberId/due-actions/:typeId` | — | `{}` | 404 `NOT_FOUND` |

## Request limits (exact)
| Field | Used by | Limit | Failure |
|---|---|---|---|
| `status` | E31 | required, `overdue` or `upcoming` | 400 `VALIDATION_ERROR`, issue path `status` (missing or any other text) |
| `typeId` | E31 | optional uuid; unknown or turned-off assessment → 200 with `data: []`, `meta.total: 0` | malformed → 400, path `typeId` |
| `page`, `pageSize` | E31 | integers, `page` ≥ 1 (default 1), `pageSize` 1–100 (default 10; Home sends 5, S3 sends 25). A page past the end → 200, `data: []`, `meta` unchanged | `pageSize=101` / `0` / `page=0` → 400 |
| unknown query keys | E31 | ignored (there is no `sortBy`, `sortDir` or search; the order is fixed) | — |
| `action` | E33 | `flag` or `snooze`; the body is strict: unknown keys are refused, so `{ action: "flag", until: … }` is 400 | 400 `VALIDATION_ERROR`, path `action` (or the unknown key) |
| `until` | E33 | required with `snooze`; a real `YYYY-MM-DD` day | missing / malformed / `2026-02-31` → 400 `VALIDATION_ERROR`, path `until` |
| `until` rule (C8) | E33 | after today, at most today + 90 days. Today 2026-10-03: `2026-10-03` and earlier → 400 `VALIDATION_ERROR` with `details.field = "until"`; `2026-10-04` and `2027-01-01` (+90) pass; `2027-01-02` (+91) → 400 `SNOOZE_TOO_FAR` | checked by the service after the 404 checks; `SNOOZE_TOO_FAR` carries no `details` a client may use |

The "1 week / 2 weeks / 1 month" choices of the screen are computed by the client: today + 7, today + 14, `addMonths(today, 1)` (3 Oct → 3 Nov, BR-REC-94); the API only ever sees a date.

## Response shapes
- `DueListItem` `{ memberId, fullName, typeId, typeName, dueOn, daysOverdue, flagged, items: [{ metricId, name }] }`. Dates `YYYY-MM-DD`; `daysOverdue` integer = calendar days from `dueOn` to today (BR-REC-105): 2 = due 2 days ago, 0 = due today, negative = due later.
- `MemberDueItem` `{ typeId, typeName, state: "overdue"|"upcoming"|"ok", neverRecorded, nextDueOn, daysOverdue, flagged, snoozedUntil: date|null, items: [{ metricId, name }] }`.
- E33 `{ kind: "flag"|"snooze", setOn, untilOn: date|null }`: `setOn` = today (gym day); `untilOn` = the sent `until`, null for a flag.
- Names are the real names (no `showOnBoard` masking: this is the admin app, not the TV).

## Behaviour a test can rely on
**One measurement, one due date (BR-REC-15, 94, 95; C1)** — checked through the pure engine (below) and, in a few cases, through E31.
- Due date of a measurement = the member's latest `measurements.measured_on` for it + its effective interval; the measurement's own pair when set, else its assessment's (BR-REC-14). Never recorded → the member's `joined_on` (no interval added).
- Only turned-on measurements of turned-on assessments count. An assessment with no turned-on measurement is never in E31 or E32. Turning an assessment off hides its rows; its measurements keep their own `is_active`.
- Changing an interval in Setup changes the next E31 / E32 answer (nothing is stored).

**E31 rows (BR-REC-16, 96; C2, C4, C5, C7)**
- One row per member + assessment. `items` = that member's due measurements of the assessment, in setup order (`sort_order`): due on or before today + Due soon days. `dueOn` = the earliest due date of the row's measurements; `daysOverdue` as above.
- `status=overdue`: `dueOn` before today. `status=upcoming`: `dueOn` today or later, within the window (Due soon 0 = only rows due today). Someone due today is `upcoming` (Q3). `meta.total` = rows of that tab after the left-out rules, the hidden reminders and the `typeId` filter.
- **Assess soon** (`flagged: true`): the row is only in `overdue`, never in `upcoming`, whatever its dates, even when nothing is due; `items` = every turned-on measurement of the assessment (setup order); `dueOn` = the earliest due date among them (so `daysOverdue` can be ≤ 0). It replaces that member + assessment's normal row. Normal rows have `flagged: false`.
- **Remind me later** hides the member + assessment from both tabs while today < `until_on`; on `until_on` the row is back (C7: reminder to 20 Oct → hidden through 19 Oct, shown on 20 Oct).
- **Left out (C3, BR-REC-17):** archived members (`archived_at` set) and members whose latest membership (latest `start_on`) has Ended, i.e. `end_on` before today. A membership ending today or later (Active, Expiring, not started yet) is listed; a member with no membership at all is listed. E32 answers for every member, archived and Expired too.
- **Order (C5, BR-REC-97), both tabs:** Assess soon rows first; then `dueOn` ascending (= most days overdue first, then soonest due); then `fullName` lower-cased, plain code-unit order; then the assessment's `sort_order`; then `memberId`. Paging cuts this one list (`pageSize` rows per page).
- The `typeId` filter keeps only that assessment's rows (BR-REC-104).

**Override ending (C6; BR-REC-98, 99)** — worked out when reading; nothing is written when it ends.
- An "Assess soon" or "Remind me later" is over when an `assessments` row of that member + type has `updated_at` ≥ the override's `created_at` AND `assessed_on` ≥ the override's `set_on`. A save dated before `set_on` (back-fill) ends neither (Case 15: set 1 Oct, saved dated 15 Sep → still Assess soon).
- When it is over, E31 / E32 behave as if there were no override (`flagged: false`, `snoozedUntil: null`, normal dates). **The `due_overrides` row stays**; the assessments stream never touches it. A test sees this by reading the table after the save.
- Setting either again (E33) replaces the row: `set_on` = today, `created_at` = now, so an old save no longer counts.

**E32 lines (BR-REC-103; C10)** — one entry per turned-on assessment with ≥ 1 turned-on measurement, in setup order; `[]` when there is none.
- `state` comes from dates only (Assess soon and reminders are ignored): `overdue` = `nextDueOn` before today, `upcoming` = due today or within the Due soon window, `ok` = later. `nextDueOn` = the earliest due date of the turned-on measurements; `daysOverdue` = days from `nextDueOn` to today (negative when not yet due).
- `neverRecorded` = none of the turned-on measurements of that assessment has a value (turned-off ones do not count), whatever the state. (The screen shows "Never recorded" before "Overdue 34 days", C10; the API only supplies the facts.)
- `items` = the due measurements as in E31; every turned-on measurement when `flagged`; `[]` when `state` is `ok` and not flagged.
- `flagged` is true only while an Assess soon is active; `snoozedUntil` is the reminder's `until_on` only while it is active (today < until, not ended); else `false` / `null`.

**E33 / E34 (BR-REC-18, 98…100; C8, C9)**
- E33 `flag` stores kind `flag`, `set_on` = today, `until_on` null; `snooze` stores kind `snooze`, `set_on` = today, `until_on` = `until`. One row per member + type (primary key): setting a flag over a reminder (or the reverse, or the same again) replaces it — the other is gone at once (BR-REC-100). Two parallel E33 for the same pair: both 200, one row remains, never 500.
- 404 `NOT_FOUND` for an unknown member or an unknown assessment (E32, E33, E34). Archived members and turned-off assessments are accepted by E33 / E34 (a turned-off one shows nothing until turned on again).
- E34 deletes the row; with nothing set it is still 200 `{}` (no 404).
- **Change log (BR-REC-158):** one `audit_log` row per successful call, in the same transaction: E33 action `due_override.set`, E34 action `due_override.clear` (also when nothing was set). `session_id` = the signed-in token's `sid`. A refused call (4xx) writes none and changes nothing. `entity` / `entityId` / `before` / `after` are not fixed by the spec: tests match on `action` and `session_id`.

## What test setup may do
Rows are inserted with Drizzle straight into `members` (`fullName`, `phone`, `phoneDigits`, `dateOfBirth`, `sex`, `joinedOn`; `archivedAt` for an archived one), `membership_periods` (`memberId`, `plan`, `startOn`, `endOn`),
`assessment_types` (`name`, `intervalCount`, `intervalUnit`, `isActive`, `sortOrder`), `metrics` (`typeId`, `name`, `datatype`, `better`, `sortOrder`, `isActive`, optional own `intervalCount` + `intervalUnit` together),
`assessments` (`memberId`, `typeId`, `assessedOn`, and an explicit `updatedAt` when a case needs it), `measurements` (`assessmentId`, `metricId`, `memberId`, `measuredOn` = the assessment's date, `value`),
`due_overrides` (`memberId`, `typeId`, `kind`, `setOn`, `untilOn`, and an explicit `createdAt` for the C6 cases). E25–E30 (the assessments stream) are not needed. `gym_settings` is set through E08 or directly
(`timezone`, `upcomingLeadDays`). The table checks hold: a `snooze` has `until_on`, a `flag` has none, `until_on` ≤ `set_on` + 90, so a row the API would refuse cannot be inserted either.

## What other streams and tests may rely on
- `API_ROUTES.DUE.LIST`, `API_ROUTES.MEMBERS.DUE`, `API_ROUTES.MEMBERS.DUE_ACTION` exist in `frontend/src/lib/api/routes.ts`; schema names: `dueListQuerySchema`, `dueListItemSchema`, `memberDueItemSchema`, `dueItemSchema`, `dueActionParamsSchema`, `dueActionBodySchema`, `dueActionResultSchema`, `clearDueActionResultSchema`; types `DueListItem`, `MemberDueItem`, `DueItem`, `DueActionBody`, `DueActionResult`, `DueListStatus`, `DueState`.
- The assessments stream (D) needs no change: saving an assessment ends an override by being read (C6). It must keep `assessments.updated_at` fresh on every save and edit (the column default and Drizzle's `$onUpdate` do).
- `computeDue` reads only what the setup stream stores: `sort_order`, `is_active` (own and the assessment's), the repeat pairs (setup contract, "What other streams and tests may rely on").

## Due engine — `backend/src/lib/domain/due.ts`
Pure: no I/O, no clock; `today` and `upcomingLeadDays` are arguments. Dates are `IsoDate` (`YYYY-MM-DD`). Built on `addInterval`, `addDays`, `daysBetween` (`dates.ts`) and `membershipStatus` (`membership.ts`). Types `DueItem`, `DueListItem`, `DueListStatus`, `DueState`, `MemberDueItem` come from `types/due.types.ts`.

```ts
computeDue(input: ComputeDueInput): DueStatus[]
dueListRows(statuses: DueStatus[], tab: DueListStatus): DueListItem[]      // tab = "overdue" | "upcoming"
memberDueItems(statuses: DueStatus[]): MemberDueItem[]                    // statuses of ONE member
isListedInDueList(member: DueListMember, today: IsoDate): boolean
```
Exported types: `DueMember`, `DueMeasurement`, `DueAssessmentType`, `DueLastMeasured`, `DueOverride`, `ComputeDueInput`, `DueStatus`, `DueListMember`.

| Input type | Fields (meaning) |
|---|---|
| `ComputeDueInput` | `today`, `upcomingLeadDays` (0–30; 0 = only "Due today"), `members: DueMember[]`, `types: DueAssessmentType[]`, `lastMeasured: DueLastMeasured[]`, `overrides: DueOverride[]` |
| `DueMember` | `id`, `fullName`, `joinedOn` (the due date of anything never recorded) |
| `DueAssessmentType` | `id`, `name`, `isActive`, `sortOrder`, `intervalCount` (1–24), `intervalUnit` (`week`\|`month`), `measurements: DueMeasurement[]` (all of them, on and off, any order) |
| `DueMeasurement` | `id` (= `metrics.id`), `name`, `isActive`, `sortOrder`, `intervalCount` / `intervalUnit` (own repeat; both or null; one side alone counts as none) |
| `DueLastMeasured` | `memberId`, `metricId`, `measuredOn`: the latest value date of that member + measurement; older duplicates are fine (the latest wins); a row for an unknown member or measurement is ignored |
| `DueOverride` | `memberId`, `typeId`, `kind` (`flag`\|`snooze`), `setOn`, `untilOn` (snooze only; a snooze without it is ignored), `latestAssessedOnSinceSet`: the latest `assessed_on` of that member + type among assessments with `updated_at` ≥ the override's `created_at`, or null when none |
| `DueListMember` | `archived`, `latestMembership: { startOn, endOn } \| null` (latest period by start) |

`computeDue` returns one `DueStatus` per member + turned-on assessment that has ≥ 1 turned-on measurement: members in input order, then assessments by `sortOrder` (stable for ties). Nothing for a turned-off assessment or one with no turned-on measurement. Rules:
1. Per turned-on measurement (setup order): effective interval = its own pair when both set, else the assessment's; due = `addInterval(latest measuredOn, count, unit)`, or `joinedOn` when the member has no value (C1; BR-REC-15, 94, 95).
2. `nextDueOn` = earliest due; `daysOverdue = daysBetween(nextDueOn, today)` (BR-REC-105); `dueItems` = measurements with `daysBetween(today, due) <= upcomingLeadDays` (so also every overdue one); `allItems` = every turned-on measurement; `neverRecorded` = no turned-on measurement has a value.
3. `state`: `ok` when `dueItems` is empty; else `overdue` when `daysOverdue >= 1`, else `upcoming`. Dates only: overrides never change `state`, `nextDueOn`, `daysOverdue` or `dueItems` (C10).
4. Overrides: ended when `latestAssessedOnSinceSet` is not null and ≥ `setOn` (C6). Not ended: `flag` → `flagged: true`; `snooze` → `snoozedUntil = untilOn` only while `today < untilOn` (C7), else null. An override whose member or assessment is not in the input is ignored.

`dueListRows(statuses, tab)`: drops rows with `snoozedUntil` set; a `flagged` status is only in `overdue` with `items = allItems`; any other status is in the tab equal to its `state` (`ok` is in none) with `items = dueItems`; `dueOn = nextDueOn`; then sorts: flagged first → `dueOn` ↑ → `fullName.toLowerCase()` ↑ (code-unit order, like E16) → `typeSortOrder` ↑ → `memberId` ↑. Returns every row (the service pages in memory and sets `meta.total` = length).
`memberDueItems(statuses)`: one `MemberDueItem` per status in the order given: `typeId`, `typeName`, `state`, `neverRecorded`, `nextDueOn`, `daysOverdue`, `flagged`, `snoozedUntil` as in the status; `items = allItems` when `flagged`, else `dueItems`.
`isListedInDueList(member, today)`: false when `archived`; false when `latestMembership` is not null and `membershipStatus(latest, today, 0).status === "expired"`; true otherwise (C3). The service passes only listed members to `computeDue` for E31, and every member's own row for E32.

Due examples (today 2026-10-03, lead 7, Body composition 1 month, Fitness test 2 months, Fran own 3 months, joined 2026-06-01) become engine inputs: one member, the type with its measurements, `lastMeasured` rows with the dates of the case; cases 1–9 and 14 read `dueItems` / `state` / `daysOverdue` / `nextDueOn`; 12, 13, 15 add one `DueOverride` and read `flagged` / `snoozedUntil` and `dueListRows`; 10, 11, 16 use `isListedInDueList`.

## Admin app (frontend; BR-REC-16…18, 96…105, C10–C13, UX BR-REC-120…140)
- **Routes:** S2 Home `/admin` (slot `components/pages/home/DueSections.tsx`: Overdue then Due soon, before B's membership sections) ·
  S3 `/admin/due?tab=overdue|soon&type=<typeId>` (new `app/(app)/admin/due/page.tsx` → `components/views/due/DueListView` → `components/pages/due/*`;
  the existing `loading.tsx` / `error.tsx` stay) · member page slot `components/pages/member/DueBlock.tsx` (`{ memberId }`).
- **Home sections (BR-REC-101, C11):** each `Section` shows its title, `meta.total` as the count, the first 5 rows (E31 `pageSize=5`) and "See all" →
  S3 on that tab; empty → one line ("Nobody is overdue." / "Nobody is due soon."); each section loads and fails on its own (grey rows; "Couldn't load this." [Try again]).
- **Row (both lists):** `ListRow`, ≥ 56 px: name; second line = assessment name; `ChipList` of `items` (+N); status at the right as `StatusBadge` with words
  (`dueRowStatus`); a "⋯" icon button (spoken name "More for <name>", 44 px). Row tap → `recordHref(memberId, typeId)` (S10, assessments stream; a 404 until D merges is accepted); 1 tap from Home (BR-REC-140).
- **Row sheet (`ResponsiveSheet`, BR-REC-138; C12):** Record assessment · Assess soon (when the row is flagged: "Remove Assess soon") · Remind me later ›
  (second step inside the same sheet: 1 week · 2 weeks · 1 month · Pick a date (`DateField`, after today, ≤ 90 days)) · Open member (`/admin/members/[memberId]`).
  No confirmation for any of them (BR-REC-133). Never nest a second Back-aware sheet (map gotcha, #18).
- **S3 (BR-REC-104):** `PageHeader` "Due list"; tabs Overdue · Due soon (URL `tab`, default `overdue`); filter chips "All" + every turned-on assessment in setup order
  (from the setup catalog query, read-only use) setting URL `type`; E31 with `pageSize=25`; "Show more" loads the next page and appends; same rows and sheet; empty → one line.
- **Member block (BR-REC-103, C10):** `Section` "Assessments": one line per E32 item: assessment name, status words (`memberDueStatus`) as a `StatusBadge`,
  chips of `items` when not empty; "⋯" per line with Record assessment · Assess soon / Remove Assess soon · Remind me later › · Remove reminder (when `snoozedUntil`).
  Archived members show the block too (C3). No main action here (the member page's "Record assessment" belongs to the frame).
- **Writes (perf tactic 8, C13):** Assess soon / Remind me later / remove apply to the cached lists at once (`applyDueChange`), call E33 / E34, undo with a toast
  ("Couldn't save this. Try again." via `messageForCode`) on error, then invalidate `dueKeys.all` on settle. Success toast: "Marked Assess soon." / "Reminder set for 3 Nov." / "Removed.".
- **Freshness:** every due query has `staleTime: 0` (setup / assessment changes show at once, map gotcha R-6).
- **Words (BR-REC-126):** never "flag", "snooze", "metric", "upcoming", "interval" on screen; use the word list.

## Admin app interfaces (coordinator, 2026-10-04 — frontend tests and frontend-dev both use these names; pure modules, no DOM)
| Module (`frontend/src/…`) | Export | Behaviour |
|---|---|---|
| `lib/due/status.ts` | `dueRowStatus(row: { flagged: boolean; daysOverdue: number })` → `{ text: string; tone: StatusTone }` | flagged → "Assess soon" (`warning`); `daysOverdue` ≥ 2 → "Overdue N days", 1 → "Overdue 1 day" (`danger`); 0 → "Due today"; −1 → "Due tomorrow"; ≤ −2 → "Due in N days" (N = −daysOverdue) (`neutral`) (BR-REC-96, 105, 125, 127) |
| | `memberDueStatus(item: MemberDueItem, today: IsoDate)` → `{ text: string; tone: StatusTone }` | first that applies (C10): `flagged` → "Assess soon" (`warning`) · `snoozedUntil` → "Reminder on 20 Oct" (`formatDay`, year only when not this year; `neutral`) · `neverRecorded` → "Never recorded" (`danger` when `state` is `overdue`, else `neutral`) · `state` `overdue` → "Overdue 34 days" / "Overdue 1 day" (`danger`) · `upcoming` → "Due today" / "Due tomorrow" / "Due in 5 days" (`neutral`) · `ok` → "Next due 12 Dec" (`formatDay`; `success`) |
| | `emptyDueLine(tab: 'overdue' \| 'soon')` | "Nobody is overdue." / "Nobody is due soon." (BR-REC-101, 130) |
| `lib/due/remind.ts` | `remindChoices(today: IsoDate)` → `{ label: string; until: IsoDate }[]` | `[{ "1 week", today+7 }, { "2 weeks", today+14 }, { "1 month", addMonths(today, 1) }]` (C8, BR-REC-94: 31 Jan → 28 Feb) |
| | `remindDateIssue(until: IsoDate \| '', today: IsoDate)` → `string \| null` | '' → "Pick a date."; ≤ today → "Pick a date after today."; > today + 90 → the `SNOOZE_TOO_FAR` text from `messageForCode`; else null (C8) |
| `lib/due/links.ts` | `recordHref(memberId, typeId)` · `dueListHref(tab: 'overdue' \| 'soon', typeId?: string \| null)` · `tabToStatus(tab)` | `/admin/members/<id>/assess?type=<typeId>` · `/admin/due?tab=<tab>` (+ `&type=<id>` when given) · `'overdue'` → `'overdue'`, `'soon'` → `'upcoming'` |
| `lib/due/searchParams.ts` | `dueListSearchParams` (nuqs parsers) · `parseDueTab(value: string \| null)` | `tab`: `overdue` \| `soon`, anything else → `overdue`; `type`: a uuid string or null (anything else → null) |
| `lib/due/optimistic.ts` | `applyDueChange(list: DueListItem[], change: DueChange, tab: 'overdue' \| 'upcoming')` → `DueListItem[]` | `DueChange` = `{ memberId, typeId, action: 'flag' \| 'snooze' \| 'clear', until?: IsoDate }`. `snooze` → that row removed; `flag` → in `overdue`: the row gets `flagged: true` and the list is re-sorted with `sortDueRows` (so it joins the flagged rows at the top in C5 order); in `upcoming`: the row is removed; `clear` → in `overdue` a flagged row gets `flagged: false` and is re-sorted by C5 (a row that was due only because of the flag stays until the refetch); no matching row → the list unchanged (same contents). Never mutates the input. |
| | `applyMemberDueChange(items: MemberDueItem[], change: DueChange)` → `MemberDueItem[]` | `flag` → `flagged: true, snoozedUntil: null`; `snooze` → `snoozedUntil: until, flagged: false`; `clear` → `flagged: false, snoozedUntil: null`; other items unchanged; never mutates |
| | `sortDueRows(rows: DueListItem[])` | the C5 order: flagged first → `dueOn` ↑ → `fullName.toLowerCase()` ↑ (code-unit order) → keep the given order for ties (stable) |
| `lib/due/text.ts` | `DUE_TEXT` | due-list's own plain-word strings (section empty lines, sheet choices, toasts); shared `UI_TEXT` / `WORDS` are only read |
| `lib/api/due/queries.ts` | `dueKeys` (`all: ['due']`, `list(status, typeId, pageSize)`, `infinite(status, typeId)`, `member(memberId)`) · `dueListQueryOptions(status, typeId, pageSize)` · `memberDueQueryOptions(memberId)` | all due queries `staleTime: 0`; hooks `useDuePreview(status)` (pageSize 5), `useDueList(status, typeId)` (infinite, 25/page), `useMemberDue(memberId)`, `useSetDueAction()`, `useClearDueAction()`; each write applies `applyDueChange` / `applyMemberDueChange` to the cached lists, rolls back on error, invalidates `dueKeys.all` on settle |
| `lib/api/due/fetchers.ts` | `fetchDueList`, `fetchMemberDue`, `putDueAction`, `deleteDueAction` | `api` + `API_ROUTES.DUE.LIST` / `MEMBERS.DUE` / `MEMBERS.DUE_ACTION` + `apiPath`; no hard-coded paths; types from `src/types/api.generated.ts` |
| | `fetchDueList({ status, typeId?, page, pageSize })` · `fetchMemberDue(memberId)` · `putDueAction(memberId, typeId, body: DueActionBody)` · `deleteDueAction(memberId, typeId)` | `fetchDueList` returns the `{ data, meta }` envelope of E31 (`typeId` sent only when set); `putDueAction` sends PUT with the strict body `{ action: 'flag' }` or `{ action: 'snooze', until }` and returns E33 `data`; `deleteDueAction` sends DELETE with no body and returns `{}`; writes carry no `Idempotency-Key` |
| `lib/api/due/queries.ts` (write hooks) | `useSetDueAction().mutate(change: Omit<DueChange, 'clear'-action>)` · `useClearDueAction().mutate({ memberId, typeId })` | `useSetDueAction` takes `{ memberId, typeId, action: 'flag' } \| { memberId, typeId, action: 'snooze', until }` and calls `putDueAction`; `useClearDueAction` calls `deleteDueAction`. Cached E31 data keeps the envelope `{ data: DueListItem[], meta }` (the infinite query holds `pages` of it); cached E32 data is the plain `MemberDueItem[]`. On mutate: cancel due queries, apply `applyDueChange` to every cached E31 list for both tabs (and every page of an infinite one) and `applyMemberDueChange` to that member's cached E32 list, keeping `meta` untouched; on error: restore every touched cache entry and show the toast text from `messageForCode(code)`; on success: toast from `DUE_TEXT` ("Marked Assess soon." / "Reminder set for <date>." / "Removed."); on settle: invalidate `dueKeys.all` |
