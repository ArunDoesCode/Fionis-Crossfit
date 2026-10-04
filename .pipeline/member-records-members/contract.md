# member-records/members · contract (E16–E24)

Spec: `docs/specs/member-records/members.md` v1 + `api-contract.md` v1. Descriptors: `backend/src/routes/members.ts` (notes show in the
manifest), schemas: `backend/src/types/members.types.ts`. Generated: `backend/.contracts/*`, `frontend/src/types/api.generated.ts`.
Handlers answer 501 until the build slices land. "Gym today" = today in `gym_settings.timezone`; "lead days" = `gym_settings.expiry_lead_days`.

## All endpoints
- Success `{ success: true, data }` (lists add `meta { page, pageSize, total, totalPages }`); error `{ success: false, message, code, details? }`.
  Creates E17, E22 → 201; all others 200. Every route is `any-authenticated` (the shared login).
- Check order: Origin (403 `CSRF_ORIGIN`, writes) → sign-in (401) → params / query / body validation (400 `VALIDATION_ERROR` with
  `details.issues[{ path, message }]`, 400 `INVALID_JSON`) → `Idempotency-Key` (E17, E22; 400 `IDEMPOTENCY_KEY_MISSING`) → handler rules below.
  A malformed id is 400; a well-formed unknown id is 404.
- Update bodies (E19, E23): unknown keys → 400, `{}` → 400, `null` clears a nullable field, an omitted field is unchanged.
- Dates `YYYY-MM-DD`; `archivedAt` ISO UTC or `null`. Enums: plan `monthly|quarterly|half_annual|annual`; sex `male|female`;
  objective `fat_loss|strength|general_fitness|other`; membership status `active|expiring|expired`.

## Endpoints
| ID | Method + path | Request | `data` | Errors (beyond 401, 400 `VALIDATION_ERROR`) |
|---|---|---|---|---|
| E16 | GET `/api/members` | query `q?`, `phone?`, `status?` (`active|expiring|expired|archived|any`), `page`=1, `pageSize`=10 (≤100), `sortBy`=`name` (`name|joinedOn|lastAssessedOn`), `sortDir`=`asc` | list of `{ id, fullName, phone, lastAssessedOn \| null, archivedAt \| null, membership{ status, plan, endOn, daysLeft } }` | — |
| E17 | POST `/api/members` + `Idempotency-Key` | `{ fullName, phone, dateOfBirth, sex, joinedOn, firstPeriod{ plan, startOn }, email?, objective?, notes? }` | member (E18 shape) | 400 `DATE_IN_FUTURE`, `START_BEFORE_JOIN`, `IDEMPOTENCY_KEY_MISSING`, `INVALID_JSON` · 422 `IDEMPOTENCY_KEY_REUSED` · 429 `RATE_LIMITED` |
| E18 | GET `/api/members/:memberId` | — | `{ id, fullName, phone, email \| null, dateOfBirth, age, sex, joinedOn, objective \| null, notes \| null, archivedAt \| null, membership{ status, plan, startOn, endOn, daysLeft }, periods[{ id, plan, startOn, endOn }] }` | 404 |
| E19 | PATCH `/api/members/:memberId` | any of `fullName, phone, email, dateOfBirth, sex, joinedOn, objective, notes` (≥ 1; nothing else) | member | 404 · 400 `DATE_IN_FUTURE`, `START_BEFORE_JOIN`, `INVALID_JSON` |
| E20 | POST `/api/members/:memberId/archive` | — | member | 404 |
| E21 | POST `/api/members/:memberId/restore` | — | member | 404 |
| E22 | POST `/api/members/:memberId/periods` + `Idempotency-Key` | `{ plan, startOn }` | `{ id, plan, startOn, endOn, memberRestored }` | 404 · 400 `START_BEFORE_JOIN`, `IDEMPOTENCY_KEY_MISSING`, `INVALID_JSON` · 409 `PERIOD_OVERLAP` · 422 `IDEMPOTENCY_KEY_REUSED` · 429 `RATE_LIMITED` |
| E23 | PATCH `/api/members/:memberId/periods/:periodId` | `{ plan?, startOn? }` (≥ 1) | `{ id, plan, startOn, endOn, memberRestored }` | 404 · 400 `START_BEFORE_JOIN`, `INVALID_JSON` · 409 `PERIOD_OVERLAP` |
| E24 | GET `/api/memberships/ending` | query `status` (`expiring|expired`, required), `page`, `pageSize` (no `sortBy`) | list of `{ memberId, fullName, phone, plan, endOn, daysLeft }` | — |

