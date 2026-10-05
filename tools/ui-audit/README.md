# ui-audit — look at the real admin (D-039)

Used by the `ux-designer` (DESIGN step) and `visual-qa` (VISUAL QA step) agents, and by you.
Runs on an **isolated copy**: own database (`gym_ui_audit`), ports 3100 / 4100, seeded demo data, a test login.

```bash
bash tools/ui-audit/setup.sh            # once per worktree (re-run = fresh demo data)
bash tools/ui-audit/serve.sh backend     # background shell 1
bash tools/ui-audit/serve.sh frontend    # background shell 2
cd tools/ui-audit && bunx playwright install chromium   # once per machine
bun shots.mjs --routes home,member --tag before          # screenshots → out/before/<viewport>-<theme>/
bun shots.mjs --routes home --css preview.css --tag after  # same screens with a CSS preview injected
bun axe.mjs --tag now                                    # WCAG 2.2 AA per screen, light + dark
```

- Screen keys: `lib.mjs` → `ROUTES` (add new screens there when a feature adds a route).
- `.ui-audit/` (login, env) and `out/` are git-ignored. Never print the password.
- `UI_AUDIT_CHROMIUM=<path>` uses an already installed Chromium; `UI_AUDIT_DB`, `UI_AUDIT_*_PORT` change the copy.
- Design rules the shots are judged against: `docs/standards/design.md`.
