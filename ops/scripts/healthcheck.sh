#!/bin/bash
set -euo pipefail

echo "--- 健康检查 ---"

SERVICES=$(docker compose -f ops/docker-compose.yml ps -q 2>/dev/null || true)

if [ -z "$SERVICES" ]; then
  echo "没有运行中的容器。项目可能尚未部署。"
  exit 0
fi

docker compose -f ops/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

echo ""

UNHEALTHY=$(docker compose -f ops/docker-compose.yml ps -a --format json 2>/dev/null | grep -c '"Health":"unhealthy"' || echo 0)

if [ "$UNHEALTHY" -gt 0 ]; then
  echo "警告: $UNHEALTHY 个服务不健康"
  exit 1
else
  echo "全部服务正常"
fi
