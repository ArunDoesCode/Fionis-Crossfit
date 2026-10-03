# member-records · Stream 0 contract (S1)

Input for S2 (red tests), S3 (build) and streams A–G. Endpoint table, rules and error semantics:
`docs/specs/member-records/api-contract.md` (v1). This file adds the exact schema names, the deviations
and the shared module signatures. Every handler answers **501 `NOT_IMPLEMENTED`** after auth and validation
(D-019); the 41 routes (40 + health) are in `backend/.contracts/{api-manifest,openapi}.json` and
`frontend/src/types/api.generated.ts`. Find a route by its summary prefix (`E17 …`) or `bun run contract:query "<METHOD /path>"`.

## Conventions (all endpoints)
- Success `{ success: true, data[, meta] }`; error `{ success: false, message, code, details? }`. Lists: query `page` ≥ 1,
  `pageSize` default 10 max 100; `meta { page, pageSize, total, totalPages }`; id is the tie-breaker.
- Order of checks per route: auth (401) → params / query / JSON body validation (400) → idempotency / ETag → handler.
  Unparsable JSON is 400 `INVALID_JSON`; a Zod failure is 400 `VALIDATION_ERROR` with `details.issues[{ path, message }]`.
- Calendar days `YYYY-MM-DD` (a real day, else 400), months `YYYY-MM`, moments ISO UTC, durations in seconds, weights kg.
- Ids are any 8-4-4-4-12 hex uuid (`z.guid()`): a well-formed unknown id is 404, a malformed one 400.
- Update bodies (E08, E11, E14, E19, E23, E29): every field optional, unknown keys rejected, ≥ 1 field (else 400); `null` clears nullable fields.
- Status codes: 201 for E10, E13, E17, E22; E40 is 204 (no body); everything else 200. Paths are keyed by resource in `END_POINTS`.