`details`: `DATE_IN_FUTURE` carries `{ field: "dateOfBirth" | "joinedOn" }` (`dateOfBirth` is checked first). `START_BEFORE_JOIN`,
`PERIOD_OVERLAP`, `NOT_FOUND` carry none.

## Field rules (BR-REC-03, 45, 46, 49) — E17, E19; `phone` also E16
| Field | Rule (applied before storing; the cleaned value is what comes back) |
|---|---|
| `fullName` | trimmed, runs of whitespace collapsed to one space, then 2–80 characters: `" Surya  Pratap "` → `"Surya Pratap"` |
| `phone` | spaces, tabs, dashes `-` and brackets `( ) [ ]` removed; then optional leading `+` and 10–15 digits (else 400): `"+91 98450-12345"` → `"+919845012345"`. Stored in `phone`; `phone_digits` = digits only (`"919845012345"`) |
| `email` | trimmed; `""`, whitespace or `null` → `null`; otherwise must look like an email (400) |
| `notes` | trimmed; `""` or `null` → `null`; at most 1,000 characters after trimming (400) |
| `sex` | `male` or `female` (anything else 400); `objective` one of the four values or `null` |
| `dateOfBirth`, `joinedOn`, `startOn` | real calendar day `YYYY-MM-DD` (400 otherwise); not-in-future rules below |
Required on E17: `fullName, phone, dateOfBirth, sex, joinedOn, firstPeriod`. Two members may share a name or a phone (never refused, BR-REC-04).

## Behaviour a test can rely on
- **E16 filters.** `q` is trimmed; fewer than 2 characters → 400. It matches part of `fullName` or `email` (case-insensitive) and, when `q`
  without spaces, dashes, brackets and `+` is non-empty and all digits, part of `phone_digits`; `%` and `_` are plain characters.
  `phone` is cleaned like a member phone (fewer than 10 digits → 400) and matches members whose last 10 digits are the same, archived ones
  included under `status=any|archived`. `q`, `phone` and `status` combine with AND.
- **E16 `status`.** omitted → non-archived, any membership status; `active|expiring|expired` → non-archived whose latest period has that status
  (BR-REC-52, same cases as `membership.status`); `archived` → archived only; `any` → everyone. `q` + `archived` searches archived members only.
- **E16 order.** `sortBy` omitted or `name`, without `q`: `fullName` A–Z (case-insensitive), then `id`. With `q`: names starting with `q`
  first, then the rest, each A–Z, then `id` (BR-REC-56): `sur` → "Surya K", "Surya Pratap", "Asura M". `sortBy=joinedOn|lastAssessedOn`: that field in
  `sortDir`, ties by name then `id`; `lastAssessedOn` null (never assessed) last in both directions. `sortDir=desc` reverses the name order
  inside each group (prefix group still first). Item `membership` = latest period by `startOn`; `lastAssessedOn` = latest `assessments.assessed_on`.
- **Membership summary** (E16, E17–E21): from the latest period by start, `membershipStatus(latest, gymToday, leadDays)`; `daysLeft` = days from
  gym today to `endOn` (0 = ends today, negative = ended). A period not started yet is `active`.
- **E17.** One transaction: member + first period (`endOn = membershipEnd(plan, startOn)`) + audit. 400 `DATE_IN_FUTURE` when `dateOfBirth` or
  `joinedOn` is after gym today; 400 `START_BEFORE_JOIN` when `firstPeriod.startOn` < `joinedOn` (checked after the future check). `archivedAt`
  is `null`. A repeat with the same `Idempotency-Key` and body returns the first 201 and creates nothing.
- **E18.** `age = ageOn(dateOfBirth, gymToday)`; `periods` newest first (`startOn` desc); `membership.startOn` = latest period's start.
  Archived members are returned like any other.
- **E19.** Works on archived members and never changes `archivedAt`. `DATE_IN_FUTURE` for a sent `dateOfBirth` / `joinedOn` after gym today.
  `joinedOn` sent and after the `startOn` of any of the member's periods → 400 `START_BEFORE_JOIN` (spec clarification 2026-10-04). Sending the
  same values as stored → 200, no audit row. `phone` change is stored cleaned and `phone_digits` follows.
- **E20.** Sets `archivedAt` = now. Already archived → 200 unchanged (original `archivedAt` kept). **E21.** Clears `archivedAt`. Not archived → 200 unchanged.
  Both return the full member; a no-op writes no audit row.
