# Decisions (append-only)

Format: **D-NNN · date · decision** — why · alternatives rejected · supersedes.

---

**D-001 · 2026-10-01 · Adopt the spec-first, agent-driven workflow from the ERP project.**
Specs → freeze → contract → tests-first (separate agent) → build → audits → PR, coordinated by an Opus
main session; Claude Code only. Why: the same solo-developer constraints; bugs come from unwritten rules.
Dropped `AGENTS.md` (Claude Code reads `CLAUDE.md`).

**D-002 · 2026-10-01 · One git repo with sibling packages `backend/`, `frontend/`, `member/`. No workspaces, no shared packages.**
Why: matches the ERP project and the standards' "no shared packages"; one worktree/branch/PR flow works for
the pipeline. The contract between packages is the HTTP API (backend manifest + OpenAPI → generated client
types). Rejected: pnpm/Turborepo monorepo with `packages/{contracts,domain}` (early design draft).
Note: `docs/standards/nextjs-standards.md` §4.0 says frontend and backend are separate repos; the ERP project
uses folders in one repo and this project follows that.

**D-003 · 2026-10-01 · Backend = Hono on Bun with Drizzle, Zod v4, three strict layers, per `docs/standards/hono-backend-standards.md`.**
Supersedes the draft's "business logic in Postgres functions" and "Node runtime": Postgres holds data and
constraints only; rules live in services and pure functions under `backend/src/lib/domain/`.

**D-004 · 2026-10-01 · Supabase is hosted Postgres only. No Supabase Auth, Realtime, Storage or RLS.**
Why: the standard says authorization is middleware-only (no RLS) and uses own JWT; one auth system, one
data path. Realtime for the TV is SSE from the backend over an outbox table (`tv_events`) with `Last-Event-ID`
replay. Rejected: Supabase Realtime + RLS policy for the display role (second auth model, second data path).
Supersedes the draft's Supabase Auth/OTP/Realtime. Login method for members (OTP vs password) is decided
in the `auth-members` spec; email delivery then becomes part of that module.

**D-005 · 2026-10-01 · Timer maths exists twice on purpose, tied by a golden fixture.**
`frontend/src/lib/timer/` (TV + admin preview) and `backend/src/lib/domain/timer.ts` (auto-end duration)
are separate implementations of the spec; `timer-cases.json` is committed byte-identically in both and
checked by `scripts/check-fixtures.sh` (CI + test-runner). Why: no shared packages (D-002).

**D-006 · 2026-10-01 · TV is a read-only client: snapshot in TanStack Query, SSE events update the cache, transient effects in a per-provider Zustand store.**
Why: fits the standard (server state in TanStack Query, UI state in Zustand) and the rule "state from
snapshots, animations from events". TV code is owned by its own agent (`tv-dev`) and skill (`tv-rendering`).

**D-007 · 2026-10-01 · Member app is Expo / React Native with a draft standard in `member/CLAUDE.md`.**
Why: iOS PWA launch time, splash and push limits (observed in the weight-tracking PWA); native Liquid Glass.
The draft standard is refined after the first feature.

**D-008 · 2026-10-01 · Member writes are idempotent (`Idempotency-Key`) and queued offline.**
Project addition to the backend standard. Why: poor gym wifi, results entered right after a workout.

**D-009 · 2026-10-01 · Early design drafts live in `docs/design/` as input to `/spec`, not as specs.**
Where they conflict with the standards or these decisions, the standards and decisions win.

**D-010 · 2026-10-01 · Lean pipeline; the ERP workflow is context, not a template to copy.**
Kept: spec → freeze → contract → red tests by a separate test-writer → build → one review pass → hand-over.
Dropped for now: `/epic`, `/watch-prs`, four separate auditors (merged into `reviewer`), run-folder
briefs/reports/`state.json` (only `plan.md`, `contract.md`, `screens.md`, optional `findings.md`).
The full versions live in `~/codes/ERP-diecast/.claude/` if they are needed later.

**D-011 · 2026-10-01 · Dev on local Docker Postgres; migrate to Supabase Postgres for prod. One repo, three folders (confirmed).**
Switch by `DATABASE_URL`; schema moves via reviewed Drizzle migrations, not `push`. Confirms D-002.

---
<!-- append below -->

**D-012 · 2026-10-03 · First deliverable is `member-records`: assessment data entry + reports, one shared login, no roles.**
Standalone MVP slice (backend + admin only; no member app, TV or SSE). Single shared login, no RBAC, so it
overrides `role_t` for this slice only; entries have no per-user attribution. Metrics live in a configurable
catalog; assessment due dates are computed from per-type intervals (per-metric override), never stored.
Why: digitise the paper binder first; historical data becomes the base for the full app.
