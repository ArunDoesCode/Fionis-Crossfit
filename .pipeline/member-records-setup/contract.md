# member-records/setup · contract (E07–E15)

Spec: `docs/specs/member-records/setup.md` v2 (incl. build clarifications C1–C10) + `api-contract.md` v1 (BR-REC-153…162).
Descriptors: `backend/src/routes/setup.ts`; schemas: `backend/src/types/setup.types.ts`; data model: `data-model.md` (`gym_settings`,
`assessment_types`, `metrics`). Generated: `backend/.contracts/*`, `frontend/src/types/api.generated.ts` (coordinator runs `types:api`).
Handlers answer **501 `NOT_IMPLEMENTED`** after auth and validation until Stream C builds them. The seed (BR-REC-68) already exists
(`backend/scripts/seed.ts` → `CATALOG`; tests in `backend/tests/scripts/seed.test.ts`).

## All nine endpoints
- Base `/api`. Success `{ success: true, data }` (E09 adds `meta { page, pageSize, total, totalPages }`). Status 200, except **E10 and E13 = 201**.
  Error `{ success: false, message, code, details? }`.
- All are `any-authenticated` (cookie `access_token` or `Authorization: Bearer`). No `Idempotency-Key` on any of them (BR-REC-156 covers E17, E22 only).
- Check order: Origin (403 `CSRF_ORIGIN` on E08, E10–E15; a missing or other `Origin` is refused) → auth (401 `UNAUTHORIZED`) → params / query / JSON
  body validation (400 `INVALID_JSON` or `VALIDATION_ERROR`, `details.issues[{ path, message }]`) → ETag (E07, E09) → handler (404, then 400/409 service rules).
  So a bad body is 400 even when the id in the path does not exist.
- Ids (`typeId`, `metricId`, entries of `typeIds` / `metricIds`) are any 8-4-4-4-12 hex uuid: malformed → 400, well-formed but unknown → 404 (or, inside an order list, 400 — see E12, E15).
- Write bodies: unknown keys rejected on E08, E11, E14 (BR-REC-157), ignored on E10, E12, E13, E15. Update bodies need ≥ 1 field. `null` is accepted only where the table says "or null".
- **Trim rule (C2):** `gymName`, `name`, `tableGroup` are trimmed first; limits and uniqueness apply to the trimmed text, and the trimmed text is what is saved and returned. `unit` is not trimmed.
- Lengths count JavaScript string length.

## Endpoints
| ID | Method + path | Request | `data` | Errors (beyond 403 / 401 / 400 above) |
|---|---|---|---|---|
| E07 | GET `/settings` | — | `Settings` (+ `ETag`; matching `If-None-Match` → 304, no body) | — |
| E08 | PATCH `/settings` | body: any of `gymName`, `timezone`, `upcomingLeadDays`, `expiryLeadDays` | `Settings` (all four, after the change) | — |
| E09 | GET `/assessment-types` | query `includeInactive` `"true"`\|`"false"` (default `"false"`), `page` ≥ 1 (1), `pageSize` 1–100 (10) | `AssessmentType[]` + `meta` (+ `ETag`, 304) | — |
| E10 | POST `/assessment-types` | body `{ name, intervalCount, intervalUnit }` (all required) | 201 `AssessmentType` | 409 `NAME_TAKEN` |
| E11 | PATCH `/assessment-types/:typeId` | body: any of `name`, `intervalCount`, `intervalUnit`, `isActive` | `AssessmentType` | 404 `NOT_FOUND` · 409 `NAME_TAKEN` |
| E12 | PUT `/assessment-types/order` | body `{ typeIds }` | `{}` | — (a wrong set of ids is 400) |
| E13 | POST `/assessment-types/:typeId/metrics` | body: `name`, `datatype`, `better` required; the rest optional (below) | 201 `Metric` | 404 · 409 `NAME_TAKEN` |
| E14 | PATCH `/metrics/:metricId` | body: any metric field + `isActive` | `Metric` | 404 · 409 `NAME_TAKEN` · 409 `METRIC_LOCKED` |
| E15 | PUT `/assessment-types/:typeId/metric-order` | body `{ metricIds }` | `{}` | 404 (unknown `typeId`) |

