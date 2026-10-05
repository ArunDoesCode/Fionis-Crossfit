#!/usr/bin/env bash
# Runs one server of the isolated copy with the env from setup.sh. Usage: serve.sh backend|frontend
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
STATE="$ROOT/.ui-audit"
[[ -f "$STATE/backend.env" ]] || { echo "Run tools/ui-audit/setup.sh first."; exit 1; }
case "${1:-}" in
  backend)  set -a; source "$STATE/backend.env"; set +a; cd "$ROOT/backend" && exec bun run src/index.ts ;;
  frontend) set -a; source "$STATE/frontend.env"; set +a
            PORT="$(grep -o 'localhost:[0-9]*' "$STATE/login.txt" | cut -d: -f2)"
            cd "$ROOT/frontend" && exec bunx next dev -p "$PORT" ;;
  *) echo "Usage: serve.sh backend|frontend"; exit 1 ;;
esac
