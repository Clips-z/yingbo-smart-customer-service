#!/bin/bash
# 迎波智能客服 - 一键构建 + asar 打包脚本
# 用法: bash build.sh

set -e

echo "=== 1/3 构建 Main 进程 ==="
TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
  npx cross-env NODE_ENV=production \
  npx webpack --config ./.erb/configs/webpack.config.main.prod.ts

echo "=== 2/3 构建 Renderer 进程 ==="
TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
  npx cross-env NODE_ENV=production \
  npx webpack --config ./.erb/configs/webpack.config.renderer.prod.ts

echo "=== 3/3 打包 asar ==="
mkdir -p _installer-stage
npx asar pack release/app _installer-stage/app.asar

echo "=== 完成 ==="
ls -lh _installer-stage/app.asar
echo ""
echo "输出: _installer-stage/app.asar"
