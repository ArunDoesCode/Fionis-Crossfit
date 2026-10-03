---
module: member-records
spec: docs/specs/member-records.md   # v2 index; sub-specs in docs/specs/member-records/
last_verified_commit: c6fcdda
last_verified_on: 2026-10-03
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
| slots | Home `components/pages/home/{HomeSearch,MembershipSections}` (B), `DueSections` (E); Member `pages/member/{MemberHeader,MembershipBlock}` (B), `DueBlock` (E), `RecentBlock` (D) | each owner replaces its whole file; member slots take `{ memberId }` |

## Data model / API
Tables: data-model.md v2 (no hand SQL, no extensions, no exclusion constraint — overlap is the BR-REC-09 service
check). Endpoints: api-contract.md + exact schema names in `.pipeline/member-records-foundation/contract.md`.
Dev/test/CI use `db:push`; production gets a generated migration at deploy (Stream G).

## Commands
`bun run seed` (idempotent: settings + `login_attempts` row + catalog only when empty) · `bun run seed:perf`
(local only, adds 1,000 members; run `db:reset` first) · `bun run db:reset` (push + seed) · `SEED_PERF_FULL=1 bun test tests/scripts/seed-perf.test.ts` (full 1,000 run; default tests use 100).

## Starting a stream session (D-017)
Remaining streams, in order: setup + members (M2) → assessments, due-list, progress (M3) → performance (M4). Each is
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
- Theme follows the device (`defaultTheme="system"`); Settings (C) must render `ThemeToggle` for the manual choice.

## Gaps (Stream 0 closed 1, 5, 6, 8, 9, 11, 12, 14, 15 of the f6000ae list; auth closed 2, 3, 4, 7, 10)
| # | Gap | Owner |
|---|---|---|
| — | transient refresh failures (5xx, 429, network) sign the device out (R-3) | [#7](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/7) (A) |
| — | page-guard refresh behind the HTTPS front: public origin + `TRUST_PROXY_HOPS=1` check (R-12) | [#8](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/8) (G) |
| — | no component tests for Login / Account (no DOM test library) (R-13) | [#9](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/9) |
| 13 | manifest / installable app | performance (G) |
| — | idempotency answer outside the handler transaction | [#3](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/3) (B) |
| — | ResponsiveSheet ships Drawer + Dialog + AlertDialog together (RV-11) | [#4](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/4) (G) |
| — | Server-Timing `db` accuracy + test (R2-2, R2-3) | [#5](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/5) (G) |
| — | DurationField paste table test; offline banner under the notch (R2-5, R2-6) | [#6](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/6) (D, G) |

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
| manual | `.pipeline/member-records-foundation/checklist.md`, `.pipeline/member-records-auth/checklist.md` | shell / ux rules, fonts, same origin; S1, S17, real-server items |

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-10-03 | — | Map created with spec v2 (split into 10 sub-specs); no feature code |
| 2026-10-03 | — | v2 answers folded (36 questions; D-017, D-018); benchmark moved here; tech notes added |
| 2026-10-03 | Stream 0 branch `claude/member-records-foundation-57e849` | Foundation built (M0): schema, 40 routes (501), middleware, change log, domain maths, seeds, shell + slots; data-model v2 (no hand SQL); D-019; 2 review rounds (round 2 READY), issues #3–#6; 551 backend + 506 frontend tests |
| 2026-10-03 | auth branch `claude/member-records-parallel-build-f18292` | Stream A built (stacked on Stream 0, synced with `main` after the M0 squash): E01–E06, lock, rotation, rate limits, `bootstrap-admin`, guard, Login, Account; spec auth v2 (4 clarifications); D-020; 1 review + fix round (2 major fixed); issues #7–#9 |
