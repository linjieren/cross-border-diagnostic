#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

export JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-change-me-in-production}"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:devpass@localhost:5434/diagnostic}"
export PORT="${PORT:-3011}"
export API_PROXY_TARGET="${API_PROXY_TARGET:-http://localhost:3011}"
export FRONTEND_PORT="${FRONTEND_PORT:-5175}"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "[dev-local] backend  -> http://127.0.0.1:${PORT}"
echo "[dev-local] frontend -> http://127.0.0.1:${FRONTEND_PORT}"

(
  cd "$BACKEND_DIR"
  npm run dev
) &
BACKEND_PID=$!

(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
