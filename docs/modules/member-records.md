---
module: member-records
spec: docs/specs/member-records.md   # v2 index; sub-specs in docs/specs/member-records/
last_verified_commit: 9d78023
last_verified_on: 2026-10-04
depends_on: []
---

# Member records — as-built map (index + shared foundation)

> What the code **is** (the specs say what it **should be**). Read this, then the sub-map of the stream you touch
> (Streams table). Symbol names, not line numbers.

## Summary
Streams 0 and A–F are merged (D-017: one session, worktree, branch and PR per stream): all 13 tables, 40 endpoints + health,
shared middleware, change log, shared domain maths, seeds, the mobile-first admin shell, screens S1–S18. Only E40 (vitals,
Stream G) still answers 501 `NOT_IMPLEMENTED`. Open: Stream G (install + service worker, CI budgets, vitals, bench, deploy).
Decisions: D-012 scope, D-016 split, D-017 streams, D-018 hosting, D-019…D-024 build choices (table below).
Run notes live in git history (Streams table), not in the tree.

## Streams
Run notes (deleted in `c412f08`, checklists kept): `git show c412f08^:.pipeline/member-records-<x>/{plan,contract,findings,screens}.md` (due-list has no findings.md); the squash commit per stream is in the last column.
Spec and sub-map share the file name (`docs/specs/member-records/<x>.md`, `docs/modules/member-records/<x>.md`).
| Stream | Sub-spec / sub-map | PR | Decisions | Squash commit (`<x>` = folder suffix) |
|---|---|---|---|---|
| 0 foundation | data-model, api-contract, ux / this file | #10 | D-019 | `2b4ef5b` (`foundation`) |
| A auth | `auth.md` | #11 | D-020 | `ad6a486` (`auth`) |
| B members | `members.md` | #22 | D-021 | `8e3d569` (`members`) |
| C setup | `setup.md` | #23 | — | `8c1ba1c` (`setup`) |
| D assessments | `assessments.md` | #35 | D-024 | `ff98ca5` (`assessments`) |
| E due-list | `due-list.md` | #33 | D-023 | `863a5ab` (`due-list`) |
| F progress | `progress.md` | #34 | D-022 | `9d78023` (`progress`) |
| G performance | `performance.md` (spec only; Run book at its end) | open | — | — |