- **E22.** `endOn = membershipEnd(plan, startOn)`. A future start is allowed. 400 `START_BEFORE_JOIN` when `startOn` < member's `joinedOn`; 409
  `PERIOD_OVERLAP` when [`startOn`, `endOn`] (both days included) shares at least one day with any other period of the member (a period that
  starts the day after another ends is fine). Order: 404 → 400 → 409. `memberRestored` = member was archived AND `startOn` ≤ gym today ≤
  `endOn`; then `archivedAt` is cleared in the same transaction; otherwise `false` and the member stays archived (old binder entry).
- **E23.** The period must belong to `:memberId`, else 404 (also for an unknown member). Plan and/or start change → `endOn` recalculated;
  `START_BEFORE_JOIN` and `PERIOD_OVERLAP` are checked against the member's OTHER periods (not itself). `memberRestored` as E22, evaluated on
  the saved values; it applies to every successful save, also one that changes nothing.
- **E24.** One row per non-archived member, from the latest period. `expiring`: status `expiring` (BR-REC-52), `endOn` asc, then `fullName`,
  then `id`. `expired`: latest period ended and `endOn` ≥ gym today − 30 days (ended exactly 30 days ago is listed, 31 is not), `endOn` desc, then
  `fullName`, then `id`; `daysLeft` negative. A member with a newer period that has not ended is in neither list.
- **Paging.** Lists answer `meta` with `totalPages = max(1, ceil(total / pageSize))`; a page past the end → empty `data`.

## Change log (`audit_log`, same transaction as the write; `session_id` = the caller's sign-in; one row per change; no change → no row)
| Action | Entity / `entity_id` | Written by | `before` / `after` (changed fields, API field names) |
|---|---|---|---|
| `member.create` | `member` / member id | E17 | `null` / the member's fields |
| `membership.create` | `membership_period` / period id | E17 (first period), E22 | `null` / `{ memberId, plan, startOn, endOn }` |
| `member.update` | `member` / member id | E19 | changed fields only |
| `member.archive` | `member` / member id | E20 | `{ archivedAt: null }` / `{ archivedAt }` |
| `member.restore` | `member` / member id | E21; E22, E23 when `memberRestored` | `{ archivedAt }` / `{ archivedAt: null }` |
| `membership.update` | `membership_period` / period id | E23 | changed fields (`endOn` too when it moves) |
E17 therefore writes 2 rows; E22 1 or 2; E23 0, 1 or 2.

## Importable units (`backend/src/types/members.types.ts`)
`fullNameSchema`, `phoneSchema`, `emailSchema`, `notesSchema`, `cleanPhone(raw)`, `phoneDigits(cleaned)`, `createMemberBodySchema`,
`updateMemberBodySchema`, `memberListQuerySchema`, `createPeriodBodySchema`, `updatePeriodBodySchema`, `endingMembershipsQuerySchema`.
`schema.parse()` returns the cleaned value (the same schemas run in the route guard and, again, in the controller).

## Assumptions accepted (coordinator, 2026-10-04)
1. E16 `q` + `phone` + `status` combine with AND; `%`/`_` in `q` are literal.
2. E16 `sortBy=joinedOn|lastAssessedOn`: ties by name then id; never-assessed last in both directions; `sortDir=desc` flips name order inside the groups.
3. E17 writes `member.create` and `membership.create` (two rows).
4. E23: a no-op save still applies the restore rule (BR-REC-58 "saving a period that covers today").
5. `fullName` collapses all whitespace runs (tabs, newlines), not only spaces.
6. No `details.field` for `START_BEFORE_JOIN` / `PERIOD_OVERLAP`: the form knows which field from the endpoint (E17/E22/E23 → start date, E19 → join date).
7. (backend build) E19 `START_BEFORE_JOIN` fires only when the sent `joinedOn` differs from the stored one (a sent-but-unchanged value is only date-checked): equivalent for data made through the API, and the S8 form sends every field.
8. (backend build) E16 name order uses `lower(full_name) COLLATE "C"` (word-by-word, ASCII); Stream 0's `members_name_active_idx` does not serve it (about 1,000 rows, sorted in memory).