## Endpoints — schema names (files `backend/src/types/<owner>.types.ts`; `common.types.ts` = shared)
Auth: P = public (E01–E03 only), A = `{ type: 'any-authenticated' }`. Errors beyond 400 `VALIDATION_ERROR` and 401 `UNAUTHORIZED`.
| ID | Method + path | Auth | Request schema (params · query · body) | 200/201 `data` schema | Errors |
|---|---|---|---|---|---|
| E01 | POST /api/auth/login | P | `loginBodySchema` | `sessionInfoSchema` (+ cookies) | 400 INVALID_JSON · 401 INVALID_CREDENTIALS · 429 LOGIN_LOCKED, RATE_LIMITED |
| E02 | POST /api/auth/refresh | P | — (refresh cookie) | `refreshResultSchema` | 401 SESSION_EXPIRED · 429 RATE_LIMITED |
| E03 | POST /api/auth/logout | P | — | `{}` | — |
| E04 | POST /api/auth/logout-all | A | — | `logoutAllResultSchema` | — |
| E05 | GET /api/auth/me | A | — | `sessionInfoSchema` | — |
| E06 | POST /api/auth/password | A | `changePasswordBodySchema` | `{}` | 400 CURRENT_PASSWORD_WRONG · 429 LOGIN_LOCKED |
| E07 | GET /api/settings | A | — | `settingsSchema` (ETag) | — |
| E08 | PATCH /api/settings | A | `updateSettingsBodySchema` | `settingsSchema` | — |
| E09 | GET /api/assessment-types | A | `assessmentTypeListQuerySchema` (`includeInactive` = "true"\|"false") | list of `assessmentTypeSchema` (ETag) | — |
| E10 | POST /api/assessment-types | A | `createAssessmentTypeBodySchema` | 201 `assessmentTypeSchema` | 409 NAME_TAKEN |
| E11 | PATCH /api/assessment-types/:typeId | A | `typeIdParamsSchema` · `updateAssessmentTypeBodySchema` | `assessmentTypeSchema` | 404 · 409 NAME_TAKEN |
| E12 | PUT /api/assessment-types/order | A | `assessmentTypeOrderBodySchema` | `{}` | — |
| E13 | POST /api/assessment-types/:typeId/metrics | A | `typeIdParamsSchema` · `createMetricBodySchema` | 201 `metricSchema` | 404 · 409 NAME_TAKEN |
| E14 | PATCH /api/metrics/:metricId | A | `metricIdParamsSchema` · `updateMetricBodySchema` | `metricSchema` | 404 · 409 NAME_TAKEN, METRIC_LOCKED |
| E15 | PUT /api/assessment-types/:typeId/metric-order | A | `typeIdParamsSchema` · `metricOrderBodySchema` | `{}` | 404 |
| E16 | GET /api/members | A | `memberListQuerySchema` (`MEMBER_SORT_FIELDS`) | list of `memberListItemSchema` | — |
| E17 | POST /api/members | A | `createMemberBodySchema` + header `Idempotency-Key` | 201 `memberDetailSchema` | 400 DATE_IN_FUTURE, START_BEFORE_JOIN, IDEMPOTENCY_KEY_MISSING · 422 IDEMPOTENCY_KEY_REUSED · 429 RATE_LIMITED |
| E18 | GET /api/members/:memberId | A | `memberIdParamsSchema` | `memberDetailSchema` | 404 |
| E19 | PATCH /api/members/:memberId | A | `memberIdParamsSchema` · `updateMemberBodySchema` | `memberDetailSchema` | 404 · 400 DATE_IN_FUTURE |
| E20 / E21 | POST /api/members/:memberId/archive · /restore | A | `memberIdParamsSchema` | `memberDetailSchema` | 404 |
| E22 | POST /api/members/:memberId/periods | A | `memberIdParamsSchema` · `createPeriodBodySchema` + header `Idempotency-Key` | 201 `periodResultSchema` | 404 · 409 PERIOD_OVERLAP · 400 START_BEFORE_JOIN, IDEMPOTENCY_KEY_MISSING · 422 IDEMPOTENCY_KEY_REUSED · 429 RATE_LIMITED |
| E23 | PATCH /api/members/:memberId/periods/:periodId | A | `periodParamsSchema` · `updatePeriodBodySchema` | `periodResultSchema` | 404 · 409 PERIOD_OVERLAP · 400 START_BEFORE_JOIN |
| E24 | GET /api/memberships/ending | A | `endingMembershipsQuerySchema` (`status` required) | list of `endingMembershipItemSchema` | — |
| E25 | GET /api/members/:memberId/entry-form | A | `memberIdParamsSchema` · `entryFormQuerySchema` | `entryFormSchema` | 404 |
| E26 | POST /api/assessments | A | `saveAssessmentBodySchema` (`values` ≤ 60; empty/all-null is NOT a 400 shape error) | `saveAssessmentResultSchema` (always 200) | 404 · 400 DATE_IN_FUTURE, NO_VALUES, METRIC_NOT_IN_TYPE |
| E27 | GET /api/assessments | A | `assessmentListQuerySchema` (`memberId` required, `sortDir` default desc) | list of `assessmentListItemSchema` | — |
| E28 | GET /api/assessments/:assessmentId | A | `assessmentIdParamsSchema` | `assessmentDetailSchema` | 404 |
| E29 | PATCH /api/assessments/:assessmentId | A | `assessmentIdParamsSchema` · `updateAssessmentBodySchema` | `assessmentDetailSchema` | 404 · 400 DATE_IN_FUTURE · 409 ASSESSMENT_DATE_TAKEN |
| E30 | DELETE /api/assessments/:assessmentId | A | `assessmentIdParamsSchema` | `deleteAssessmentResultSchema` | 404 |
| E31 | GET /api/due | A | `dueListQuerySchema` (`status` required) | list of `dueListItemSchema` | — |
| E32 | GET /api/members/:memberId/due | A | `memberIdParamsSchema` | array of `memberDueItemSchema` (not paginated) | 404 |
| E33 | PUT /api/members/:memberId/due-actions/:typeId | A | `dueActionParamsSchema` · `dueActionBodySchema` (`{action:'flag'}` \| `{action:'snooze',until}`) | `dueActionResultSchema` | 404 · 400 SNOOZE_TOO_FAR |
| E34 | DELETE /api/members/:memberId/due-actions/:typeId | A | `dueActionParamsSchema` | `{}` | 404 |
| E35 | GET /api/members/:memberId/report-card | A | `memberIdParamsSchema` | `reportCardSchema` | 404 |
| E36 | GET /api/reports/progress | A | `progressQuerySchema` | `progressStatsSchema` | 404 |
| E37 | GET /api/reports/leaderboard | A | `leaderboardQuerySchema` | list of `leaderboardItemSchema` | 404 · 400 NO_DIRECTION |
| E38 | GET /api/reports/active-by-plan | A | — | `activeByPlanSchema` | — |
| E39 | GET /api/exports/:file | A | `exportParamsSchema` (`file` plain string) | CSV text, `text/csv`, not JSON (200 documented as `string`) | 404 (unknown `file`, check vs `EXPORT_FILES`) |
| E40 | POST /api/vitals | A | `vitalBodySchema` | 204, no body | 429 RATE_LIMITED |

