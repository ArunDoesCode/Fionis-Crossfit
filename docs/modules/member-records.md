---
module: member-records
spec: docs/specs/member-records.md   # v2 index; sub-specs in docs/specs/member-records/
last_verified_commit: 16dd568
last_verified_on: 2026-10-04
depends_on: []
---

# Member records — as-built map

> What the code **is** (the specs say what it **should be**). Read before touching any member-records stream.

## Summary
Stream 0 (Foundation) is built (merge point M0): all 13 tables, all 40 endpoints registered with Zod +
descriptors (handlers answer 501 `NOT_IMPLEMENTED` until their stream builds them), shared middleware, change
log, domain maths in both packages, seeds, and the mobile-first admin shell with empty slots. Streams A–F fill
their own files (ownership: spec index → "Shared files"). Working copies per stream: D-017. Hosting: D-018.
Stream 0 choices: D-019. Run notes: `.pipeline/member-records-foundation/` (plan, contract, findings, screens, checklist).
Stream A (auth) is built: E01–E06, `bootstrap-admin`, page guard, Login (S1), Account (S17); choices D-020; run notes
`.pipeline/member-records-auth/` (plan, contract incl. admin interfaces, findings, screens, checklist).
Stream B (members) is built: E16–E24, S4–S9, Home search + membership sections, member header + membership block, archived/ended
banner; choices D-021; run notes `.pipeline/member-records-members/` (plan, contract incl. admin interfaces, findings, screens, checklist).
Stream C (setup) is built: E07–E15, `roundMetricValue`, S14 Settings hub, S15 Assessment setup, S16 Reminders & gym; run notes
`.pipeline/member-records-setup/` (plan, contract incl. admin interfaces, findings, screens, checklist); spec setup.md v2 (C1–C13).
Stream E (due-list) is built: E31–E34, pure engine `computeDue`, Home Overdue / Due soon sections, S3 `/admin/due`, row sheet, member "Assessments" block; choices D-022;
run notes `.pipeline/member-records-due-list/` (plan, contract incl. admin interfaces, screens, checklist); spec due-list.md v2 (C1–C13).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| app factory | `backend/src/app.ts` | `createApp`: log → `serverTiming` → `dataResponseHeaders` → `bodyLimit` → `originCheck` → routers (no CORS) |
| routes | `backend/src/routes/{auth,setup,members,assessments,due,progress,vitals}.ts`, `mount-route.ts`, `end-points.ts` | `routeMounter` registers the descriptor and derives guard + validation from it; replace `notImplemented` only |
| types | `backend/src/types/<owner>.types.ts`, `common.types.ts` | schema names per endpoint: `.pipeline/member-records-foundation/contract.md` |
| enums | `backend/src/lib/enums.ts` | one `as const` array + union per enum-like column (DB checks and Zod) |
| schema | `backend/src/db/schemas/{infrastructure,auth,setup,members,assessments,due}.ts`, `helpers.ts` | `auditLog`, `idempotencyKeys`, `appAccount`, `authSessions`, `loginAttempts`, `gymSettings`, `assessmentTypes`, `metrics`, `members`, `membershipPeriods`, `assessments`, `measurements`, `dueOverrides` |
| db client | `backend/src/db/client.ts` | `Db`, `Tx`; patches Drizzle `QueryPromise.then` so every query feeds Server-Timing `db` |
| middleware | `backend/src/lib/{origin-check,idempotency,etag,server-timing,response-headers,validate}.ts` | `originCheck`, `idempotency` (+ `pruneIdempotencyKeys`), `etagMiddleware`, `serverTiming`/`measureDb`, `dataResponseHeaders` |
| change log | `backend/src/lib/audit.ts` | `writeAudit(tx, entry)`, `diffChangedFields` (redacts /password|token|secret|hash/i) |
| domain | `backend/src/lib/domain/{dates,duration,membership}.ts` = `frontend/src/lib/domain/*` | `addMonths`, `addInterval`, `daysBetween`, `gymToday`, `ageOn`, `parseDuration`, `formatDuration`, `durationFromParts/ToParts`, `membershipEnd`, `membershipStatus` |
| seeds | `backend/scripts/{seed,seed-perf,db-reset}.ts` | `seed()` (`CATALOG` const), `seedPerf({ memberCount })`, `assertLocalDatabase` |
| frontend http | `frontend/src/lib/api/{client,server,routes,errors}.ts` | `api` (ETag cache, refresh once), `serverApi`, `API_ROUTES` (all 41) + `apiPath` |
| frontend shared | `frontend/src/lib/{format.ts,messages/errors.ts,messages/words.ts,hooks/*}` | `formatDay`, `formatRelativeDay`, `formatValue`, `formatPhone`, `messageForCode`, `UI_TEXT` |
| shell | `frontend/src/components/shells/*`, `app/(app)/admin/layout.tsx` | `AppShell`, `BottomTabBar` (< 1024 px), `SideNav`, `SignOutButton` (slot for A) |
| shared UI | `frontend/src/components/common/*` | PageHeader (+ActionBar), Section, ListRow, StatusBadge, ChipList, ResponsiveSheet, ConfirmSheet, NumberField, DurationField, DateField, ChoiceChips, Sparkline, OfflineBanner, Skeletons, EmptyState, ErrorState |
| auth (A) backend | `backend/src/{routes,controller,service,repository}/auth*`, `service/authLock.ts` (pure lock rules), `scripts/bootstrap-admin.ts` | `authService.{login,refresh,logout,logoutAll,me,changePassword,createAccount,resetPassword,unlock}(…, meta, now)`, `authRepository.{lockForUpdate,rotateSession,touchSession,…}` |
| auth (A) libs | `backend/src/lib/{token,http,auth-middleware,rate-limiter}.ts` | `signAccessToken` (iss/aud pinned), `generateRefreshToken`, `hashRefreshToken` (HMAC hex); `setAccessCookie`, `setRefreshCookie(c, token, remember)`, `clearAuthCookies`, `clientAddress` (`TRUST_PROXY_HOPS`), `deviceLabel`; `readAccessToken`; `rateLimiter({windowMs,max})` |
| auth (A) admin | `frontend/src/proxy.ts`, `lib/auth/{safeNextPath,loginError,loginUrl,signOut}.ts`, `lib/validators/auth.ts`, `lib/api/auth/{fetchers,queries}.ts`, `components/{views,pages}/auth/*`, `app/(auth)/login`, `app/(app)/admin/settings/account` | page guard + server E02; `useMe`, `useLogin`, `useChangePassword`, `useSignOut(All)`; `authKeys.me()`; global 401 handler in `lib/queryClient.ts` |
| members (B) backend | `backend/src/{controller,service,repository}/{members,memberships}*`, `service/{membersView,membershipsRules}.ts`, `repository/membersSql.ts` | `membersService.{list,create,get,update,archive,restore,restoreInTransaction}`, `membershipsService.{add,update,ending}`; pure `periodsOverlap`, `coversDay`, `restoresMember`, `RECENTLY_ENDED_DAYS`; `statusCondition()` (SQL twin of `membershipStatus`); field rules + `cleanPhone`/`phoneDigits` in `types/members.types.ts` |
| members (B) admin | `frontend/src/{lib/validators/members.ts,lib/members/**,lib/api/members/**,components/{views,pages}/members/**}`, routes `app/(app)/admin/{members,memberships}/**` | pure: `memberFormSchema`, `cleanPhone`, `samePhone`, `membershipStatusText`, `memberListBadge`, `memberBannerText`, `renewDefaults`, `renewRestoresMember`, `duplicatePhoneMatches`; hooks `useMemberList` (25/page), `useMember`, `useSavePeriod`, `useEndingList/Preview`; keys `memberKeys` `['members']`, `membershipKeys` `['memberships']`; `PeriodSheetLazy` + `useLazySheet`; `clampSearchText` (E16 `q` ≤ 100) |
| slots | Home `components/pages/home/{HomeSearch,MembershipSections}` (B, filled), `DueSections` (E); Member `pages/member/{MemberHeader,MembershipBlock}` (B, filled), `DueBlock` (E), `RecentBlock` (D) | each owner replaces its whole file; member slots take `{ memberId }` |
| setup (C) backend | `backend/src/{routes/setup,controller/setupController,service/setupService,service/setupRules,repository/setupRepository}.ts` | `setupService.{getSettings,updateSettings,listCatalog,createType,updateType,reorderTypes,createMetric,updateMetric,reorderMetrics}`; pure rules `setupRules.ts`: `newMetricFields`, `editedMetricFields` (C3), `metricIssues` (C8), `changesKindOrUnit` (C4), `listsEveryIdOnce` (C7) |
| domain (C) | `backend/src/lib/domain/metric-value.ts` | `roundMetricValue(value, datatype, decimals)` — half away from zero on the decimal digits; the assessments stream (D) calls it when saving (BR-REC-76) |
| setup (C) admin | `frontend/src/{lib/validators/setup.ts,lib/setup/{describe,text,form,timezones}.ts,lib/api/setup/{fetchers,queries}.ts,components/{views,pages}/setup/*}`, `app/(app)/admin/settings/{page.tsx,general,assessments/[typeId]}` | `setupKeys`, `settingsQueryOptions`/`assessmentTypesQueryOptions` (`staleTime: 0`, catalog `pageSize=100`), `SetupSheet` (edit sheet + confirm step), `ThemeChoice` (System/Light/Dark), `SettingsHubView`, `GymSettingsView`, `AssessmentSetupView`, `AssessmentDetailView` |
| due (E) backend | `backend/src/{routes/due,controller/dueController,service/dueService,repository/dueRepository}.ts` | `dueService.{list,memberItems,setAction,clearAction}`; `dueRepository.{listMembers,listCatalog,listLastMeasured,listOverrides,typeExists,findOverride,upsertOverride,deleteOverride}` |
| due (E) domain | `backend/src/lib/domain/due.ts` (pure, no I/O; `today` and lead days are arguments) | `computeDue`, `dueListRows` (sorted, not paged), `memberDueItems`, `isListedInDueList` (C3: archived / Ended left out) |
| due (E) admin | `frontend/src/lib/due/{status,remind,links,searchParams,optimistic,target,text,types,useDueSheet}.ts`, `lib/api/due/{fetchers,queries}.ts`, `components/pages/due/*`, `components/views/due/DueListView.tsx`, `app/(app)/admin/due/page.tsx` | pure: `dueRowStatus`, `memberDueStatus`, `remindChoices`, `remindDateIssue`, `recordHref`, `dueListHref`, `sortDueRows`, `applyDueChange`, `applyMemberDueChange`; `dueKeys` (`['due']`), hooks `useDuePreview` (5 rows), `useDueList` (25/page, infinite), `useMemberDue`, `useSetDueAction`, `useClearDueAction` (one mutation key `['due-write']`); `DueSheetLazy` (one `import()`), `DueSection` (Home), `DueList`/`DueListPanel` (S3), `MemberDueRow` |
| slots | Home `components/pages/home/{HomeSearch,MembershipSections,DueSections}` (B, E: filled); Member `pages/member/{MemberHeader,MembershipBlock,DueBlock}` (B, E: filled), `RecentBlock` (D) | each owner replaces its whole file; member slots take `{ memberId }` |

