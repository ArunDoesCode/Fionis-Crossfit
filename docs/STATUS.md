# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-10-04 · **Milestone:** member-records M2 merged (B #22, C #23); M3 in progress: progress (F) built and verified on its branch, assessments (D) and due-list (E) in their own sessions
**Next action:** run the progress checklist (`.pipeline/member-records-progress/checklist.md`) and merge the progress PR (`claude/feature-f-progress-report-6c2bbe`); D and E merge from their own sessions → M4: performance (G) + scenario test + owner/coach check.
**Updated:** 2026-10-04 · **Milestone:** member-records M2 merged (members #22, setup #23); M3 in progress: assessments (D) built and verified on its branch, due-list (E) and progress (F) in their own sessions (`member/` skipped for the member-records MVP)
**Next action:** open the assessments PR (`claude/member-record-assessment-696977`; checklist `.pipeline/member-records-assessments/checklist.md`; say "open the PR" in that session). Then due-list (E) and progress (F) finish M3; before the PR of E merges, E must root its query keys at `'due'` (BR-REC-88). Confirm the build clarifications D1–D21 in `docs/specs/member-records/assessments.md`.

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| member-records (assessment entry, overdue list, report card, gym progress, membership terms) | frozen v2: index + 10 sub-specs (data-model v2, auth v2, setup v2, assessments v2) | current (Stream 0, auth, members, setup, assessments) | partial: Stream 0, auth, members, setup on `main`; assessments (D) on its branch | E, F (M3, own sessions) → G (M4) |
| auth-members (login, invites, roles, permissions) | none | — | none | M1 — `/spec auth-members` |
| workouts (library, benchmarks, versions, timer config) | none | — | none | M1 |
| sessions (templates, schedule, lifecycle state machine, jobs) | none | — | none | M1 |
| attendance (QR check-in, manual add) | none | — | none | M1 |
| results (submit, validate, correct, audit, idempotency) | none | — | none | M1 |
| scoring-board (baseline, perf index, board, PR) | none | — | none | M2 |
| achievements (catalog, streaks, awards, revocation) | none | — | none | M2 |
| tv-feed (snapshot, SSE, outbox, heartbeat) | none | — | none | M3 |
| tv-scenes (ambient, gather, workout, live board, overlay, credits, lab) | none | — | none | M3 (several sub-specs) |
| member-app (today, check-in, result entry, history, progress, boards) | none | — | none | M4 |
| push (tokens, reminders, results-open) | none | — | none | M4 |
| membership-payments | none | — | none | after the pilot |

Legend — Code: none / schema only / partial / full. Tests per module: see each map's **Tests** table.

## Active pipelines
| Feature | Branch | Phase | PR | Waiting on |
|---|---|---|---|---|
| member-records/members (Stream B) | `claude/member-records-feature-8fca5b` | verified, ready for PR (review 3 rounds, 2 fix rounds, all checks green) | — | you: "open the PR" |
| member-records/setup (Stream C) | `claude/member-records-setup-8ce4cb` | own session (not this one) | — | — |
| member-records/progress (Stream F) | `claude/feature-f-progress-report-6c2bbe` | PR open (1 review round, 0 blocker/major after fixes, 6 minors → issues #26–#31; owner decision O-1 done) | see the PR from this branch | you: manual checklist, then merge |

## Waiting on you
- [ ] Progress: run `.pipeline/member-records-progress/checklist.md` on a phone and do the print check (BR-REC-109) on Chrome Android + desktop (start: `cd backend && bun run db:reset && bun run seed:perf && bun run bootstrap-admin`, API 4006, web 3006).
- [ ] Members: say "open the PR"; then run `.pipeline/member-records-members/checklist.md` on a phone (start: `cd backend && bun run db:reset && bun run bootstrap-admin`, API on 4002, web on 3002).
- [ ] Members: confirm two build choices (D-021): E19 join-date rule only when the join date changes; E16 name order word-by-word without the name index (bench in G).
| member-records/assessments (Stream D) | `claude/member-record-assessment-696977` | built and verified (2 review rounds, 2 fix iterations, checks green) | not opened | your "open the PR" + owner confirmation of D1–D21 |

## Waiting on you
- [ ] Assessments: say "open the PR"; then run `.pipeline/member-records-assessments/checklist.md` on a phone (start: `cd backend && bun run db:reset && bun run bootstrap-admin`, API on 4003, web on 3003).
- [ ] Assessments: confirm the build choices (D-022) and spec D1–D21; decide whether the move-date screen (#32) is needed for the pilot.
- [ ] Members and setup checklists (`.pipeline/member-records-{members,setup}/checklist.md`), and the members choices in D-021 (E19 join-date rule; E16 name order).
- [ ] Run the auth manual checklist `.pipeline/member-records-auth/checklist.md` (start with `cd backend && bun run bootstrap-admin`).
- [ ] Setup checklist (`docs/WORKFLOW.md` §Setup): create the GitHub repo, protect `main`, install `gh`.
- [ ] Confirm decisions D-002 (single repo, no shared packages) and D-004 (own auth + SSE, Supabase only as Postgres).
- [ ] Decide: member login by email OTP or password — settled in the `auth-members` interview.

## Recently done
- 2026-10-04 — member-records progress (Stream F) built and verified on its branch: E35–E39, S12 report card, S13 gym progress, S18 export; no server cache (D-022); 2226 backend + 1805 admin tests; review READY (issues #26–#31).
- 2026-10-04 — member-records assessments (Stream D) built and verified: E25–E30, S10, S11, Recent block, shared field fixes (#19, #21); 2185 backend + 2430 admin tests; spec assessments v2 (D1–D21); D-022; issues #32 (+ comments on #19, #21).
- 2026-10-04 — member-records members (B, #22) and setup (C, #23) merged: M2 done.
- 2026-10-04 — member-records members (Stream B) built and verified on its branch: E16–E24, S4–S9, Home search + sections; 472 backend + 324 admin tests; 3 review rounds (D-021; issues #16, #17, #20).
- 2026-10-03 — member-records spec PR #2, Stream 0 #10, auth #11 (M1) and the CI fix #12 merged to `main`.
- 2026-10-03 — member-records auth (Stream A) built and verified: E01–E06, lock, sessions, rate limits, `bootstrap-admin`, page guard, Login, Account (D-020; auth spec v2; issues #7–#9).
- 2026-10-03 — Stream 0 merged to `main` (#10, M0).
- 2026-10-03 — member-records Stream 0 (Foundation) built and verified on its branch (D-019; data-model v2; issues #3–#6).
- 2026-10-01 — workflow, agents, skills, hooks, standards and design drafts set up (not yet committed).
