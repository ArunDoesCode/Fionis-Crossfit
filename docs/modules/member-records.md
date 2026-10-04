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
Run notes: `git show <sha>:.pipeline/member-records-<x>/{plan,contract,findings,screens,checklist}.md` (due-list has no findings.md).
Spec and sub-map share the file name (`docs/specs/member-records/<x>.md`, `docs/modules/member-records/<x>.md`).
| Stream | Sub-spec / sub-map | PR | Decisions | Run notes `<sha>` (`<x>`) |
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
| seeds | `backend/scripts/{seed,seed-perf,db-reset}.ts` | `seed()` (`CATALOG` const), `seedPerf({ memberCount })`, `assertLocalDatabase` |
| frontend http | `frontend/src/lib/api/{client,server,routes,errors}.ts`, `lib/queryClient.ts` | `api` (ETag cache, refresh once), `serverApi`, `API_ROUTES` (all 41) + `apiPath` |
| frontend shared | `frontend/src/lib/{format.ts,messages/errors.ts,messages/words.ts,hooks/*}` | `formatDay`, `formatValue`, `messageForCode`, `UI_TEXT`, `useBackToClose` |
| shell | `frontend/src/components/shells/*`, `app/(app)/admin/layout.tsx` | `AppShell`, `BottomTabBar` (< 1024 px), `SideNav`, `SignOutButton` |
| shared UI | `frontend/src/components/common/*` | `PageHeader` (+`ActionBar`), `ResponsiveSheet`, `NumberField`, `DurationField`, `ChoiceChips` |
| slots | Home `components/pages/home/{HomeSearch,MembershipSections,DueSections}`; Member `pages/member/{MemberHeader,MembershipBlock,DueBlock,RecentBlock}` | all five filled (B, E, D); each owner replaced its whole file; member slots take `{ memberId }` |

## Data model / API / commands
Tables: data-model.md (no hand SQL, no extensions, no exclusion constraint: overlap is the BR-REC-09 service check). Endpoints:
api-contract.md; shapes `cd backend && bun run contract:query "<METHOD /path>"`. Dev/test use `db:push`; production gets a generated migration at deploy (G).
`bun run seed` (idempotent: settings, `login_attempts` row, catalog when empty) · `seed:perf` (local only, +1,000 members; after `db:reset`) ·
`db:reset` (push + seed) · `seed:demo` (planned, BR-REC-176: 25 named demo members, dates relative to today) ·
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

## Gaps (no GitHub issue; open issues: `gh issue list --label mod:member-records`)
- `SignOutSection` (auth) imports `ConfirmSheet` statically (bundle on `/admin/settings/account`) — G.
- Manifest / installable app (BR-REC-151) and service worker — G.
- `/assess` page JS vs BR-REC-146 (49 KB with the shared chunks, 35 KB without); E26 ≈ 8 round trips vs 200 ms p95 — G (bench / bundle check).

## Tests
| Area | Directory | BR |
|---|---|---|
| schema, seeds | `backend/tests/db/`, `backend/tests/scripts/` | 10, 13, 65, 68, 163, 164, 168–170, 175 |
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
