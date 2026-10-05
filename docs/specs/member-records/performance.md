---
module: member-records/performance
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 3
frozen_on: 2026-10-05
owner: Arun
depends_on: [member-records/ux, member-records/api-contract, member-records/data-model]
---
# Member records · Speed budgets and how we meet them

## Summary

The app must feel instant on a mid-range Android phone on gym Wi-Fi. This sub-spec sets measurable budgets
every stream must meet, and lists the techniques: MVP ones each stream builds as it goes, Pass ones built by
the performance stream at the end, Later ones only if a budget fails. Done = every budget below passes on the
production build with the 1,000-member perf seed, and CI checks them on every PR.

## Owns

Rules BR-REC-141…152, 173, 174, 208…215 · endpoint E40 · the tactics table · CI budget checks, installable app, service
worker, `bench` script. Every other stream must meet BR-REC-142…149 on its own screens and endpoints; Stream 0
meets BR-REC-150 and 174 (fonts) in the root layout.

## Who can do what

| Action | Allowed |
|---|---|
| send speed measurements (E40) | the shared login's app, automatically |

## Rules

| ID | Rule | Example (given → then) | Check |
|---|---|---|---|
| BR-REC-141 | Budgets are measured on the production build with the perf seed (BR-REC-170), Lighthouse mobile settings (mid-range Android, 4× CPU slowdown, 150 ms round trip, 1.6 Mbps), on the D-018 setup: Next + API on one server, database in the same region. | Same numbers on every run ± 10% | Run book at the end of this file |
| BR-REC-142 | Largest content shows within 2.0 s on Login, Home, Members, Member page and Record assessment, and within 2.5 s on every other screen. | Home cold open → list visible at 1.8 s | Lighthouse LCP |
| BR-REC-143 | Nothing jumps while loading: layout shift at most 0.05 on every screen, fonts swapping in included. | Skeleton rows have the real row height | Lighthouse CLS |
| BR-REC-144 | Every tap answers within 200 ms; typing in Record assessment updates the change line within 50 ms on the test phone. | Type "94" → "v 1.5 kg better" appears at once | INP field data + manual check |
| BR-REC-145 | A repeat open (installed or recently used) shows the Home frame within 1.0 s and Home data within 1.5 s on gym Wi-Fi. | Open from the home-screen icon → frame first, rows right after | Lighthouse repeat view |
| BR-REC-146 | ~~First-load JavaScript is at most 150 KB gzip shared plus 40 KB per screen; CI fails above it; no chart, date-picker or whole-icon-pack library ever ships.~~ Superseded by BR-REC-215 (v2). | — | — |
| BR-REC-147 | API p95 server time (warm, perf seed): lists and search 150 ms, member page 100 ms, entry form 120 ms, save assessment 200 ms, due list 300 ms, report card 300 ms, gym progress 500 ms (no cache, progress v2), CSV first byte 1 s. | Search "sur" on 1,000 members → 40 ms | `bench` script, 200 runs per endpoint, reads `Server-Timing` |
| BR-REC-148 | Response sizes (gzip): a 25-row list page ≤ 10 KB, entry form ≤ 8 KB, report card ≤ 30 KB, catalog ≤ 10 KB. | Members page 1 → 4 KB | `bench` records sizes |
| BR-REC-149 | A screen loads with one page request and at most 4 API calls, all started together; no call waits for another. | Home = 4 parallel calls from the server | Network waterfall review |
| BR-REC-150 | ~~Three self-hosted fonts … Raleway (titles) …~~ Superseded by BR-REC-214 (v2: Poppins replaces Raleway). | — | — |
| BR-REC-174 | All font files together are at most 150 KB and Outfit alone at most 40 KB (woff2); icons are single SVG imports and the only pictures are the app icon and the Fionis logo (v2). | A fourth font, or Poppins in every weight → CI red | CI sums the `latin` `.woff2` files in the build output (the only ones a screen can fetch; `next/font` also emits other unicode-range subsets the browser never downloads) |
| BR-REC-151 | The app installs to the home screen (opens at `/admin`, full screen) and a service worker keeps the app frame and static files so it opens on bad Wi-Fi; it never stores API data; a new version shows "Update ready — Reload". | Wi-fi off, open app → frame + offline banner | CI manifest test (name, start `/admin`, standalone, icons) + offline reload test |
| BR-REC-152 | Each page view reports LCP, INP and CLS to E40 in one background request, so real-phone speed is visible to the developer. | Trainer opens Home → one `vitals` log line | Log check |
| BR-REC-173 | Every PR, once Stream G has added the checks, runs the bundle and font check and Lighthouse mobile on Login, Home, Members, a seeded member page and Record assessment against a seeded production build; missing BR-REC-142, 143, 215 or 174 fails the PR (v2: the `next build` + bundle part runs from slice U1, BR-REC-210). | PR adds a chart library → bundle check red, PR cannot merge | CI workflow on the PR; a deliberately oversized branch fails |
| BR-REC-208 | Prefetch on intent: list rows, Home rows and member links start the route and the member's data (member, recent assessments, due block) on hover, focus or touch-start; tabs prefetch their sibling tab's data; "Record assessment" preloads the form code and the catalog. | Hover Surya's row, click → member page shows data with no skeleton | Network log: requests start on hover; no `prefetch={false}` without an intent handler |
| BR-REC-209 | Data is not refetched on window focus; due and progress data stay fresh 30 s, the catalog and settings 10 min (ETag), entry forms are always fresh; a write refreshes only the data it changes (an assessment save → that member, member list, directory and due lists, never every `members` key); a sheet closes when the write answers, not after the refetch. | Alt-tab away and back on Home → 0 requests | Query-client config test; invalidation test per mutation |
| BR-REC-210 | The shared browser bundle carries no Zod (the public env value is read directly; Zod stays on the server and in form screens); CI runs `next build` and fails above BR-REC-215; unused packages are removed (Zustand and `lib/store` unless a screen needs them; TanStack Table stays for the desktop tables, ux BR-REC-183; `date-fns` stays for the calendar). | `lib/api/client.ts` imports Zod → bundle check red | CI build step + chunk-size report written to the module map |
| BR-REC-211 | Client hot paths are cheap: icons tree-shaken (`optimizePackageImports`), no `X-Powered-By`, compression done once (Brotli at the HTTPS front when present), one cached day formatter behind the today hook, draft autosave written at most every 300 ms and on page hide, no costly backdrop blur on overlays. | 5 components read "today" → one `Intl.DateTimeFormat` built | Profiler check; `curl -I` shows one `content-encoding` |
| BR-REC-212 | API: Home's two due sections share one due computation per request; the due engine skips archived members in SQL; E18 reads settings, member and periods in parallel; the database pool size and idle timeout are set for the D-018 server; E16, E18, E24, E31 and E35 send an `ETag` (BR-REC-160). | Home → one due computation, ≤ 10 database queries | `bench` + `Server-Timing`; route tests for 304 |
| BR-REC-213 | Server prefetch (tactic 1, #20): Home and the member page start their API calls on the server and hand the data to the screen; other screens start in the browser (Q6 = A). | Home cold open → due rows in the first HTML | Lighthouse LCP ≤ 2.0 s on Home and member page |
| BR-REC-214 | Three self-hosted fonts, Latin only, each showing text at once in a size-matched fallback and swapping in without a jump: Outfit (all text) is the only one preloaded; Poppins 600 (titles, ux v2) and Geist Mono (number columns) download only when the screen shows them. | Open Login → Outfit preloaded, Poppins fetched for the title, Geist Mono never requested | Network review per screen; CLS check of BR-REC-143; fonts ≤ BR-REC-174 |
| BR-REC-215 | First-load JavaScript is at most 150 KB gzip shared plus 40 KB per screen; CI fails above it; no chart or whole-icon-pack library ships; the shadcn Calendar (`react-day-picker`) is allowed only as an on-demand chunk loaded when a date picker opens, never in the shared chunk or a screen's first load. | `/assess` first load unchanged after the DatePicker lands; Calendar chunk fetched on first open | CI bundle check; network log on opening a picker |

## Tactics

MVP = each stream builds it with its screens · Pass = performance stream, last · Later = only if a budget fails.

| # | Tactic | When | Owner |
|---|---|---|---|
| 1 | Pages start their API calls on the server (same machine, D-018) and hand data to the screen pre-filled (HydrationBoundary); each section streams in its own Suspense with a skeleton | MVP | all |
| 2 | API on the same address under `/api` (D-018) → no CORS preflight requests (BR-REC-36) | MVP | Stream 0, auth |
| 3 | Page guard refreshes sign-in on the server → no bounce through Login (BR-REC-40) | MVP | auth |
| 4 | Code split per route (App Router default); sheets, dialogs and the print layout load on demand | MVP | all |
| 5 | Trend lines and bars are SVG drawn on the server → no chart JavaScript | MVP | progress |
| 6 | Prefetch on intent (v2: BR-REC-208, not built in v1): tabs prefetch; long lists use `prefetch={false}` and start route + data prefetch on touch-start/hover | MVP | all |
| 7 | TanStack Query: 30 s fresh time; catalog and settings 10 min + ETag; keep previous page while paging; "Show more" with infinite query; v2: no focus refetch, narrow invalidation (BR-REC-209) | MVP | all |
| 8 | Optimistic updates for Assess soon, Remind me later, clear, archive/restore, turn on/off (undo on error); never for saving results or adding members | MVP | due-list, members, setup |
| 9 | ~~Search: 250 ms debounce, 2-letter minimum, older requests cancelled, results cached per text~~ — v2: search filters the cached member directory in the browser, no debounce (members BR-REC-203) | MVP | members |
| 10 | Skeletons the same size as content; reserved message lines; fixed field heights | MVP | all |
| 11 | Indexes: name (lower) and last-10-phone-digits b-tree; member + measurement + date; measurement + date (data-model). Trigram search indexes only if a budget fails (data-model v2) | MVP | Stream 0 |
| 12 | No N+1: list rows get last assessment and membership status in one query; due engine = 3 queries then a pure function | MVP | members, due-list |
| 13 | Offset paging per the standard with a parallel count; keyset paging only past 10,000 rows | Later | — |
| 14 | Lists return only the columns shown; dates as strings | MVP | all |
| 15 | gzip from the API over 1 KB; Brotli for static files from the HTTPS front on the server (D-018) | MVP / Pass | Stream 0 / deploy |
| 16 | ETag 304s for catalog and settings; `/_next/static` cached for a year (Next default); API `private, no-store` | MVP | Stream 0 |
| 17 | Keep-alive connections browser → Next → API (same machine); one Postgres pool per process (max 10) | MVP | Stream 0 |
| 18 | One server in Mumbai (ap-south-1) next to Supabase (D-018): Next → API is a local hop, API → database ≤ 5 ms | Pass | deploy |
| 19 | ~~Gym progress cached in memory by filters, cleared on every write~~ — dropped: computed live (progress v2, BR-REC-110) | — | progress |
| 20 | Pre-computed per-member summary table for progress and leaderboards | Later | — |
| 21 | Virtualised lists — only if a screen ever renders more than 100 rows | Later | — |
| 22 | Fonts via `next/font/google` (downloaded at build, served from our server): `subsets: ['latin']`, `display: 'swap'`, `adjustFontFallback` on; Outfit variable with `preload: true`; Poppins (v2, was Raleway) weight 600 only and Geist Mono variable with `preload: false`. Estimate ≈ 100–130 KB for all three; Stream 0 writes the real sizes in the map | MVP | Stream 0 |
| 23 | Icons imported one by one from `@hugeicons/core-free-icons`; no component barrel imports; React Compiler on | MVP | all |
| 24 | Links and the installed app open `/admin` directly (the `/` → `/admin` redirect costs a round trip) | MVP | Stream 0 |
| 25 | `Server-Timing` (db, total) on every API response | MVP | Stream 0 |
| 26 | Installable manifest + Serwist service worker: precache static files, network-first pages, `/api` network-only (Q2) | Pass | performance |
| 27 | Bundle + font budget check in CI on every PR (Turbopack analyzer or chunk-size script; BR-REC-173) | Pass | performance |
| 28 | Lighthouse CI (mobile) on the five key screens against a seeded production build on every PR (BR-REC-173) | Pass | performance |
| 29 | Web-vitals beacon (BR-REC-152) | Pass | performance |
| 30 | Prepared statements through a session pooler; `zod/mini` in the browser | Later | — |

## Not now

Edge rendering, a CDN for API responses, offline saving with background sync, image optimisation (there are no images).

## Questions (Q1–Q3 answered 2026-10-03; Q6 answered 2026-10-05; 0 open — v2 Q1–Q5, Q7, Q8 are in ux.md)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Fonts | **A** Outfit for everything / B keep Raleway headings and Geist Mono | **B** keep all three → BR-REC-150, 174, tactic 22 |
| Q2 | Installable app + offline frame in this module | **A** yes, built last / B later | **A** → BR-REC-151, tactic 26 |
| Q3 | (developer) Lighthouse and bundle checks | **A** in CI on every PR / B by hand before hand-over | **A** → BR-REC-173, tactics 27–28 |
| Q6 | (v2) Server prefetch (tactic 1, #20) | **A** Home and member page only / B every screen / C drop to Later | **A** (owner, 2026-10-05) → BR-REC-213 |

## Build clarifications (U6, owner scope cut 2026-10-05)

The owner asked for U6 to stay simple: minimal code, the biggest wins, lazy loading where cheap, no complicated fetching or caching. Delivered in U6: BR-REC-208 (row and member links no longer opt out of prefetching, plus the existing hover prefetch of the member's data; no sibling-tab or form preloading), BR-REC-209 (no refetch on window focus; 30 s default freshness; entry forms always fresh; the assessment save refreshes the member list and directory instead of every `members` key), BR-REC-210 (no Zod in the shared client bundle; CI runs `next build`; dead packages removed), BR-REC-211 (icons, powered-by header, one cached day formatter, 300 ms draft autosave, no overlay blur), BR-REC-212 in part (E18 reads in parallel; pool size and idle timeout; due engine skips archived members in SQL). Deferred by the owner, still open: BR-REC-212 ETag on lists and the shared Home due computation, BR-REC-213 server prefetch (#20), sibling-tab prefetch (BR-REC-208 tail).

## Changelog
- 2026-10-05 v3 — owner scope cut for U6 (simple, minimal): which of BR-REC-208…213 ship now and which are deferred; no rule changed
- 2026-10-05 v2 — re-frozen by the owner after the UX redesign review (#59); all open questions answered
- 2026-10-03 v0 — draft, new in member-records v2
- 2026-10-03 v0 — answers folded: three fonts kept (BR-REC-150 rewritten, new BR-REC-174 font bytes, tactic 22);
  CI on every PR (new BR-REC-173); BR-REC-151 checked by a manifest test (Lighthouse 12 has no PWA audit); D-018
  setup in BR-REC-141 and tactics 1, 2, 15, 17, 18
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-03 v1 — tactic 11 follows data-model v2 (no trigram or exclusion indexes); no rule changed
- 2026-10-03 v1 — clarified during build (Stream 0): BR-REC-174 counts the `latin` font files (measured: Outfit 31.5 KB, all three 71.5 KB); `next/font/google` emits every unicode subset (166 KB in total) but only `latin` is ever fetched; no rule changed
- 2026-10-04 v1 — user decision during the Stream F build (progress v2): no server cache for gym progress — BR-REC-147 drops "50 ms cached" (500 ms stays), tactic 19 dropped
- 2026-10-05 v2 — changed after freeze (owner UAT #59, perf audit #54–#58, #20; D-029, D-030, D-031): BR-REC-146
  superseded by 215 (shadcn Calendar allowed as an on-demand chunk); BR-REC-150 superseded by 214 (Poppins replaces
  Raleway); 173 example and 174 wording follow; new BR-REC-208…213 (prefetch on intent, freshness + narrow
  invalidation, Zod out of the shared chunk + `next build` in CI, client hot paths, API dedupe/parallel/pool/ETag,
  server prefetch for Home + member page); tactic 9 struck (browser search), tactics 6, 7, 22 updated; Q6 open
- 2026-10-05 v2 — Q6 = A (owner): server prefetch for Home and the member page only (BR-REC-213, tactic 1 limited to
  those two screens); BR-REC-174 "Fionis logo" = `public/Fionis-Logo.avif` (raster, AVIF); 0 open

## Run book

How to measure BR-REC-141 (moved here from the module map).
1. `cd backend && docker compose up -d && bun run db:reset && bun run seed:perf` (local only; ~15 s for 1,000 members, ~343k values).
2. Build and start API and frontend in production mode on one machine, Next forwarding `/api` (as D-018).
3. `cd backend && bun run bench` → p95 and gzip size per endpoint vs BR-REC-147, 148.
4. Lighthouse mobile (default throttling) on `/login`, `/admin`, `/admin/members`, a seeded member page and its
   `/assess` page → LCP, CLS vs BR-REC-142, 143; repeat view for BR-REC-145; bundle and font sizes for
   BR-REC-146, 174. CI runs the same on every PR once Stream G lands (BR-REC-173).
5. Write the numbers in the History table of the module map (`docs/modules/member-records.md`).
