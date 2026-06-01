#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== 运行集成测试 ==="
npx vitest run --config vitest.config.ts --dir integration
