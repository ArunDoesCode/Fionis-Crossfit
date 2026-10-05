---
module: member-records/api-contract
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 2
frozen_on: 2026-10-05
owner: Arun
depends_on: [member-records/data-model]
---
# Member records · API contract (shared contract)

> The one endpoint list backend and frontend sessions share. **Stream 0** registers every route below
> (Zod schemas + route descriptors, handlers answer 501) and runs `contract:generate` + `types:api` before
> any other stream starts. Each stream then fills in only the endpoints it owns.

## Summary

REST under `/api` on the app's own web address, following `docs/standards/hono-backend-standards.md` (three
layers, Zod, envelope, pagination). 40 endpoints + the existing health check. Base URL (D-018, one server): the
browser calls the relative path `/api/…` (same origin, `NEXT_PUBLIC_API_URL=/api`); Next.js forwards it, and
server-side code calls the API's internal address `API_URL` on the same machine. Done = every row below is in
`.contracts/openapi.json` and behaves as its owner sub-spec says.

## Owns

Rules BR-REC-153…162 · the endpoint table · the error-code list · `.contracts/*`, `routes/end-points.ts`.

## Who can do what

| Action | Allowed |
|---|---|
| call any endpoint | the shared login (no roles, D-012) |
| call E01 login, E02 refresh, E03 logout, health | anyone |

## Rules

| ID | Rule | Example (given → then) | Check |
|---|---|---|---|
| BR-REC-153 | JSON in camelCase; calendar days as `YYYY-MM-DD` (gym days); moments as ISO UTC; durations in seconds; weights in kg. | Plank 2:02 is sent as `122` | Contract review; Zod date regex |
| BR-REC-154 | Success is `{ success: true, data }` (lists add `meta`); failure is `{ success: false, message, code, details? }` with a code from the list below; the app shows its own friendly text for every code. | Overlap → 409 `PERIOD_OVERLAP` → "This overlaps another membership" | Test per code; frontend dictionary has every code |
| BR-REC-155 | Lists use `page` (from 1) and `pageSize` (default 10, max 100; screens ask for 25), return `meta { page, pageSize, total, totalPages }`, sort only by whitelisted fields with the id as tie-breaker. | `pageSize=500` → 400 | Route test per list; CI route-drift test fails if a list route skips the shared pagination schema |
| BR-REC-156 | Create endpoints E17 and E22 need an `Idempotency-Key` (UUID); a repeat with the same key within 48 h returns the first answer; same key with a different body → 422. | Phone loses signal after Save, retries → one member, not two | Replay test |
| BR-REC-157 | Update bodies reject unknown fields and need at least one field. | `PATCH /members/1 {}` → 400 | Route test |
| BR-REC-158 | Every write runs in one transaction together with its change-log row (session, action, old → new). | Rename member → one `audit_log` row with before/after name | Service test |
| BR-REC-159 | Every route needs a sign-in except E01–E03 and health; route descriptors use auth `any-authenticated` (no permission keys yet). | No cookie → 401 `UNAUTHORIZED` | Route-drift test checks every descriptor's auth |
| BR-REC-160 | E07 settings and E09 catalog send an `ETag`; a matching `If-None-Match` gets 304 with no body. v2: also E16, E18, E24, E31, E35 (performance BR-REC-212). | Re-open entry form, nothing changed → 304 | Route test per listed endpoint |
| BR-REC-161 | Data responses carry `Cache-Control: private, no-store`, a `Server-Timing` header (`db`, `total`), and are gzip-compressed when over 1 KB. | Member list → `content-encoding: gzip` | Route test on headers |
| BR-REC-162 | A stream that must change a shape edits only its own `types/<feature>.types.ts`, then re-runs `contract:generate` and `types:api`; merge conflicts in generated files are solved by re-running both, never by hand. | Members adds a field → regenerated files in the same commit | CI `contract:check` |

## Endpoints

Errors column lists codes beyond `VALIDATION_ERROR` (400) and `UNAUTHORIZED` (401). Paths are kebab-case.

