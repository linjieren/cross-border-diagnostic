#!/bin/bash
set -euo pipefail

COMPOSE_FILE="ops/docker-compose.yml"
SERVICE="${1:-}"

if [ -z "$SERVICE" ]; then
  echo "用法: logs.sh <service> [--follow]"
  echo "可用服务: nginx backend frontend db redis"
  exit 1
fi

FOLLOW="${2:---tail=100}"

docker compose -f "$COMPOSE_FILE" logs "$FOLLOW" "$SERVICE"