## Data model / API
Tables: data-model.md v2 (no hand SQL, no extensions, no exclusion constraint — overlap is the BR-REC-09 service
check). Endpoints: api-contract.md + exact schema names in `.pipeline/member-records-foundation/contract.md`.
Dev/test/CI use `db:push`; production gets a generated migration at deploy (Stream G).

## Commands
`bun run seed` (idempotent: settings + `login_attempts` row + catalog only when empty) · `bun run seed:perf`
(local only, adds 1,000 members; run `db:reset` first) · `bun run db:reset` (push + seed) · `SEED_PERF_FULL=1 bun test tests/scripts/seed-perf.test.ts` (full 1,000 run; default tests use 100).

## Starting a stream session (D-017)
Remaining streams, in order: setup (M2; members built) → assessments, due-list, progress (M3) → performance (M4). Each is
one new desktop-app session on this repo with the worktree option on and Opus, started from fresh `main` once the
previous merge point is merged (check `docs/specs/member-records/` exists in the new session).
Before: Postgres is started once (`docker compose up -d` in `backend/`, never from a second worktree); create
`backend/.env` and `frontend/.env.local` from the `.env.example` files (worktrees do not copy them); give the worktree
its own `DATABASE_URL_TEST` database name and, for a dev server, its own `PORT`.
First message (replace `<name>`: `setup`, `members`, `assessments`, `due-list`, `progress`, `performance`):
```
/feature member-records/<name> — per docs/specs/member-records.md → "Parallel build plan". D-017: this session's own branch and worktree are the working branch. Own only the files listed for your stream under "Shared files"; everything else is read-only — if you need a shared change, stop and tell me. Stop at hand-over; I will ask for the PR.
```
When it says ready, answer "open the PR". After each merge, the other open sessions sync with `main`.

