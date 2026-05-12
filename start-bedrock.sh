#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/servers/current"
WEB_PORT=60120
WEB_PID_FILE="$SERVER_DIR/web-dashboard.pid"
WEB_LOG_FILE="$SERVER_DIR/web-dashboard.log"
CONSOLE_LOG_FILE="$SERVER_DIR/bedrock-console.log"
COMMAND_FIFO_FILE="$SERVER_DIR/bedrock-console.fifo"
VENV_DIR="$ROOT_DIR/.venv"
WEBAPP_DIR="$ROOT_DIR/webapp"

if [[ ! -x "$SERVER_DIR/bedrock_server" ]]; then
  echo "bedrock_server not found under $SERVER_DIR" >&2
  exit 1
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install -r "$ROOT_DIR/requirements.txt"
fi

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  npm install --prefix "$ROOT_DIR"
fi

if [[ ! -d "$WEBAPP_DIR/node_modules" ]]; then
  npm install --prefix "$WEBAPP_DIR"
fi

npm run --prefix "$WEBAPP_DIR" build >/dev/null

rm -f "$COMMAND_FIFO_FILE"
mkfifo "$COMMAND_FIFO_FILE"
exec 3<>"$COMMAND_FIFO_FILE"

if [[ -f "$WEB_PID_FILE" ]]; then
  EXISTING_WEB_PID="$(<"$WEB_PID_FILE")"
  if [[ "$EXISTING_WEB_PID" =~ ^[0-9]+$ ]] && kill -0 "$EXISTING_WEB_PID" 2>/dev/null; then
    kill "$EXISTING_WEB_PID" 2>/dev/null || true
    wait "$EXISTING_WEB_PID" 2>/dev/null || true
  fi
  rm -f "$WEB_PID_FILE"
fi

"$VENV_DIR/bin/python" "$ROOT_DIR/status_server.py" \
  --root-dir "$ROOT_DIR" \
  --server-dir "$SERVER_DIR" \
  --port "$WEB_PORT" \
  >"$WEB_LOG_FILE" 2>&1 &
WEB_PID=$!
echo "$WEB_PID" >"$WEB_PID_FILE"
sleep 1
if ! kill -0 "$WEB_PID" 2>/dev/null; then
  echo "Failed to start Bedrock status dashboard on port $WEB_PORT" >&2
  wait "$WEB_PID"
  exit 1
fi

cleanup() {
  local exit_code=$?
  if [[ -f "$WEB_PID_FILE" ]]; then
    rm -f "$WEB_PID_FILE"
  fi
  exec 3>&-
  rm -f "$COMMAND_FIFO_FILE"
  if [[ "${WEB_PID:-}" =~ ^[0-9]+$ ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

cd "$SERVER_DIR"
export LD_LIBRARY_PATH=.
cat <&3 - | ./bedrock_server 2>&1 | tee -a "$CONSOLE_LOG_FILE"
