# Project status — pick up here

> Entry point for "where are we and what's next". Updated by `/status`, `/wrap` and, after each merge, by the coordinator in one docs commit (D-025).

**Updated:** 2026-10-05 (UX v10 built) · **Milestone:** member-records: Streams 0, A–F merged to `main` (M0–M3); Stream G (performance, M4) still open
**Next action:** run the manual checklists on a phone (start: `cd backend && bun run db:reset && bun run seed:demo && bun run bootstrap-admin`), then build Stream G.

## Modules
| Module | Spec | Map | Code | Next step |
|---|---|---|---|---|
| member-records (assessment entry, due list, report card, gym progress, membership terms) | frozen v3: index + 10 sub-specs (ux v2 desktop-first, frozen 2026-10-05) | current (Streams 0, A–F) | Streams 0, A–F on `main`; G open | G (M4), scenario test, owner/coach check |
| auth-members (login, invites, roles, permissions) | none | — | none | after member-records; first `/spec auth-members` |
| workouts (library, benchmarks, versions, timer config) | none | — | none | after member-records |
| sessions (templates, schedule, lifecycle, jobs) | none | — | none | after member-records |
| attendance (QR check-in, manual add) | none | — | none | after member-records |
| results (submit, validate, correct, audit, idempotency) | none | — | none | after member-records |
| scoring-board (baseline, perf index, board, PR) | none | — | none | after member-records |
| achievements (catalog, streaks, awards, revocation) | none | — | none | after member-records |
| tv-feed (snapshot, SSE, outbox, heartbeat) | none | — | none | after member-records |
| tv-scenes (ambient, gather, workout, live board, overlay, credits, lab) | none | — | none | after member-records (several sub-specs) |
| member-app (today, check-in, result entry, history, progress, boards) | none | — | none | after member-records |
| push (tokens, reminders, results-open) | none | — | none | after member-records |
| membership-payments | none | — | none | after the pilot |

Legend — Code: none / schema only / partial / full. Tests per module: see each map's **Tests** table.

## Active pipelines
| Feature | Branch | Phase | PR | Waiting on |
|---|---|---|---|---|
| UX v10 visual refresh "Navy & Flame" (ux v10–v16, D-037, D-038) | `claude/admin-tool-design-refresh-974c68` | built S1–S4 + 2 review rounds; all frontend checks green; not pushed | not opened | owner: browser check `.pipeline/member-records-ux-v10/checklist.md`, then PR |
| docs cleanup + `seed:demo` (BR-REC-176) | `work/mvp-demo-prep` | built; DB tests not yet run (no env files in this worktree) | not opened | owner creates the env files, then tests + PR |

## Waiting on you
- [ ] Browser-check UX v10 (`.pipeline/member-records-ux-v10/checklist.md`, before/after in `docs/design/admin-ui-audit/`), then say if you want the PR. (UX v2 #59 merged as #61.)
- [ ] Pick the bundle fix (#60): `zod/mini` on the client (recommended), or amend the per-screen budget.
- [ ] Existing databases (dev, staging, prod): run `drop index members_name_active_idx` once, then `bun run db:push` (collate-only index change is invisible to drizzle-kit; BR-REC-207).
- [ ] Run the manual checklists `.pipeline/member-records-*/checklist.md` on a phone (progress: also the print check, BR-REC-109).
- [ ] Confirm the build choices and spec clarifications: members D-021, progress D-022 (P1–P14), due-list D-023 (C1–C13), assessments D-024 (D1–D21). Decide if the move-date screen (#32) is needed for the pilot.
- [ ] GitHub: protect `main` (PR + required jobs `backend`, `frontend`, `member`, `fixtures`); create the `P1` label.
- [ ] Confirm D-004 (own auth + SSE, Supabase only as Postgres).
