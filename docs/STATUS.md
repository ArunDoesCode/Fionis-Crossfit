# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-10-04 · **Milestone:** member-records M2 merged (members #22, setup #23); M3 in progress: due-list (E) built and verified on its branch, assessments (D) and progress (F) in their own sessions (`member/` skipped for the member-records MVP)
**Next action:** open the due-list PR (`claude/due-date-engine-overdue-871ad4`; checklist `.pipeline/member-records-due-list/checklist.md`), then Stream D must fix #24 before it merges (every save writes `assessments.updated_at`); F progress in its own session (D-017).

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| member-records (assessment entry, overdue list, report card, gym progress, membership terms) | frozen v2: index + 10 sub-specs (due-list v2 with build clarifications C1–C13) | current (Stream 0 + auth + members + setup + due-list) | partial: Stream 0, auth, members, setup on `main` (M2); due-list (E) on its branch, PR next | D, F (M3, own sessions) → G (M4) |
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
| member-records/due-list (Stream E) | `claude/due-date-engine-overdue-871ad4` | verified, ready for PR (1 review round, 0 blockers, all checks green) | — | you: "open the PR" |

## Waiting on you
- [ ] Due list: say "open the PR"; then run `.pipeline/member-records-due-list/checklist.md` on a phone (start: `cd backend && bun run db:reset && bun run bootstrap-admin`, API on 4005, web on 3005; the entry form needs Stream D).
- [ ] Due list: confirm the build clarifications C1–C13 in `docs/specs/member-records/due-list.md` (D-022); Stream D must fix #24 (every save writes `assessments.updated_at`).
- [ ] Run the auth manual checklist `.pipeline/member-records-auth/checklist.md` (start with `cd backend && bun run bootstrap-admin`).
- [ ] Setup checklist (`docs/WORKFLOW.md` §Setup): create the GitHub repo, protect `main`, install `gh`.
- [ ] Confirm decisions D-002 (single repo, no shared packages) and D-004 (own auth + SSE, Supabase only as Postgres).
- [ ] Decide: member login by email OTP or password — settled in the `auth-members` interview.

## Recently done
- 2026-10-04 — member-records due-list (Stream E) built and verified on its branch: E31–E34, `computeDue`, Home due sections, S3, row sheet, member block; 2218 backend + 1706 admin tests; 1 review round; E31 p95 ≈ 157 ms (D-022; issues #24, #25).
- 2026-10-04 — member-records members (B, #22) and setup (C, #23) merged to `main` (M2).
- 2026-10-04 — member-records members (Stream B) built and verified on its branch: E16–E24, S4–S9, Home search + sections; 472 backend + 324 admin tests; 3 review rounds (D-021; issues #16, #17, #20).
- 2026-10-03 — member-records spec PR #2, Stream 0 #10, auth #11 (M1) and the CI fix #12 merged to `main`.
- 2026-10-03 — member-records auth (Stream A) built and verified: E01–E06, lock, sessions, rate limits, `bootstrap-admin`, page guard, Login, Account (D-020; auth spec v2; issues #7–#9).
- 2026-10-03 — Stream 0 merged to `main` (#10, M0).
- 2026-10-03 — member-records Stream 0 (Foundation) built and verified on its branch (D-019; data-model v2; issues #3–#6).
- 2026-10-01 — workflow, agents, skills, hooks, standards and design drafts set up (not yet committed).