## Assumptions and deviations from api-contract.md (decided in S1; each stream may refine its own types file, BR-REC-162)
1. Endpoint table gaps filled by reading the BRs: E02 also 429 RATE_LIMITED (BR-REC-38); E26 is always 200 (the `created` flag
   says new/edit); creates E10/E13/E17/E22 are 201 (BR-REC-04 says 201 for E17); E24 `status` is required (omission was undefined).
2. E32 is a plain array (bounded by the catalog), so it carries no `pagination` metadata. All other lists do.
3. Inner shapes the spec table does not spell out (BR-REC-106…108, 112): E35 `first/latest/best` and `points` are `{ value, on, isEstimated }`,
   `change` = latest − first or null (< 2 readings), `best` null for "No direction", `segmental { on, isEstimated, groups[], rows[{ part, values{group→n|null} }] }`;
   E36 `metric { id, name, unit, datatype, decimals, better }`, `avgChange` null at n = 0; E40 `name` ∈ LCP|INP|CLS, `rating` ∈ good|needs-improvement|poor.
4. `daysOverdue` (E31/E32) and `daysLeft` are integers; negative `daysLeft` = ended. E32 `nextDueOn` is never null.
5. E01 `remember` is required (no server default). Field-level rules (lengths, phone digits, snooze ≤ 90 days, ranges, both-or-neither pairs) are NOT in the schemas: owner streams add them.
6. DB checks beyond the data-model DDL lines: `metrics_plausible_range_check` (min < max), `metrics_interval_pair_check`, `metrics_table_pair_check`
   (both-or-neither, from the DDL comments), `due_overrides_snooze_max_check` (until ≤ set_on + 90). NOT enforced: metrics "duration → 0 decimals" (comment only).
7. `Idempotency-Key` and ETag are documented in route `notes` (the registry has no header field). 204 and CSV appear as `unknown` / `string` in OpenAPI.
8. `ETag` with `Cache-Control: private, no-store`: the browser will not revalidate by itself; the app's fetch wrapper must send `If-None-Match`.

## Error codes (`ERROR_CODES` in `lib/errors.ts`; the frontend dictionary needs a message for each)
400 VALIDATION_ERROR INVALID_JSON DATE_IN_FUTURE START_BEFORE_JOIN NO_VALUES METRIC_NOT_IN_TYPE SNOOZE_TOO_FAR NO_DIRECTION CURRENT_PASSWORD_WRONG IDEMPOTENCY_KEY_MISSING ·
401 UNAUTHORIZED INVALID_CREDENTIALS SESSION_EXPIRED · 403 CSRF_ORIGIN · 404 NOT_FOUND · 409 NAME_TAKEN METRIC_LOCKED PERIOD_OVERLAP ASSESSMENT_DATE_TAKEN ·
413 PAYLOAD_TOO_LARGE · 422 IDEMPOTENCY_KEY_REUSED · 429 LOGIN_LOCKED RATE_LIMITED · 500 INTERNAL_ERROR · **501 NOT_IMPLEMENTED** (`NotImplementedError`, placeholder).

## Enums (`backend/src/lib/enums.ts`: `X` array + `Type` union; Drizzle checks via `inList` and Zod use the same arrays)
`PLANS` monthly·quarterly·half_annual·annual · `SEXES` male·female · `OBJECTIVES` fat_loss·strength·general_fitness·other · `DATATYPES` number·duration ·
`BETTER_DIRECTIONS` higher·lower·none · `INTERVAL_UNITS` week·month · `TABLE_PARTS` whole_body·arms·trunk·legs · `DUE_OVERRIDE_KINDS` flag·snooze ·
`SESSION_REVOKE_REASONS` logout·logout_all·password_change·reuse·reset·expired · `MEMBERSHIP_STATUSES` active·expiring·expired (derived, no column).
API-only unions: `MEMBER_STATUS_FILTERS`, `MEMBER_SORT_FIELDS`, `ENDING_STATUSES` (members) · `DUE_LIST_STATUSES`, `DUE_STATES` (due) · `AGE_BANDS`, `EXPORT_FILES` (progress) · `VITAL_NAMES` (vitals).

