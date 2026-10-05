# CrossFit gym app — repo root

TV-driven class flow for a CrossFit box. Solo developer + Claude Code. One git repo, three sibling packages
(not a monorepo: no workspaces, no shared packages, each has its own `package.json` and `CLAUDE.md`):
- `backend/` — Bun + Hono + Drizzle + Zod + Postgres (REST + SSE). Supabase is only hosted Postgres.
- `frontend/` — Next.js 16: trainer/owner admin (`/admin`) and the gym TV (`/tv`, `src/tv/**`).
- `member/` — Expo (React Native) member app: check-in, result entry, history, push.
This file covers **how work flows**. Tech conventions: the package `CLAUDE.md` (+ `docs/standards/*`).

Current milestone and next step: `docs/STATUS.md`.
Roadmap and daily routine: `docs/WORKFLOW.md`. Design drafts (input to specs): `docs/design/`.

## The loop (every module, no exceptions)
SPEC → DESIGN (admin screens) → FREEZE → CONTRACT → BACKEND + TESTS → CLIENTS (admin / TV / member) → VISUAL QA → SCENARIO TEST → OWNER/COACH CHECK → DONE → lessons written down
DESIGN = `/design <module>` (ux-designer: mock-ups on the real app, owner picks); VISUAL QA = visual-qa in `/feature` verify.
Both judge against `docs/standards/design.md` on the isolated `tools/ui-audit` copy (D-039).

**Gate rule:** do not write or change feature code for a module unless `docs/specs/<module>.md` exists and
has `status: frozen`. If it doesn't, stop and say so — suggest `/spec <module>`. Bug fixes to existing
behaviour go through `/bug`; a bug that reveals a missing rule becomes a spec change first.

**Scope rule:** ideas not in the frozen spec become a GitHub issue (`gh issue create`, labels `P1–P3` + type +
`mod:<module>`), never part of the current build. Don't "also add" things.

**Test independence rule:** tests are written only by the `test-writer` agent, from the spec, in a fresh
context with a pointers-only brief (never a fork, never your summary). Developer agents and the coordinator
never create or edit tests; tests and code go in separate `test(…)` / `feat(…)`/`fix(…)` commits.
Details: `.claude/pipeline/PROTOCOL.md` → Test independence.
**No look tests (D-038):** frontend tests cover logic only (formatters, parsers, validators, save rules, queries).
Visual rules (colours, fonts, sizes, layout, class names) are checked by screenshots, axe and the manual checklist —
never by source-scan tests. Kept guards: `check:colors` (no raw colour), no hand-edited `components/ui`.

## How to write (every agent, every reply, report and doc)
- Answer or result first, in 1–2 lines. Then only what the user needs to decide or act.
- Plain words, short sentences. Small list or table over paragraphs. A normal reply fits one screen (~15 lines).
- One recommendation, not a survey. Don't restate the question or narrate what you did.
- Questions to the user: max 3 at a time, each answerable with a letter or one word.
- Detail belongs in files (spec, map, report) — link to it instead of pasting it.

## Where knowledge lives (layered — details and budgets in `docs/KNOWLEDGE.md`)
| File | Contains |
|---|---|
| `docs/STATUS.md` | **Start here.** Where every module stands, active pipelines, what's waiting, next action |
| `docs/modules/<module>.md` | As-built map: code locations, data model, API, flows, gotchas, history |
| `docs/specs/<module>.md` | Should-be behaviour: states, rules `BR-<MOD>-NN`, examples |
| GitHub Issues | Deferred ideas, defects, change requests, UAT bugs |
| `docs/decisions.md` | Decisions with the why (append-only) |
| `docs/standards/*` | The user's backend and Next.js standards — the law for those packages |
| package `CLAUDE.md` + skills | Tech conventions per package / per kind of task |

**Before touching a module, read its map; explore only code changed since the map's `last_verified_commit`.**
Module learnings go in the map, not here. If the user corrects you twice on the same thing, write it down at
the narrowest layer that fits. CodeGraph: if `.codegraph/` exists use it first (`.claude/pipeline/PROTOCOL.md` → Code lookup).

## Commands (`.claude/skills/`)
You: `/spec <module>` → `/design <module>` (admin screens) → owner/coach answers → `/freeze <module>`  ← last step you must be present for
Autonomous (Opus coordinator = main session, `claude --model opus`): `/feature <module>`.
Pick-up: `/status`, `/map <module>` | `/map --stale`, `/wrap`. Manual: `/slice`, `/bug`.
Agents (`.claude/agents/`): explorer, test-runner (haiku); backend-dev, frontend-dev, tv-dev, member-dev,
test-writer, reviewer, visual-qa (sonnet); spec-analyst, ux-designer (opus). They talk only via the coordinator; run notes live in
`.pipeline/<feature>/{plan,contract,screens}.md`. Package agents (hono-*, nextjs-*, expo-*)
hold the detailed conventions the dev/review agents read.

## Git
- **One working branch, one worktree, few PRs.** Work on `work/<theme>` in `.claude/worktrees/work`
  (create once: `git worktree add .claude/worktrees/work -b work/m0 origin/main`). Never a new branch or
  worktree per bug/feature/spec. Never commit to `main`.
  **Exception — member-records build streams (D-017):** one session + worktree + branch + PR per stream, from fresh
  `main` (spec index → Parallel build plan).
- Each item is its own commit (`fix(…)`, `test(…)`, `feat(…)`, `docs(…)`); STATUS/map updates are commits too.
- **Don't push until a batch is ready.** One PR per batch, only when the user asks or a related group is done
  and checked. The user merges; then start the next batch from fresh `main`.
- Pipeline PRs carry label `agent-pipeline`; pipeline replies on GitHub start with `🤖`. CI green before handing a PR over — check the checks really ran (`gh pr checks`); a 0 s failure means GitHub rejected the workflow file.

## Checks (run before calling anything done)
- Backend: `cd backend && bun run typecheck && bun run lint && bun test` (needs `docker compose up -d` + `bun run db:test:prepare`; tests only ever touch the `*_test` DB)
- Frontend: `cd frontend && bun run typecheck && bun run lint` (+ `bun test` once tests exist)
- Member: `cd member && bun run typecheck && bun run lint`
- Contract: `cd backend && bun run contract:generate` and commit `.contracts/*`; then `bun run types:api` in `frontend/` and `member/`. CI runs `contract:check`.
- Fixtures: `bash scripts/check-fixtures.sh` (shared golden fixtures byte-identical in backend and frontend)

## Domain invariants (never break)
- Members submit; trainers correct. Boards, history, PRs and awards read `official_*`, never `submitted_*`.
- Result and session writes run in one transaction under the per-session advisory lock; write endpoints are idempotent (`Idempotency-Key`); `tv_events` rows are inserted in that same transaction.
- The board, PR, streak and award rules are pure functions (`backend/src/lib/domain/`) — no I/O, no clock; time is an argument.
- A workout used by a session is locked; changing it creates a new version. History never changes meaning.
- Server time is authoritative (`startedAt`); clients only apply a measured clock offset.
- Every state change is permission-checked and audit-trailed. `showOnBoard=false` members appear as "Athlete" to everyone else, in responses and events.
- TV: read-only; state from snapshots, animations from events; never blank, never double-flash after reconnect.
