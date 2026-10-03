# Agent pipeline protocol (lean)

How the coordinator (the main session, Opus) and subagents work together. Subagents read this first.
The ERP project's heavier version (run folders with briefs/reports/state.json, `/epic`, `/watch-prs`,
separate auditors) is in `~/codes/ERP-diecast/.claude/` if you ever need it back.

## Topology
```
 you ── spec / freeze / answers / PR review / merge
   │
 COORDINATOR (main session) ── the only one that spawns agents, talks to you, touches GitHub
   ├─ explorer (haiku)      code lookup
   ├─ backend-dev ∥ frontend-dev | tv-dev | member-dev   (sonnet; disjoint file ownership)
   ├─ test-writer (sonnet)  tests + manual checklist, independent of the developers
   ├─ reviewer (sonnet)     one read-only pass: spec, correctness, security, performance, contract
   └─ test-runner (haiku)   runs every automated check, never fixes
```
Subagents cannot spawn subagents and never talk to each other; everything goes through the coordinator.
Backend and clients share one artefact: the **API contract** (`backend/src/routes/end-points.ts`,
`backend/.contracts/{api-manifest,openapi}.json`, `.pipeline/<feature>/contract.md`). Clients never read
backend source; generated types (`src/types/api.generated.ts`) come from `openapi.json` via `bun run types:api`.
The TV is a client too: `GET /v1/tv/snapshot` + the SSE stream are in the contract.

## Run folder `.pipeline/<feature>/` (committed on the working branch)
| File | Written by | Purpose |
|---|---|---|
| `plan.md` | coordinator | slices (2–6 BRs each, with a `[ ]`/`[x]` checkbox), surfaces per slice, file ownership |
| `contract.md` | backend-dev | endpoints and SSE events added/changed: method, path, request, response, errors, permissions |
| `screens.md` | surface devs (append) | per screen/scene: URL or scene name, permission, controls/states — input for the manual checklist |
| `findings.md` | coordinator | only if a fix loop runs: open findings and their resolution |

Resume = read `plan.md` + `git log` on the working branch. No other state file.

## Brief (coordinator → agent, in the prompt)
```
Feature: <id>   Branch: <branch>   Spec: docs/specs/<module>.md (vN, frozen)   BRs: BR-XXX-01, BR-XXX-02
Task: <what to do, concretely>
Scope — every line filled:
- In: <exactly what to do>      - Out: <what NOT to do>
- May edit: <globs>             - May read: <globs or "anything">
- Size: <e.g. ≤ 3 files, ≤ 150 changed lines>
- Stop if: anything outside scope is needed → return BLOCKED with the question
Done when: <verifiable checks>
```
A brief without a filled Scope block is not sent. An agent that finds out-of-scope work reports it under QUESTIONS.

## Return (agent → coordinator, final message, ≤ 60 lines)
```
STATUS: DONE | BLOCKED | FAILED
CHANGED: <files, or none>
FINDINGS: <n blocker, n major, n minor>   (reviewer / test-runner only; table above this block)
QUESTIONS: <numbered, each with options + your recommendation, or none>
NEXT: <one line>
```
`BLOCKED` = needs a decision (never guess a business rule; never ask the user yourself). `FAILED` = technical
reason. Findings table: `# | severity | area | file:line | finding | fix`.

## Ownership
- backend-dev: `backend/**` except test files · frontend-dev: `frontend/**` except `src/tv/**`, `src/app/tv/**`, tests
- tv-dev: `frontend/src/tv/**`, `frontend/src/app/tv/**`, `frontend/src/lib/timer/**` except tests · member-dev: `member/**` except tests
- test-writer: only test files and the manual checklist. Test files = `**/*.test.ts(x)`, `backend/tests/**`
  (incl. `fixtures/`), `backend/src/scenarios/**`, `frontend/tests/**`, `frontend/e2e/**`, `member/tests/**`, `member/.maestro/**`, `scripts/check-fixtures.sh`
  (fixture-pair list; allowed in `test(` commits)
- coordinator: `.pipeline/**`, `docs/**`, GitHub issues · reviewer, test-runner, explorer: read-only

## Test independence (non-negotiable)
Tests are the spec turned into code; they must not be shaped by the implementation.
1. test-writer writes tests; developers write code; nobody does both; the coordinator edits neither tests nor
   production code during `/feature`.
2. Tests first, committed alone: `test(<id>): BR-… tests` before the implementation commits (`feat(`/`fix(` touch no test file).
3. **Zero-context brief for test-writer** — pointers only, spawned as `subagent_type: test-writer` in a fresh
   context, **never a fork**. No summary, interpretation, plan notes, developer output or conversation history.
   ```
   Feature: <id>  Branch: <branch>   Mode: tests | regression | checklist
   Spec: docs/specs/<module>.md (vN, frozen)   BR ids: …
   Contract: .pipeline/<id>/contract.md                 (omit if none)
   Screens touched: .pipeline/<id>/screens.md           (checklist mode only)
   Test change request: findings.md#<id>                (only to change an existing test; must quote the spec rule)
   May edit: <test globs>   Out: production code, specs
   ```
   If test-writer needs more it returns BLOCKED; the answer goes into the **spec** changelog, never the brief.
4. Changing a test needs a finding that quotes the spec rule showing the test is wrong, or a spec change via
   `/freeze`. "The implementation does X" is never a reason.
5. test-runner mechanically checks that test files only change in `test(` commits (violation = blocker).
6. The manual checklist in the PR is written by test-writer from the spec, not by the developer.

## Shared golden fixture (the one deliberate duplication)
No shared packages, so the timer maths exists in `frontend/src/lib/timer/` and `backend/src/lib/domain/timer.ts`.
`timer-cases.json` is committed byte-identically in `backend/tests/fixtures/` and `frontend/tests/fixtures/`;
only test-writer edits it (both copies, one commit); `bash scripts/check-fixtures.sh` (CI + test-runner) enforces it.

## Loop limit
Max **2** fix iterations after the first review. A finding still open after two fixes → stop and ask the user.

## Code lookup (CodeGraph, optional)
If `.codegraph/` exists (the SessionStart hook builds it when `codegraph` is installed): one `codegraph_explore`
per question with symbol names and `projectPath` = worktree root; don't Read what it returned; still Read the
files you edit. test-writer looks up signatures/types/routes only, never implementation bodies.
