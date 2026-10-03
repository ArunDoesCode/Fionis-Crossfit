---
name: feature
description: >
  Lean feature pipeline, run by the main session as the Opus coordinator. Takes a FROZEN spec and plans →
  builds slice by slice (contract → red tests by test-writer → backend-dev ∥ surface devs) → one review pass
  (reviewer + test-runner) → knowledge update → hands over on the working branch; opens a PR only when asked.
  Use when: /feature <module>, /feature <module> --resume, "build this feature", "run the pipeline".
model: opus
---

# /feature <module> [--resume] [--from-pr <n>]

You are the **coordinator**: the only one who spawns agents, talks to the user, and touches GitHub. Read
`.claude/pipeline/PROTOCOL.md` and follow it for every agent call. Recommended: `claude --model opus` in the
working worktree. Involve the user only for (a) a question neither the spec nor `docs/decisions.md` answers,
(b) a fix loop that did not converge, (c) the hand-over. Decide and record everything else.

## 0. Preflight
1. Spec gate: `docs/specs/<module>.md` has `status: frozen` (and its `depends_on` specs). Else stop: "run `/spec` then `/freeze`".
2. `git status` clean on the working branch `work/<theme>` in `.claude/worktrees/work` (create it once:
   `git worktree add .claude/worktrees/work -b work/<theme> origin/main`). Never a per-feature branch.
3. Infra: `bun install` in each package you will touch; `cd backend && docker compose up -d && bun run db:push && bun run db:test:prepare`.
4. Baseline: spawn **test-runner**; remember which checks already fail (only new failures count later).
5. Create `.pipeline/<module>/` (`plan.md`). On `--resume` read `plan.md` + `git log` and continue at the first unchecked slice.

## 1. Plan
Load yourself (cheap, no exploring): `docs/STATUS.md`, the spec, `docs/modules/<module>.md` (+ maps of
`depends_on`), open issues `gh issue list --label mod:<module>`, `docs/decisions.md`.
1. Spawn **explorer** (map-first, diff-only) for what the map doesn't answer for these BRs. No map yet → `/map <module>` first.
2. Write `plan.md`: slices in order (2–6 BRs each, demo-able), per slice the surfaces (backend / admin / tv /
   member), files likely touched, new tests, each with a `[ ]` checkbox.
3. Ambiguity → spec, then decisions, then ask the user (AskUserQuestion ≤4, options + recommendation). Record
   answers in the spec Changelog (bump version, "clarified during build"). Commit `chore(<module>): plan`.

## 2. Build, per slice
1. **backend-dev — contract only:** route descriptors + registry + Zod (+ SSE event schemas for TV slices),
   `contract:generate`, `.pipeline/<module>/contract.md`; then `bun run types:api` in `frontend/` and
   `member/`. Commit `feat(<module>): <slice> contract`.
2. **test-writer — red tests** with the zero-context brief from PROTOCOL.md (`subagent_type: test-writer`,
   never a fork; pointers only). FAIL-BUG on existing code for in-scope BRs is expected; out-of-scope → GitHub issue.
   Commit alone: `test(<module>): BR-… tests (red)`.
3. **In parallel, one Agent call per surface** (disjoint ownership): **backend-dev** (make the slice tests
   green) plus the surface devs the slice needs — **frontend-dev** (admin), **tv-dev** (TV), **member-dev**
   (Expo) — each against `contract.md`. No brief mentions test-writer's reasoning, only "make these test files
   pass" and the spec. Surface devs append to `.pipeline/<module>/screens.md`.
4. BLOCKED → answer from spec/decisions or ask the user, then re-brief the same agent. A developer who says a
   test is wrong must quote the contradicting spec rule; decide against the spec; if the test really is wrong,
   re-brief **test-writer** (not the developer) and commit as `test(<module>): …`.
5. Commit `feat(<module>): <slice> (BR-…)` — production code only. Tick the slice in `plan.md`.

## 3. Verify (max 2 fix iterations)
```
loop:
  A. spawn in parallel: reviewer (whole diff vs base) + test-runner (compare with baseline)
  B. triage into findings.md: fix now (blockers, majors) | issue (minor/out of scope) | reject (say why —
     check the code yourself, the reviewer can be wrong). Route fixes by area: backend → backend-dev,
     admin → frontend-dev, TV → tv-dev, member → member-dev, test → test-writer (only with a spec-rule
     citation), spec gap → ask the user. New test failures: assume the code is wrong first.
  C. commit fixes `fix(<module>): address R-…` (tests separately `test(...)`) → back to A, max 2 times
  D. no open blockers/majors and no new test failures → exit
a finding still open after 2 fixes → stop and summarise to the user.
```

## 4. Knowledge update and hand-over
1. In this branch, so code and knowledge travel together: `docs/modules/<module>.md` (apply devs' "Map
   updates", gotchas from the fix loop, History row, `last_verified_commit`), spec "Implementation status"
   (BR → done + test file), GitHub issues for backlogged items, `docs/decisions.md` for decisions made,
   `docs/STATUS.md`. One-line cross-cutting conventions go in the package `CLAUDE.md` only if they would have
   prevented a finding (respect `docs/KNOWLEDGE.md` budgets). Commit `docs(<module>): map, spec status`.
2. **Batch, don't ship each feature.** Tell the user the feature is committed on the working branch and ask
   whether to add more items or open the PR now.
3. When asked: `git push -u origin work/<theme>`; `gh pr create --label agent-pipeline` with: spec + version,
   BR coverage table (BR | enforced at | test), what changed per surface, contract changes, review summary
   (fixed / issue / rejected), test results vs baseline, and the **manual checklist** written by test-writer
   (checklist mode; TV items name the `/tv/lab` scenario, member items the device/OS). `gh pr checks <n>`
   must be green before handing over. Tell the user how to run it (`backend bun run dev`, `frontend bun run dev`,
   `member bun run start`).

## Resume from PR feedback (`--resume --from-pr <n>`)
Fetch comments (`gh pr view <n> --json reviews,comments`), ignore ones starting with `🤖`. Classify: bug
(behaviour ≠ spec) → regression test by test-writer (brief: spec path + BR id + the comment URL, no diagnosis)
then fix by the dev agent; spec change → `/freeze` change path, then tests, then code; question → answer on the
PR; nit → fix or decline. Run section 3 again, push, reply to each comment starting with `🤖`.

## After merge
Switch the worktree to a new working branch from fresh `origin/main` (`git switch -c work/<next> origin/main`),
delete the merged branch locally, note the merge in `docs/STATUS.md` as the first commit of the new branch.