## Drizzle tables (`backend/src/db/schemas/*`, barrel `index.ts`; `db:push` / `db:test:prepare` verified on empty DBs, second push = "No changes detected")
`auditLog`, `idempotencyKeys` (infrastructure.ts) · `appAccount`, `authSessions`, `loginAttempts` (auth.ts) · `gymSettings`, `assessmentTypes`, `metrics` (setup.ts) ·
`members`, `membershipPeriods` (members.ts) · `assessments`, `measurements` (assessments.ts) · `dueOverrides` (due.ts). Column keys are camelCase of the snake_case names;
`date` columns are `mode: "string"` (`YYYY-MM-DD`), `timestamptz` are `Date`, `numeric(12,3)` is `mode: "number"`. Check names `<table>_<column>_check`; one-row tables use `*_single_row_check` and the unique index `app_account_one_row`.

## Global middleware order (`createApp`; target, wired in S3 — CORS is removed there)
1. request log (exists) → 2. `serverTiming()` → 3. `dataResponseHeaders()` (no-store + gzip > 1 KB) → 4. `bodyLimit` 1 MiB (413) →
5. `originCheck()` on POST/PUT/PATCH/DELETE (403 CSRF_ORIGIN; applies to E01–E03 too) → 6. router: `requireAuth` → `validate` → route extras → handler → `onError`/`notFound`.
Route extras already wired as pass-throughs in `routes/{members,setup}.ts`: `idempotency()` on E17 and E22; `etagMiddleware()` on E07 and E09. `routes/mount-route.ts`
(`routeMounter`) registers each descriptor and derives guard + validation from it; a stream replaces `notImplemented` with its controller, nothing else.

## Stubs for S2/S3 (signature; "pass-through" = already harmless, "throws" = `new Error("not implemented")`)
| Module | Export | Meaning |
|---|---|---|
| `lib/idempotency.ts` | `idempotency(): MiddlewareHandler` (pass) · `pruneIdempotencyKeys(now: Date): Promise<number>` (throws) · `IDEMPOTENCY_TTL_HOURS = 48` | BR-REC-156 replay / 422 / 400; prune rows older than 48 h |
| `lib/origin-check.ts` | `originCheck(allowedOrigins = [env.APP_ORIGIN])` (pass) · `WRITE_METHODS` | BR-REC-37; a write with no/other `Origin` → 403 CSRF_ORIGIN |
| `lib/etag.ts` | `etagMiddleware()` (pass) | BR-REC-160 ETag + 304 on matching `If-None-Match` |
| `lib/server-timing.ts` | `serverTiming()` (pass) · `measureDb<T>(query: () => Promise<T>)` (pass, just runs it) · `formatServerTiming({dbMs,totalMs}): string` (throws) | `Server-Timing: db;dur=…, total;dur=…`; `measureDb` adds a call's time to the request's `db` |
| `lib/response-headers.ts` | `dataResponseHeaders()` (pass) · `COMPRESSION_THRESHOLD_BYTES = 1024` | `Cache-Control: private, no-store` + gzip when over 1 KB |
| `lib/audit.ts` | `writeAudit(executor: Tx \| Db, entry: AuditEntry): Promise<void>` · `diffChangedFields(before, after)` · `AUDIT_REDACTED_FIELD_PATTERN` (all throw) | one `audit_log` row inside the caller's transaction; changed fields only as `{ before, after }` or null; never password/token/secret/hash fields |
| `lib/domain/dates.ts` | `IsoDate` (= string) · `isIsoDate` · `addDays` · `addMonths` · `addInterval(date, count, unit)` · `daysBetween(from, to)` (+ when `to` later) · `gymToday(now, timeZone)` · `ageOn(dob, on)` (all throw) | BR-REC-93/94; month add clamps to month end, week = 7 days |
| `lib/domain/duration.ts` | `parseDuration(text): number\|null` · `formatDuration(s)` (m:ss, ≥ 1 h h:mm:ss) · `durationFromParts(min 0–599, sec 0–59): number\|null` · `durationToParts(s): {minutes, seconds}` (all throw) | BR-REC-12/75 |
| `lib/domain/membership.ts` | `PLAN_MONTHS` (real constant) · `membershipEnd(plan, startOn)` · `membershipStatus(latest\|null, today, leadDays): {status, daysLeft}\|null` (throw) | BR-REC-51/52; `daysLeft` = days from today to end (0 = today, < 0 ended) |
| `scripts/seed.ts` | `seed(): Promise<SeedSummary>` (throws) | settings + the one `login_attempts` row + catalog on empty catalog only (BR-REC-68); `bun run seed` |
| `scripts/seed-perf.ts` | `seedPerf(options?: PerfSeedOptions): Promise<PerfSeedSummary>` · `assertLocalDatabase(url): void` (throw) | BR-REC-170; guard = local host + not production; `bun run seed:perf` |
Other new shared code: `lib/validate.ts` (`validate(target, schema)`), `lib/enums.ts`, `types/common.types.ts` (`uuidSchema`, `isoDateSchema`, `isoMonthSchema`, `isoDateTimeSchema`,
`paginationQuerySchema`, `sortedListQuerySchema(fields, dir?)`, `updateBodySchema(shape)`, `emptyDataSchema`, `IDEMPOTENCY_KEY_HEADER`), `lib/response-schemas.ts` (`errorResponse(codes)`, `badRequestResponse`, …).

