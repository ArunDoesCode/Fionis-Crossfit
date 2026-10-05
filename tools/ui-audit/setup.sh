#!/usr/bin/env bash
# Isolated admin copy for screenshots (D-039): own database, own ports, seeded demo data, a test login.
# Never touches the dev database `gym` or the test database. Re-run safely: it resets only its own database.
#   UI_AUDIT_DB (default gym_ui_audit) · UI_AUDIT_FRONTEND_PORT (3100) · UI_AUDIT_BACKEND_PORT (4100)
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(git rev-parse --show-toplevel)"
DB="${UI_AUDIT_DB:-gym_ui_audit}"
FPORT="${UI_AUDIT_FRONTEND_PORT:-3100}"
BPORT="${UI_AUDIT_BACKEND_PORT:-4100}"
STATE="$ROOT/.ui-audit"
mkdir -p "$STATE"

[[ "$DB" == gym || "$DB" == *_test ]] && { echo "Refused: $DB is the dev or a test database."; exit 1; }

docker compose -f "$ROOT/backend/docker-compose.yaml" up -d postgres >/dev/null
docker exec gym-postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 \
  || docker exec gym-postgres psql -U postgres -c "CREATE DATABASE $DB" >/dev/null

# Secrets are generated per copy and stay in the git-ignored state folder.
if [[ ! -f "$STATE/backend.env" ]]; then
  cat > "$STATE/backend.env" <<ENV
PORT=$BPORT
APP_ORIGIN=http://localhost:$FPORT
DATABASE_URL=postgres://postgres:postgres@localhost:5433/$DB
DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/${DB}_test
ACCESS_TOKEN_SECRET=$(openssl rand -base64 48)
REFRESH_TOKEN_SECRET=$(openssl rand -base64 48)
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=604800
SESSION_SHORT_TTL_SECONDS=43200
TRUST_PROXY_HOPS=0
ENV
fi
printf 'NEXT_PUBLIC_API_URL=/api\nAPI_URL=http://localhost:%s/api\n' "$BPORT" > "$STATE/frontend.env"

set -a; source "$STATE/backend.env"; set +a
(cd "$ROOT/backend" && [[ -d node_modules ]] || bun install >/dev/null)
(cd "$ROOT/frontend" && [[ -d node_modules ]] || bun install >/dev/null)
[[ -d node_modules ]] || bun install >/dev/null
(cd "$ROOT/backend" && DB_RESET_CONFIRM="$DB" bun run db:reset >/dev/null && bun run seed:demo | tail -3)

PW="$(openssl rand -hex 12)"
(cd "$ROOT/backend" && bun run bootstrap-admin --username owner --password "$PW" >/dev/null)
printf 'username=owner\npassword=%s\nurl=http://localhost:%s\n' "$PW" "$FPORT" > "$STATE/login.txt"

echo "Ready. Start the two servers (each in its own background shell):"
echo "  bash tools/ui-audit/serve.sh backend"
echo "  bash tools/ui-audit/serve.sh frontend"
echo "Login file: .ui-audit/login.txt (never print the password)."
