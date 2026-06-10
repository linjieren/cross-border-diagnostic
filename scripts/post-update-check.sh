#!/bin/bash
# 部署后自动检查脚本
# 每次代码更新后运行，确保环境一致性

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Post-Update Check ==="

# 1. 检查前端依赖一致性
echo "[1/5] 检查前端依赖..."
cd "$PROJECT_ROOT/frontend"
PKG_DEPS=$(cat package.json | grep -E '"react-markdown"|"remark-gfm"|"react-i18next"|"i18next"' | wc -l)
INSTALLED=$(ls node_modules | grep -E "^react-markdown$|^remark-gfm$|^react-i18next$|^i18next$" | wc -l)
if [ "$PKG_DEPS" -ne "$INSTALLED" ]; then
  echo "  前端依赖不匹配，正在安装..."
  npm install
else
  echo "  前端依赖正常"
fi

# 2. 检查后端依赖一致性
echo "[2/5] 检查后端依赖..."
cd "$PROJECT_ROOT/backend"
if [ ! -d "node_modules/cors" ]; then
  echo "  后端 cors 未安装，正在安装..."
  npm install cors @types/cors
else
  echo "  后端依赖正常"
fi

# 3. 检查环境变量
echo "[3/5] 检查环境变量..."
if ! grep -q "DEEPSEEK_API_KEY" "$PROJECT_ROOT/docker-compose.yml"; then
  echo "  DEEPSEEK_API_KEY 未配置！"
  exit 1
else
  echo "  环境变量已配置"
fi

# 4. 清理缓存并重建
echo "[4/5] 清理缓存并重建容器..."
cd "$PROJECT_ROOT"
docker compose exec frontend rm -rf /app/node_modules/.vite 2>/dev/null || true
docker compose up -d --build 2>/dev/null

# 5. 健康检查
echo "[5/5] 健康检查..."
sleep 5
BACKEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3011/health || echo "000")
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5175/ || echo "000")

if [ "$BACKEND" = "200" ] && [ "$FRONTEND" = "200" ]; then
  echo "  全栈健康（backend:$BACKEND, frontend:$FRONTEND）"
  echo "=== 检查完成，可以开始测试 ==="
else
  echo "  健康检查失败（backend:$BACKEND, frontend:$FRONTEND）"
  exit 1
fi
