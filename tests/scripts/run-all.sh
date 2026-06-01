#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== 运行全部测试 ==="
npx vitest run --config vitest.config.ts
echo ""
echo "=== 全部测试通过 ==="
