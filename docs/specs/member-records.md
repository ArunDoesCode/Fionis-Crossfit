---
module: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 2
frozen_on: 2026-10-03          # v2 frozen with all 10 sub-specs
owner: Arun
depends_on: []
sub_specs: [data-model, api-contract, ux, performance, auth, members, setup, assessments, due-list, progress]
---
# Member records (assessment data entry + reports) — index

> Standalone first slice: digitise the paper binder; the full app later builds on `members`. v2 = 10 sub-specs in
> `docs/specs/member-records/`, built in parallel with `/feature member-records/<sub-spec>`, never on this index.

## Summary
A trainer enters each member's body-composition and fitness-test results, plus their membership term, on a
phone or tablet on the gym floor (mobile-first; desktop is the same layout, wider). Home shows who is overdue
for an assessment and whose membership is ending. Each member has a report card; the owner sees gym-wide
progress. Done = the whole paper binder is entered and the three outputs are right, within the speed budgets.

## Scope
In: one shared login · members + memberships · assessment setup · recording results · due dates + Home ·
report card, gym progress, CSV · mobile-first UI · speed budgets · installable app. Out: see Not now.

## Who can do what
| Action | Allowed |
|---|---|
| everything (members, memberships, assessments, setup, reports) | the one shared login (no roles) |
| open the Login page | anyone |
| create the login, reset a forgotten password, end a sign-in lock early, run seeds and migrations | developer, server commands |

## Flow
| Thing | States (derived from dates, never typed) | Rule |
|---|---|---|
| Membership | Active → Expiring (≤ lead days left) → Expired | BR-REC-08 |
| Assessment due (per member + type) | Not due → Upcoming → Overdue → Done (saved) | BR-REC-16, 17 |
| Member | Active ↔ Archived (hidden, still editable) | BR-REC-06, 58 |

## Sub-specs
| Sub-spec | What it decides | Rules | Endpoints | Tables | Screens |
|---|---|---|---|---|---|
| [data-model](member-records/data-model.md) | every table, constraint, index, seed commands | 10 | — | all 13 | — |
| [api-contract](member-records/api-contract.md) | conventions, the 40-endpoint table, error codes | 10 | all (list) | — | — |
| [ux](member-records/ux.md) | shell, navigation, words, fonts, components, a11y, tap budgets, screen index | 21 | — | — | shell |
| [performance](member-records/performance.md) | speed budgets, fonts budget, CI checks, installable app | 14 | E40 | — | — |
| [auth](member-records/auth.md) | shared login, JWT cookies, one global lock, page guard | 23 | E01–E06 | app_account, auth_sessions, login_attempts | S1, S17 |
| [members](member-records/members.md) | members, memberships, search, archive (still editable), renew | 23 | E16–E24 | members, membership_periods | S4–S9 |
| [setup](member-records/setup.md) | assessments catalog, settings, seed content | 17 | E07–E15 | gym_settings, assessment_types, metrics | S14–S16 |
| [assessments](member-records/assessments.md) | recording, editing, drafts, history | 24 | E25–E30 | assessments, measurements | S10, S11 |
| [due-list](member-records/due-list.md) | due-date engine, Home, Assess soon / Remind me later | 17 | E31–E34 | due_overrides | S2, S3 |
| [progress](member-records/progress.md) | report card, gym progress, leaderboards, CSV | 17 | E35–E39 | — | S12, S13, S18 |

Why: each feature sub-spec is one build stream with its own files; the four shared ones are built once, first
(Stream 0). The report sub-spec is named `progress` because "report" file names are reserved for run reports.

## Rule map
IDs are permanent and unique across sub-specs (strike out, never renumber). 176 rules, each with an example and
a Check. Next free ID: **BR-REC-177**.
| BR-REC | Sub-spec | | BR-REC | Sub-spec |
|---|---|---|---|---|
| 01–02, 25–44, 171 | auth | | 15–18, 93–105 | due-list |
| 03–09, 45–59, 172 | members | | 22–24, 106–119 | progress |
| 10, 11, 13, 14, 60–72 | setup | | 120–140 | ux |
| 12, 19–21, 73–92 | assessments | | 141–152, 173, 174 | performance |
| 153–162 | api-contract | | 163–170, 175, 176 | data-model |
v1 rules BR-REC-01…24 moved word for word; the v1 "Metric list" moved to setup.

