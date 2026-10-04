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
one-worktree rule (index Q6) (answered by D-017). Rejected: per-sub-spec ID prefixes (two IDs for one module), one 400-line spec.

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
(1) Unbuilt endpoints answer 501 `NOT_IMPLEMENTED`. (2) The access token carries `sid` from the start. (3) No hand-written SQL
(user, MVP light): all Drizzle, `db:push` in dev/test/CI, a generated migration in production; no extensions, trigram indexes or
exclusion constraint (BR-REC-167 struck; overlap = BR-REC-09 service check); `seed` creates the `login_attempts` row. (4) No
backend CORS: same origin (D-018) + Origin check. (5) Shared frontend libs for BR-REC-127 formatters and gym-day "today". (6)
One TS union per enum-like column (BR-REC-175). Why: every stream needs these first. Rejected: hand SQL in custom migrations
(the guard hook blocks migration edits), per-stream formatters. Details: data-model.md v2 changelog.

**D-020 · 2026-10-03 · member-records auth (Stream A) build choices: stacked on Stream 0, grace without re-rotation, guard forwards the visitor, no new frontend env.**
(1) Built stacked on the unmerged Stream 0 branch (user); Stream 0 bugs went to that session; synced with `main` after the
squash. (2) A refresh token replaced within 60 s gets an access cookie only, no second rotation. (3) The page guard forwards the
visitor's `Origin`, `X-Forwarded-For` and `User-Agent` to E02; `TRUST_PROXY_HOPS` is 0 (fails closed), 1 on the D-018 server.
(4) Auth owns the unlisted `lib/env.ts`, `.env.example`, `package.json`, `lib/http.ts`, `client.ts`, `queryClient.ts` (user).
Why: found while building. Rejected: waiting for the M0 PR, re-rotating inside the grace (cookie-order race), a new `APP_ORIGIN`
env var. Details: auth.md v2 changelog.

**D-021 · 2026-10-04 · member-records members (Stream B) build choices: own settings read, per-member row lock, join-date rule, lazy sheets, tests grouped by surface.**
(1) Own `gym_settings` read, no dependency on Stream C. (2) E22, E23 and a changed join date (E19) lock the member row first,
then check overlap / join date. (3) E19 refuses a join date after any membership start only when the join date changes. (4) E16
name order is `lower(full_name) COLLATE "C"`, no name index (`bench` in G). (5) The member page lists every membership, also a
single one. (6) Renew / edit and archive sheets load on demand; server-side data start is decided in G (#20). (7) Admin "today"
= the device's time zone (server stays authoritative). Why: found while building. Rejected: a DB exclusion constraint (hand SQL,
D-019), caching settings, a Stream-B-only HydrationBoundary. Details: members.md changelog.

**D-022 · 2026-10-04 · member-records progress (Stream F) build choices: no server cache, live reads, streamed CSV by member pages, own print styles, segmental as its own section.**
(1) No server cache for gym progress and leaderboards (user: MVP light): live reads meet BR-REC-110; BR-REC-147 loses "cached",
tactic 19 dropped. (2) E36 is one grouped query; E37 ranks the whole list with pure `rankLeaderboard`, then pages; E38 uses
`membershipStatus`. (3) E39 streams keyset pages of 10 members; no DB cursor. (4) Print layout = inline `@media print` style
with S12. (5) The segmental table is its own S12 section. (6) P2–P14 confirmed by the owner. (7) Owner O-1: the CSV formula
guard is for text only; numbers stay plain (P9). Why: no shared-file change. Rejected: guarding numbers (breaks sums), a cache
with write hooks, a chart library. Details: progress.md Build clarifications.

**D-023 · 2026-10-04 · member-records due-list (Stream E) build choices: overrides end on read, one date per measurement, rows built in memory, optimistic writes.**
(1) "Assess soon" / "Remind me later" end on read, when a later save of that member + assessment is dated on/after the day they
were set; D must write `assessments.updated_at` on every save (#24). (2) Each measurement has its own due date; a row = one
member + one assessment; the pure engine takes `today`. (3) E31 runs 5 parallel queries, pages in memory (p95 ≈ 157 ms). (4) E33
/ E34 lock the member row, one change-log row each. (5) Optimistic writes with undo; "Remind me later" is a second step in the
same sheet (#18); admin "today" = device zone (D-021 7). (6) Member page: "Never recorded" wins over "Overdue" (owner Q5). Why:
Stream D untouched. Rejected: a "done" flag on the override, a per-member due table. Details: due-list.md C1–C13.

**D-024 · 2026-10-04 · member-records assessments (Stream D) build choices: own settings read, changed-fields-only edits, reducer form, shared field fixes here, E29 API-only.**
(1) Own read of `gym_settings` (time zone), like members (D-021). (2) `NO_VALUES` = the save leaves no stored value; an edit
sends only changed fields, so nothing is re-rounded (D2, setup C9). (3) The Record form is a pure reducer, not RHF + Zod: drafts
and the leave guard need one state machine. (4) User: the shared `NumberField` (#21) and `DurationField` (#19) fixes are made
here. (5) E29 (move a date) is API only; its screen is #32. (6) Unsaved results live in `localStorage` for 7 days. (7) `/assess`
JS is 35–37 KB gzip vs the 40 KB budget (BR-REC-146): G decides how to measure. Why: found while building. Rejected: resending
every field on edit, a wrapper field in screens, the move-date screen now. Details: assessments.md Build clarifications D1–D21.

**D-025 · 2026-10-04 · Docs after parallel streams: stream PRs never edit shared docs; the coordinator updates them after the merge.**
A stream PR edits only its own sub-spec, its own sub-map and `.pipeline/<feature>/`. STATUS, `decisions.md`, the spec index and
the module index are updated by the coordinator in ONE docs commit after the merge, which also assigns the next D-NNN. Why: six
parallel stream PRs conflicted in STATUS, the index, the map and decisions (and three entries got the same number).
Rejected: a shared integration branch. Detail: `docs/KNOWLEDGE.md` → Parallel streams. Also on 2026-10-04: D-019…D-024 were condensed to decision + why + rejected (the long build-choice lists live in the specs' Build clarifications; the full original text is in git at `9d78023`).

**D-026 · 2026-10-04 · `seed:demo` (BR-REC-176): a curated, today-relative demo data set, in addition to `seed:perf`.**
25 named members whose dates are today plus fixed offsets, so every screen and every manual checklist starts from known rows
after `db:reset`. Why: `seed:perf` is random, leaves hundreds overdue and has no due overrides. Rejected: SQL snippets pasted in
the checklists. Detail: data-model.md v3.
