#!/usr/bin/env bash
# Run the local backend + frontend against the server's Postgres / Qdrant / Ollama through an
# SSH tunnel, using an isolated database and Qdrant collection so server data is never touched.
# The chat model (OPENAI_BASE_URL / AI_MODEL in backend/.env) is used as configured; only the
# embedding model is reached through the tunnel.
#
#   scripts/dev_remote.sh up     start tunnel, scratch DB, backend (8010), frontend (3010)
#   scripts/dev_remote.sh down   stop everything (keeps the scratch DB and collection)
#   scripts/dev_remote.sh clean  down + drop the scratch DB and collection
set -euo pipefail

SERVER="${SCR_SERVER:-xiaomi250@100.65.199.107}"
DB_NAME="${SCR_DEV_DB:-scr_dev}"
COLLECTION="${SCR_DEV_COLLECTION:-scr_dev_docs}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="/tmp/scr-dev"
mkdir -p "$RUN_DIR"

psql_remote() { ssh "$SERVER" "docker exec self_correcting_rag_db psql -U postgres $*"; }

stop_pid() {
  local f="$RUN_DIR/$1.pid"
  [ -f "$f" ] || return 0
  kill "$(cat "$f")" 2>/dev/null || true
  pkill -P "$(cat "$f")" 2>/dev/null || true
  rm -f "$f"
}

down() {
  stop_pid frontend; stop_pid backend; stop_pid tunnel
  lsof -ti tcp:3010 tcp:8010 2>/dev/null | xargs kill 2>/dev/null || true
  echo "stopped"
}

case "${1:-up}" in
  up)
    ssh -o BatchMode=yes -f -N -L 55432:localhost:55432 -L 6333:localhost:6333 -L 11434:localhost:11434 "$SERVER"
    pgrep -f "ssh -o BatchMode=yes -f -N -L 55432" | head -1 > "$RUN_DIR/tunnel.pid"
    psql_remote -Atc "\"select 1 from pg_database where datname='$DB_NAME'\"" | grep -q 1 \
      || psql_remote -c "\"CREATE DATABASE $DB_NAME\""

    export POSTGRES_HOST=localhost POSTGRES_PORT=55432 POSTGRES_DB="$DB_NAME" \
           QDRANT_HOST=localhost QDRANT_PORT=6333 \
           EMBEDDING_BASE_URL=http://localhost:11434/v1 \
           RAG_DEFAULT_COLLECTION="$COLLECTION"

    (cd "$ROOT/backend" && uv run alembic upgrade head >/dev/null)
    (cd "$ROOT/backend" && nohup uv run uvicorn app.main:app --port 8010 --ws websockets-sansio \
      > "$RUN_DIR/backend.log" 2>&1 < /dev/null & echo $! > "$RUN_DIR/backend.pid")
    (cd "$ROOT/frontend" && nohup npm run dev > "$RUN_DIR/frontend.log" 2>&1 < /dev/null & echo $! > "$RUN_DIR/frontend.pid")

    for _ in $(seq 1 40); do
      curl -sf localhost:8010/api/v1/health >/dev/null && curl -sf -o /dev/null localhost:3010/login && break; sleep 1
    done
    echo "backend : $(curl -s localhost:8010/api/v1/health)"
    echo "frontend: http://localhost:3010   (first registered user becomes admin)"
    echo "database: $DB_NAME   collection: $COLLECTION   logs: $RUN_DIR/*.log"
    ;;
  down) down ;;
  clean)
    down
    ssh -o BatchMode=yes -f -N -L 6333:localhost:6333 "$SERVER" && sleep 1
    curl -s -X DELETE "localhost:6333/collections/$COLLECTION" >/dev/null || true
    pkill -f "ssh -o BatchMode=yes -f -N -L 6333" || true
    psql_remote -c "\"DROP DATABASE IF EXISTS $DB_NAME\""
    echo "scratch database and collection removed"
    ;;
  *) echo "usage: $0 up|down|clean"; exit 1 ;;
esac
