#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/servers/current"

if [[ ! -x "$SERVER_DIR/bedrock_server" ]]; then
  echo "bedrock_server not found under $SERVER_DIR" >&2
  exit 1
fi

cd "$SERVER_DIR"
export LD_LIBRARY_PATH=.
exec ./bedrock_server
