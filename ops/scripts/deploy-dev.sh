#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OPS_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$OPS_DIR")"

cd "$PROJECT_DIR"

echo "=== dev 部署启动 ==="
echo "项目目录: $PROJECT_DIR"
echo ""

docker compose \
  -f ops/docker-compose.yml \
  -f ops/docker-compose.dev.yml \
  --env-file ops/.env.dev \
  up -d --build

echo ""
echo "=== 等待健康检查 ==="
sleep 3
"$SCRIPT_DIR/healthcheck.sh"

echo ""
echo "=== dev 部署完成 ==="
echo "访问地址: http://localhost:${DEV_PORT:-8081}"
