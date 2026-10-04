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

**D-021 · 2026-10-04 · member-records members (Stream B) build choices: own settings read, per-member row lock, join-date rule, lazy sheets, tests grouped by surface.**
(1) The members repository reads `gym_settings` (time zone, `expiry_lead_days`) per request itself, so Stream B does not depend on
Stream C's code. (2) Period writes (E22, E23) and a changed join date (E19) take `select … for update` on the member row first,
then check overlap / join date: parallel renewals cannot overlap (BR-REC-09; there is no database constraint, data-model v2).
(3) E19 refuses a join date after any membership start only when the join date changes (keeps BR-REC-50/55 true both ways).
(4) E16 name order uses `lower(full_name) COLLATE "C"` (word by word); Stream 0's name index does not serve it, fine for ~1,000
members, to be measured by `bench` in Stream G. (5) The member page lists every membership, also a single one, so a typo in
the first plan can be corrected. (6) Renew / edit sheet and archive confirm load on demand (own `sheetLoader` + `useLazySheet`, one `import()` per sheet,
retry after a failed load) to stay under the bundle budget (tactic 4); server-side data start (tactic 1) is decided once for all streams in Stream G (#20). (7) Admin
"today" = the device's time zone (gym and phones share one); the server stays authoritative.
Why: found while building; each keeps the spec's rules true without a shared-file change. Rejected: a database exclusion
constraint (hand SQL, D-019), caching settings (breaks a lead-days change), Stream-B-only HydrationBoundary (inconsistent).

**D-022 · 2026-10-04 · member-records progress (Stream F) build choices: no server cache, live reads, streamed CSV by member pages, own print styles, segmental as its own section.**
(1) No server cache for gym progress and leaderboards (user decision: keep the MVP light): BR-REC-110 is met by reading the
database on every call and by `staleTime: 0` in the admin; progress v2, performance BR-REC-147 loses "50 ms cached", tactic 19
dropped. The writes that would have to clear a cache live in streams B and D (other sessions' files). Measured on the perf seed
(1,000 members, 336,640 values): E35 ≈ 50 ms, E36 80–140 ms, E37 ≈ 110 ms, E38 ≈ 60 ms warm, all inside the budgets.
(2) E36 is one grouped query (count, first and latest per member) joined to members and their latest period; E37 ranks the
whole list with the pure `rankLeaderboard` and then cuts the page, so ranks continue across pages; E38 uses the pure
`membershipStatus` (no second copy of the rule in SQL).
(3) E39 sends the headers and the first chunk before any row is read, then reads keyset pages of members (measurements: 10
members per batch) into a pull-based stream; no DB cursor (may not survive the Supabase transaction pooler) and no keyset on
measurement rows (no index serves the CSV order).
(4) The print layout is an inline `@media print` style that ships only with S12 and hides the shell by its `data-slot` marks:
no edit of shared shell files or `globals.css`.
(5) The segmental table is its own S12 section after the assessments (E35 carries no assessment id), not inside "Body
composition" as the sketch draws it.
(6) Build clarifications P2–P14 are in the progress spec (v2); the owner confirmed them 2026-10-04.
(7) Owner decision O-1 (2026-10-04): the CSV formula guard applies to text only; real numbers are written plain (a negative Flexibility value stays a number in Excel), and a text that is exactly a negative number literal (the `display` "-0.5") is written as is (P9).
Why: each keeps the spec's rules true without a shared-file change. Rejected: guarding numbers too (breaks sums and charts for negative values), a fingerprint cache or write hooks (touch other
streams' code), a chart library (BR-REC-146), per-row CSV from one big query (re-sorts the table per batch).
**D-022 · 2026-10-04 · member-records assessments (Stream D) build choices: own settings read, changed-fields-only edits, reducer form, shared field fixes here, E29 API-only.**
(1) The assessments repository reads `gym_settings` (time zone) itself, like members (D-021). (2) `NO_VALUES` means the save would leave the
assessment with no stored value (spec D2 amended in review): an edit may send only the changed fields or an empty list (About-only), and the form
sends only fields the trainer changed, so an untouched stored value is never re-rounded when setup changes decimals (setup C9). (3) The Record
form is a pure reducer plus `buildSaveValues`, not React Hook Form + Zod (`nextjs-standards.md` §14): a Number is text until Save, drafts, the
saved-assessment offer and the leave guard need one state machine. (4) User decision: the shared `NumberField` (`allowNegative`, #21) and
`DurationField` (`status`, #19) fixes are made in this stream; setup's own callers still need to adopt them (comments on #19, #21). (5) E29 (move a
date) is built as an API only; its screen is issue #32 (MVP light). (6) Unsaved results live in the browser's `localStorage` per member + assessment
+ date for 7 days (values only). (7) The `/assess` page JS is 35–37 KB gzip without and 49–51 KB with the two shared base-ui chunks against
BR-REC-146's 40 KB: Stream G decides how the budget is measured.
Why: found while building; each keeps the spec's rules true without a shared-file change except (4). Rejected: resending every field on edit (silently
re-rounds history), a wrapper field in the screens (duplicates shared code), building the move-date screen now.