| ID | Method + path | Owner | Request (query / body) | Response `data` | Errors |
|---|---|---|---|---|---|
| E01 | POST `/api/auth/login` | auth | `{ username, password, remember }` | `{ username, remember, expiresAt }` + cookies | 401 `INVALID_CREDENTIALS`, 429 `LOGIN_LOCKED` (one lock for the whole login; `details.retryAfterSeconds` + `Retry-After` header), 429 `RATE_LIMITED` |
| E02 | POST `/api/auth/refresh` | auth | refresh cookie | `{ expiresAt }` + rotated cookies (works during a lock) | 401 `SESSION_EXPIRED` |
| E03 | POST `/api/auth/logout` | auth | — | `{}`; cookies cleared | — |
| E04 | POST `/api/auth/logout-all` | auth | — | `{ signedOut: n }`; cookies cleared | — |
| E05 | GET `/api/auth/me` | auth | — | `{ username, remember, expiresAt }` | — |
| E06 | POST `/api/auth/password` | auth | `{ currentPassword, newPassword }` | `{}` | 400 `CURRENT_PASSWORD_WRONG`, 429 `LOGIN_LOCKED` (as E01) |
| E07 | GET `/api/settings` | setup | — | `{ gymName, timezone, upcomingLeadDays, expiryLeadDays }` (ETag) | — |
| E08 | PATCH `/api/settings` | setup | any of the above | same as E07 | — |
| E09 | GET `/api/assessment-types` | setup | `includeInactive`, page, pageSize | list `{ id, name, intervalCount, intervalUnit, isActive, sortOrder, hasValues, metrics[{ id, name, unit, datatype, decimals, better, plausibleMin, plausibleMax, intervalCount, intervalUnit, tableGroup, tablePart, isActive, sortOrder, hasValues }] }` (ETag) | — |
| E10 | POST `/api/assessment-types` | setup | `{ name, intervalCount, intervalUnit }` | type | 409 `NAME_TAKEN` |
| E11 | PATCH `/api/assessment-types/:typeId` | setup | `{ name?, intervalCount?, intervalUnit?, isActive? }` | type | 404, 409 `NAME_TAKEN` |
| E12 | PUT `/api/assessment-types/order` | setup | `{ typeIds[] }` (all, once each) | `{}` | — |
| E13 | POST `/api/assessment-types/:typeId/metrics` | setup | metric fields (see E09) | metric | 404, 409 `NAME_TAKEN` |
| E14 | PATCH `/api/metrics/:metricId` | setup | any metric field + `isActive` | metric | 404, 409 `NAME_TAKEN`, 409 `METRIC_LOCKED` |
| E15 | PUT `/api/assessment-types/:typeId/metric-order` | setup | `{ metricIds[] }` | `{}` | 404 |
| E16 | GET `/api/members` | members | `q` (2–100 chars), `phone` (last-10-digit match), `status` (active·expiring·expired·archived·any; without it archived are left out), page, pageSize, `sortBy` (name·joinedOn·lastAssessedOn), sortDir | list `{ id, fullName, phone, email, lastAssessedOn, archivedAt, membership{ status, plan, endOn, daysLeft } }` (v2: `email`, BR-REC-205) | — |
| E17 | POST `/api/members` | members | member fields + `firstPeriod{ plan, startOn }`; header `Idempotency-Key` | member (as E18) | 400 `DATE_IN_FUTURE`, `START_BEFORE_JOIN`, `IDEMPOTENCY_KEY_MISSING`; 422 `IDEMPOTENCY_KEY_REUSED` |
| E18 | GET `/api/members/:memberId` | members | — | `{ id, fullName, phone, email, dateOfBirth, age, sex, joinedOn, objective, notes, archivedAt, membership{ status, plan, startOn, endOn, daysLeft }, periods[{ id, plan, startOn, endOn }] }` | 404 |
| E19 | PATCH `/api/members/:memberId` | members | any member field (archived members too) | member | 404, 400 `DATE_IN_FUTURE`, `START_BEFORE_JOIN` (join date after a membership start) |
| E20 | POST `/api/members/:memberId/archive` | members | — | member | 404 |
| E21 | POST `/api/members/:memberId/restore` | members | — | member | 404 |
| E22 | POST `/api/members/:memberId/periods` | members | `{ plan, startOn }`; header `Idempotency-Key` | period + `memberRestored` | 404, 409 `PERIOD_OVERLAP`, 400 `START_BEFORE_JOIN` |
| E23 | PATCH `/api/members/:memberId/periods/:periodId` | members | `{ plan?, startOn? }` | period + `memberRestored` | 404, 409 `PERIOD_OVERLAP`, 400 `START_BEFORE_JOIN` |
| E24 | GET `/api/memberships/ending` | members | `status` (expiring·expired), page, pageSize | list `{ memberId, fullName, phone, plan, endOn, daysLeft }` | — |
| E25 | GET `/api/members/:memberId/entry-form` | assessments | `typeId`, `date` | `{ member{ id, fullName, joinedOn }, type{ id, name }, existing{ assessmentId, isEstimated, values{ [metricId]: value } } \| null, metrics[{ id, name, unit, datatype, decimals, better, plausibleMin, plausibleMax, tableGroup, tablePart, previous{ value, on, isEstimated } \| null }] }` (v2: `tableGroup`, `tablePart`, BR-REC-217) | 404 |
| E26 | POST `/api/assessments` | assessments | `{ memberId, typeId, date, isEstimated, values[{ metricId, value \| null }] }` (max 60) | `{ assessmentId, created, saved, removed }` | 404, 400 `DATE_IN_FUTURE`, `NO_VALUES`, `METRIC_NOT_IN_TYPE` |
| E27 | GET `/api/assessments` | assessments | `memberId` (required), `typeId`, page, pageSize, sortDir (default desc) | list `{ id, typeId, typeName, date, isEstimated, valueCount }` | — |
| E28 | GET `/api/assessments/:assessmentId` | assessments | — | `{ id, memberId, typeId, typeName, date, isEstimated, values[{ metricId, name, unit, datatype, value }] }` | 404 |
| E29 | PATCH `/api/assessments/:assessmentId` | assessments | `{ date?, isEstimated? }` | as E28 | 404, 400 `DATE_IN_FUTURE`, 409 `ASSESSMENT_DATE_TAKEN` |
| E30 | DELETE `/api/assessments/:assessmentId` | assessments | — | `{ removed: n }` | 404 |
| E31 | GET `/api/due` | due-list | `status` (overdue·upcoming, required), `typeId`, page, pageSize | list `{ memberId, fullName, typeId, typeName, dueOn, daysOverdue, flagged, items[{ metricId, name }] }` | — |
| E32 | GET `/api/members/:memberId/due` | due-list | — | `[{ typeId, typeName, state (overdue·upcoming·ok), neverRecorded, nextDueOn, daysOverdue, flagged, snoozedUntil, items[] }]` | 404 |
| E33 | PUT `/api/members/:memberId/due-actions/:typeId` | due-list | `{ action: 'flag' }` or `{ action: 'snooze', until }` | `{ kind, setOn, untilOn }` | 404, 400 `SNOOZE_TOO_FAR` |
| E34 | DELETE `/api/members/:memberId/due-actions/:typeId` | due-list | — | `{}` | 404 |
| E35 | GET `/api/members/:memberId/report-card` | progress | — | `{ gymName, printedOn, member{ fullName, age, sex, plan, membershipStatus, joinedOn }, types[{ name, metrics[{ name, unit, datatype, better, first, latest, best, change, readings, points[≤12] }] }], segmental \| null }` | 404 |
| E36 | GET `/api/reports/progress` | progress | `metricId` (required), `joinedFrom`, `joinedTo` (YYYY-MM), `plan`, `sex`, `ageBand` (under20·20to29·30to39·40to49·50to59·60plus) | `{ metric, n, notCounted, avgChange, improved, noChange, worse }` | 404 |
| E37 | GET `/api/reports/leaderboard` | progress | `metricId`, `sex` (both required), page, pageSize | list `{ rank, memberId, fullName, value, on }` | 404, 400 `NO_DIRECTION` |
| E38 | GET `/api/reports/active-by-plan` | progress | — | `{ monthly, quarterly, halfAnnual, annual, total }` | — |
| E39 | GET `/api/exports/:file` | progress | `file` = members.csv · memberships.csv · measurements.csv | CSV stream (not JSON; documented exception to §7) | 404 |
| E40 | POST `/api/vitals` | performance | `{ name, value, rating, route }` | 204 | 429 `RATE_LIMITED` |