## Code locations (shared foundation, Stream 0; each stream's own files are in its sub-map)
| Layer | Path | Key symbols |
|---|---|---|
| app factory | `backend/src/app.ts` | `createApp`: log → `serverTiming` → `dataResponseHeaders` → `bodyLimit` → `originCheck` → routers (no CORS) |
| routes | `backend/src/routes/{auth,setup,members,assessments,due,progress,vitals}.ts`, `mount-route.ts`, `end-points.ts` | `routeMounter` registers the descriptor and derives guard + validation from it; `notImplemented` (E40 only) |
| types | `backend/src/types/<owner>.types.ts`, `common.types.ts` | Zod schema per endpoint; names in `bun run contract:query` |
| enums | `backend/src/lib/enums.ts` | one `as const` array + union per enum-like column (DB checks and Zod) |
| schema | `backend/src/db/schemas/{infrastructure,auth,setup,members,assessments,due}.ts`, `helpers.ts` | the 13 tables; `asExpression`, `createdAt`/`updatedAt` helpers |
| db client | `backend/src/db/client.ts` | `Db`, `Tx`; patches Drizzle `QueryPromise.then` so every query feeds Server-Timing `db` |
| middleware | `backend/src/lib/{origin-check,idempotency,etag,server-timing,response-headers,validate}.ts` | `originCheck`, `idempotency` (+ `pruneIdempotencyKeys`), `etagMiddleware`, `serverTiming`, `dataResponseHeaders` |
| change log | `backend/src/lib/audit.ts` | `writeAudit(tx, entry)`, `diffChangedFields` (redacts /password\|token\|secret\|hash/i) |
| domain | `backend/src/lib/domain/{dates,duration,membership}.ts` = `frontend/src/lib/domain/*` | `addMonths`, `gymToday`, `parseDuration`/`formatDuration`, `membershipEnd`, `membershipStatus` |
| seeds | `backend/scripts/{seed,seed-perf,seed-demo,seed-demo-data,db-reset}.ts` | `seed()` (`CATALOG` const), `seedPerf({ memberCount })`, `assertLocalDatabase` |
| frontend http | `frontend/src/lib/api/{client,server,routes,errors}.ts`, `lib/queryClient.ts` | `api` (ETag cache, refresh once), `serverApi`, `API_ROUTES` (all 41) + `apiPath` |
| frontend shared | `frontend/src/lib/{format.ts,messages/errors.ts,messages/words.ts,hooks/*}` | `formatDay`, `formatValue`, `messageForCode`, `UI_TEXT`, `useBackToClose` |
| shell | `frontend/src/components/shells/*`, `lib/routes.ts`, `lib/breakpoints.ts`, `app/(app)/admin/layout.tsx` | `AppShell` (shadcn `SidebarProvider` + `Sidebar collapsible="icon"` + `SidebarInset`), `ShellProvider` (drawer + Back), `SideNav`, `NavLinks` (one list: `navItems.ts`), `sidebarState.ts` (`readSidebarOpen`, pre-paint script, `<html data-sidebar="open\|collapsed">`), `ROUTES`/`routeFor`/`routeForPattern`/`trailFor` (the only back/crumb source; loading.tsx and views read the same entry) |
| theme | `frontend/src/app/globals.css`, `lib/statusTone.ts`, `scripts/check-colors.ts` | Fionis tokens (`bg-brand`, `text-brand`, `info`, `-soft` tones, navy `sidebar-*`), density tokens (fine-pointer ≥ 1024 px: header 56 / control 40 / row 48), `--page-max-narrow/-wide`, `toneFor(key)` = the ONE status→tone map, `bun run check:colors` (CI) |
| forms | `frontend/src/components/common/form/*`, `lib/forms/{numberText,firstProblem,zodNumber}.ts` | `FormField`/`FormItem` (`min-h-19`, `hint`/`error`, hint and message share one slot)/`FormControl`/`FormMessage`, `FloatingLabelInput` (`action` slot), `FormGrid` (container query), `NumberInput` (± button when `allowNegative`), `DurationInput`, `ChipGroup`, `FormErrorSummary`, `useFocusFirstProblem` (`data-field` is the focus key); one number parser `parseNumberText` + zod pipes `numberFromText` / `optionalNumberFromText` / `exactNumberFromText`; schemas in `lib/validators/*` (typed text for numbers) |
| dates | `lib/dates/{dayPicker,month}.ts`, `lib/format.ts`, `components/common/{DatePicker,DatePickerCalendar,MonthPicker}.tsx` | `isoToDate`/`dateToIso` (local fields, never UTC), `WEEK_STARTS_ON = 1`, `formatDay` = `dd MMM yyyy` (the one formatter), calendar chunk loaded on demand (`DatePickerCalendar` is the only importer of `ui/calendar`) |
| modals | `components/common/{ResponsiveSheet,ConfirmSheet,TimeZoneCombobox}.tsx`, `ui/{drawer,command,popover,collapsible,calendar,sidebar}` | phone = shadcn Drawer, desktop = Dialog (scrolls inside); `ConfirmSheet` props `cancelLabel`, `backToClose` |
| shared UI | `frontend/src/components/common/*` | `PageHeader` (+`ActionBar`), `ResponsiveSheet`, `NumberField`, `DurationField`, `ChoiceChips` |
| slots | Home `components/pages/home/{HomeSearch,MembershipSections,DueSections}`; Member `pages/member/{MemberHeader,MembershipBlock,DueBlock,RecentBlock}` | all five filled (B, E, D); each owner replaced its whole file; member slots take `{ memberId }` |

## Data model / API / commands
Tables: data-model.md (no hand SQL, no extensions, no exclusion constraint: overlap is the BR-REC-09 service check). Endpoints:
api-contract.md; shapes `cd backend && bun run contract:query "<METHOD /path>"`. Dev/test use `db:push`; production gets a generated migration at deploy (G).
`bun run seed` (idempotent: settings, `login_attempts` row, catalog when empty) · `seed:perf` (local only, +1,000 members; after `db:reset`) ·
`db:reset` (push + seed) · `seed:demo` (BR-REC-176, after `db:reset`: 25 named demo members, every date = today + a fixed offset, fixed ids `…0001`–`…0025`, refuses a non-local or `*_test` database and a non-empty `members`; no login: run `bootstrap-admin`; code `backend/scripts/seed-demo{,-data}.ts`, buckets self-checked with the due and membership domain functions) ·
`SEED_PERF_FULL=1 bun test tests/scripts/seed-perf.test.ts` (full 1,000 run; default tests use 100).

