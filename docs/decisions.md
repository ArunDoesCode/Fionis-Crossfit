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

**D-013 · 2026-10-03 · Icon library is Hugeicons (`@hugeicons/react` `HugeiconsIcon` + `@hugeicons/core-free-icons`); replaces lucide.**
Use `<HugeiconsIcon icon={SomeIcon} />`. `lucide-react` is removed. Why: the shadcn preset generates `ui/*` with Hugeicons
(`components.json` `iconLibrary: hugeicons`); one icon library only.

**D-014 · 2026-10-03 · TanStack Table v9 (`@tanstack/react-table` 9.2.x), not v8.**
Owner chose v9. React Compiler needs no `'use no memo'` for stateless tables. Pages never import tanstack directly:
they build columns with `createDataTableColumnHelper` from `components/common/DataTable`. Server-paginated tables register
no features (nuqs `offset`/`limit` + `TablePagination`). Patterns: `docs/standards/nextjs-standards.md` §15.

**D-015 · 2026-10-03 · member-records sign-in: 15-min access JWT + rotating opaque refresh token in the DB, both httpOnly cookies on the app's own address (`/api` forwarded by Next.js).**
Access: HS256 JWT checked by signature only. Refresh: random 256-bit value, stored as HMAC in `auth_sessions`,
rotated on each use with a 60 s grace, reuse revokes the session. Cookies SameSite=Lax, Path=/, Secure in prod
(refresh cookie deviates from nextjs-standards §8.1 Strict/path-scoped: the page guard must read it); writes
need a matching `Origin`. Lock counter in the DB (`login_attempts`). `proxy.ts` refreshes on the server when
the access cookie is gone. Why: the standard asks for short access + rotating refresh (§8.2, §13); the owner
must be able to sign out every device after a password change (BR-REC-02, 34); same-origin cookies avoid CORS
preflights and cross-site cookie problems on phones. Rejected: stateless refresh JWT (no revoke), a DB read
on every request (heavier, not the standard), tokens in browser storage (forbidden), cross-site API domain.
Detail: `docs/specs/member-records/auth.md`.

**D-016 · 2026-10-03 · member-records v2 is split into 10 sub-specs with one continuous BR-REC-NN sequence, built contract-first (Stream 0) then in parallel streams; UI is mobile-first.**
Shared sub-specs (data-model, api-contract, ux, performance) are built once by Stream 0; six feature sub-specs
(auth, members, setup, assessments, due-list, progress) own disjoint files. IDs continue from BR-REC-25 so
they stay unique across sub-specs; v1 rules moved word for word. Why: the user wants parallel sessions and a
detailed, reviewable plan; one ID sequence keeps tests (`BR-REC-NN …`) unambiguous. User decision: phone + tablet
first (bottom tabs, bottom action bar, no Reset button) — overrides `nextjs-standards.md` §14 button placement
for this app; record in `frontend/CLAUDE.md` when Stream 0 lands. Open: per-stream worktrees vs the
one-worktree rule (index Q6). Rejected: per-sub-spec ID prefixes (two IDs for one module), one 400-line spec.

**D-017 · 2026-10-03 · member-records only: one session + worktree + branch per build stream; each stream opens its own PR to `main`.**
Each stream (index "Parallel build plan") runs in its own desktop-app session and worktree, started from fresh
`main`. Stream 0 merges first (M0); streams A–F start from that `main`; PRs merge in merge-point order and open
streams sync from `main` after each merge. Why: the user wants parallel sessions, which need separate working
copies; streams own disjoint files, so merges stay small. Scoped exception to the root CLAUDE.md rule "one
branch, one worktree" (that file is not changed; every other module keeps the rule). Answers index Q6 of D-016.
Amended 2026-10-03: the first draft used an integration branch `work/member-records` and branches
`work/mr-<stream>` with one PR at M4; dropped because the app makes one worktree per session from `main` and the
user merges PRs on GitHub. Rejected: one session at a time (no parallelism).

**D-018 · 2026-10-03 · Hosting: one small server in Mumbai (ap-south-1), next to the Supabase database, runs Next.js and the API behind one public address.**
Chain: browser → HTTPS front on the server → Next.js → API on the same machine; the browser calls relative
`/api/…` and Next forwards it (`NEXT_PUBLIC_API_URL=/api`, server code uses `API_URL`); the API port is not
public. Why: same origin means first-party cookies, no CORS preflight, CSRF handled by SameSite=Lax + Origin
check (D-015); one hop from Next to the API and a few ms to the database meet the speed budgets
(performance.md); one deploy for a solo developer. Rejected: Vercel for Next + a separate API host (two deploys,
cross-site cookie and CORS set-up, an extra network hop). The provider and machine size are picked at deploy
time; they must be in ap-south-1. Answers member-records index Q7.

