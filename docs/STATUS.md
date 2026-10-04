# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-10-04 · **Milestone:** member-records M1 done (Stream 0 #10, auth #11 merged); M2 in progress: Stream C setup built on its branch (PR when you ask), Stream B members is its own session and PR (`member/` skipped for the member-records MVP)
**Next action:** setup (Stream C) is ready: answer "open the PR" in the setup session, and confirm the spec clarifications C1–C13 (`docs/specs/member-records/setup.md` → Build clarifications). Then members (B) finishes M2; D, E, F (M3) start from fresh `main` — steps in the map → "Starting a stream session". Before D starts, fix the shared `NumberField` minus sign (#21).

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| member-records (assessment entry, overdue list, report card, gym progress, membership terms) | frozen v2: index + 10 sub-specs (data-model v2, auth v2, setup v2) | current (Stream 0, auth, setup) | partial: Stream 0 (M0) + auth (M1) on `main`; setup (C) on its branch | B (M2) → D, E, F (M3) → G (M4) |
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
| member-records/setup (Stream C) | `claude/member-records-setup-8ce4cb` | built and verified (2 review rounds, checks green) | not opened | your "open the PR" + owner confirmation of C1–C13 |

## Waiting on you
- [ ] Run the setup manual checklist `.pipeline/member-records-setup/checklist.md` (needs the API and frontend running; steps inside).
- [ ] Run the auth manual checklist `.pipeline/member-records-auth/checklist.md` (start with `cd backend && bun run bootstrap-admin`).
- [ ] Setup checklist (`docs/WORKFLOW.md` §Setup): create the GitHub repo, protect `main`, install `gh`.
- [ ] Confirm decisions D-002 (single repo, no shared packages) and D-004 (own auth + SSE, Supabase only as Postgres).
- [ ] Decide: member login by email OTP or password — settled in the `auth-members` interview.

## Recently done
- 2026-10-04 — member-records setup (Stream C) built and verified: E07–E15, `roundMetricValue`, S14–S16; 574 backend + 334 admin tests; spec setup.md v2 (C1–C13); D-021; issues #18, #19, #21.
- 2026-10-03 — member-records spec PR #2, Stream 0 #10, auth #11 (M1) and the CI fix #12 merged to `main`.
- 2026-10-03 — member-records auth (Stream A) built and verified: E01–E06, lock, sessions, rate limits, `bootstrap-admin`, page guard, Login, Account (D-020; auth spec v2; issues #7–#9).
- 2026-10-03 — Stream 0 merged to `main` (#10, M0).
- 2026-10-03 — member-records Stream 0 (Foundation) built and verified on its branch (D-019; data-model v2; issues #3–#6).
- 2026-10-01 — workflow, agents, skills, hooks, standards and design drafts set up (not yet committed).