## Error codes

400 `VALIDATION_ERROR` `INVALID_JSON` `DATE_IN_FUTURE` `START_BEFORE_JOIN` `NO_VALUES` `METRIC_NOT_IN_TYPE`
`SNOOZE_TOO_FAR` `NO_DIRECTION` `CURRENT_PASSWORD_WRONG` `IDEMPOTENCY_KEY_MISSING` · 401 `UNAUTHORIZED`
`INVALID_CREDENTIALS` `SESSION_EXPIRED` · 403 `CSRF_ORIGIN` · 404 `NOT_FOUND` · 409 `NAME_TAKEN`
`METRIC_LOCKED` `PERIOD_OVERLAP` `ASSESSMENT_DATE_TAKEN` · 413 `PAYLOAD_TOO_LARGE` ·
422 `IDEMPOTENCY_KEY_REUSED` · 429 `LOGIN_LOCKED` `RATE_LIMITED` · 500 `INTERNAL_ERROR`.
A wrong current password is 400, never 401: a 401 makes the app try a refresh and sign out. Archived members
are editable, so no write is refused for being archived (members Q6 = B).

## Not now

Cursor/keyset pagination (performance.md), public API keys, webhooks, a change-log read endpoint.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | (developer) Default `pageSize` stays 10 per the standard, screens send 25? | **A** yes / B change the default to 25 | **A** → BR-REC-155 + CI route-drift check |