## Admin app interfaces (coordinator, 2026-10-04 — tests and frontend-dev both use these names)
"Today" on the admin side = `gymToday(new Date(), <device time zone>)` from `lib/domain/dates.ts` (the gym and its phones are in one zone;
the server stays authoritative with `DATE_IN_FUTURE`). All functions below are pure (no React, no fetch, no clock): `today` is an argument.
| Module (`frontend/src/…`) | Export | Behaviour (rule) |
|---|---|---|
| `lib/validators/members.ts` | `normalizeName(raw: string): string` | trim + collapse whitespace runs to one space (BR-REC-45) |
| | `cleanPhone(raw: string): string \| null` | remove spaces, dashes, brackets; optional leading `+` then 10–15 digits → cleaned string, else `null` (BR-REC-46) |
| | `samePhone(a: string, b: string): boolean` | last 10 digits equal (after cleaning; `false` when either has < 10 digits) (BR-REC-46) |
| | `memberFormSchema(today: IsoDate)` | Zod for S6: `fullName, phone, dateOfBirth, sex, joinedOn, plan, startOn` required, `email, objective, notes` optional (`""` → `null`); issues on the field's path. Phone empty → "Enter a phone number" (BR-REC-134); date after `today` → issue on that field (BR-REC-48); `startOn` < `joinedOn` → issue on `startOn` "Membership can't start before the join date" (BR-REC-50); no plan → issue on `plan` (BR-REC-05, Q5: no default); name 2–80 after `normalizeName`, email shape, notes ≤ 1,000 (BR-REC-45); sex male/female (BR-REC-49). Parsed output = the E17 body (`firstPeriod{ plan, startOn }`, cleaned values) |
| | `memberEditFormSchema(today: IsoDate)` | the same member fields without plan/start (S8) |
| | `periodFormSchema` | `{ plan, startOn }` both required (S9) |
| `lib/members/membershipText.ts` | `PLAN_LABELS: Record<Plan, string>` | `Monthly`, `Quarterly`, `Half-annual`, `Annual` |
| | `membershipStatusText(m: { status, startOn?, endOn, daysLeft }, today)` → `{ label: 'Active' \| 'Ends soon' \| 'Ended', detail: string, tone: 'success' \| 'warning' \| 'danger' }` | expired → `Ended`, detail "Ended yesterday" / "Ended 5 days ago" (`formatRelativeDay`); expiring → `Ends soon`, "Ends today" / "Ends tomorrow" / "Ends in 7 days"; active and `startOn` after today → `Active`, "Starts 20 Oct" (`formatDay`); other active → `Active`, "241 days left" ("1 day left") (BR-REC-52, 59, spec membership-maths table) |
| | `memberListBadge(item: E16 item, today)` → `{ text, tone }` | archived → "Archived" (neutral); else expired "Ended" (danger), expiring "Ends in 4 days" / "Ends today" / "Ends tomorrow" (warning), active "Active" (success) (BR-REC-125, S5) |
| `lib/members/banner.ts` | `memberBannerText(member: { archivedAt: string \| null, membership: { status, endOn } }, today: IsoDate, timeZone: string): string \| null` | archived → "Archived 2 Jun 2026 · Membership ended 31 May 2026" (or "· Membership ends 31 Dec 2026" while running); not archived + ended → "Membership ended 31 May 2026"; otherwise `null`. Dates always with the year; `archivedAt` turned into a day in `timeZone` (BR-REC-172) |
| `lib/members/dateWarning.ts` | `birthDateWarning(dateOfBirth: IsoDate, today: IsoDate): string \| null` | age (`ageOn`) under 10 or over 100 → "Please check the date"; else `null`; never blocks (BR-REC-48) |
| `lib/members/renew.ts` | `renewDefaults(periods: { plan, startOn, endOn }[]): { plan, startOn }` | latest period by `startOn`: its plan, start = its `endOn` + 1 day (BR-REC-54) |
| | `renewRestoresMember(archived: boolean, period: { startOn, endOn }, today): boolean` | archived and `startOn` ≤ today ≤ `endOn` → S9 shows "Renewing brings {name} back to the list." (BR-REC-58) |
| `lib/members/duplicates.ts` | `duplicatePhoneMatches(items: E16 items, selfId?: string): { id: string, label: string }[]` | other members only (drops `selfId`); label = full name, archived ones as "Anita Rao (archived)"; the form shows "Also used by {labels joined by ', '} · Open" and keeps Save enabled (BR-REC-47) |
| `lib/members/search.ts` | `isSearchReady(q: string): boolean` | trimmed length ≥ 2 (BR-REC-07) |
- E16 duplicate check: on leaving the phone field with a valid phone → `GET /api/members?phone=<cleaned, + sent as %2B>&status=any&pageSize=10`.
- Lists ask `pageSize=25` with "Show more" (BR-REC-56, 57); Home sections ask `pageSize=5` and link "See all" to `/admin/memberships?tab=ending|ended`.
- Error codes map through `messageForCode` (`DATE_IN_FUTURE`, `START_BEFORE_JOIN`, `PERIOD_OVERLAP` already in the dictionary); `DATE_IN_FUTURE`
  goes under `details.field`, `START_BEFORE_JOIN` under the start date (E17/E22/E23) or join date (E19), `PERIOD_OVERLAP` under the start date.
