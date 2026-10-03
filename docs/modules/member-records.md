---
module: member-records
spec: docs/specs/member-records.md   # v2 index; sub-specs in docs/specs/member-records/
last_verified_commit: f6000ae
last_verified_on: 2026-10-03
depends_on: []
---

# Member records — as-built map

> What the code **is** (the specs say what it **should be**). Read before touching any member-records stream.

## Summary
No feature code yet. Only the M0 scaffold exists: Hono backend skeleton (health route, error envelope, route
registry, JWT helpers, in-memory rate limiter) and the Next.js admin shell (light/dark, Hugeicons, Table v9,
fetch wrapper with one-refresh-in-flight, cookie-presence `proxy.ts`). File ownership per stream: spec index →
"Parallel build plan". Working copies per stream: D-017. Hosting (one server, same origin): D-018.

## Code locations (existing, useful to every stream)
| Layer | Path | Key symbols |
|---|---|---|
| app factory | `backend/src/app.ts` | `createApp` (CORS, 1 MB body limit, global `onError`) |
| errors / envelope | `backend/src/lib/{errors,http,response-schemas}.ts` | `AppError` family, `ok`, `okPaginated`, `failure`, `paginatedResponse` |
| auth skeleton | `backend/src/lib/{token,auth-middleware,permissions,rate-limiter}.ts` | `signAccessToken`, `requireAuth`, `PERMISSIONS = {}`, `rateLimiter` |
| contract | `backend/src/lib/route-registry.ts`, `scripts/generate-api-manifest.ts` | `register`, `AuthRequirement` |
| db | `backend/src/db/client.ts` | postgres.js, `prepare: false` |
| frontend http | `frontend/src/lib/api/{client,server,routes,errors}.ts` | `createApi`, `refreshSession`, `serverApi`, `API_ROUTES` |
| frontend shell | `frontend/src/{proxy.ts,app/layout.tsx,lib/queryClient.ts,components/common/*}` | `proxy`, `getQueryClient`, `DataTable` |

## Data model / API
None built. Target: `docs/specs/member-records/data-model.md` and `api-contract.md`.

## Gaps found (commit f6000ae)
| # | Gap | Where | Closed by |
|---|---|---|---|
| 1 | No tables; infra tables `audit_log`, `idempotency_keys` (FOUNDATIONS) missing; no idempotency middleware | `backend/src/db/schemas/index.ts` | Stream 0 |
| 2 | Refresh token is a stateless JWT (`signRefreshToken`): no rotation store, no revoke; payload has no `sid` | `backend/src/lib/token.ts` | auth |
| 3 | Cookie names hard-coded in three places; no access-cookie setter. (Refresh `maxAge` default 7 days already matches auth Q2 = B.) | `lib/http.ts`, `lib/auth-middleware.ts`, `frontend/src/proxy.ts` | auth |
| 4 | Rate limiter keys on the first `X-Forwarded-For` hop (browser-controlled), per process | `backend/src/lib/rate-limiter.ts` | auth (BR-REC-38; `TRUST_PROXY_HOPS` for the D-018 chain) |
| 5 | No Origin check on writes, no gzip, ETag or `Server-Timing` | `backend/src/app.ts` | Stream 0 |
| 6 | `PERMISSIONS` is empty: routes must register `{ type: 'any-authenticated' }` | `lib/permissions.ts` | api-contract BR-REC-159 |
| 7 | `bootstrap-admin` (with `--reset`, `--unlock`) and `seed` scripts listed in `backend/CLAUDE.md` but absent from `package.json` | `backend/package.json` | auth / Stream 0 |
| 8 | `drizzle()` has no `casing` option: give snake_case column names explicitly | `backend/src/db/client.ts` | Stream 0 |
| 9 | Not yet same-origin (D-018 decided): `NEXT_PUBLIC_API_URL` must be a full URL (target `/api`); no `/api` rewrite in `next.config.ts`; `frontend/CLAUDE.md` Env text describes a cross-site API; backend CORS then unneeded | `frontend/src/lib/env.ts`, `next.config.ts`, `backend/src/app.ts` | Stream 0 |
| 10 | `proxy.ts` checks cookie presence only; its matcher would also catch `/api/*` once same-origin; no server-side refresh; no redirect away from `/login` | `frontend/src/proxy.ts` | auth (BR-REC-39, 40, 42) |
| 11 | All three fonts (Outfit, Raleway, Geist Mono) are preloaded on every page with full defaults; spec keeps all three but preloads only Outfit, Raleway 600 only | `frontend/src/app/layout.tsx` | Stream 0 (BR-REC-150, 174) |
| 12 | `/` redirects to `/admin`: one extra round trip on cold open | `frontend/src/app/page.tsx` | Stream 0 (tactic 24) |
| 13 | Profile says `pwa: false`; no manifest | `frontend/CLAUDE.md` | performance (profile change needed) |
| 14 | Missing shadcn primitives: sheet, dialog, alert-dialog, badge, tabs, switch, checkbox, toggle-group; only a table list exists | `frontend/src/components/ui` | Stream 0 |
| 15 | nextjs-standards §14 (right-aligned buttons, Reset button) conflicts with the mobile action bar and "no Reset" | `docs/standards/nextjs-standards.md` | record override in `frontend/CLAUDE.md` (D-016) |
| 16 | ~~Root CLAUDE.md allows one branch + one worktree~~ — decided: D-017 is a scoped exception for this module; CLAUDE.md unchanged (the user may add a pointer) | `CLAUDE.md` | closed by D-017 |
| 17 | Open GitHub issues for `mod:member-records` not checked (no shell in the spec session) | GitHub | coordinator |

## Tech notes
- Lighthouse 12 removed the PWA category, so "installable" (BR-REC-151) is checked by a manifest test plus an
  offline reload test, not by a Lighthouse score.
- next/font: `preload: false` fonts are fetched by the browser only when an element on screen uses them;
  `adjustFontFallback` gives the size-adjusted fallback ([Next.js font docs](https://nextjs.org/docs/app/api-reference/components/font)).
- Font file sizes (BR-REC-174, budget 150 KB total, Outfit ≤ 40 KB): not measured yet — Stream 0 writes them here.
- Global sign-in lock (auth Q1 = B): one row in `login_attempts`; trade-off and limits in `auth.md` → Known trade-off.

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
1. `cd backend && docker compose up -d && bun run db:reset && bun run seed:perf` (local only).
2. Build and start API and frontend in production mode on one machine, Next forwarding `/api` (as D-018).
3. `cd backend && bun run bench` → p95 and gzip size per endpoint vs BR-REC-147, 148.
4. Lighthouse mobile (default throttling) on `/login`, `/admin`, `/admin/members`, a seeded member page and its
   `/assess` page → LCP, CLS vs BR-REC-142, 143; repeat view for BR-REC-145; bundle and font sizes for
   BR-REC-146, 174. CI runs the same on every PR once Stream G lands (BR-REC-173).
5. Write the numbers in History below.

## Tests
None yet.

## Known gaps / debt
See "Gaps found".

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-10-03 | — | Map created with spec v2 (split into 10 sub-specs); no feature code |
| 2026-10-03 | — | v2 answers folded (36 questions; D-017 own session+PR per stream, D-018 hosting); gaps 3, 9, 11, 16 updated; benchmark moved here from the index; tech notes added |
