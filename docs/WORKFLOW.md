# Workflow — spec-first, agent-driven, Claude Code only (lean)

Adapted from the ERP project as **context, not a template** (see D-010). Idea: bugs come from business rules
nobody wrote down and scope that keeps moving. Claude is a functional consultant first, coder second. You do
the thinking (spec, owner/coach answers, freeze) and the final check (manual test, merge).

```
SPEC → FREEZE → CONTRACT → RED TESTS (separate agent) → BUILD (backend ∥ admin/TV/member) → REVIEW → HAND-OVER → lessons written down
```

## Who does what
| Stage | Who | Command |
|---|---|---|
| Spec: interview, rules, owner/coach questions | you + `spec-analyst` (Opus) | `/spec <module>` |
| Freeze (the hand-off) | you | `/freeze <module>` |
| Plan → build slices → review → hand-over | Opus coordinator (main session) + Sonnet/Haiku agents | `/feature <module>` |
| One slice with you in the loop | you + Claude | `/slice <module> <BRs>` |
| Bug | you + Claude | `/bug <description>` |
| Manual test, review, merge | you, on GitHub | — |
| Where are we / end of session | Claude | `/status`, `/wrap`, `/map <module>` |

## Claude Code setup
- `CLAUDE.md` + `backend|frontend|member/CLAUDE.md`, loaded by directory (line budgets: `docs/KNOWLEDGE.md`).
- `.claude/agents/` — 9 agents: explorer, test-runner (haiku); backend-dev, frontend-dev, tv-dev, member-dev,
  test-writer, reviewer (sonnet); spec-analyst (opus). Package agents (hono/nextjs/expo builder + reviewer)
  hold the code conventions, derived from `docs/standards/*`.
- `.claude/skills/` — 8 commands above; package skills in `<package>/.claude/skills/`.
- `.claude/settings.json` — allow/deny list (no force push, no push to `main`, no `gh pr merge`, no `rm -rf`, no `.env` reads) and hooks:
  **PreToolUse** `guard-protected-files` (blocks hand-edits of shadcn `ui/`, generated API types, contract files, migrations, env files) ·
  **PostToolUse** `biome-format` · **Stop** `typecheck-on-stop` · **SessionStart** `codegraph-sync` (only if `codegraph` is installed).
- Run the coordinator as `claude --model opus` in `.claude/worktrees/work`.

## Roadmap
| Milestone | Modules (spec each, then `/feature`) | Done when |
|---|---|---|
| M0 Foundations | scaffold only (`docs/FOUNDATIONS.md`) | CI green on empty packages, hooks verified |
| M1 Session core | auth-members → workouts → sessions → attendance → results | a full class runs through the API and admin Live control with test users |
| M2 Scoring + awards | scoring-board → achievements | boards, PRs, awards match recorded classes in fixtures |
| M3 TV | tv-feed → tv-scenes (split into sub-specs: shell+lab → workout → live board → achievements → credits) | a full class plays on a real TV; kill-network test passes |
| M4 Member app | member-app → push | check-in → submit → history on iOS 26, iOS 18, Android |
| Pilot | UAT at the gym (10+ members, 2 weeks) | defects triaged, perf budgets met |
| After | membership-payments, second gym | — |

Spec and map size budgets: `docs/KNOWLEDGE.md`; bigger → split. Raw material for every spec: `docs/design/` (standards and
`docs/decisions.md` win on conflict).

## Day to day
- **Start:** `/status`. Test the open PR from its manual checklist (phone / TV lab / admin) → merge or comment ("Step 4: expected X, got Y").
- **During:** `/spec` the next module, answer coordinator questions; new ideas → GitHub issue, not a PR comment.
- **End:** `/wrap`. **Weekly:** triage issues; repeated review findings → a rule in a CLAUDE.md or reviewer checklist.

## Setup
Done in this repo: folders, `CLAUDE.md` files, `.claude/` (agents, skills, hooks, pipeline, settings), package
agents/skills, `.github/` (CI, issue + PR templates), `.gitignore`, `scripts/check-fixtures.sh`, `docs/*`,
spec/map templates, `docs/standards/`, `docs/design/`.

Still manual (needs you; outward-facing or account-bound):
1. `git init`; commit the setup; `brew install gh && gh auth login`; create the GitHub repo and push.
2. Protect `main` (PR + required jobs `backend`, `frontend`, `member`, `fixtures`); auto-merge and delete-branch-on-merge on.
3. Create labels (list in `docs/FOUNDATIONS.md`).
4. Optional: `codegraph init`; Maestro for member e2e later; Apple Developer + Google Play accounts before the first beta (M4).
5. Run M0 per `docs/FOUNDATIONS.md`, then `/spec auth-members`.

## Add back when it hurts
`/epic` (big multi-PR features), `/watch-prs` (auto-pick up PR comments), separate security/performance
auditors, per-run briefs/reports/`state.json`. Originals: `~/codes/ERP-diecast/.claude/`.

## Lessons carried over
- Protected `main` rejects direct pushes: always branch + PR; a deny rule backs it up.
- Worktrees may be recycled: uncommitted files vanish — commit or push early.
- The permission classifier can block subagents editing test files or running destructive git: don't work around it, ask the human.
- One seed command for demo data after a reset; start manual checklists from that seed.
- Docs drift: after changing auth or structure, grep `CLAUDE.md` and agent files for old names.