## How tests authenticate and write
`const sid = crypto.randomUUID(); const token = await signAccessToken({ userId, userName, permissions: [], sid });` then header `Cookie: access_token=<token>`
(or `Authorization: Bearer <token>`). A token without a valid `sid` → 401. Cookie name constant: `ACCESS_COOKIE` (`lib/auth-middleware.ts`). `Actor` has `{ id, name, permissions, sessionId }`.
Once S3 mounts the Origin check every POST/PUT/PATCH/DELETE test sends `Origin: <process.env.APP_ORIGIN>` (E01–E03 and E40 too). Today nothing enforces it.
Tests run on `gym_test` (preload swaps `DATABASE_URL`); parallel worktrees must use their own `DATABASE_URL_TEST` database name.

## Golden fixtures (written by test-writer only, byte-identical in `backend/tests/fixtures/` and `frontend/tests/fixtures/`)
`duration-cases.json`: `{ "parse": [{ "text", "seconds" }], "format": [{ "seconds", "text" }], "fromParts": [{ "minutes", "seconds", "total" }], "toParts": [{ "total", "minutes", "seconds" }] }`
(`seconds`/`total` is `null` for invalid input / out of range).
`membership-end-cases.json`: `{ "end": [{ "plan", "startOn", "endOn" }], "status": [{ "latest": { "startOn", "endOn" } | null, "today", "leadDays", "expected": { "status", "daysLeft" } | null }] }`
(dates `YYYY-MM-DD`, `plan` ∈ `PLANS`, `status` ∈ `MEMBERSHIP_STATUSES`). Add both pairs to `scripts/check-fixtures.sh`.

## Frontend shared modules (S1 stubs in `frontend/src/lib/`; S3 implements; coordinator-defined interface)
| Module | Export | Meaning |
|---|---|---|
| `lib/domain/{dates,duration,membership}.ts` | same names and signatures as the backend modules above (`IsoDate` = string; `Plan` union; `PLAN_MONTHS` real) | BR-REC-12, 51, 52, 94 — same golden fixtures as the backend |
| `lib/format.ts` | `formatDay(date, today)` "3 Oct 2026" (year left out in today's year) · `formatRelativeDay(date, today)` "today" / "tomorrow" / "yesterday" / "in 3 days" / "2 days ago" · `formatValue(value, decimals 0\|1\|2, unit)` "95.5 kg", "24.0 %" · `formatPhone(phone)` "98450 12345" | BR-REC-127 |
| `lib/messages/errors.ts` | `ERROR_CODES` (the list above incl. `NOT_IMPLEMENTED`) · `ErrorCode` · `ERROR_MESSAGES: Partial<Record<ErrorCode, string>>` · `messageForCode(code: string \| undefined): string` (unknown/undefined → a generic plain sentence) | BR-REC-128, 154: one plain sentence per code |
| `lib/api/routes.ts` | `API_ROUTES`: nested `as const` object whose leaves are path templates relative to `/api`, with `:param` placeholders spelled exactly as in `backend/.contracts/api-manifest.json` (e.g. `'/members/:memberId'`) | S3: one leaf per manifest route (E01–E40 + health) |

## Notes for streams (from the Stream 0 review)
- Writes need a matching `Origin` (BR-REC-37) — server-side calls too. `serverApi` sends none today, so a server-side
  write (e.g. auth's page-guard refresh E02, BR-REC-40) gets 403 `CSRF_ORIGIN` until the auth stream decides how
  (e.g. `serverApi` sends `Origin: <app origin>` on non-GET). Owner: Stream A.
- Middleware stubs above are now built (S3); idempotency details: api-contract.md changelog (BR-REC-156 clarified).
