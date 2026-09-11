#!/bin/bash
# ── AI English Tutor — 清理开发端口 ──
# 释放本地开发占用的端口 (3000, 6173)
#
# Usage: pnpm dev:clean  或  bash scripts/dev/clean.sh

set -e

echo "🧹 清理 AI English Tutor 开发端口..."
echo ""

kill_port() {
    local port=$1
    local service_name=$2
    local pids=$(lsof -ti :$port -sTCP:LISTEN 2>/dev/null)

    if [ -z "$pids" ]; then
        echo "✅ 端口 $port ($service_name): 未被占用"
    else
        echo "🔄 端口 $port ($service_name): 正在释放..."
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
        # 验证是否释放成功
        if lsof -ti :$port -sTCP:LISTEN >/dev/null 2>&1; then
            echo "❌ 端口 $port 释放失败，请手动处理"
        else
            echo "✅ 端口 $port 已释放"
        fi
    fi
}

kill_port 3000 "后端服务"
kill_port 6173 "前端服务"

echo ""
echo "✨ 清理完成！现在可以运行 pnpm local 启动开发环境"
