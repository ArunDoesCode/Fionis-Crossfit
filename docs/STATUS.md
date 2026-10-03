# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-10-03 · **Milestone:** member-records M1 — auth in review (M0 Stream 0 merged #10; `member/` skipped for the member-records MVP)
**Next action:** review + squash-merge PR [#11](https://github.com/ArunDoesCode/Fionis-Crossfit/pull/11) (auth, M1) once CI is green; then start streams C setup + B members (M2) from fresh `main` — `/feature member-records/setup` and `/feature member-records/members`, one session/worktree/PR each (D-017), each with its own `DATABASE_URL_TEST` database.

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| member-records (assessment entry, overdue list, report card, gym progress, membership terms) | frozen v2: index + 10 sub-specs (data-model v2, auth v2) | current (Stream 0 + auth) | partial: Stream 0 on `main` (M0); auth in PR #11 | merge #11 (M1) → C + B (M2) → D, E, F (M3) → G (M4) |
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
| member-records auth (Stream A) | `claude/member-records-parallel-build-f18292` | PR open, CI running | [#11](https://github.com/ArunDoesCode/Fionis-Crossfit/pull/11) | you: review + squash-merge; manual checklist `.pipeline/member-records-auth/checklist.md` |

## Waiting on you
- [ ] Review + squash-merge PR #11 (auth); run its manual checklist (start with `cd backend && bun run bootstrap-admin`).
- [ ] Setup checklist (`docs/WORKFLOW.md` §Setup): create the GitHub repo, protect `main`, install `gh`.
- [ ] Confirm decisions D-002 (single repo, no shared packages) and D-004 (own auth + SSE, Supabase only as Postgres).
- [ ] Decide: member login by email OTP or password — settled in the `auth-members` interview.

## Recently done
- 2026-10-03 — member-records auth (Stream A) built and verified: E01–E06, lock, sessions, rate limits, `bootstrap-admin`, page guard, Login, Account (D-020; auth spec v2; issues #7–#9).
- 2026-10-03 — Stream 0 merged to `main` (#10, M0).
- 2026-10-03 — member-records Stream 0 (Foundation) built and verified on its branch (D-019; data-model v2; issues #3–#6).
- 2026-10-01 — workflow, agents, skills, hooks, standards and design drafts set up (not yet committed).
