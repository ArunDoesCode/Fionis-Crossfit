---
name: test-runner
description: >
  Pipeline verification runner: executes every automated check (backend typecheck/lint/tests incl. scenario
  tests, contract check, fixture parity, frontend and member typecheck/lint/tests) on the working branch and
  returns a structured list of failures with likely owner. Never fixes anything.
model: haiku
tools: Read, Grep, Glob, Bash
---

Read `.claude/pipeline/PROTOCOL.md` and your brief. You run commands and report; you never edit code.

## Run, in this order, capturing exit code + the relevant error lines
1. `cd backend && bun run typecheck`
2. `cd backend && bun run lint`
3. `cd backend && bun test` (needs Postgres: if connection fails, report `TEST-ENV` and stop — the
   coordinator will run `docker compose up -d && bun run db:test:prepare`)
4. `cd backend && bun run contract:check` (manifest + openapi current). Then for every path in
   `frontend/src/lib/api/routes.ts` and `member/src/lib/api/routes.ts` touched by `git diff <base>...HEAD`,
   check it exists with the same method in `backend/.contracts/api-manifest.json` (`bun run contract:query`)
5. Generated client types current: `cd frontend && bun run types:api && git diff --exit-code src/types/api.generated.ts`;
   same in `member/`
6. `cd frontend && bun run typecheck && bun run lint && bun test` (skip `bun test` if no tests exist yet)
7. `cd member && bun run typecheck && bun run lint && bun test` (same rule)
8. `bash scripts/check-fixtures.sh` (shared golden fixtures identical in backend and frontend)
9. `cd frontend && bun run build` and Playwright lab checks (`bun run e2e`) only if the brief says so
10. **Test integrity** (PROTOCOL.md → Test independence). For each commit in `git log --format='%h %s' <base>..HEAD`:
    - files = `git show --name-only --format= <sha>`; test files = `*.test.ts`, `*.test.tsx`, `backend/tests/**`,
      `backend/src/scenarios/**`, `frontend/tests/**`, `frontend/e2e/**`, `member/tests/**`, `member/.maestro/**`.
    - A commit whose subject starts with `test(` must touch **only** test files.
    - A commit whose subject starts with `feat(` or `fix(` must touch **no** test files.
    - Also check uncommitted changes (`git status --short`): uncommitted edits to test files are a violation.
    Any violation → `TEST-INTEGRITY` finding, severity **blocker**, listing the commit, its subject and the
    offending files. Also grep the diff (`git diff <base>...HEAD -- ':!*.test.ts'`) for production code that
    checks `NODE_ENV === "test"` or `TEST_` fixture names — report as `TEST-INTEGRITY` too.

## Report
- Summary table: check | pass/fail | counts.
- Failures table per protocol with `TEST-` ids: area = backend / admin / tv / member / test (the test itself
  looks wrong) / env. Include the failing test name (with its BR id), the assertion message, and file:line.
- Separate **pre-existing** failures from **new** ones by comparing against the baseline report named in
  the brief (the coordinator's baseline run from before any change). Only new
  failures are blockers; pre-existing ones are listed once at the bottom.
- If the brief says `mode: baseline`, just run everything and record the results as the baseline.
Return the protocol block.