## Parallel build plan
Freeze all ten sub-specs first (Stream 0 needs the contract and shared maths from several of them).
| Stream | Sub-spec | Starts after | Delivers |
|---|---|---|---|
| 0 Foundation | data-model, api-contract, ux (+ BR-REC-12, 51, 52, 94 maths, fonts BR-REC-150, 174) | freeze | all tables (Drizzle, `db:push`, no hand SQL) + `seed` (incl. the one `login_attempts` row) + `seed:perf`; every route registered (Zod + descriptor, handlers answer 501); change-log, idempotency, Origin check, gzip, Server-Timing, ETag middleware; `lib/domain/{dates,duration,membership}` in backend and frontend; `contract:generate` + `types:api`; full `API_ROUTES`; `/api` rewrite (same origin, D-018); root layout fonts; app shell, shared components, error-code dictionary; Home and Member-page frames with empty slots; empty route folders with `loading.tsx` + `error.tsx` |
| A | auth | M0 | E01–E06, `bootstrap-admin` (`--reset`, `--unlock`), `proxy.ts`, Login, Account |
| B | members | M0 | E16–E24, S4–S9, Home membership sections, archived banner |
| C | setup | M0 | E07–E15, S14–S16 |
| D | assessments | M0 | E25–E30, S10, S11, member "Recent" block, drafts |
| E | due-list | M0 | E31–E34, `computeDue`, Home due sections, S3, member "Assessments" block |
| F | progress | M0 | E35–E39, S12, S13, S18 |
| G | performance | M3 | Pass items: service worker + install, CI bundle/font/Lighthouse checks on every PR, vitals (E40), `bench`, deploy to the D-018 server |

