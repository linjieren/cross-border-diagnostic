#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== 运行单元测试 ==="
npx vitest run --config vitest.config.ts --dir unit