## Request limits (exact; the OpenAPI shows min/max/enum, the notes carry the rest)
| Field | Used by | Limit | Issue `path` · `message` on failure |
|---|---|---|---|
| `gymName` | E08 | string, trimmed, 2–60 chars | `gymName` · "Use 2 to 60 characters" |
| `timezone` | E08 | an IANA zone name the server's `Intl` knows: `Asia/Kolkata`, `Europe/London`, `UTC` pass; `Mars/Olympus`, `""`, `" Asia/Kolkata"`, offsets like `+05:30` fail. Not visible in OpenAPI (refine). Letter case is not checked strictly: tests use exact names | `timezone` · "Use a time zone name" |
| `upcomingLeadDays` | E08 | integer 0–30 | `upcomingLeadDays` · "Use 0 to 30 days" (a non-integer: Zod's "expected int") |
| `expiryLeadDays` | E08 | integer 0–60 | `expiryLeadDays` · "Use 0 to 60 days" |
| `name` | E10, E11, E13, E14 | string, trimmed, 2–40 chars | `name` · "Use 2 to 40 characters" |
| `intervalCount` | E10, E11 (integer, required on E10); E13, E14 (integer or `null`) | 1–24 | `intervalCount` · "Use 1 to 24" |
| `intervalUnit` | E10, E11; E13, E14 (or `null`) | `week` \| `month` | `intervalUnit` · Zod enum message |
| `isActive` | E11, E14 | boolean | — |
| `datatype` | E13 (required), E14 | `number` \| `duration` (the sheet calls duration "Time") | `datatype` · Zod enum message |
| `better` | E13 (required), E14 | `higher` \| `lower` \| `none` | `better` · Zod enum message |
| `unit` | E13, E14 | string, 0–12 chars (empty allowed) | `unit` · "Use at most 12 characters" |
| `decimals` | E13, E14 | integer 0–2 (checked for a duration too: `3` is 400) | `decimals` · "Use 0, 1 or 2" |
| `plausibleMin`, `plausibleMax` | E13, E14 | number from −999,999,999.999 to 999,999,999.999 (fits `numeric(12,3)`; bounds included), or `null` (the "please check" range; seconds for a duration, C3) | `plausibleMin` / `plausibleMax` · "Use a number up to 999,999,999.999 either way" |
| `tableGroup` | E13, E14 | string trimmed 2–40 chars, or `null` (the report-table group) | `tableGroup` · "Use 2 to 40 characters" |
| `tablePart` | E13, E14 | `whole_body` \| `arms` \| `trunk` \| `legs`, or `null` | `tablePart` · Zod enum message |
| `typeIds` / `metricIds` | E12 / E15 | array of uuids, ≥ 1, no id twice (compared ignoring letter case) | `typeIds` / `metricIds` · "List every item once" |

**Cross-field checks inside one body** (all give 400 `VALIDATION_ERROR`; invisible in OpenAPI, so also in the route `notes`):
| Check | E13 (create) | E14 (update) | Issue `path` · `message` |
|---|---|---|---|
| range: `plausibleMin` < `plausibleMax` (strict) when **both** are numbers (equal fails; `null` or a missing side is not checked) | yes | yes, when both are in the body | `plausibleMin` · "Below must be smaller than above" |
| own repeat: `intervalCount` and `intervalUnit` both set or both empty (`null` / omitted counts as empty) | yes | only when **both** keys are in the body | `intervalCount` · "Set both the repeat number and unit, or neither" |
| report-table place: `tableGroup` and `tablePart` both set or both empty | yes | only when **both** keys are in the body | `tableGroup` · "Set both the report group and part, or neither" |

With only one side of a pair or of the range in an E14 body, the schema accepts it and the **service** checks the result against the stored values (C8) → 400 `VALIDATION_ERROR`.
If a field has the wrong type, the cross-field checks are skipped (only the type issue is reported).

## Response shapes (plain; limits are on requests only)
- `Settings` `{ gymName, timezone, upcomingLeadDays, expiryLeadDays }`.
- `AssessmentType` `{ id, name, intervalCount, intervalUnit, isActive, sortOrder, hasValues, metrics: Metric[] }`.
- `Metric` `{ id, name, unit, datatype, decimals, better, plausibleMin|null, plausibleMax|null, intervalCount|null, intervalUnit|null, tableGroup|null, tablePart|null, isActive, sortOrder, hasValues }`.
- Numbers come back as JSON numbers (`numeric(12,3)` ranges, e.g. `95.5`); durations and duration check ranges are whole seconds (BR-REC-153).

## Behaviour a test can rely on
**Settings (BR-REC-60, C1)**
- A fresh database (after `seed`) answers E07 `{ gymName: "Fionis CrossFit", timezone: "Asia/Kolkata", upcomingLeadDays: 7, expiryLeadDays: 14 }`.
- E08 changes only the fields sent; the answer is the whole row; a following E07 shows the same. `gymName` `"  Fionis  "` is saved as `"Fionis"`.
- Boundaries: `upcomingLeadDays` 0 and 30 pass, −1 and 31 fail, `45` fails with "Use 0 to 30 days"; `expiryLeadDays` 0 and 60 pass, 61 fails. `7.5` fails. `null` for any setting fails.
- E07 ETag: same data → same tag → 304 on a matching `If-None-Match`; after an E08 that changes a value the old tag gets 200 with the new body (BR-REC-72, 160).
- A refused E08 (400) changes nothing.

**Assessments (BR-REC-10, 13, 61, 66, 67, 70, 72; C5–C7)**
- E09 lists assessments ordered by `sortOrder` ascending, each with its `metrics` ordered by their `sortOrder`. After the seed: "Body composition" (1 month, order 1) then "Fitness test" (2 months, order 2); seeded `sortOrder` values start at 1.
- E09 without `includeInactive` (or `"false"`) leaves out off assessments (with all their measurements) and off measurements of on assessments. With `"true"` it returns everything, each with its own `isActive`.
  Any other `includeInactive` text → 400. `meta.total` counts the assessments after this filter. No sort or search parameters.
- E11 `{ isActive: false }` turns an assessment off. Its measurements keep their own `isActive`; they are hidden from E09's default list while it is off. Turning it on again shows them as before (C5, BR-REC-66).
- E10: the new assessment is On (`isActive: true`), has `metrics: []`, `hasValues: false`, and `sortOrder` greater than every other assessment's (added last, C7). Name and interval are required.
- E11's answer lists **all** of the assessment's measurements, on and off, in setup order, each with its own `isActive` (the `includeInactive` filter belongs to E09 only).
- `NAME_TAKEN` (E10, E11): another assessment — on **or off** — has the same trimmed name ignoring case ("body composition" vs "Body composition"). An E11 that keeps or only re-cases the assessment's **own** name is not a conflict.
- E11 changes only the fields sent; changing `intervalCount` / `intervalUnit` is saved at once (the due list reads it live, BR-REC-70). Unknown `typeId` → 404.
- `hasValues` (C6): an assessment is `true` when any stored measurement value belongs to any of its measurements (on or off); a measurement is `true` when it has at least one stored value. Tests create values by inserting `assessments` + `measurements` rows (E26 belongs to another stream).
- E12: `typeIds` must list **every** assessment (on and off) **once**; anything else (a missing, extra, unknown or duplicate id; `[]`) → 400 `VALIDATION_ERROR`. On success `data` is `{}`, E09 (with `includeInactive=true`) returns the assessments in the order sent (BR-REC-67), and their `sortOrder` values are 1…n in that order (the seed also numbers from 1).
- Nothing is ever deleted: there is no DELETE route; "off" is the only way out (BR-REC-66).

**Measurements (BR-REC-10, 11, 14, 62, 64, 65, 66, 67, 69; C3, C4, C6–C9)**
- E13 creates the measurement under `:typeId`: `isActive: true`, `hasValues: false`, `sortOrder` greater than every sibling's (added last). Omitted fields default to `unit ""`, `decimals 1`, `plausibleMin/Max null`, `intervalCount/Unit null`, `tableGroup/Part null`. Unknown `typeId` → 404.
- **Duration (C3):** a measurement whose `datatype` is `duration` is always saved with `unit: "min:sec"` and `decimals: 0`, whatever the request sends (`unit: "kg", decimals: 2` is accepted and answered as `min:sec` / `0`; a `unit` over 12 chars or `decimals: 3` is still 400). A `number` measurement keeps the unit and decimals sent. No unit conversion anywhere (BR-REC-69).
- `NAME_TAKEN` (E13, E14): another measurement **of the same assessment** — on or off — has the same trimmed name ignoring case. The same name in a different assessment is fine; an E14 that keeps or re-cases its own name is fine.
- E14 changes only the fields sent. Name, decimals, better, check range, own repeat, report-table place and `isActive` can always be changed, also when values exist (BR-REC-11, 64, 71). Changing `decimals` never changes stored values (C9).
- **`METRIC_LOCKED` (BR-REC-11, C4):** `hasValues` is `true` and the request would really change `datatype` or `unit` → 409 `METRIC_LOCKED`. Sending the stored `datatype` / `unit` again is 200. The lock compares the datatype and unit the measurement would end up with (after C3) to the stored ones, so `{ unit: "kg" }` on a duration measurement that has values is 200 and the unit stays `min:sec`. With no values both can change (a switch from Time to Number without a `unit` in the body leaves the unit empty, C3; a switch to Time sets `min:sec` and 0 decimals).
- E14 with several problems at once answers the first of: 404 (unknown `metricId`) → C8 400 → `METRIC_LOCKED` → `NAME_TAKEN`; tests still trigger one error at a time.
- E14 clears optional fields with `null`: `plausibleMin`, `plausibleMax`, the repeat pair (both `null`), the report-table pair (both `null`).
- **C8 (service checks against stored values, 400 `VALIDATION_ERROR`):** only `plausibleMin` sent and it is ≥ the stored `plausibleMax` (and the mirror case); only `intervalCount` or only `intervalUnit` sent where the other stored side is `null` (or `intervalCount: null` alone while a unit is stored); only `tableGroup` or only `tablePart` likewise; the mirror cases (clearing one side alone: `intervalUnit: null`, `tableGroup: null`, `tablePart: null` while the other is stored) are 400 too.
- **C11:** two writes racing on the same name (E10, E11, E13, E14): one succeeds, the other is 409 `NAME_TAKEN`, never 500; two parallel adds get different `sortOrder` values.
- E15: `metricIds` must list **every** measurement of `:typeId` (on and off) once; a missing, extra, duplicate or foreign (other assessment's) id, or `[]` → 400 `VALIDATION_ERROR`. Unknown `typeId` with a well-formed body → 404. On success `data` is `{}`, E09 shows that order (BR-REC-67), and the measurements' `sortOrder` values are 1…n in that order.
- Turning a measurement off (`isActive: false`) hides it from E09's default list; history stays (BR-REC-66).

**Change log (BR-REC-158, C10)** — one `audit_log` row per successful write, written in the same transaction; a refused write (4xx) writes none and changes nothing.
`audit_log.action`: E08 `settings.update` · E10 `assessment_type.create` · E11 `assessment_type.update` (also for on/off) · E12 `assessment_type.reorder` · E13 `metric.create` · E14 `metric.update` (also for on/off) · E15 `metric.reorder`.
`session_id` = the signed-in token's `sid`. `before` / `after` hold changed fields only (`diffChangedFields`). `entity` / `entityId` are not fixed by the spec: tests match on `action` and `session_id`.

## What other streams and tests may rely on
- `API_ROUTES.SETTINGS`, `ASSESSMENT_TYPES`, `METRICS` exist in `frontend/src/lib/api/routes.ts`; schema names: `settingsSchema`, `updateSettingsBodySchema`, `assessmentTypeSchema`, `metricSchema`, `createAssessmentTypeBodySchema`, `updateAssessmentTypeBodySchema`, `createMetricBodySchema`, `updateMetricBodySchema`, `assessmentTypeOrderBodySchema`, `metricOrderBodySchema`, `assessmentTypeListQuerySchema`.
- The assessments and due-list streams read the catalog from the tables directly (not through E09). They rely on: `assessment_types.sort_order` / `metrics.sort_order` give the order of forms, report card and lists (BR-REC-67); an off assessment hides all its measurements without changing their own `is_active` (C5, BR-REC-66); effective interval = the measurement's own pair when set, else its assessment's (BR-REC-14); the Time unit is the literal `min:sec` (C3).
- Check ranges (`plausible_min/max`) are "please check" limits only (never a hard error in setup); durations in seconds (BR-REC-153).
- Setup tests that need values insert rows with Drizzle (`assessments`, `measurements`, `members`); they do not call E26.

## Rounding function (C9, BR-REC-64) — `backend/src/lib/domain/metric-value.ts` (pure, no I/O)
`roundMetricValue(value: number, datatype: "number" | "duration", decimals: 0 | 1 | 2): number`
- `number`: round **half away from zero** to `decimals`, on the decimal digits (not the binary float): 95.56 @1 → 95.6; −2.25 @1 → −2.3; 1.005 @2 → 1.01; 2.5 @0 → 3; −2.5 @0 → −3; 95.5 @0 → 96; 12 @2 → 12.
- `duration`: whole seconds, same half-away-from-zero rule, `decimals` ignored: 122.4 → 122; 122.5 → 123.
- Finite input only (callers validate); never changes the sign of a non-zero result; −0 is returned as 0.
- The assessments stream calls it when saving (BR-REC-76). Setup itself never rounds stored values (changing decimals only changes display, E14).

## Admin app (frontend; BR-REC-60…72, UX BR-REC-120…140)
- **Routes:** S14 `/admin/settings` (hub) · S15 `/admin/settings/assessments` (list) and `/admin/settings/assessments/[typeId]` (one assessment's measurements) · S16 `/admin/settings/general`.
  Each page is a thin server file → `components/views/setup/*View` → `components/pages/setup/*`. Both existing `loading.tsx` / `error.tsx` stay.
- **S14 hub:** rows Assessments › · Reminders & gym › · Account › (`/admin/settings/account`) · Export data › (`/admin/settings/export`, built by the progress stream — a 404 until then is accepted) · Theme with the existing `ThemeToggle` (System / Light / Dark, BR-REC-136). Desktop: same list, 720 px.
- **S15 list:** one `ListRow` per assessment: name, "Every 2 months", "Off" badge when off, Move up / Move down (44 px targets, disabled at the ends), tap → detail. Main action "Add assessment" (sheet: name, repeat number + unit). Edit (sheet: name, repeat, On switch). Off assessments are shown (the catalog is loaded with `includeInactive=true`) so they can be turned on again.
- **S15 detail:** title = assessment name, "Repeat every 1 month", rows per measurement: name, `unit · "Higher is better"` (or own repeat "every 3 months"), "Off" badge, Move up / Move down; main action "Add measurement"; row tap opens the measurement sheet. A `typeId` not in the catalog → `EmptyState` "This assessment was not found." (+ back to the list).
- **Measurement sheet** (`ResponsiveSheet`): Name *, Kind (Number / Time, `ChoiceChips`; **locked with a short note when `hasValues`**), Unit (same lock; hidden for Time, which always shows "min:sec"), Decimals (0 / 1 / 2; hidden for Time), Better (Higher / Lower / No direction), "Please check below / above" (two `NumberField`s; for Time two `DurationField`s in min:sec, stored as seconds), Repeat (Same as assessment / Own: number + unit), Report table (none, or group + part: Whole body / Arms / Trunk / Legs), On switch. No technical words (BR-REC-126).
- **Confirmations (`ConfirmSheet`, BR-REC-133):** changing an assessment's or a measurement's repeat when editing → "This changes due dates for all members" (BR-REC-70); changing "Better" on a measurement with `hasValues` → "Best results and leaderboards will change for past results" (BR-REC-71). Nothing else asks.
- **Errors:** every server code goes through `messageForCode`; `NAME_TAKEN` is shown next to the Name field, `METRIC_LOCKED` as a toast (the sheet locks the fields first, so it is a safety net). Forms follow BR-REC-134: validate on leaving a field and on Save; Save stays tappable and scrolls to the first problem; no Reset button.
- **Catalog freshness (BR-REC-72):** the catalog and settings queries use `staleTime: 0`, so every mount revalidates through the client's ETag cache (`lib/api/client.ts`, 304 when unchanged); each successful write invalidates `setupKeys.all`. Order buttons send the whole new order (E12 / E15) and show the new order at once, rolling back with a toast if the call fails.
- **Catalog page size:** `pageSize=100` (the catalog is a handful of assessments and E12 needs every one of them in one list); this is the one place that does not use the screens' 25.

## Admin app interfaces (coordinator, 2026-10-04 — frontend tests and frontend-dev both use these names; pure modules, no DOM)
| Module (`frontend/src/…`) | Export | Behaviour |
|---|---|---|
| `lib/validators/setup.ts` | `gymSettingsSchema` · `assessmentFormSchema` · `measurementFormSchema` (Zod; types `GymSettingsInput`, `AssessmentFormInput`, `MeasurementFormInput`) | Mirror the backend limits, same issue `path`s and `message`s as the "Request limits" table above (trimmed names/group, 2–60 gym name, lead days 0–30 and 0–60, name 2–40, repeat 1–24, unit ≤ 12, decimals 0–2, range bound ±999,999,999.999, min < max, repeat pair and report-table pair both-or-neither). `gymSettingsSchema`: `{ gymName, timezone (non-empty), upcomingLeadDays, expiryLeadDays }`. `assessmentFormSchema`: `{ name, intervalCount, intervalUnit }`. `measurementFormSchema`: `{ name, datatype 'number'\|'duration', unit, decimals 0\|1\|2, better, plausibleMin\|null, plausibleMax\|null, intervalCount\|null, intervalUnit\|null, tableGroup\|null, tablePart\|null, isActive }` |
| `lib/setup/describe.ts` | `intervalLabel(count, unit)` | "Every 1 month" · "Every 2 months" · "Every 1 week" · "Every 3 weeks" (plural when count ≠ 1) |
| | `betterLabel(better)` | `higher` → "Higher is better", `lower` → "Lower is better", `none` → "No direction" |
| | `datatypeLabel(datatype)` | `number` → "Number", `duration` → "Time (min:sec)" |
| | `tablePartLabel(part)` | `whole_body` → "Whole body", `arms` → "Arms", `trunk` → "Trunk", `legs` → "Legs" |
| | `intervalChangeNeedsConfirm(before, after)` | `before` / `after` = `{ intervalCount: number\|null, intervalUnit: 'week'\|'month'\|null }`; true when count or unit differs (BR-REC-70) |
| | `betterChangeNeedsConfirm({ better, hasValues }, newBetter)` | true only when `hasValues` and `newBetter !== better` (BR-REC-71) |
| | `moveItem(ids, index, direction)` | `direction` `'up'\|'down'`; returns a new array with the item swapped with its neighbour; at the first / last place (or an index out of range) returns an equal copy (BR-REC-67) |
| `lib/setup/text.ts` | `SETUP_TEXT` | setup's own plain-word strings (screen titles, row words, sheet labels, confirm texts); uses the word list (BR-REC-126); shared `UI_TEXT` is only read |
| `lib/api/setup/queries.ts` | `setupKeys` (`all`, `settings()`, `catalog(includeInactive)`) · `settingsQueryOptions()` · `assessmentTypesQueryOptions(includeInactive)` | both options have `staleTime: 0`; hooks `useSettings`, `useUpdateSettings`, `useAssessmentTypes`, `useCreateAssessmentType`, `useUpdateAssessmentType`, `useReorderAssessmentTypes`, `useCreateMetric`, `useUpdateMetric`, `useReorderMetrics`; every mutation invalidates `setupKeys.all` |
| `lib/api/setup/fetchers.ts` | one function per endpoint E07–E15 using `api` + `API_ROUTES` + `apiPath` | no hard-coded paths; types from `src/types/api.generated.ts` |
