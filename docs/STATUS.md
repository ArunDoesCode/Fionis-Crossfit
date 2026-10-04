# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-10-04 · **Milestone:** member-records M1 done (Stream 0 #10 and auth #11 merged); M2 in progress: members (B) built and verified on its branch, setup (C) in its own session (`member/` skipped for the member-records MVP)
**Next action:** open the members PR (`claude/member-records-feature-8fca5b`; checklist `.pipeline/member-records-members/checklist.md`), then after M2 start D assessments, E due-list, F progress as three sessions from fresh `main` (D-017; steps in the map → "Starting a stream session").

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| member-records (assessment entry, overdue list, report card, gym progress, membership terms) | frozen v2: index + 10 sub-specs (data-model v2, auth v2, members v1 + build clarifications) | current (Stream 0 + auth + members) | partial: Stream 0 (M0) + auth (M1) on `main`; members (B) on its branch, PR next | C (M2, own session) → D, E, F (M3) → G (M4) |
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

## Waiting on you
- [ ] Members: say "open the PR"; then run `.pipeline/member-records-members/checklist.md` on a phone (start: `cd backend && bun run db:reset && bun run bootstrap-admin`, API on 4002, web on 3002).
- [ ] Members: confirm two build choices (D-021): E19 join-date rule only when the join date changes; E16 name order word-by-word without the name index (bench in G).
- [ ] Run the auth manual checklist `.pipeline/member-records-auth/checklist.md` (start with `cd backend && bun run bootstrap-admin`).
- [ ] Setup checklist (`docs/WORKFLOW.md` §Setup): create the GitHub repo, protect `main`, install `gh`.
- [ ] Confirm decisions D-002 (single repo, no shared packages) and D-004 (own auth + SSE, Supabase only as Postgres).
- [ ] Decide: member login by email OTP or password — settled in the `auth-members` interview.

## Recently done
- 2026-10-04 — member-records members (Stream B) built and verified on its branch: E16–E24, S4–S9, Home search + sections; 472 backend + 324 admin tests; 3 review rounds (D-021; issues #16, #17, #20).
- 2026-10-03 — member-records spec PR #2, Stream 0 #10, auth #11 (M1) and the CI fix #12 merged to `main`.
- 2026-10-03 — member-records auth (Stream A) built and verified: E01–E06, lock, sessions, rate limits, `bootstrap-admin`, page guard, Login, Account (D-020; auth spec v2; issues #7–#9).
- 2026-10-03 — Stream 0 merged to `main` (#10, M0).
- 2026-10-03 — member-records Stream 0 (Foundation) built and verified on its branch (D-019; data-model v2; issues #3–#6).
- 2026-10-01 — workflow, agents, skills, hooks, standards and design drafts set up (not yet committed).