## Invariants & gotchas (apply to more than one stream; per-stream traps are in the sub-maps)
- Every write needs a matching `Origin` (403 `CSRF_ORIGIN`), server-side calls too; a POST with no Origin to an unknown path is 403, not 404.
- gzip only for JSON over 1 KB with a known body; CSV/streams pass through. Never `res.clone()` and return the original; `c.res = x` copies old headers. `app.request()` sends no `Accept-Encoding`: test on a real `Bun.serve` (`response-headers-server.test.ts`).
- Idempotency: `tryClaim` → SELECT-only polling (≤ 10 s, then 429) → handler; only 2xx stored; a failed request frees its key. The key is checked before the handler (unknown id without the header is 400, not 404); same key + different body is 422; the answer is not stored in the handler's transaction (#3).
- ETag + `no-store`: the browser never revalidates by itself; `lib/api/client.ts` sends `If-None-Match` from its own cache. `etagMiddleware` tags 2xx GETs only; gzip weakens it to `W/`.
- Server-Timing `db`: automatic for Drizzle queries; raw `queryClient` calls, BEGIN/COMMIT and `db.$count()` are not counted; a sum, so parallel queries can exceed `total` (#5). Repositories never call `measureDb`. After `next()` a handler error does not throw (Hono sets `c.error`): route middleware checks status.
- Zod: `z.guid()` for ids (well-formed unknown id → 404); `.partial()` keeps strictness, the "≥ 1 field" refine is invisible in OpenAPI; a bare `.transform()` shows `unrepresentable` in the manifest: use `.trim()`/`.overwrite()` or `…nullable().transform(fn).pipe(z.x().nullable())`. `validate()` only checks and discards: a controller that needs the trimmed value parses again with the route schema (setup does).
- Drizzle: `date` columns `mode:"string"`, `numeric(12,3)` `mode:"number"`; a text sub-select in a one-table select list compares its own columns (table names dropped): use `exists(db.select()…)` or a join (setup `hasValues`, due `listOverrides`); a subquery's raw `sql` column needs `.mapWith(Number).as(…)`. `db:push` recreates indexes mixing columns and expressions unless the column goes through `asExpression()`.
- Shared Postgres on 5433: each parallel worktree needs its own `DATABASE_URL_TEST` database name and never runs `db:push` / `db:test:prepare` against a database another session uses while its schema differs (`push --force` drops the other tables).
- Lock order: the member row first (`membersRepository.lockById`; assessments `lockMember`; due E33/E34), then type/assessment rows; never lock an assessment row before its member (deadlock).
- Gym "today" and lead days come from `gym_settings`, read per request, never cached, fallback Asia/Kolkata / 14: members `readGymSettings`, assessments `readTimezone`, progress `SETTINGS_DEFAULTS`, due via `setupService.getSettings()`.
- Freshness: no server cache anywhere (BR-REC-110 v2, D-022); setup, due, progress and the entry form use `staleTime: 0` (app default 30 s). Catalog edits reach other screens only through `setupKeys.all` (BR-REC-70). Every assessment write calls `invalidateAssessmentData`, which also invalidates `['members']` (E16 `lastAssessedOn`) and `['due']`: due keys must stay rooted at `'due'` (BR-REC-88).
- Sheets and Back (#18): never nest sheets (`useBackToClose` is not stack-aware): a confirmation or second step is a step inside the one `ResponsiveSheet`. The desktop dialog does not scroll: wrap long sheets in setup's `SheetBody`. Sheets not needed at first paint load through `lib/members/useLazySheet.ts` (one `import()` site each; see members.md).
- `membershipStatus`: a not-yet-started latest period is Active; lead window inclusive; `daysLeft` 0 = ends today. E16 has an SQL twin of it (members.md).
- `parseDuration` accepts `m:ss` / `h:mm:ss` only, ≤ 599:59; bare numbers → null. Timed metrics have unit "min:sec": never append it after `formatDuration`.
- Use `messageForCode`, never `ERROR_MESSAGES[code]` (inherited keys like `constructor`).
- `API_ROUTES` leaves are manifest paths with `:param`; `apiPath(template, params)` fills them. `next.config.ts` rewrites are baked at build time (`API_URL` needed for `next build`). `Route` types exist only after `bunx next typegen` / build: run it after adding pages; hrefs with a query string need `as Route` (plain `tsc` can pass while `next build` fails).
- `PageHeader`'s `action` is drawn twice (desktop header / phone `ActionBar`); `ActionBar form` hides the tab bar. Sticky elements under the offline banner use `top-[var(--offline-h,0px)]`.
- Dark `--primary` fails 4.5:1 as text: no `text-primary` / `variant="link"`. 48 px controls and 44 px hit areas are unlayered CSS in `globals.css` (shadcn files are never edited). Biome a11y bans `onBlur` / `onPointerDown` on a div: listen natively through a ref (`focusout`).

- `seed:demo`: leaderboards need exactly 11 non-archived members per sex with a result (changing sex, archived or never-recorded members needs a re-check); Surya Pratap is 34 days overdue on any run day except when today minus a month lands on the 29th–31st (e.g. run on 4 May: 33 days) because the newest visit and latest period are placed by month maths (the buckets still hold); noise uses a constant seed, history dates are fixed-day offsets and only each member's newest visit and latest period use month maths. Re-seed (`db:reset`, `seed:demo`, `bootstrap-admin`) the morning of a demo.
- UX v2 shell traps (U1): `usePathname()` outside `<Suspense>` fails `next build` on dynamic routes (unit tests don't catch it; build with `API_URL=… NEXT_PUBLIC_API_URL=/api`). shadcn Sidebar is Base UI: use `render={<Link/>}`, not `asChild`; it hard-codes `svh` (override `h-dvh`). The pre-paint sidebar script only runs on server-rendered loads: `readSidebarOpen()` must fall back to the cookie. Drawer links go through `afterHistorySettles` (the sheet's history entry must pop first); `useLeaveGuard` closes a sheet entry with `history.back()` before asking. `bun run fix` unscoped rewrites test files — scope biome to your files. Raw colours (hex/oklch/palette classes) fail CI; print CSS uses the words `white`/`black`.
- UX v2 form/date traps (U2–U3): `FormControl` clones `id`/`aria-invalid`/`aria-describedby` onto its ONE child, which must spread them onto the real element. `FormItem` with `label` is a fieldset (give `FormMessage` `basis-full`). `drizzle-kit push` ignores a collate-only index change (drop then push). Record assessment form values are `{date, isEstimated, values:{[metricId]: string|{min,sec}}}`; dirty = `isDirty && isChanged` (D19). Never `toISOString()` / `new Date('YYYY-MM-DD')` for a picked day. Biome rejects `aria-required` on a button (the date trigger is `role=combobox`). `shadcn add` pulls extra ui files (textarea, input-group, tooltip): review the diff, never `--overwrite`.

## Gaps (no GitHub issue; open issues: `gh issue list --label mod:member-records`)
- `SignOutSection` (auth) imports `ConfirmSheet` statically (bundle on `/admin/settings/account`) — G.
- Manifest / installable app (BR-REC-151) and service worker — G.
- `/assess` page JS vs BR-REC-146 (49 KB with the shared chunks, 35 KB without); E26 ≈ 8 round trips vs 200 ms p95 — G (bench / bundle check).

## Tests
| Area | Directory | BR |
|---|---|---|
| schema, seeds | `backend/tests/db/`, `backend/tests/scripts/` | 10, 13, 65, 68, 163, 164, 168–170, 175, 176 |
| contract | `backend/tests/routes/`, `frontend/tests/lib/api/routes.test.ts` | 153, 155, 157, 159 |
| middleware, change log | `backend/tests/lib/*.test.ts`, `backend/tests/app.test.ts` | 36, 37, 43, 147, 156, 158, 160, 161 |
| domain | `{backend,frontend}/tests/lib/domain/` + golden `duration-cases.json`, `membership-end-cases.json` (`bash scripts/check-fixtures.sh`) | 03, 12, 51, 52, 75, 93, 94, 105 |
| frontend libs | `frontend/tests/lib/{format,messages/errors}.test.ts` | 127, 128, 154 |
| streams A–F | `backend/tests/{auth,members,setup,assessments,due,progress}/`, `frontend/tests/<same>/` | per sub-map; per rule: `git grep -l 'BR-REC-NN' -- '*/tests/*'` |
| manual | `.pipeline/member-records-{foundation,auth,members,setup,assessments,due-list,progress}/checklist.md` | shell, fonts, same origin; every screen; real-server items |
No DOM test library (#9): screen wiring is covered by the manual checklists.

## Tech notes
- Fonts (BR-REC-150, 174, measured 2026-10-03): latin files Outfit 31.5 KB (preloaded), Raleway 600 17.4 KB, Geist Mono 22.6 KB = 71.5 KB; `next/font/google` also emits unused unicode subsets (166 KB total): the budget counts `latin` only.
- Lighthouse 12 removed the PWA category, so "installable" (BR-REC-151) is checked by a manifest test plus an offline reload test.

## Benchmark notes (2026-10-03; what we copy)
- Duplicate phone: warn, offer "open existing", never block ([MyTime](https://help.mytime.com/support/solutions/articles/31000175209-duplicate-phone-numbers-and-email-addresses-on-client-profile)) → BR-REC-47.
- Expiring: "about to expire" report plus an alert N days before ([Zenoti](https://help.zenoti.com/en/configuration/fitness-configurations/configure-alerts-for-expiring-memberships-and-packages.html), Zen Planner) → Ends soon, BR-REC-60.
- PRs: gold badge, results filterable by date ([Wodify PRs](https://help.wodify.com/hc/en-us/articles/209426457-Track-PRs)) → best on the report card.
- Body composition per date, segmental analysis ([InBody in BRP](https://brpsystems.atlassian.net/wiki/spaces/BM/pages/5594873862/InBody)) → BR-REC-108.
- Custom body-stat fields, coach-entered kept apart ([ABC Trainerize ideas](https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/18392212-add-custom-fields-in-body-stats)) → setup catalog; coach entry only.
- 2026-10-05 (ux v2): gym admin tools are desktop dashboards with a collapsible left menu ([PushPress Dashboard 2.0](https://help.pushpress.com/en/articles/10270346-core-dashboard-2-0-overview), [Wodify left navigation](https://help.wodify.com/hc/en-us/articles/29738980015255-Feb-2025-Left-Navigation-Updates)) → shadcn Sidebar, BR-REC-177. Client lookup by name, email or phone is standard ([Mindbody client fields via API docs](https://pipedream.com/apps/mindbody)) → field picker, BR-REC-201. Official help pages for SugarWOD / Zen Planner search were not reachable (Wodify help 403).

## History
| Date | PR | Change |
|---|---|---|
| 2026-10-03 | — | Map created with spec v2 (10 sub-specs); D-017, D-018; benchmark and tech notes |
| 2026-10-03 | #10 | Stream 0 (M0): schema, 40-route contract, middleware, change log, shared maths, seeds, shell + slots; D-019 |
| 2026-10-03 | #11 | Stream A (M1): auth E01–E06, lock, rotation, `bootstrap-admin`, guard, Login, Account; D-020 |
| 2026-10-04 | #22 | Stream B: members and memberships E16–E24, S4–S9; D-021 |
| 2026-10-04 | #23 | Stream C: setup E07–E15, `roundMetricValue`, S14–S16 |
| 2026-10-04 | #35 | Stream D: assessments E25–E30, S10, S11, Recent block, shared field fixes; D-024 |
| 2026-10-04 | #33 | Stream E: due-list E31–E34, `computeDue`, Home due sections, S3; D-023 |
| 2026-10-04 | #34 | Stream F: progress E35–E39, S12, S13, S18; D-022 |
| 2026-10-04 | — | Map split into this index + one sub-map per stream; verified at `9d78023` |
| 2026-10-04 | work/mvp-demo-prep | `seed:demo` (BR-REC-176, data-model v3): 25 named, today-relative demo members; D-026 |
| 2026-10-05 | claude/ui-ux-responsive-redesign | Spec change only (no code): UX redesign #59, BR-REC-177…217, owner answers folded; D-027…D-035. Asset in repo: `frontend/public/Fionis-Logo.avif` (284 × 106 wordmark); follow-ups: square logo, app icon, favicon. Contradiction kept open for the owner: nextjs-standards §14 `h-4` vs the owner's `FormItem min-h-19` (D-034) |
| 2026-10-05 | claude/ui-ux-responsive-redesign | UX v2 slice U1 (shell + theme): shadcn Sidebar shell, ☰ drawer, route table + crumbs, Fionis tokens, Poppins, one tone map, `check:colors`; ux v5; D-027…D-036; issues #37–#59 |
| 2026-10-05 | claude/ui-ux-responsive-redesign | UX v2 slices U2 (form primitives, modals, forms on RHF + Zod incl. Record assessment, empty-Save fix), U3 (shadcn DatePicker/MonthPicker, `dd MMM yyyy`), U5-backend (E16 `email`, E25 `tableGroup`/`tablePart`, name index collate "C"); ux v7; D-034…D-036 |
