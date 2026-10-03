# Project status — pick up here

> Single entry point for "where are we and what's next". Updated by `/feature` (at phase changes and in
> every PR), `/status` (on demand) and `/wrap`. Humans: read this, then run `/status`.

**Updated:** 2026-10-03 · **Milestone:** M0 Foundations (backend + frontend scaffolded; `member/` skipped for the member-records MVP)
**Next action:** merge the member-records spec PR, start Postgres once (`docker compose up -d` in `backend/`), then open a new session for Stream 0 (Foundation); streams A–F start after M0 is merged (index → Parallel build plan; each stream = own session, worktree and PR, D-017).

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| member-records (assessment entry, overdue list, report card, gym progress, membership terms) | frozen v2: index + 10 frozen sub-specs, 175 rules, 0 open questions | stub (gaps, benchmark, tech notes) | none | Stream 0 → streams A–F in parallel worktrees (D-017) |
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
| — | — | none active | — | — |

## Waiting on you
- [ ] Setup checklist (`docs/WORKFLOW.md` §Setup): create the GitHub repo, protect `main`, install `gh`.
- [ ] Confirm decisions D-002 (single repo, no shared packages) and D-004 (own auth + SSE, Supabase only as Postgres).
- [ ] Decide: member login by email OTP or password — settled in the `auth-members` interview.

## Recently done
- 2026-10-01 — workflow, agents, skills, hooks, standards and design drafts set up (not yet committed).