## Changelog
- 2026-10-05 v2 — re-frozen by the owner after the UX redesign review (#59); all open questions answered
- 2026-10-03 v0 — draft, split out of member-records v2
- 2026-10-03 v0 — answers folded: `MEMBER_ARCHIVED` removed (E19, E22, E23, E26, code list); E16 returns
  `archivedAt`; E01/E06 lock is global with `Retry-After`; E36 `ageBand` 10-year bands; base URL per D-018
- 2026-10-03 v0 — members Q7 = B: E22 (and E23) return `memberRestored` when a period covering today restores an archived member (BR-REC-58)
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-03 v1 — clarified during build (Stream 0, owner to confirm at merge): BR-REC-156 — only a successful (2xx)
  answer is stored and replayed; a request that fails frees its key, so a corrected retry runs normally; a duplicate
  that arrives while the first is still running waits up to 10 s for its answer, then gets 429 `RATE_LIMITED` (E17,
  E22); a claim older than 60 s without an answer is treated as abandoned. Status codes: 201 for creates E10, E13,
  E17, E22; E40 204; `VALIDATION_ERROR` carries `details.issues[{ path, message }]`; endpoints not built yet answer
  501 `NOT_IMPLEMENTED` (temporary, D-019). E39 CSV is streamed and not gzip-compressed by the API (BR-REC-147
  first byte; the HTTPS front may compress). No rule changed.
- 2026-10-04 v1 — clarified during build (Stream B; no rule changed): E19 can answer 400 `START_BEFORE_JOIN` (changed join date
  after a membership start); E16 `q` is 2–100 characters; E16 `sortBy` defaults to `name`.
- 2026-10-04 v1 — clarified during build (Stream F; no rule changed): E35 measurements carry `id` and `decimals`, types carry `id`, segmental groups are `{ name, unit, decimals }`; E36–E38 are computed live (progress v2).
- 2026-10-05 v2 — changed after freeze (UX redesign #59, additive only, no field removed): E16 items gain `email`
  (members BR-REC-205); E25 metrics gain `tableGroup`, `tablePart` (assessments BR-REC-217); BR-REC-160 ETag also on
  E16, E18, E24, E31, E35 (performance BR-REC-212)
