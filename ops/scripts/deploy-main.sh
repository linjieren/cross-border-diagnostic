#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OPS_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$OPS_DIR")"

AUTH_FLAG="$OPS_DIR/.deploy_main_authorized"

echo "=== main 部署检查 ==="
echo ""

if [ ! -f "$AUTH_FLAG" ]; then
  echo "未找到部署授权文件: $AUTH_FLAG"
  echo ""
  echo "main 部署需要用户明确授权。"
  echo "授权方式: 在项目目录执行以下命令创建授权标记"
  echo "  touch ops/.deploy_main_authorized"
  echo ""
  echo "或者由 Partner/用户通过事务线 inbound 发送授权指令。"
  exit 1
fi

AUTH_AGE=$(($(date +%s) - $(stat -f %m "$AUTH_FLAG" 2>/dev/null || stat -c %Y "$AUTH_FLAG" 2>/dev/null)))

if [ $AUTH_AGE -gt 3600 ]; then
  echo "授权文件已过期 (${AUTH_AGE}s > 3600s)。请重新授权。"
  rm -f "$AUTH_FLAG"
  exit 1
fi

echo "授权有效 (${AUTH_AGE}s 前)。开始部署 main..."

cd "$PROJECT_DIR"

docker compose \
  -f ops/docker-compose.yml \
  -f ops/docker-compose.main.yml \
  --env-file ops/.env.main \
  up -d --build

rm -f "$AUTH_FLAG"

echo ""
echo "=== 等待健康检查 ==="
sleep 3
"$SCRIPT_DIR/healthcheck.sh"

echo ""
echo "=== main 部署完成 ==="
echo "访问地址: http://localhost:${MAIN_PORT:-80}"