Implementation status: built and merged: Streams 0, A–F (PRs #10, #11, #22, #23, #35, #33, #34); open: G (performance). Per-rule tests: `git grep -l 'BR-REC-NN' -- '*/tests/*'`; manual checks: `.pipeline/member-records-*/checklist.md`; as-built code: `docs/modules/member-records.md` and `docs/modules/member-records/<stream>.md`.

Merge points: **M0** Stream 0 → **M1** A (needed to click through anything) → **M2** C, B → **M3** D, E, F
→ **M4** G + scenario test (3 real binder members typed in end to end) + owner/coach check → done. A–F may
all run at once after M0: backend tests seed their own rows and mint tokens with `signAccessToken`; screens
are built against the contract and clicked through after M1/M2. After each merge: re-run `contract:generate`
and `types:api`, then all package checks.

Working copies (D-017, this module only): every stream runs in its own session, worktree and branch (made by the
desktop app from fresh `main`) and opens its own PR to `main` when done and green. Stream 0 merges first (M0);
A–F start from that `main`; later PRs merge in merge-point order and open streams sync from `main` after each.
No shared integration branch.

Shared files (everyone else reads only; a needed change goes to the coordinator, never a quiet edit):
| Files | Owner |
|---|---|
| `backend/src/db/**`, `scripts/seed*`, `routes/end-points.ts`, `routes/index.ts`, `lib/{audit,idempotency,origin-check,etag,server-timing}.ts`, `lib/domain/{dates,duration,membership}.ts` | Stream 0 |
| `backend/src/{types,routes,controller,service,repository}/<feature>*`, `lib/domain/due.ts` (E), `lib/domain/report.ts` (F) | that stream |
| `backend/src/lib/{token,auth-middleware,rate-limiter}.ts`, `scripts/bootstrap-admin.ts`, `frontend/src/proxy.ts` | A auth |
| `backend/src/lib/domain/metric-value.ts` (rounding; D assessments calls it) | C setup |
| `.contracts/*`, `frontend/src/types/api.generated.ts` | generated — re-run, never hand-merge |
| `frontend/src/{lib/api/{routes,client}.ts,lib/messages/**,lib/format.ts,lib/domain/**,lib/hooks/**,lib/searchParams.ts,components/common/**,components/shells/**}`, `next.config.ts`, `app/layout.tsx`, `app/(app)/admin/layout.tsx`, the Home and Member-page frames | Stream 0 |
| `frontend/src/components/pages/home/DueSections.tsx`, `pages/member/DueBlock.tsx` | E due-list |
| `frontend/src/components/pages/home/{MembershipSections,HomeSearch}.tsx`, `pages/member/{MemberHeader,MembershipBlock}.tsx` | B members |
| `frontend/src/components/pages/member/RecentBlock.tsx` | D assessments |
| `frontend/src/{lib/api,lib/validators,components/views,components/pages}/<feature>/**` + the routes in the ux screen index | that stream |
| `frontend/src/app/manifest.ts`, service worker, CI budget workflow, `backend/scripts/bench.ts`, deploy files | G performance |

Contract files that must exist before streams A–F start: the Drizzle schema, `routes/end-points.ts`,
every `types/*.types.ts`, `.contracts/{api-manifest,openapi}.json`, `frontend/src/types/api.generated.ts`,
`frontend/src/lib/api/routes.ts`, and the golden fixtures `duration-cases.json` and
`membership-end-cases.json` (test-writer, both packages, checked by `scripts/check-fixtures.sh`).
Benchmark notes and links (what we copy, what we skip): module map `docs/modules/member-records.md`.

## Not now
Food plan, lifestyle, medical history, payments, freezes/pauses, roles, attendance, member app, TV, insights and
personalisation rules (plateau flags, ratios, risk bands, personalised loads), server-side PDF, CSV import,
source-photo attachment. Added in v2: personal logins, signed-in device list, email password reset, saving
offline with later sync, reminders to members (WhatsApp/SMS), scale import, other languages, custom plans, multi-gym.

## v1 rules re-read (accepted by the owner at the v2 freeze)
v1 wording is kept; v2 reads it like this:
1. BR-REC-01 lock: one lock for the whole login, from any device or network (auth Q1 = B; BR-REC-28, 29, 171).
2. BR-REC-06 "vanish from search": gone from Home, due lists and normal search; listed only under the Members
   "Archived" chip, and still editable (members Q6 = B; BR-REC-57, 58, 172).
3. BR-REC-08 month-end clamp: monthly from 31 Jan ends 28 Feb (BR-REC-51); "recently Expired" = last 30 days (BR-REC-53).
4. BR-REC-10 better: a third value "No direction", used for Height (setup Q1 = A; BR-REC-63).
5. BR-REC-12 mm:ss: typed in two boxes, minutes and seconds (assessments Q3 = A; BR-REC-75).
6. BR-REC-16 due today: counts as Upcoming, shown "Due today" (due-list Q3 = A; BR-REC-96).
7. BR-REC-18 clearing: a flag clears only on a save dated on/after the day it was set; a snooze ends on save (BR-REC-98, 99).
8. BR-REC-19 blanks: when editing, emptying a saved field deletes that value (BR-REC-77).
9. BR-REC-21 warning: checked in the browser only; the server never blocks (BR-REC-82).

## Questions (all answered 2026-10-03)
All sub-spec questions answered in their files, including members Q7 = B (renewing an archived member restores them).
| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | What do SCW and SMW on the paper mean, and are they tracked? | **A** ask the coach, add later / B drop them | B |
| Q2 | Q1–Q4 columns on paper have no dates. How do we date historical entries? | **A** join date + 3-month steps, marked "estimated" / B ask the trainer for real dates | A |
| Q3 | Fran, Filthy 50, 5K: are the written numbers min:sec (e.g. "3:20")? Flexibility: what is measured (cm reach)? | **A** mm:ss, flexibility in cm / B other | A |
| Q4 | Warning at a 30% jump and "plateau" at < 1% change: right for the owner? | **A** yes, adjustable later / B other values | A |
| Q5 | Lead windows: Upcoming 7 days, Expiring 14 days. | **A** keep / B other | A |
| Q6 | (developer) Parallel sessions need separate working copies; the root CLAUDE.md allows one branch and one worktree. | **A** one worktree + branch per stream, merged into `work/member-records` at each merge point / B one session at a time | A → D-017 (own PR per stream, no integration branch) |
| Q7 | (developer) Hosting | **A** one small server in Mumbai (ap-south-1) next to Supabase, Next + API behind one address / B Vercel + a separate API host | A → D-018 |

## Changelog
- 2026-10-03 v0 — draft from owner scope discussion (benchmark step skipped: a records tool, not class scoring)
- 2026-10-03 v1 — frozen; Q1–Q5 answered (SCW/SMW dropped, others as recommended)
- 2026-10-03 v2 — changed after freeze: split into 10 sub-specs; BR-REC-01…24 moved word for word with the same
  IDs; new BR-REC-25…170; benchmark added; user decision: phone + tablet, mobile-first.
- 2026-10-03 v2 — answers folded: all 36 answered (auth Q1 = B global lock, Q2 = B 7-day sign-in; members Q6 = B
  archived stays editable + banner; performance Q1 = B three fonts; progress Q2 = B age bands; Q6/Q7 → D-017,
  D-018), members Q7 = B (auto-restore on a period covering today, BR-REC-58); new BR-REC-171…175;
  `MEMBER_ARCHIVED` removed; v1 re-read list added; benchmark moved to the map; no open questions left.
- 2026-10-03 v2 — frozen: index + 10 sub-specs; the 9 v1 re-reads accepted by the owner. Build process only: D-017 amended (own PR per stream, no integration branch); no rule changed.
- 2026-10-03 v2 — data-model v2 during the Stream 0 build (user: keep the MVP light): BR-REC-167 struck, BR-REC-169
  rewritten (no extensions, no hand-written SQL, dev/test `db:push`); Stream 0 row updated.
- 2026-10-03 v2 — ownership table completed during Stream 0 (HomeSearch slot → B; shared frontend libs → Stream 0); Stream 0 also added the `sid` claim to auth-owned `token.ts`/`auth-middleware.ts` (D-019). No rule changed.
- 2026-10-04 v2 — progress v2 during the Stream F build (user: keep the MVP light): BR-REC-110 computed live, no server cache; performance BR-REC-147 / tactic 19 follow; build clarifications P1–P14 in progress.md.
- 2026-10-04 v2 — data-model v3: new BR-REC-176 (`seed:demo`, MVP demo; next free ID BR-REC-177); ownership table: `metric-value.ts` → C setup; "Implementation status" replaced by one status paragraph (duplicate BR→test tables dropped, D-025)