## Invariants & gotchas
- Every write needs a matching `Origin` (403 `CSRF_ORIGIN`), server-side calls too; a POST with no Origin to an unknown path is 403, not 404.
- gzip only for JSON over 1 KB with a known body; CSV/streams pass through. Never `res.clone()` and return the original; `c.res = x` copies old headers onto the new response.
- `app.request()` sends no `Accept-Encoding`: test compression on a real `Bun.serve` (`tests/lib/response-headers-server.test.ts`).
- Idempotency: `tryClaim` (insert … on conflict do nothing) → SELECT-only polling (≤ 10 s, then 429) → handler; only 2xx stored; a failed request frees its key; a store failure keeps the claim. Answer is not stored in the handler's transaction (small crash window; #3).
- ETag + `no-store`: the browser never revalidates by itself; `lib/api/client.ts` sends `If-None-Match` from its own cache. `etagMiddleware` tags 2xx GETs only; gzip weakens it to `W/`.
- Server-Timing `db`: automatic for Drizzle queries; raw `queryClient` calls, BEGIN/COMMIT and `db.$count()` are not counted; it is a sum, so parallel queries can exceed `total` (#5). Repositories never call `measureDb`.
- After `next()` a handler error does not throw (Hono sets `c.error`); route middleware checks status, not try/catch.
- `z.guid()` for ids (well-formed unknown id → 404). `.partial()` keeps strictness; the "≥ 1 field" refine is invisible in OpenAPI. `date` columns `mode:"string"`, `numeric(12,3)` `mode:"number"`.
- drizzle-kit push recreates indexes mixing columns and expressions unless the column goes through `asExpression()` (`db/schemas/helpers.ts`).
- Shared Postgres on 5433: each parallel worktree needs its own `DATABASE_URL_TEST` database name, and never runs `db:push` / `db:test:prepare` against a database another session uses while its schema differs (`push --force` drops the other tables).
- `membershipStatus`: a not-yet-started latest period is Active; lead window inclusive; `daysLeft` 0 = ends today (+0).
- `parseDuration` accepts `m:ss` / `h:mm:ss` only, ≤ 599:59; bare numbers → null. Timed metrics have unit "min:sec": never append it after `formatDuration`.
- Use `messageForCode`, never `ERROR_MESSAGES[code]` (inherited keys like `constructor`). `LOGIN_LOCKED` text ends "Try again later." — Login (A) adds minutes from `details.retryAfterSeconds`.
- `API_ROUTES` leaves are manifest paths with `:param`; `apiPath(template, params)` fills them. `next.config.ts` rewrites are baked at build time (`API_URL` needed for `next build`); run `bunx next typegen` after adding routes.
- `PageHeader`'s `action` is drawn twice (desktop header / phone `ActionBar`); `ActionBar form` hides the tab bar. Sticky elements under the offline banner use `top-[var(--offline-h,0px)]`.
- Dark `--primary` fails 4.5:1 as text: no `text-primary` / `variant="link"`. 48 px controls and 44 px hit areas are unlayered CSS in `globals.css` (shadcn files are never edited).
- Auth lock: one `login_attempts` row read `FOR UPDATE`; fixed 15-min window from the first wrong try (spec v2); tries refused while locked are not counted; the counter update and the reuse revoke commit BEFORE the 401/429 is thrown (a throw inside the transaction would roll them back).
- Refresh grace: a replaced token within 60 s gets an access cookie only (no rotation, no refresh cookie); after 60 s it revokes `reuse`. E05 reads the `sid` row (revoked too); a random `sid` → 401 (use `createSignedInSession()` in tests).
- Rate limiter is in-memory per process; key = `clientAddress` (`TRUST_PROXY_HOPS`, default 0; D-018 production 1 — Next 16 rewrites pass `X-Forwarded-For` through). The page guard forwards the visitor's `X-Forwarded-For` and `User-Agent` on its E02 call.
- Page guard: its server E02 must send `Origin` (= `request.nextUrl.origin`; behind the HTTPS front Next must see the public origin, #8); `/login?reason=expired` renders Login even with an access cookie (no loop); only a 401 `UNAUTHORIZED` triggers the client refresh.
- argon2id: 64 MiB / t=2 pinned; minimum cost only under `NODE_ENV=test`; a decoy hash at import keeps unknown-user timing equal.
- Live server tests: `backend/tests/auth/signin` spawns the real API (`bun --no-env-file src/index.ts`); do not run two auth suites at once on one DB (one-row tables).
- Theme follows the device (`defaultTheme="system"`); the manual choice is `ThemeChoice` on S14 (the shared `ThemeToggle` is a two-state icon button and cannot offer System).

- Setup E07 is a pure read (C13): no `gym_settings` row → the schema defaults (`SETTINGS_DEFAULTS` read from the Drizzle column defaults); only E08 (`lockSettings`) and `seed` create the row.
- Setup locks (C11): E10–E12 take `pg_advisory_xact_lock(hashtext('setup.assessment_types'))`; E13 and E15 lock the type row `FOR UPDATE`; E14 locks the metric row (blocks a concurrent value insert, so `hasValues` cannot flip). Unique-index 23505 → 409 `NAME_TAKEN`; 23514 on the check range → 400.
- Setup controllers parse the body again with the route schema: `validate()` only checks and discards, so the trim of `gymName`/`name`/`tableGroup` arrives through the controller's parse.
- E09 `hasValues`: Drizzle drops table names inside `sql` fragments in a one-table select list, so a text sub-select compares its own columns and returns false — use `exists(db.select()…)` builders (`setupRepository.hasStoredValue`).
- Setup audit: one `audit_log` row per successful write (entities `settings` id "1", `assessment_type`, `metric`; create rows hold the new item, reorder rows `{ order: [ids] }`); a no-op write still logs a row with null before/after; no ip/device.
- Time → Number switch with no unit and no decimals in the body takes the creation defaults (unit "", decimals 1); a Time measurement is always `min:sec` + 0 decimals (C3). `INTERVAL`/`hasValues` rules and the E14 error order (404 → C8 400 → `METRIC_LOCKED` → `NAME_TAKEN`): setup contract.md.
- Never nest Back-aware sheets (`useBackToClose` is not stack-aware, [#18](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/18)): a confirmation is a step inside the one `SetupSheet`, not a second `ResponsiveSheet`. A hidden (not unmounted) form keeps its state, but `focus()` on it fails until visible (`flushSync` first).
- Setup edits to the catalog reach other screens through `setupKeys.all` only: the due-list stream's Home due query must use `staleTime: 0` (or a key setup invalidates) so BR-REC-70 ("Home reflects it at once") holds — the app default is 30 s (R-6).
- iOS decimal keypad has no minus: `NumberField` cannot type a negative number ([#21](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/21)); the desktop dialog of `ResponsiveSheet` does not scroll — setup wraps its sheets in `SheetBody` ([#18](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/18)).

- Members (B): every write to one member takes `select … for update` on its row first (`membersRepository.lockById`); overlap, join-date and restore checks run after it. Idempotency and the settings read happen outside the transaction; refusals throw before the first write.
- Members (B): gym "today" and `expiry_lead_days` are read from `gym_settings` per request (no cache); a missing row falls back to Asia/Kolkata / 14. E16 status filters are SQL (`membersSql.statusCondition`) — change `lib/domain/membership.ts` and it together. E16 name order is `lower(full_name) COLLATE "C"` (word by word); `members_name_active_idx` does not serve it (bench in G).
- Members (B): `phone` is stored cleaned (`+919845012345`), `phone_digits` digits only; `phone` filter and "same phone" compare the last 10 digits. In a query string a bare `+` becomes a space: send `%2B`.
- Members (B): zod transforms in request schemas: a bare `.transform()` shows `unrepresentable` in the manifest; use `.trim()`/`.overwrite()` or `…nullable().transform(fn).pipe(z.x().nullable())`. `Idempotency-Key` is checked before the handler (E22 unknown member without the header is 400, not 404).
- Members (B) admin: `useToday()` has a server snapshot (UTC day): never take form defaults from it — `AfterHydration` draws S6 in the browser only. `memberFormSchema` object-level checks need `.refine(…, { when: () => true })` or zod skips them once a field fails. `ChoiceChips` cannot un-choose (Goal has a "Not set" chip). `ApiError.body.details.field` carries the field.
- Members (B) admin: sheets not needed at first paint (`PeriodSheet`, `ConfirmSheet` in Archive) load through `lib/members/useLazySheet.ts`: `sheetLoader(() => import(…))` = ONE `import()` site per sheet (a second site makes Turbopack emit a second chunk copy) with a cache that resets on failure (`React.lazy`/`next/dynamic` keep a rejected load forever); the sheet mounts CLOSED and opens one frame later (Base UI skips the open animation for a sheet that mounts open), stays mounted (unmounting calls `history.back()` via `useBackToClose` and loses the exit animation); a failed load toasts "Couldn't load this. Try again." and the next tap retries. Keep `useForm` inside the sheet children. Renew pointer-down/focus preloads the chunk and `prefetchMember`s the detail. Biome rejects `onPointerDown` on a div: native listeners via ref (`MembershipHistory`).
- Members (B) admin: list/search requests forward the abort signal; idempotency key reused only while the JSON body is identical (a changed body with the same key is 422); `crypto.randomUUID` needs a secure page, so `newIdempotencyKey` falls back to `getRandomValues`.

- Due (E): an override ends when read, not when written: `due_overrides` row stays; ended = a save of that member + type with `assessments.updated_at >= override.created_at` AND `assessed_on >= set_on` (`dueRepository.listOverrides` = LEFT JOIN + `max(assessed_on)` grouped by the key; a correlated sub-select in the select list loses the table name, as with `hasValues`). Stream D must write `assessments.updated_at` on every save and edit ([#24](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/24)); `created_at` is the API clock, `updated_at` is DB `now()` on insert: the comparison assumes close clocks ([#25](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/25)).
- Due (E): one due date per measurement (latest `measured_on` + effective interval, never recorded → `joined_on`); a row = member + assessment with the measurements due within Due soon days; `daysOverdue` 0 = today, negative = later; "Assess soon" rows are only in `overdue` with every turned-on measurement as chips. E31 loads every member (archived too) and `isListedInDueList` is the only place that leaves them out; paging is in memory over the sorted list (1,000 members: p95 ≈ 157 ms). The E31 query value is `upcoming`, the S3 URL tab is `soon`.
- Due (E): tests have no clock: dates come from `gymToday(new Date(), tz)`; a run straddling midnight in the gym zone can flake once. `backend/tests/due/support.ts` refuses a test DB that holds active members it did not create (every new assessment is due for every active member): run `bun run db:test:prepare`.
- Due (E) admin: write hooks cancel + snapshot all due queries, apply the change to every cached list (infinite lists are flattened, changed and re-cut to the old page sizes), roll back with `messageForCode` (a failure with no code toasts "Couldn't save this. Try again."; a 401 gets none), and invalidate `dueKeys.all` only when no other due write is still running. `meta.total` is not touched (Home count stale for one round trip, [#25](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/25)). A tab switch unmounts the other tab (Base UI `Tabs.Panel`), only a chip change keeps old rows (`keepPreviousData`).
- Due (E) admin: the row sheet is one `ResponsiveSheet` with a second step for "Remind me later" (never a second sheet, #18); "Record assessment" / "Open member" are `<Link replace>` so Back does not land on a ghost entry; `links.ts` returns `as const` template literals so typed routes pass without casts (`bunx next typegen` once after adding `/admin/due`). Admin "today" = the device zone (D-021 7): the server answers 400 `VALIDATION_ERROR` / `SNOOZE_TOO_FAR` for an edge day and the change is undone.

## Gaps (Stream 0 closed 1, 5, 6, 8, 9, 11, 12, 14, 15 of the f6000ae list; auth closed 2, 3, 4, 7, 10)
| # | Gap | Owner |
|---|---|---|
| — | transient refresh failures (5xx, 429, network) sign the device out (R-3) | [#7](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/7) (A) |
| — | page-guard refresh behind the HTTPS front: public origin + `TRUST_PROXY_HOPS=1` check (R-12) | [#8](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/8) (G) |
| — | no component tests for Login / Account (no DOM test library) (R-13) | [#9](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/9) |
| — | shared words, `START_BEFORE_JOIN` wording for Edit member, `DateField` onBlur/warning (members uses local stand-ins) | [#16](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/16) |
| — | S5 desktop columns (phone, last assessment) not built; `ListRow` has no column slot | [#17](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/17) |
| — | server-side data start (HydrationBoundary) used nowhere; decide once for all streams (tactic 1) | [#20](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/20) (G) |
| — | `SignOutSection` (auth) still imports `ConfirmSheet` statically (bundle on `/admin/settings/account`) | G |
| 13 | manifest / installable app | performance (G) |
| — | idempotency answer outside the handler transaction | [#3](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/3) (B) |
| — | ResponsiveSheet ships Drawer + Dialog + AlertDialog together (RV-11) | [#4](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/4) (G) |
| — | Server-Timing `db` accuracy + test (R2-2, R2-3) | [#5](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/5) (G) |
| — | DurationField paste table test; offline banner under the notch (R2-5, R2-6) | [#6](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/6) (D, G) |
| — | ResponsiveSheet desktop dialog does not scroll; `useBackToClose` not stack-aware | [#18](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/18) (shared) |
| — | DurationField reads an out-of-range box as empty | [#19](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/19) (shared) |
| — | NumberField cannot type a minus on iOS (needed by setup ranges and Stream D results) | [#21](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/21) (shared, before D) |
| — | assessments must write `assessments.updated_at` on every save/edit, or Assess soon / Remind me later never end (C6) | [#24](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/24) (D, before it merges) |
| — | due-list polish: clock source, infinite-list refetch, Home count after an optimistic change | [#25](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/25) (E) |

## Tech notes
- Fonts (BR-REC-150, 174, measured 2026-10-03): latin files Outfit 31.5 KB (preloaded), Raleway 600 17.4 KB, Geist Mono 22.6 KB = 71.5 KB; `next/font/google` also emits unused unicode subsets (166 KB total) — the budget counts `latin` only (performance changelog).
- Lighthouse 12 removed the PWA category, so "installable" (BR-REC-151) is checked by a manifest test plus an offline reload test.
- next/font: `preload: false` fonts are fetched only when an element on screen uses them; `adjustFontFallback` gives the size-adjusted fallback.
- Global sign-in lock (auth Q1 = B): one row in `login_attempts` (created by `seed`); trade-off in `auth.md` → Known trade-off.

## Benchmark notes (2026-10-03)
- Duplicate phone: warn with the matching client's name/phone and an "open existing" choice; never block
  ([MyTime](https://help.mytime.com/support/solutions/articles/31000175209-duplicate-phone-numbers-and-email-addresses-on-client-profile),
  [Goldie](https://support.heygoldie.com/en/articles/808910-avoiding-and-resolving-duplicate-clients)) → BR-REC-47. Merging duplicates: skipped.
- Expiring memberships: date-range "about to expire" report and an alert N days before
  ([Zenoti](https://help.zenoti.com/en/configuration/fitness-configurations/configure-alerts-for-expiring-memberships-and-packages.html), Zen Planner reports) → Ends soon + BR-REC-60.
- PRs and history: gold PR badge, per-client results filterable by date
  ([Wodify Track PRs](https://help.wodify.com/hc/en-us/articles/209426457-Track-PRs),
  [Wodify Performance Results](https://help.wodify.com/hc/en-us/articles/360061195634-Understanding-Performance-Results)) → best on the report card.
- Body composition: details per measurement date with segmental analysis by body part
  ([InBody in BRP](https://brpsystems.atlassian.net/wiki/spaces/BM/pages/5594873862/InBody)) → BR-REC-108. Device sync: skipped.
- Coaches ask for custom body-stat fields and to keep coach-entered values apart from client-entered ones
  ([ABC Trainerize ideas](https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/18392212-add-custom-fields-in-body-stats))
  → setup catalog. We have coach entry only.
- Skipped on purpose: scale/InBody sync, members entering their own stats, merging duplicates, auto-renew billing,
  world leaderboards (BTWB).

## Perf run book (BR-REC-141)
1. `cd backend && docker compose up -d && bun run db:reset && bun run seed:perf` (local only; ~15 s for 1,000 members, ~343k values).
2. Build and start API and frontend in production mode on one machine, Next forwarding `/api` (as D-018).
3. `cd backend && bun run bench` → p95 and gzip size per endpoint vs BR-REC-147, 148.
4. Lighthouse mobile (default throttling) on `/login`, `/admin`, `/admin/members`, a seeded member page and its
   `/assess` page → LCP, CLS vs BR-REC-142, 143; repeat view for BR-REC-145; bundle and font sizes for
   BR-REC-146, 174. CI runs the same on every PR once Stream G lands (BR-REC-173).
5. Write the numbers in History below.

## Tests
| Area | Files | BR |
|---|---|---|
| schema | `backend/tests/db/schema.test.ts` | 163, 164, 168, 169, 175 |
| contract | `backend/tests/routes/{contract-conventions,route-drift}.test.ts`, `frontend/tests/lib/api/routes.test.ts` | 153, 155, 157, 159 |
| middleware | `backend/tests/lib/{origin-check,idempotency,etag,response-headers,response-headers-server,server-timing}.test.ts`, `backend/tests/app.test.ts` | 36, 37, 147, 156, 160, 161 |
| change log | `backend/tests/lib/audit.test.ts` | 43, 158 |
| seeds | `backend/tests/scripts/{seed,seed-perf}.test.ts` | 10, 13, 65, 68, 168, 170 |
| domain | `{backend,frontend}/tests/lib/domain/*.test.ts` + golden `duration-cases.json`, `membership-end-cases.json` | 03, 12, 51, 52, 75, 93, 94, 105 |
| frontend libs | `frontend/tests/lib/{format,messages/errors}.test.ts` | 127, 128, 154 |
| auth backend | `backend/tests/auth/signin/*` (live API child), `backend/tests/auth/session/*` (`createApp().request` + probe child) | 01, 02, 25–35, 37, 38, 43, 44, 171 |
| auth admin | `frontend/tests/auth/{proxy,fetch-wrapper,query-cache-401,locked-line,login-error,safe-next-path,sign-out,validators}.test.ts` | 01, 02, 27, 29, 35, 38–42 |
| members backend | `backend/tests/members/{field-rules,create-member,member-detail,update-member,archive-restore,add-period,edit-period,list-search,search-text-length,memberships-ending,membership-status}.test.ts` (+ `support/suite.ts`) | 03–09, 45–59, 172, 154–158 |
| members admin | `frontend/tests/members/{validators-helpers,validators-forms,membership-text,banner,date-warning,renew,duplicates,search,search-clamp}.test.ts` | 03–05, 07, 45–50, 52, 54, 58, 59, 125, 134, 172 |
| manual | `.pipeline/member-records-foundation/checklist.md`, `.pipeline/member-records-auth/checklist.md`, `.pipeline/member-records-members/checklist.md` | shell / ux rules, fonts, same origin; S1, S17, S4–S9, Home search/sections, real-server items |
| setup backend | `backend/tests/setup/{metric-value,settings,assessment-types,metrics,change-log,gates}.test.ts` (+ `settings-empty` for C13) | 10, 11, 13, 14, 60–67, 69, 72, 158, 159, 160 |
| setup admin | `frontend/tests/setup/{validators,describe,text,queries}.test.ts` | 10, 13, 14, 60–67, 69–72, 126 (UI wiring of 70, 71 is manual: no DOM test library, #9) |
| due backend | `backend/tests/due/{compute-due,due-list-rows,e31-due-list,e32-member-due,e33-e34-actions,override-ending,settings-and-today,http-gates}.test.ts` (+ `support.ts`) | 15–18, 93–100, 103–105, 158 |
| due admin | `frontend/tests/due/{status,remind,links,search-params,text,optimistic,fetchers,queries,query-hooks,list-paging,mutation-hooks}.test.ts` (+ `helpers.ts`, `hookHarness.ts`) | 16, 18, 94, 96–105, 125–127 (UI wiring of 101, 102, 138, 140 is manual: no DOM test library, #9) |
| manual | `.pipeline/member-records-foundation/checklist.md`, `.pipeline/member-records-auth/checklist.md`, `.pipeline/member-records-setup/checklist.md`, `.pipeline/member-records-due-list/checklist.md` | shell / ux rules, fonts, same origin; S1, S17, real-server items; Home due sections, S3, row sheet, member block |

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-10-03 | — | Map created with spec v2 (split into 10 sub-specs); no feature code |
| 2026-10-03 | — | v2 answers folded (36 questions; D-017, D-018); benchmark moved here; tech notes added |
| 2026-10-03 | Stream 0 branch `claude/member-records-foundation-57e849` | Foundation built (M0): schema, 40 routes (501), middleware, change log, domain maths, seeds, shell + slots; data-model v2 (no hand SQL); D-019; 2 review rounds (round 2 READY), issues #3–#6; 551 backend + 506 frontend tests |
| 2026-10-03 | auth branch `claude/member-records-parallel-build-f18292` | Stream A built (stacked on Stream 0, synced with `main` after the M0 squash): E01–E06, lock, rotation, rate limits, `bootstrap-admin`, guard, Login, Account; spec auth v2 (4 clarifications); D-020; 1 review + fix round (2 major fixed); issues #7–#9 |
| 2026-10-04 | members branch `claude/member-records-feature-8fca5b` | Stream B built (from `main` 9244b2c): E16–E24, S4–S9, Home search + sections; 472 backend + 324 admin tests; 3 review rounds, 2 fix rounds (2 major fixed: lazy sheets −58…−68 KB gz, history from one period; 9 minor fixed, 1 → #20); D-021; issues #16, #17, #20 |
| 2026-10-04 | setup branch `claude/member-records-setup-8ce4cb` | Stream C built (from `main` after M1): E07–E15, `roundMetricValue`, S14–S16; setup spec v2 (C1–C13); 2 review rounds (1 major fixed, minors fixed or filed), issues #18, #19, #21; 541 backend + 334 admin tests |
| 2026-10-04 | due-list branch `claude/due-date-engine-overdue-871ad4` | Stream E built (from `main` 8e3d569, M2): E31–E34, `computeDue`, Home due sections, S3, row sheet, member block; due-list spec v2 (C1–C13); 1 review round (0 blockers; R-1 major → #24 for Stream D, R-4/R-5 fixed, minors → #25); E31 p95 ≈ 157 ms on the perf seed; D-022; 2218 backend + 1706 admin tests (baseline 1855 / 1407) |