**D-019 · 2026-10-03 · member-records Stream 0 build choices: 501 placeholders, `sid` claim now, no hand-written SQL, no CORS, shared formatters.**
(1) Endpoints whose stream has not built them yet answer 501 `NOT_IMPLEMENTED`; each stream replaces its own.
(2) The access token carries `sid` (session id) from Stream 0, because `idempotency_keys` and `audit_log` are keyed
by session; auth (Stream A) issues the real ids. (3) No hand-written SQL (user decision, keep the MVP light): everything is
expressed in Drizzle; dev, test and CI keep `db:push`; production gets a generated migration at deploy. So no
extensions, no trigram indexes and no exclusion constraint (BR-REC-167 struck; overlap is the BR-REC-09 service
check); the `login_attempts` row is created by `seed` (data-model v2). (4) Backend CORS is removed: same origin (D-018), writes guarded by the Origin check (BR-REC-37).
(5) BR-REC-127 formatters and the gym-day "today" helper are shared frontend libs built by Stream 0. (6) One TS union
per enum-like column in `backend/src/lib/enums.ts`, used by the Drizzle checks and Zod (BR-REC-175).
Why: every stream needs these before it starts; deciding them once avoids six conflicting versions.
Rejected: hand SQL in custom migrations (the guard hook blocks editing migrations; not worth it for 1,000 members), formatters per stream.

**D-020 · 2026-10-03 · member-records auth (Stream A) build choices: stacked on Stream 0, grace without re-rotation, guard forwards the visitor, no new frontend env.**
(1) Stream A was built stacked on the unmerged Stream 0 branch (user decision: do not wait for the M0 PR, do not
overlap with that session); Stream 0 bugs found on the way went to that session (R-1 gzip, T-4), never patched here;
after the M0 squash-merge the branch synced with `main` keeping its own side (trees verified equal). (2) A replaced refresh
token used within 60 s gets an access cookie only — no second rotation — so concurrent refreshes cannot drop the newest
token and fake a `reuse` (auth spec v2). (3) The page guard calls E02 with `Origin` = the request's origin and forwards
the visitor's `X-Forwarded-For` and `User-Agent`, so limits and the change log see the real device; `TRUST_PROXY_HOPS`
defaults to 0 (one shared bucket, fails closed) and is 1 on the D-018 server. (4) Auth owns the unlisted files
`lib/env.ts`, `.env.example`, `package.json`, `lib/http.ts`, `client.ts`, `queryClient.ts` (user decision). Rejected:
waiting for the M0 PR (idle hours), rotating again inside the grace (cookie-order race), a new `APP_ORIGIN` frontend env var.

**D-021 · 2026-10-04 · member-records setup (Stream C) build choices: setup spec clarifications C1–C13, a confirmation is a step inside the sheet, theme as three choices.**
(1) Where the frozen setup spec was silent the coordinator decided and logged C1–C13 in `setup.md` (gym name 2–60, IANA time zone, trimmed names; a Time measurement is always `min:sec` and 0 decimals; the datatype/unit lock only on a real change; an off assessment hides its measurements without changing their own state; every id once in an order list; pair checks on edit; the rounding function ships for Stream D; name races end in 409; E07 never writes); the owner confirms them at merge. (2) Confirmations (repeat, "better") are a second step inside the one edit sheet, because `useBackToClose` is not stack-aware and nested sheets lose typed values on Back (#18). (3) Theme is three choices System / Light / Dark on S14 (`ThemeChoice`), since the shared `ThemeToggle` is a two-state icon. (4) The catalog loads with `pageSize=100` (E12/E15 need every item in one list). (5) Check ranges are bounded to ±999,999,999.999 (the `numeric(12,3)` limit). (6) The BR-REC-11 example changed from Fran to Deadlift kg → lb (Fran is a Time measurement).
Why: keep the MVP light and avoid six conflicting guesses; each is cheap to reverse. Rejected: a local copy of `NumberField` to type negative ranges on iOS (filed #21 for the shared fix), a second nested `ConfirmSheet`, fixing the shared sheet in this stream (Stream 0 files).

